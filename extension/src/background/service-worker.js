/**
 * FreeClipboard Extension - Service Worker (Main Entry)
 * Handles all background operations, sync, and messaging
 */

import { getSupabase } from '../lib/supabase-client.js';
import { getCRDT } from '../lib/crdt.js';
import { FC_CONFIG, FC_PATTERNS, FC_ERRORS } from '../lib/constants-module.js';

// ============================================
// INITIALIZATION
// ============================================

const state = {
  supabase: null,
  crdt: null,
  syncQueue: [],
  isOnline: navigator.onLine,
  syncState: 'idle',
  lastSyncTime: 0,
  pendingChanges: 0,
  initialized: false,
  listenersRegistered: false,
  lastAuthNotifyAt: 0,
  lastSyncNotifyAt: 0
};
let initializePromise = null;

chrome.runtime.onMessage.addListener(handleMessage);
chrome.runtime.onStartup.addListener(initialize);
chrome.runtime.onInstalled.addListener(initialize);
initialize({ reason: 'service_worker_load' });

async function initialize(details) {
  if (state.initialized) {
    return;
  }
  if (initializePromise) {
    return initializePromise;
  }

  initializePromise = (async () => {
    console.log('[FreeClipboard] Initializing...', details);

    // Initialize CRDT
    state.crdt = getCRDT();

    // Initialize Supabase
    try {
      state.supabase = await getSupabase();
      setupSupabaseListeners();
      await syncFromServer();
    } catch (err) {
      console.error('[FreeClipboard] Supabase init failed:', err);
    }

    // Setup context menus
    setupContextMenus();

    // Setup alarms for keep-alive and sync
    chrome.alarms.create('keepAlive', { periodInMinutes: 4.9 });
    chrome.alarms.create('syncCheck', { periodInMinutes: 1 });

    // Setup network monitoring
    if (!state.listenersRegistered) {
      self.addEventListener('online', () => {
        state.isOnline = true;
        processSyncQueue();
      });
      self.addEventListener('offline', () => {
        state.isOnline = false;
      });
      state.listenersRegistered = true;
    }

    state.initialized = true;
    console.log('[FreeClipboard] Initialized successfully');
  })();

  try {
    await initializePromise;
  } finally {
    initializePromise = null;
  }
}

// ============================================
// MESSAGE HANDLERS
// ============================================

function handleMessage(request, sender, sendResponse) {
  const handlers = {
    'CAPTURE_CLIP': handleCaptureClip,
    'GET_CLIPS': handleGetClips,
    'SEARCH_CLIPS': handleSearchClips,
    'DELETE_CLIP': handleDeleteClip,
    'TOGGLE_FAVORITE': handleToggleFavorite,
    'GET_STATS': handleGetStats,
    'SYNC_NOW': handleSyncNow,
    'AI_REQUEST': handleAIRequest,
    'GET_SESSION': handleGetSession,
    'SIGN_OUT': handleSignOut,
    'SIGN_IN_GOOGLE': handleSignInGoogle,
    'COMPLETE_WEB_AUTH': handleCompleteWebAuth,
    'COMPLETE_WEB_AUTH_TOKEN': handleCompleteWebAuthToken,
    'CLOSE_AUTH_WINDOW': handleCloseAuthWindow,
    'SAVE_SETTINGS': handleSaveSettings,
    'SHOW_FEEDBACK': handleShowFeedback,
    'PASTE_QUICK_PASTE': handlePasteQuickPaste,
    'OPEN_WEB_ROUTE': handleOpenWebRoute
  };
// Add new handler functions:

async function handleSignInGoogle(data, sender) {
  try {
    console.log('[FreeClipboard] Starting Google OAuth flow...');

    if (!state.supabase) {
      state.supabase = await getSupabase();
      setupSupabaseListeners();
    }

    const authData = await state.supabase.signInWithGoogle();
    await uploadPendingLocalClips();
    await syncFromServer();
    console.log('[FreeClipboard] OAuth sign in successful');

    return {
      session: authData?.session || null,
      user: authData?.user || authData?.session?.user || null
    };
  } catch (err) {
    const errorMsg = err?.message || 'Unknown error during sign in';
    console.error('[FreeClipboard] OAuth sign in failed:', errorMsg, err);
    
    // Categorize error for better user feedback
    let userError = errorMsg;
    
    if (errorMsg.includes('user') || errorMsg.includes('cancelled') || errorMsg.includes('approve access')) {
      userError = 'Chrome sign-in was not approved. Open freeclipboard.com/login, sign in, then reopen the extension.';
    } else if (errorMsg.includes('Chrome') || errorMsg.includes('Identity')) {
      userError = 'Chrome Identity API error - please reinstall the extension';
    } else if (errorMsg.includes('Authorization') || errorMsg.includes('load')) {
      userError = 'Failed to load authorization page - add the Chrome redirect URL to Supabase Auth Redirect URLs';
    } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
      userError = 'Network error - check your internet connection';
    }

    throw new Error(userError);
  }
}

