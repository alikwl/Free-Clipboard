/**
 * FreeClipboard Extension - Capture Handler
 * Handles all clip capture from various sources
 */

import { FC_CONFIG, FC_PATTERNS } from '../lib/constants-module.js';

class CaptureHandler {
  constructor(syncEngine) {
    this.sync = syncEngine;
    this.recentCaptures = new Set(); // Deduplication
    this.captureCounter = 0;
  }

  // ============================================
  // MAIN CAPTURE METHOD
  // ============================================

  async capture(data, source = 'unknown') {
    // Validate
    if (!this.isValidCapture(data)) {
      return { success: false, reason: 'invalid' };
    }

    // Deduplication check
    const dedupKey = this.getDedupKey(data.content);
    if (this.recentCaptures.has(dedupKey)) {
      return { success: false, reason: 'duplicate' };
    }

    // Add to recent captures
    this.recentCaptures.add(dedupKey);
    setTimeout(() => this.recentCaptures.delete(dedupKey), 5000);

    // Enrich data
    const enriched = await this.enrichCapture(data, source);

    // Create clip document
    const clip = this.createClipDocument(enriched);

    // Save locally first
    await this.saveToLocalDB(clip);

    // Queue for sync
    await this.sync.addToQueue({
      operation: 'insert',
      ...clip
    });

    // Update stats
    this.captureCounter++;

    return {
      success: true,
      clip,
      clipId: clip.id
    };
  }

  // ============================================
  // VALIDATION
  // ============================================

  isValidCapture(data) {
    if (!data || !data.content) return false;
    
    const content = data.content.trim();
    
    // Length checks
    if (content.length < 3) return false;
    if (content.length > FC_CONFIG.MAX_CLIP_LENGTH) return false;

    // Sensitive content check
    if (this.isSensitive(content)) return false;

    // Blocked patterns
    if (FC_PATTERNS.PASSWORD_FIELD.test(content)) return false;

    return true;
  }

  isSensitive(content) {
    // API keys
    if (FC_PATTERNS.API_KEY.test(content)) return true;

    // Credit cards
    if (/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(content)) return true;

    // Private keys
    if (/-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/.test(content)) return true;

    // JWT tokens (long base64)
    if (/^[A-Za-z0-9_-]{100,}\.[A-Za-z0-9_-]{100,}/.test(content)) return true;

    return false;
  }

  getDedupKey(content) {
    // Simple hash for deduplication
    return content.substring(0, 100).replace(/\s+/g, ' ').trim();
  }

  // ============================================
  // ENRICHMENT
  // ============================================

  async enrichCapture(data, source) {
    const enriched = { ...data };

    // Detect content type
    enriched.content_type = this.detectContentType(data.content);

    // Extract URLs
    const urls = this.extractUrls(data.content);
    if (urls.length > 0) {
      enriched.extracted_urls = urls;
      if (!enriched.source_url) {
        enriched.source_url = urls[0];
      }
    }

    // Extract emails
    const emails = this.extractEmails(data.content);
    if (emails.length > 0) {
      enriched.extracted_emails = emails;
    }

    // Generate preview
    enriched.preview = this.generatePreview(data.content);

    // Add capture metadata
    enriched.capture_metadata = {
      source,
      user_agent: navigator.userAgent,
      captured_at: new Date().toISOString(),
      word_count: data.content.split(/\s+/).length,
      line_count: data.content.split('\n').length,
      has_unicode: /[^\x00-\x7F]/.test(data.content)
    };

    return enriched;
  }

  detectContentType(content) {
    // Code detection
    if (this.isCode(content)) return 'code';

    // URL
    if (FC_PATTERNS.URL.test(content)) return 'link';

    // Email
    if (FC_PATTERNS.EMAIL.test(content)) return 'email';

    // Phone
    if (FC_PATTERNS.PHONE.test(content)) return 'phone';

    // Markdown
    if (FC_PATTERNS.MARKDOWN_HEADER.test(content)) return 'markdown';

    // HTML
    if (FC_PATTERNS.HTML_TAG.test(content)) return 'html';

    // Check if multi-line paragraph
    if (content.includes('\n\n')) return 'paragraph';

    return 'text';
  }

  isCode(content) {
    const codeIndicators = [
      /^(const|let|var|function|class|import|export)\s/m,
      /^(def|class|import|from)\s/m, // Python
      /^<\?php/, // PHP
      /^(SELECT|INSERT|UPDATE|DELETE)\s/i, // SQL
      /^(function|const|let|var)\s+\w+\s*[=:]/m,
      /[{};]\s*$/, // Ends with brace or semicolon
      /^(if|for|while|switch|try|catch)\s*[({]/m,
      /^(public|private|protected|static)\s+/m, // Java/C#
    ];

    // Need multiple indicators for confidence
    let score = 0;
    for (const pattern of codeIndicators) {
      if (pattern.test(content)) score++;
    }

    return score >= 2;
  }

  extractUrls(text) {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
    return [...text.matchAll(urlRegex)].map(m => m[0]);
  }

  extractEmails(text) {
    const emailRegex = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
    return [...text.matchAll(emailRegex)].map(m => m[0]);
  }

  generatePreview(content) {
    // First 200 chars, normalized
    let preview = content.substring(0, 200).trim();
    
    // Remove extra whitespace
    preview = preview.replace(/\s+/g, ' ');
    
    // Add ellipsis if truncated
    if (content.length > 200) {
      preview += '...';
    }

    return preview;
  }

  // ============================================
  // CLIP DOCUMENT CREATION
  // ============================================

  createClipDocument(data) {
    const now = new Date().toISOString();

    return {
      id: crypto.randomUUID(),
      content: data.content,
      content_type: data.content_type || 'text',
      preview: data.preview || data.content.substring(0, 200),
      
      // Source info
      source_url: data.source_url || null,
      source_title: data.source_title || null,
      source_app: data.source_app || 'Unknown',
      source_tab_id: data.source_tab_id || null,
      
      // Metadata
      metadata: {
        ...data.metadata,
        ...data.capture_metadata,
        extracted_urls: data.extracted_urls || [],
        extracted_emails: data.extracted_emails || []
      },
      
      // User state
      is_favorite: false,
      is_deleted: false,
      is_archived: false,
      tags: [],
      
      // Timestamps
      created_at: now,
      updated_at: now,
      deleted_at: null,
      archived_at: null,
      
      // Sync
      sync_status: 'pending',
      last_sync_at: null,
      
      // CRDT
      version: 1,
      modified_by: null
    };
  }

  // ============================================
  // LOCAL STORAGE
  // ============================================

  async saveToLocalDB(clip) {
    const db = await this.getDB();
    const tx = db.transaction('clips', 'readwrite');
    const store = tx.objectStore('clips');
    await store.put(clip);
  }

  async getDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('FreeClipboardDB', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  // ============================================
  // BATCH CAPTURE
  // ============================================

  async captureBatch(items, source = 'batch') {
    const results = [];

    for (const item of items) {
      try {
        const result = await this.capture(item, source);
        results.push(result);
      } catch (err) {
        results.push({ success: false, error: err.message });
      }
    }

    return {
      total: items.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  // ============================================
  // STATS
  // ============================================

  getStats() {
    return {
      totalCaptures: this.captureCounter,
      recentDuplicates: this.recentCaptures.size,
      isHealthy: true
    };
  }
}

// Singleton
let instance = null;

export function getCaptureHandler(syncEngine) {
  if (!instance) {
    instance = new CaptureHandler(syncEngine);
  }
  return instance;
}

export default CaptureHandler;
