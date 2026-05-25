/**
 * FreeClipboard Extension - AI Bridge
 * Handles all AI processing with caching and rate limiting
 */

import { FC_CONFIG } from '../lib/constants-module.js';

class AIBridge {
  constructor(supabaseClient) {
    this.db = supabaseClient;
    this.cache = new Map();
    this.pendingRequests = new Map();
    this.rateLimitReset = 0;
    this.requestCount = 0;
  }

  // ============================================
  // CACHE MANAGEMENT
  // ============================================

  getCacheKey(action, content) {
    const hash = this.simpleHash(content.substring(0, 500));
    return `${action}:${hash}`;
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  getCached(action, content) {
    const key = this.getCacheKey(action, content);
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < FC_CONFIG.CACHE_EXPIRY) {
      return cached.data;
    }
    
    this.cache.delete(key);
    return null;
  }

  setCached(action, content, data) {
    const key = this.getCacheKey(action, content);
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });

    // Cleanup old cache entries
    if (this.cache.size > 1000) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
  }

  // ============================================
  // RATE LIMITING
  // ============================================

  async checkRateLimit() {
    const now = Date.now();
    
    if (now > this.rateLimitReset) {
      this.requestCount = 0;
      this.rateLimitReset = now + 60000; // 1 minute window
    }

    if (this.requestCount >= 60) { // 60 requests per minute
      throw new Error('Rate limit exceeded. Please try again later.');
    }

    this.requestCount++;
  }

  // ============================================
  // AI REQUESTS
  // ============================================

  async request(endpoint, payload) {
    // Check cache
    const cacheKey = `${endpoint}:${payload.content?.substring(0, 100) || JSON.stringify(payload)}`;
    const cached = this.getCached(endpoint, payload.content || '');
    if (cached) return cached;

    // Check rate limit
    await this.checkRateLimit();

    // Check for pending identical request
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    // Make request
    const promise = this.makeRequest(endpoint, payload);
    this.pendingRequests.set(cacheKey, promise);

    try {
      const result = await promise;
      this.setCached(endpoint, payload.content || '', result);
      return result;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  async makeRequest(endpoint, payload) {
    const { data: { session } } = await this.db.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(`${FC_CONFIG.AI_ENDPOINT}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `AI request failed: ${response.status}`);
    }

    return response.json();
  }

  // ============================================
  // FEATURES
  // ============================================

  async generateTags(content) {
    return this.request('tags', {
      content: content.substring(0, 2000),
      max_tags: 5
    });
  }

  async summarize(content, options = {}) {
    return this.request('summarize', {
      content: content.substring(0, 10000),
      max_length: options.maxLength || 150,
      style: options.style || 'concise'
    });
  }

  async translate(content, targetLang) {
    return this.request('translate', {
      content: content.substring(0, 5000),
      target_language: targetLang,
      preserve_formatting: true
    });
  }

  async explainCode(code, language) {
    return this.request('explain-code', {
      code: code.substring(0, 8000),
      language: language || 'auto'
    });
  }

  async generateReply(context, message, tone = 'professional') {
    return this.request('generate-reply', {
      context: context.substring(0, 3000),
      message: message.substring(0, 1000),
      tone
    });
  }

  async analyzeSentiment(content) {
    return this.request('sentiment', {
      content: content.substring(0, 5000)
    });
  }

  async extractEntities(content) {
    return this.request('entities', {
      content: content.substring(0, 5000)
    });
  }

  // ============================================
  // BATCH PROCESSING
  // ============================================

  async processClip(clip) {
    const tasks = [];
    const results = {};

    // Always generate tags
    tasks.push(
      this.generateTags(clip.content).then(tags => {
        results.tags = tags;
      }).catch(() => {})
    );

    // Summarize long content
    if (clip.content.length > 200) {
      tasks.push(
        this.summarize(clip.content).then(summary => {
          results.summary = summary;
        }).catch(() => {})
      );
    }

    // Code explanation
    if (clip.content_type === 'code') {
      tasks.push(
        this.explainCode(clip.content).then(explanation => {
          results.code_explanation = explanation;
        }).catch(() => {})
      );
    }

    // Sentiment for text
    if (clip.content_type === 'text' || clip.content_type === 'paragraph') {
      tasks.push(
        this.analyzeSentiment(clip.content).then(sentiment => {
          results.sentiment = sentiment;
        }).catch(() => {})
      );
    }

    // Wait for all with timeout
    await Promise.race([
      Promise.all(tasks),
      new Promise(resolve => setTimeout(resolve, 10000)) // 10s max
    ]);

    return results;
  }

  // ============================================
  // SMART FEATURES
  // ============================================

  async suggestRelated(clips, currentClip) {
    // Find semantically related clips
    return this.request('related', {
      current: currentClip.content.substring(0, 1000),
      candidates: clips.map(c => ({
        id: c.id,
        preview: c.content.substring(0, 200)
      }))
    });
  }

  async autoCategorize(clips) {
    // Suggest categories for uncategorized clips
    return this.request('categorize', {
      clips: clips.map(c => ({
        id: c.id,
        content: c.content.substring(0, 500),
        type: c.content_type
      }))
    });
  }

  // ============================================
  // STATS
  // ============================================

  getStats() {
    return {
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size,
      requestCount: this.requestCount,
      rateLimitReset: this.rateLimitReset
    };
  }
}

// Singleton
let instance = null;

export function getAIBridge(supabaseClient) {
  if (!instance) {
    instance = new AIBridge(supabaseClient);
  }
  return instance;
}

export default AIBridge;
