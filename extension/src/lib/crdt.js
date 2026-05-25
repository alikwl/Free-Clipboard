/**
 * FreeClipboard Extension - CRDT (Conflict-free Replicated Data Type)
 * Handles merge conflicts across devices
 */

class FreeClipboardCRDT {
  constructor() {
    this.nodeId = this.generateNodeId();
  }

  generateNodeId() {
    // Unique device identifier
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
  }

  // Generate new version vector
  createVectorClock(existing = {}) {
    const clock = { ...existing };
    clock[this.nodeId] = (clock[this.nodeId] || 0) + 1;
    return clock;
  }

  // Compare two vector clocks
  // Returns: -1 (a < b), 0 (concurrent), 1 (a > b)
  compareVectors(a, b) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let aGreater = false;
    let bGreater = false;

    for (const key of keys) {
      const aVal = a[key] || 0;
      const bVal = b[key] || 0;

      if (aVal > bVal) aGreater = true;
      if (bVal > aVal) bGreater = true;
    }

    if (aGreater && !bGreater) return 1;
    if (bGreater && !aGreater) return -1;
    return 0; // Concurrent or equal
  }

  // Merge two clips with conflict resolution
  mergeClips(localClip, remoteClip) {
    const comparison = this.compareVectors(
      localClip.vector_clock,
      remoteClip.vector_clock
    );

    if (comparison === 1) {
      // Local is newer
      return localClip;
    } else if (comparison === -1) {
      // Remote is newer
      return remoteClip;
    }

    // Concurrent changes - need smart merge
    return this.smartMerge(localClip, remoteClip);
  }

  smartMerge(local, remote) {
    const merged = {
      ...local,
      id: local.id,
      vector_clock: this.mergeVectors(local.vector_clock, remote.vector_clock),
      version: this.generateVersion(),
      modified_at: new Date().toISOString(),
      modified_by: this.nodeId,
      merge_conflict: true,
      parent_versions: [
        ...(local.parent_versions || []),
        local.version,
        remote.version
      ]
    };

    // Merge content based on type
    if (local.content_type === 'text' || local.content_type === 'code') {
      merged.content = this.mergeText(local.content, remote.content);
    } else {
      // For other types, prefer longer/more recent
      merged.content = remote.content.length > local.content.length
        ? remote.content
        : local.content;
    }

    // Merge arrays (tags, etc.)
    merged.tags = [...new Set([...(local.tags || []), ...(remote.tags || [])])];

    // Merge metadata
    merged.metadata = {
      ...local.metadata,
      ...remote.metadata,
      merge_history: [
        ...(local.metadata?.merge_history || []),
        { merged_at: new Date().toISOString(), sources: [local.modified_by, remote.modified_by] }
      ]
    };

    return merged;
  }

  mergeVectors(a, b) {
    const merged = { ...a };
    for (const [key, value] of Object.entries(b)) {
      merged[key] = Math.max(merged[key] || 0, value);
    }
    merged[this.nodeId] = (merged[this.nodeId] || 0) + 1;
    return merged;
  }

  mergeText(localText, remoteText) {
    // Use diff-match-patch for text merge
    // For simplicity, this is a basic implementation
    const localLines = localText.split('\n');
    const remoteLines = remoteText.split('\n');

    // If one is subset of other, take longer
    if (localText.includes(remoteText)) return localText;
    if (remoteText.includes(localText)) return remoteText;

    // Otherwise, combine unique lines
    const allLines = [...new Set([...localLines, ...remoteLines])];
    return allLines.join('\n');
  }

  generateVersion() {
    return `v-${this.nodeId}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  // Create new clip with CRDT metadata
  createClip(content, metadata = {}) {
    const now = new Date().toISOString();
    const vectorClock = this.createVectorClock();

    return {
      id: crypto.randomUUID(),
      content,
      vector_clock: vectorClock,
      version: this.generateVersion(),
      created_at: now,
      modified_at: now,
      created_by: this.nodeId,
      modified_by: this.nodeId,
      parent_versions: [],
      merge_conflict: false,
      ...metadata
    };
  }
}

// Singleton
let crdtInstance = null;

export function getCRDT() {
  if (!crdtInstance) {
    crdtInstance = new FreeClipboardCRDT();
  }
  return crdtInstance;
}

export default FreeClipboardCRDT;
