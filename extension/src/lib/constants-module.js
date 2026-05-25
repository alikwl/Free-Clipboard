/**
 * Module wrapper for extension runtime files.
 * Keep src/lib/constants.js export-free so it can also run as a plain content script.
 */

const FC_CONFIG = globalThis.FC_CONFIG || {
  SUPABASE_URL: 'https://ymfxpnyhlxirfzhjirfv.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InltZnhwbnlobHhpcmZ6aGppcmZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NjI5MzMsImV4cCI6MjA5NTEzODkzM30.oZo1i6s4pz7xATjF6Xgd98vewMpF5W-BCNM1QC84UBw',
  API_BASE: 'https://freeclipboard.com',
  AI_ENDPOINT: 'https://ai.freeclipboard.com',
  SYNC_INTERVAL: 30000,
  SYNC_BATCH_SIZE: 10,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  MAX_LOCAL_CLIPS: 1000,
  MAX_CLIP_LENGTH: 100000,
  CACHE_EXPIRY: 7 * 24 * 60 * 60 * 1000,
  TOOLTIP_AUTO_HIDE: 3000,
  BADGE_DURATION: 1500,
  SEARCH_DEBOUNCE: 150,
  ENABLE_CLIPBOARD_MONITOR: true,
  ENABLE_SMART_TOOLTIP: true,
  ENABLE_AI_FEATURES: true,
  ENABLE_OFFLINE_QUEUE: true,
  CONTENT_TYPES: {
    TEXT: 'text',
    CODE: 'code',
    LINK: 'link',
    IMAGE: 'image',
    EMAIL: 'email',
    PHONE: 'phone',
    ADDRESS: 'address',
    HTML: 'html',
    MARKDOWN: 'markdown'
  }
};

const FC_PATTERNS = globalThis.FC_PATTERNS || {
  URL: /^https?:\/\/[^\s]+/i,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^[\d\s\-\+\(\)]{10,}$/,
  CODE_BLOCK: /^(function|const|let|var|class|import|export|if|for|while|return)\s/m,
  HTML_TAG: /<[^>]+>/,
  MARKDOWN_HEADER: /^#{1,6}\s/,
  API_KEY: /^(sk-|pk-|ak-|bk-)[a-zA-Z0-9]{20,}$/,
  PASSWORD_FIELD: /password|passwd|pwd/i
};

const FC_ERRORS = globalThis.FC_ERRORS || {
  AUTH_EXPIRED: 'auth_expired',
  NETWORK_ERROR: 'network_error',
  QUOTA_EXCEEDED: 'quota_exceeded',
  INVALID_CONTENT: 'invalid_content',
  SYNC_CONFLICT: 'sync_conflict'
};

export { FC_CONFIG, FC_PATTERNS, FC_ERRORS };