async function openWebsiteLoginFallback() {
  const loginUrl = 'https://freeclipboard.com/login?extension=1';

  try {
    await chrome.tabs.create({ url: loginUrl, active: true });
  } catch {
    await chrome.windows.create({
      url: loginUrl,
      type: 'popup',
      width: 820,
      height: 760,
      focused: true
    });
  }
}

async function handleCompleteWebAuth(data, sender) {
  if (!data?.url) {
    throw new Error('Missing authentication callback URL');
  }

  if (!state.supabase) {
    state.supabase = await getSupabase();
    setupSupabaseListeners();
  }

  const authData = await state.supabase.completeAuthFromUrl(data.url);
  await uploadPendingLocalClips();
  await syncFromServer();
  notifyAuthChanged(authData.user);
  closeAuthSurface(sender);

  return {
    session: authData.session,
    user: authData.user
  };
}

async function handleCompleteWebAuthToken(data, sender) {
  if (!data?.accessToken) {
    throw new Error('Missing authentication token');
  }

  if (!state.supabase) {
    state.supabase = await getSupabase();
    setupSupabaseListeners();
  }

  const authData = await state.supabase.completeAuthFromToken({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken || null,
    expiresIn: data.expiresIn || 3600
  });
  await uploadPendingLocalClips();
  await syncFromServer();
  notifyAuthChanged(authData.user);
  if (data.closeAuthWindow === true) {
    closeAuthSurface(sender);
  }

  return {
    session: authData.session,
    user: authData.user
  };
}

async function handleCloseAuthWindow(data, sender) {
  closeAuthSurface(sender);
  return { closing: true };
}

async function handleSaveSettings(data, sender) {
  try {
    if (!state.supabase?.session) {
      const error = 'Not authenticated - session expired or invalid';
      console.error('[FreeClipboard] Settings save error:', error);
      throw new Error(error);
    }
    
    const { settings } = data;
    
    // Save to local storage
    await chrome.storage.local.set({ fc_settings: settings });
    
    // Save to server
    const { error } = await state.supabase.client
      .from('user_settings')
      .upsert({
        user_id: state.supabase.session.user.id,
        settings,
        updated_at: new Date().toISOString()
      });
    
    if (error) throw error;
    
    return { success: true };
  } catch (err) {
    if (err.message?.includes('user_settings')) {
      console.warn('[FreeClipboard] user_settings table not available, keeping settings local only');
      return { success: true, localOnly: true };
    }
    return { success: false, error: err.message };
  }
}

async function handleShowFeedback(data) {
  return { shown: true, message: data?.message || '' };
}

