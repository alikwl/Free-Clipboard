/**
 * FreeClipboard Extension - Sync Engine
 * Handles CRDT-based synchronization across devices
 */

import { getCRDT } from '../lib/crdt.js';
import { FC_CONFIG } from '../lib/constants-module.js';

class SyncEngine {
  constructor(supabaseClient) {
    this.db = supabaseClient;
    this.crdt = getCRDT();
    this.syncQueue = [];
    this.syncState = 'idle';
    this.lastSyncTime = 0;
    this.isOnline = navigator.onLine;
    this.processingInterval = null;
  }

  async initialize() {
    // Setup network listeners
    self.addEventListener('online', () => {
      this.isOnline = true;
      this.processQueue();
    });
    
    self.addEventListener('offline', () => {
      this.isOnline = false;
    });

    // Start periodic processing
    this.processingInterval = setInterval(
      () => this.processQueue(),
      FC_CONFIG.SYNC_INTERVAL
    );

    // Initial queue load from IndexedDB
    await this.loadQueueFromDB();

    console.log('[SyncEngine] Initialized');
  }

  async destroy() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
  }

  // ============================================
  // QUEUE MANAGEMENT
  // ============================================

  async addToQueue(item) {
    const queueItem = {
      ...item,
      queued_at: Date.now(),
      retry_count: 0,
      priority: this.calculatePriority(item)
    };

    this.syncQueue.push(queueItem);
    await this.saveQueueToDB();

    // Try immediate sync if online
    if (this.isOnline && this.syncState === 'idle') {
      this.processQueue();
    }
  }

  calculatePriority(item) {
    if (item.operation === 'delete') return 3;
    if (item.is_favorite !== undefined) return 2;
    if (item.metadata?.is_todo) return 1;
    return 0;
  }

  // ============================================
  // QUEUE PROCESSING
  // ============================================

  async processQueue() {
    if (!this.isOnline || this.syncQueue.length === 0) return;
    if (this.syncState === 'syncing') return;

    this.syncState = 'syncing';

    // Sort by priority
    this.syncQueue.sort((a, b) => b.priority - a.priority);

    // Take batch
    const batch = this.syncQueue.splice(0, FC_CONFIG.SYNC_BATCH_SIZE);

    try {
      for (const item of batch) {
        await this.syncItem(item);
      }

      this.lastSyncTime = Date.now();
      await this.saveQueueToDB();

      // Notify success
      this.broadcastStatus('synced', {
        processed: batch.length,
        remaining: this.syncQueue.length
      });

    } catch (err) {
      console.error('[SyncEngine] Batch sync failed:', err);

      // Put back failed items
      for (const item of batch) {
        item.retry_count++;
        if (item.retry_count < FC_CONFIG.MAX_RETRIES) {
          // Exponential backoff
          item.next_retry = Date.now() + (FC_CONFIG.RETRY_DELAY * Math.pow(2, item.retry_count));
          this.syncQueue.push(item);
        } else {
          // Mark as permanently failed
          await this.markFailed(item);
        }
      }

      await this.saveQueueToDB();
      this.broadcastStatus('error', { error: err.message });
    }

    this.syncState = 'idle';

    // Process more if queue not empty
    if (this.syncQueue.length > 0) {
      setTimeout(() => this.processQueue(), 1000);
    }
  }

  async syncItem(item) {
    const { operation, id, ...data } = item;
    const startTime = Date.now();

    try {
      console.log(`[SyncEngine] Syncing ${operation} item ${id}`);

      switch (operation) {
        case 'delete':
          await this.db.from('clips')
            .update({ is_deleted: true, deleted_at: new Date().toISOString() })
            .eq('id', id);
          break;

        case 'update':
          await this.db.from('clips')
            .update(data)
            .eq('id', id);
          break;

        case 'insert':
        default:
          // Use CRDT to create proper document
          const user = await this.db.auth.getUser();
          if (!user?.data?.user?.id) {
            throw new Error('User session invalid - cannot sync without authentication');
          }

          const clip = this.crdt.createClip(data.content, {
            ...data,
            user_id: user.data.user.id
          });
          
          await this.db.from('clips')
            .upsert(clip, { onConflict: 'id' });
          break;
      }

      // Update local sync status
      await this.updateLocalSyncStatus(id, 'synced');
      
      const duration = Date.now() - startTime;
      console.log(`[SyncEngine] Sync success for ${id} (${duration}ms)`);
      
    } catch (err) {
      console.error(`[SyncEngine] Sync failed for ${operation} item ${id}:`, err.message);
      throw err;
    }
  }

  // ============================================
  // CONFLICT RESOLUTION
  // ============================================

  async resolveConflict(localClip, remoteClip) {
    const merged = this.crdt.mergeClips(localClip, remoteClip);

    // Save merged version
    await this.db.from('clips')
      .upsert(merged, { onConflict: 'id' });

    // Update local
    await this.updateLocalClip(merged.id, merged);

    return merged;
  }

  // ============================================
  // REAL-TIME HANDLERS
  // ============================================

  async handleRemoteInsert(remoteClip) {
    // Check if we have local version
    const localClip = await this.getLocalClip(remoteClip.id);

    if (!localClip) {
      // New clip, just save
      await this.saveLocalClip(remoteClip);
      return { action: 'inserted', clip: remoteClip };
    }

    // Check if local has pending changes
    const pendingItem = this.syncQueue.find(q => q.id === remoteClip.id);

    if (pendingItem) {
      // We have local changes, need merge
      const merged = await this.resolveConflict(localClip, remoteClip);
      
      // Remove from queue since server now has merged version
      this.syncQueue = this.syncQueue.filter(q => q.id !== remoteClip.id);
      await this.saveQueueToDB();

      return { action: 'merged', clip: merged };
    }

    // No local changes, check if remote is newer
    const comparison = this.crdt.compareVectors(
      localClip.vector_clock || {},
      remoteClip.vector_clock || {}
    );

    if (comparison === -1) {
      // Remote is newer
      await this.updateLocalClip(remoteClip.id, remoteClip);
      return { action: 'updated', clip: remoteClip };
    }

    // Local is same or newer, keep local
    return { action: 'ignored', clip: localClip };
  }

  async handleRemoteUpdate(remoteClip) {
    return this.handleRemoteInsert(remoteClip);
  }

  async handleRemoteDelete(remoteClipId) {
    // Soft delete locally
    await this.updateLocalClip(remoteClipId, {
      is_deleted: true,
      deleted_at: new Date().toISOString()
    });

    // Remove from queue if present
    this.syncQueue = this.syncQueue.filter(q => q.id !== remoteClipId);
    await this.saveQueueToDB();

    return { action: 'deleted', id: remoteClipId };
  }

  // ============================================
  // FULL SYNC (Initial load or recovery)
  // ============================================

  async performFullSync() {
    const { data: { user } } = await this.db.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get server clips
    const { data: serverClips, error } = await this.db
      .from('clips')
      .select('id, user_id, content, title, tags, pinned, created_at')
      .eq('user_id', user.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get local clips
    const localClips = await this.getAllLocalClips();

    // Build sync plan
    const syncPlan = this.buildSyncPlan(localClips, serverClips || []);

    // Execute plan
    for (const action of syncPlan) {
      switch (action.type) {
        case 'upload':
          await this.syncItem({ ...action.clip, operation: 'insert' });
          break;
        case 'download':
          await this.saveLocalClip(action.clip);
          break;
        case 'merge':
          await this.resolveConflict(action.local, action.remote);
          break;
        case 'delete_local':
          await this.deleteLocalClip(action.id);
          break;
      }
    }

    return {
      uploaded: syncPlan.filter(a => a.type === 'upload').length,
      downloaded: syncPlan.filter(a => a.type === 'download').length,
      merged: syncPlan.filter(a => a.type === 'merge').length
    };
  }

  buildSyncPlan(localClips, serverClips) {
    const plan = [];
    const localMap = new Map(localClips.map(c => [c.id, c]));
    const serverMap = new Map(serverClips.map(c => [c.id, c]));

    // Check local clips
    for (const local of localClips) {
      const remote = serverMap.get(local.id);

      if (!remote) {
        // Local only, upload if not deleted
        if (!local.is_deleted) {
          plan.push({ type: 'upload', clip: local });
        }
      } else {
        // Both exist, check for conflict
        const comparison = this.crdt.compareVectors(
          local.vector_clock || {},
          remote.vector_clock || {}
        );

        if (comparison === 0) {
          // Concurrent changes
          plan.push({ type: 'merge', local, remote });
        } else if (comparison === -1) {
          // Remote newer, download
          plan.push({ type: 'download', clip: remote });
        }
        // Local newer, will be handled by server check
      }
    }

    // Check server-only clips
    for (const remote of serverClips) {
      if (!localMap.has(remote.id)) {
        plan.push({ type: 'download', clip: remote });
      }
    }

    return plan;
  }

  // ============================================
  // INDEXEDDB OPERATIONS (Local)
  // ============================================

  async getDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('FreeClipboardDB', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async saveLocalClip(clip) {
    const db = await this.getDB();
    const tx = db.transaction('clips', 'readwrite');
    const store = tx.objectStore('clips');
    await store.put(clip);
  }

  async updateLocalClip(id, updates) {
    const db = await this.getDB();
    const tx = db.transaction('clips', 'readwrite');
    const store = tx.objectStore('clips');
    
    const existing = await store.get(id);
    if (existing) {
      await store.put({ ...existing, ...updates });
    }
  }

  async getLocalClip(id) {
    const db = await this.getDB();
    const tx = db.transaction('clips', 'readonly');
    const store = tx.objectStore('clips');
    return store.get(id);
  }

  async getAllLocalClips() {
    const db = await this.getDB();
    const tx = db.transaction('clips', 'readonly');
    const store = tx.objectStore('clips');
    
    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async deleteLocalClip(id) {
    const db = await this.getDB();
    const tx = db.transaction('clips', 'readwrite');
    const store = tx.objectStore('clips');
    await store.delete(id);
  }

  async updateLocalSyncStatus(id, status) {
    await this.updateLocalClip(id, { sync_status: status });
  }

  // ============================================
  // QUEUE PERSISTENCE
  // ============================================

  async saveQueueToDB() {
    const db = await this.getDB();
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    
    // Clear and save all
    await store.clear();
    for (const item of this.syncQueue) {
      await store.put(item);
    }
  }

  async loadQueueFromDB() {
    const db = await this.getDB();
    const tx = db.transaction('syncQueue', 'readonly');
    const store = tx.objectStore('syncQueue');
    
    const items = await new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
    });

    // Filter out expired retries
    this.syncQueue = items.filter(item => {
      if (!item.next_retry) return true;
      return Date.now() >= item.next_retry;
    });
  }

  async markFailed(item) {
    await this.updateLocalClip(item.id, {
      sync_status: 'failed',
      sync_error: 'Max retries exceeded'
    });
  }

  // ============================================
  // BROADCASTING
  // ============================================

  broadcastStatus(status, data) {
    chrome.runtime.sendMessage({
      type: 'SYNC_STATUS',
      status,
      data
    }).catch(() => {});
  }

  // ============================================
  // STATS
  // ============================================

  getStats() {
    return {
      queueLength: this.syncQueue.length,
      syncState: this.syncState,
      lastSyncTime: this.lastSyncTime,
      isOnline: this.isOnline
    };
  }
}

// Singleton
let instance = null;

export async function getSyncEngine(supabaseClient) {
  if (!instance) {
    instance = new SyncEngine(supabaseClient);
    await instance.initialize();
  }
  return instance;
}

export default SyncEngine;