async function handlePasteQuickPaste(data) {
  const { content = '' } = data || {};
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || isBlockedUrl(tab.url)) {
    return { pasted: false, reason: 'blocked-tab' };
  }

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (text) => {
        const active = document.activeElement;
        if (!active) return { pasted: false, reason: 'no-active-element' };

        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
          const start = active.selectionStart ?? active.value.length;
          const end = active.selectionEnd ?? active.value.length;
          active.focus();
          active.setRangeText(text, start, end, 'end');
          active.dispatchEvent(new Event('input', { bubbles: true }));
          active.dispatchEvent(new Event('change', { bubbles: true }));
          return { pasted: true };
        }

        if (active instanceof HTMLElement && active.isContentEditable) {
          active.focus();
          const selection = window.getSelection();
          if (!selection) return { pasted: false, reason: 'no-selection' };
          if (!selection.rangeCount) {
            const range = document.createRange();
            range.selectNodeContents(active);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }
          selection.deleteFromDocument();
          selection.getRangeAt(0).insertNode(document.createTextNode(text));
          selection.collapseToEnd();
          active.dispatchEvent(new Event('input', { bubbles: true }));
          return { pasted: true };
        }

        return { pasted: false, reason: 'unsupported-element' };
      },
      args: [content]
    });

    return result || { pasted: false, reason: 'unknown' };
  } catch (error) {
    console.error('[FreeClipboard] Paste failed:', error);
    return { pasted: false, reason: error?.message || 'script-error' };
  }
}

async function handleOpenWebRoute(data) {
  const route = data?.route || '/dashboard';
  const url = `https://freeclipboard.com${route.startsWith('/') ? route : `/${route}`}`;
  await chrome.tabs.create({ url, active: true });
  return { opened: true };
}
  const handler = handlers[request.type];
  if (!handler) {
    sendResponse({ error: 'Unknown message type' });
    return false;
  }

  Promise.resolve()
    .then(() => initialize({ reason: 'message_wakeup' }))
    .then(() => handler(request.data, sender))
    .then(result => sendResponse({ success: true, data: result }))
    .catch(err => sendResponse({ success: false, error: err.message }));

  return true; // Async response
}

async function handleCaptureClip(data, sender) {
  const clip = state.crdt.createClip(data.content, {
    user_id: state.supabase?.session?.user?.id,
    content_type: data.content_type || detectContentType(data.content),
    source_url: data.source_url || data.page_url || sender.tab?.url,
    source_title: data.source_title || data.page_title || sender.tab?.title,
    source_app: data.source_app || getAppName(sender.tab?.url),
    sync_status: 'pending',
    metadata: {
      ...data.metadata,
      capture_method: data.source_method || 'manual',
      word_count: data.content.split(/\s+/).length,
      char_count: data.content.length
    }
  });

  // Save locally first
  await saveToLocalDB(clip);
  notifyUI('clip_added', clip);

  // Queue for sync
  state.syncQueue.push({
    ...clip,
    sync_status: 'pending',
    retry_count: 0
  });

  // Try immediate sync
  if (state.isOnline && state.syncState === 'idle') {
    processSyncQueue();
  }

  // Update badge silently
  updateBadge('•');

  return { clip, queued: true };
}

async function handleGetClips(data) {
  // Try server first if online
  if (state.isOnline && state.supabase?.session) {
    try {
      const result = await state.supabase.getClips(data);
      // Update local cache
      for (const clip of result.clips) {
        await saveToLocalDB(clip);
      }
      return result;
    } catch (err) {
      console.log('[FreeClipboard] Server fetch failed, using local:', err.message);
    }
  }

  // Fallback to local
  const clips = await getLocalClips(data.limit || 20, data.offset || 0);
  return { clips, total: clips.length };
}

async function handleSearchClips(data) {
  const { query, filters = {} } = data;

  // Local search first (instant)
  const localResults = await searchLocalClips(query, filters);

  // Server search for better results
  if (state.isOnline && query.length > 2) {
    try {
      const serverResults = await state.supabase.getClips({
        ...filters,
        search: query,
        limit: 50
      });
      return { clips: serverResults.clips, source: 'server' };
    } catch (err) {
      return { clips: localResults, source: 'local' };
    }
  }

  return { clips: localResults, source: 'local' };
}

async function handleDeleteClip(data) {
  const { id } = data;

  // Soft delete locally
  await updateLocalClip(id, { is_deleted: true, deleted_at: new Date().toISOString() });

  // Queue for sync
  state.syncQueue.push({
    id,
    is_deleted: true,
    deleted_at: new Date().toISOString(),
    sync_status: 'pending',
    operation: 'delete'
  });

  processSyncQueue();
  return { deleted: true };
}

async function handleToggleFavorite(data) {
  const { id, isFavorite } = data;

  await updateLocalClip(id, { is_favorite: isFavorite });

  state.syncQueue.push({
    id,
    is_favorite: isFavorite,
    sync_status: 'pending',
    operation: 'update'
  });

  processSyncQueue();
  return { favorited: isFavorite };
}

async function handleGetStats() {
  const localCount = await getLocalClipCount();
  const queueSize = state.syncQueue.length;

  return {
    total_clips: localCount,
    pending_sync: queueSize,
    is_online: state.isOnline,
    last_sync: state.lastSyncTime,
    sync_state: state.syncState
  };
}

async function handleSyncNow() {
  await processSyncQueue();
  await syncFromServer();
  return { synced: true, queue_size: state.syncQueue.length };
}

async function handleAIRequest(data) {
  const { action, content, options = {} } = data;

  switch (action) {
    case 'summarize':
      return state.supabase.summarize(content, options.maxLength);
    case 'tags':
      return state.supabase.generateTags(content);
    case 'search':
      return state.supabase.getClips({
        search: content,
        limit: options.limit || 10
      });
    default:
      throw new Error(`Unknown AI action: ${action}`);
  }
}

async function handleGetSession() {
  return {
    authenticated: !!state.supabase?.session,
    session: state.supabase?.session || null,
    user: state.supabase?.session?.user || null
  };
}

async function handleSignOut() {
  await state.supabase?.signOut();
  await clearLocalDB();
  state.syncQueue = [];
  return { signed_out: true };
}

// ============================================
// SYNC ENGINE
// ============================================

async function processSyncQueue() {
  if (!state.isOnline || state.syncQueue.length === 0) return;
  if (!state.supabase?.session) return;
  if (state.syncState === 'syncing') return;

  state.syncState = 'syncing';
  updateBadge('↻');

  const batch = state.syncQueue.splice(0, FC_CONFIG.SYNC_BATCH_SIZE);

  try {
    for (const item of batch) {
      if (item.operation === 'delete') {
        await state.supabase.deleteClip(item.id);
      } else if (item.operation === 'update') {
        await state.supabase.toggleFavorite(item.id, item.is_favorite);
      } else {
        // Insert or update
        await state.supabase.saveClip(item);
      }

      // Mark as synced locally
      await updateLocalSyncStatus(item.id, 'synced');
    }

    state.lastSyncTime = Date.now();
    state.pendingChanges = state.syncQueue.length;

    // Clear badge if all done
    if (state.syncQueue.length === 0) {
      updateBadge('');
    } else {
      updateBadge('•');
    }

  } catch (err) {
    console.error('[FreeClipboard] Sync failed:', err);
    console.error('[FreeClipboard] Sync diagnostics:', {
      authenticated_user_id: state.supabase?.session?.user?.id || null,
      batch_preview: batch.map((item) => ({
        id: item.id,
        user_id: item.user_id || null,
        content_preview: String(item.content || '').slice(0, 60),
        operation: item.operation || 'upsert'
      }))
    });

    // Put back in queue with retry
    for (const item of batch) {
      item.retry_count = (item.retry_count || 0) + 1;
      if (item.retry_count < FC_CONFIG.MAX_RETRIES) {
        state.syncQueue.push(item);
      } else {
        await updateLocalSyncStatus(item.id, 'failed');
      }
    }

    updateBadge('!');
  }

  state.syncState = 'idle';
}

async function syncFromServer() {
  if (!state.supabase?.session || !state.isOnline) return;

  try {
    await uploadPendingLocalClips();
    const result = await state.supabase.getClips({ limit: 50, offset: 0 });
    for (const clip of result.clips) {
      await saveToLocalDB(clip);
    }
  notifyClipsSynced(result.clips.length);
  } catch (err) {
    console.error('[FreeClipboard] Remote sync failed:', err);
  }
}

async function uploadPendingLocalClips() {
  if (!state.supabase?.session || !state.isOnline) return;

  const pendingClips = await getPendingLocalClips();
  if (pendingClips.length === 0) return;

  for (const clip of pendingClips) {
    try {
      await state.supabase.saveClip({
        ...clip,
        user_id: clip.user_id || state.supabase.session.user.id
      });
      await updateLocalSyncStatus(clip.id, 'synced');
    } catch (err) {
      console.error('[FreeClipboard] Pending clip upload failed:', err);
      await updateLocalClip(clip.id, {
        sync_status: 'failed',
        sync_error: err.message
      });
    }
  }

  notifyClipsSynced(pendingClips.length);
}

// ============================================
// SUPABASE LISTENERS
// ============================================

function setupSupabaseListeners() {
  if (!state.supabase) return;

  // Real-time clip changes
  state.supabase.on('clip_change', (payload) => {
    handleRemoteChange(payload);
  });

  // Connection status
  state.supabase.on('connection', ({ status }) => {
    console.log('[FreeClipboard] Realtime:', status);
  });
}

async function handleRemoteChange(payload) {
  const { eventType, new: newRecord, old: oldRecord } = payload;

  switch (eventType) {
    case 'INSERT':
      if (newRecord.created_by !== state.crdt.nodeId) {
        await saveToLocalDB(newRecord);
        notifyUI('clip_added', newRecord);
      }
      break;

    case 'UPDATE':
      const local = await getLocalClip(newRecord.id);
      if (local) {
        const merged = state.crdt.mergeClips(local, newRecord);
        await saveToLocalDB(merged);
        notifyUI('clip_updated', merged);
      }
      break;

    case 'DELETE':
      await deleteLocalClip(oldRecord.id);
      notifyUI('clip_deleted', { id: oldRecord.id });
      break;
  }
}

// ============================================
// CONTEXT MENU
// ============================================

function setupContextMenus() {
  chrome.contextMenus.removeAll();

  // Main parent
  chrome.contextMenus.create({
    id: 'freeclipboard',
    title: '📋 FreeClipboard',
    contexts: ['all']
  });

  // Save options
  chrome.contextMenus.create({
    parentId: 'freeclipboard',
    id: 'save-selection',
    title: '💾 Save Selection',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    parentId: 'freeclipboard',
    id: 'save-image',
    title: '🖼️ Save Image',
    contexts: ['image']
  });

  chrome.contextMenus.create({
    parentId: 'freeclipboard',
    id: 'save-link',
    title: '🔗 Save Link',
    contexts: ['link']
  });

  chrome.contextMenus.create({
    parentId: 'freeclipboard',
    id: 'save-page',
    title: '📄 Save Page',
    contexts: ['page']
  });

  // Separator
  chrome.contextMenus.create({
    parentId: 'freeclipboard',
    id: 'sep-1',
    type: 'separator',
    contexts: ['all']
  });

  // AI options
  chrome.contextMenus.create({
    parentId: 'freeclipboard',
    id: 'ai-summarize',
    title: '🤖 AI Summarize',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    parentId: 'freeclipboard',
    id: 'ai-translate',
    title: '🌐 AI Translate',
    contexts: ['selection']
  });

  // Separator
  chrome.contextMenus.create({
    parentId: 'freeclipboard',
    id: 'sep-2',
    type: 'separator',
    contexts: ['all']
  });

  // Quick actions
  chrome.contextMenus.create({
    parentId: 'freeclipboard',
    id: 'add-todo',
    title: '✅ Add as Todo',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    parentId: 'freeclipboard',
    id: 'create-note',
    title: '📝 Create Note',
    contexts: ['selection']
  });

  // Handler
  chrome.contextMenus.onClicked.addListener(handleContextMenu);
}

async function handleContextMenu(info, tab) {
  const { menuItemId, selectionText, srcUrl, linkUrl, pageUrl } = info;

  let content = '';
  let contentType = 'text';
  let metadata = {};

  switch (menuItemId) {
    case 'save-selection':
      content = selectionText;
      contentType = detectContentType(selectionText);
      break;

    case 'save-image':
      content = srcUrl;
      contentType = 'image';
      metadata = { image_url: srcUrl };
      break;

    case 'save-link':
      content = linkUrl;
      contentType = 'link';
      metadata = { link_url: linkUrl };
      break;

    case 'save-page':
      content = pageUrl;
      contentType = 'page';
      metadata = { page_title: tab.title };
      break;

    case 'ai-summarize':
      await openAISidebar(tab.id, 'summarize', selectionText);
      return;

    case 'ai-translate':
      await openAISidebar(tab.id, 'translate', selectionText);
      return;

    case 'add-todo':
      await createTodo(selectionText, tab);
      return;

    case 'create-note':
      await createNote(selectionText, tab);
      return;

    default:
      return;
  }

  // Send capture message
  await handleCaptureClip({
    content,
    content_type: contentType,
    source_url: pageUrl || tab.url,
    source_title: tab.title,
    source_app: 'context-menu',
    metadata
  }, { tab });

  // Silent confirmation
  showPageBadge(tab.id, '✓');
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

chrome.commands.onCommand.addListener(async (command) => {
  switch (command) {
    case 'quick-search':
      openQuickSearch();
      break;

    case 'save-selection':
      await saveCurrentSelection();
      break;

    case 'ai-assistant':
      openAIAssistant();
      break;
  }
});

async function saveCurrentSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    // Check if scriptable
    if (isBlockedUrl(tab.url)) {
      console.log('[FreeClipboard] Cannot access this page');
      return;
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() || ''
    });

    if (result) {
      await handleCaptureClip({
        content: result,
        source_url: tab.url,
        source_title: tab.title,
        source_app: 'keyboard-shortcut'
      }, { tab });

      showPageBadge(tab.id, '✓');
    }
  } catch (err) {
    console.error('[FreeClipboard] Save failed:', err);
  }
}

function openQuickSearch() {
  chrome.windows.create({
    url: chrome.runtime.getURL('src/quick-search/search.html'),
    type: 'popup',
    width: 700,
    height: 600,
    focused: true
  });
}

function openAIAssistant() {
  chrome.windows.create({
    url: chrome.runtime.getURL('src/ai-assistant/assistant.html'),
    type: 'popup',
    width: 450,
    height: 700,
    focused: true
  });
}

async function openAISidebar(tabId, action, text) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/content/ai-sidebar.js']
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    func: (action, text) => {
      window.postMessage({
        type: 'FC_AI_SIDEBAR',
        action,
        text
      }, '*');
    },
    args: [action, text]
  });
}

async function createTodo(text, tab) {
  await handleCaptureClip({
    content: `[TODO] ${text}`,
    content_type: 'todo',
    source_url: tab.url,
    source_title: tab.title,
    metadata: { todo_status: 'pending' }
  }, { tab });
}

async function createNote(text, tab) {
  await handleCaptureClip({
    content: text,
    content_type: 'note',
    source_url: tab.url,
    source_title: tab.title,
    metadata: { note_format: 'plain' }
  }, { tab });
}

// ============================================
// ALARMS
// ============================================

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // Keep service worker alive
    console.log('[FreeClipboard] Keep-alive');
  }

  if (alarm.name === 'syncCheck') {
    processSyncQueue();
    syncFromServer();
  }
});

// ============================================
// LOCAL DATABASE (IndexedDB)
// ============================================

const DB_NAME = 'FreeClipboardDB';
const DB_VERSION = 1;
let dbPromise = null;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionToPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new DOMException('Transaction aborted'));
  });
}

function getDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Clips store
        const clipStore = db.createObjectStore('clips', { keyPath: 'id' });
        clipStore.createIndex('created_at', 'created_at', { unique: false });
        clipStore.createIndex('content_type', 'content_type', { unique: false });
        clipStore.createIndex('is_favorite', 'is_favorite', { unique: false });
        clipStore.createIndex('is_deleted', 'is_deleted', { unique: false });
        clipStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });

        // Sync queue store
        db.createObjectStore('syncQueue', { keyPath: 'id' });

        // Settings store
        db.createObjectStore('settings', { keyPath: 'key' });
      };
    });
  }
  return dbPromise;
}

async function saveToLocalDB(clip) {
  const db = await getDB();
  const tx = db.transaction('clips', 'readwrite');
  const store = tx.objectStore('clips');
  store.put(clip);
  await transactionToPromise(tx);
}

async function getLocalClip(id) {
  const db = await getDB();
  const tx = db.transaction('clips', 'readonly');
  const store = tx.objectStore('clips');
  const result = await requestToPromise(store.get(id));
  await transactionToPromise(tx);
  return result;
}

async function getLocalClips(limit = 20, offset = 0) {
  const db = await getDB();
  const tx = db.transaction('clips', 'readonly');
  const store = tx.objectStore('clips');
  const index = store.index('created_at');

  const clips = [];
  let skipped = 0;

  return new Promise((resolve) => {
    const request = index.openCursor(null, 'prev');

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) {
        resolve(clips);
        return;
      }

      if (skipped < offset) {
        skipped++;
        cursor.continue();
        return;
      }

      if (clips.length < limit) {
        if (!cursor.value.is_deleted) {
          clips.push(cursor.value);
        }
        cursor.continue();
      } else {
        resolve(clips);
      }
    };
  });
}

async function getPendingLocalClips() {
  const db = await getDB();
  const tx = db.transaction('clips', 'readonly');
  const store = tx.objectStore('clips');
  const txDone = transactionToPromise(tx);

  const clips = [];
  await new Promise((resolve) => {
    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) {
        resolve();
        return;
      }

      const clip = cursor.value;
      if (!clip.is_deleted && clip.sync_status !== 'synced') {
        clips.push(clip);
      }
      cursor.continue();
    };
    request.onerror = () => resolve();
  });

  await txDone;
  return clips;
}

async function searchLocalClips(query, filters = {}) {
  const db = await getDB();
  const tx = db.transaction('clips', 'readonly');
  const store = tx.objectStore('clips');

  const allClips = [];
  await new Promise((resolve) => {
    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) {
        resolve();
        return;
      }
      allClips.push(cursor.value);
      cursor.continue();
    };
  });

  const lowerQuery = query.toLowerCase();

  return allClips.filter(clip => {
    if (clip.is_deleted) return false;

    const matchesQuery = !query ||
      clip.content.toLowerCase().includes(lowerQuery) ||
      clip.source_title?.toLowerCase().includes(lowerQuery) ||
      clip.tags?.some(t => t.toLowerCase().includes(lowerQuery));

    const matchesType = !filters.type || clip.content_type === filters.type;
    const matchesFavorite = filters.favorite === undefined || clip.is_favorite === filters.favorite;

    return matchesQuery && matchesType && matchesFavorite;
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function updateLocalClip(id, updates) {
  const db = await getDB();
  const tx = db.transaction('clips', 'readwrite');
  const store = tx.objectStore('clips');

  const existing = await requestToPromise(store.get(id));
  if (!existing) return;

  store.put({ ...existing, ...updates, modified_at: new Date().toISOString() });
  await transactionToPromise(tx);
}

async function updateLocalSyncStatus(id, status) {
  await updateLocalClip(id, { sync_status: status });
}

async function deleteLocalClip(id) {
  const db = await getDB();
  const tx = db.transaction('clips', 'readwrite');
  const store = tx.objectStore('clips');
  store.delete(id);
  await transactionToPromise(tx);
}

async function getLocalClipCount() {
  const db = await getDB();
  const tx = db.transaction('clips', 'readonly');
  const store = tx.objectStore('clips');

  const count = await requestToPromise(store.count());
  await transactionToPromise(tx);
  return count;
}

async function clearLocalDB() {
  const db = await getDB();
  const tx = db.transaction(['clips', 'syncQueue'], 'readwrite');
  tx.objectStore('clips').clear();
  tx.objectStore('syncQueue').clear();
  await transactionToPromise(tx);
}

// ==========================================
// UI & HELPERS
// ==========================================

function detectContentType(content = '') {
  if (!content) return 'text';
  if (FC_PATTERNS.URL.test(content)) return 'link';
  if (FC_PATTERNS.EMAIL.test(content)) return 'email';
  if (FC_PATTERNS.PHONE.test(content)) return 'phone';
  if (FC_PATTERNS.MARKDOWN_HEADER.test(content)) return 'markdown';
  if (FC_PATTERNS.HTML_TAG.test(content)) return 'html';

  const codeIndicators = [
    /^(const|let|var|function|class|import|export)\s/m,
    /^(def|class|import|from)\s/m,
    /^<\?php/,
    /^(SELECT|INSERT|UPDATE|DELETE)\s/i,
    /[{};]\s*$/
  ];

  if (codeIndicators.filter((pattern) => pattern.test(content)).length >= 2) {
    return 'code';
  }

  if (content.includes('\n\n')) return 'paragraph';
  return 'text';
}

function getAppName(url) {
  if (!url) return 'FreeClipboard';

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname || 'FreeClipboard';
  } catch {
    return 'FreeClipboard';
  }
}

function isBlockedUrl(url = '') {
  return /^(chrome|edge|about|brave|opera|vivaldi):/i.test(url);
}

async function updateBadge(text) {
  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: text === '!' ? '#b42318' : '#2563eb' });
  } catch (err) {
    console.warn('[FreeClipboard] Failed to update badge:', err);
  }
}

async function showPageBadge(tabId, text) {
  try {
    await chrome.action.setBadgeText({ tabId, text });
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    }, FC_CONFIG.BADGE_DURATION);
  } catch (err) {
    console.warn('[FreeClipboard] Failed to show page badge:', err);
  }
}

function notifyUI(event, data) {
  chrome.runtime.sendMessage({ type: 'UI_UPDATE', event, data }).catch?.(() => {});
}

function notifyAuthChanged(user) {
  const now = Date.now();
  if (now - state.lastAuthNotifyAt < 1500) return;
  state.lastAuthNotifyAt = now;
  notifyUI('auth_changed', { user });
}

function notifyClipsSynced(count) {
  if (!count) return;

  const now = Date.now();
  if (now - state.lastSyncNotifyAt < 1500) return;
  state.lastSyncNotifyAt = now;
  notifyUI('clips_synced', { count });
}

function closeAuthSurface(sender) {
  const tabId = sender?.tab?.id;
  const url = sender?.tab?.url || '';

  if (!isAuthCallbackUrl(url)) {
    console.warn('[FreeClipboard] Refusing to close non-auth tab:', url);
    return;
  }

  setTimeout(() => {
    if (typeof tabId === 'number') {
      chrome.tabs.remove(tabId).catch((tabErr) => {
        console.warn('[FreeClipboard] Could not close auth tab:', tabErr?.message || tabErr);
      });
    }
  }, 700);
}

function isAuthCallbackUrl(url) {
  try {
    const parsed = new URL(url);
    const isFreeClipboard = /(^|\.)freeclipboard\.com$/i.test(parsed.hostname) ||
      /^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname);
    if (!isFreeClipboard) return false;

    const hashParams = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash);
    return parsed.pathname === '/extension-connected' ||
      hashParams.has('access_token') ||
      hashParams.has('refresh_token');
  } catch {
    return false;
  }
}
