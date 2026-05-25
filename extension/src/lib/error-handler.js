/**
 * FreeClipboard Extension - Error Handler
 * Centralized error handling, logging, and recovery
 */

export class FreeClipboardError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'FreeClipboardError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

// Error codes and HTTP status mappings
export const ERROR_CODES = {
  AUTH_EXPIRED: { code: 'AUTH_EXPIRED', status: 401, userMsg: 'Your session expired. Please sign in again.' },
  AUTH_INVALID: { code: 'AUTH_INVALID', status: 401, userMsg: 'Authentication failed. Please try again.' },
  NETWORK_ERROR: { code: 'NETWORK_ERROR', status: 0, userMsg: 'Connection error. Please check your internet.' },
  SYNC_CONFLICT: { code: 'SYNC_CONFLICT', status: 409, userMsg: 'Sync conflict detected. Resolving...' },
  QUOTA_EXCEEDED: { code: 'QUOTA_EXCEEDED', status: 429, userMsg: 'You\'ve reached your limit. Please upgrade.' },
  INVALID_CONTENT: { code: 'INVALID_CONTENT', status: 400, userMsg: 'Invalid content format.' },
  DATABASE_ERROR: { code: 'DATABASE_ERROR', status: 500, userMsg: 'Database error. Please try again.' },
  SIGNIN_FAILED: { code: 'SIGNIN_FAILED', status: 401, userMsg: 'Sign in failed. Please try again.' },
  OAUTH_CANCELLED: { code: 'OAUTH_CANCELLED', status: 0, userMsg: 'Sign in was cancelled.' },
  SUPABASE_INIT: { code: 'SUPABASE_INIT', status: 500, userMsg: 'Failed to initialize. Please refresh.' },
  UNKNOWN_ERROR: { code: 'UNKNOWN_ERROR', status: 500, userMsg: 'Something went wrong. Please try again.' }
};

/**
 * ErrorHandler: Centralized error handling service
 */
export class ErrorHandler {
  constructor() {
    this.errorLog = [];
    this.maxLogSize = 1000;
    this.subscribers = new Map();
  }

  /**
   * Log an error with context
   */
  log(error, context = {}) {
    const errorInfo = {
      timestamp: new Date().toISOString(),
      message: error?.message || 'Unknown error',
      code: error?.code || 'UNKNOWN_ERROR',
      stack: error?.stack || '',
      context,
      type: error?.name || 'Error'
    };

    // Add to error log
    this.errorLog.push(errorInfo);
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }

    // Log to console in development
    console.error('[FreeClipboard Error]', errorInfo);

    // Send to listeners
    this.notify('error', errorInfo);

    return errorInfo;
  }

  /**
   * Handle an error with recovery logic
   */
  async handle(error, options = {}) {
    const { 
      context = {},
      retry = false, 
      recoveryFn = null,
      fallback = null,
      retryCount = 0,
      maxRetries = 3
    } = options;

    // Log the error
    this.log(error, { ...context, attempt: retryCount + 1 });

    // Determine error type and recovery action
    const errorCode = this.classifyError(error);
    const recovery = this.getRecoveryAction(errorCode);

    // If recoverable and retries remaining, retry
    if (retry && recovery.recoverable && retryCount < maxRetries) {
      console.log(`[FreeClipboard] Retrying after ${recovery.delay}ms...`);
      await this.delay(recovery.delay);
      
      if (recoveryFn) {
        return this.handle(
          await recoveryFn().catch(e => e),
          { ...options, retryCount: retryCount + 1 }
        );
      }
    }

    // Use fallback if available
    if (fallback) {
      console.log('[FreeClipboard] Using fallback...');
      return fallback;
    }

    // Throw the error
    throw new FreeClipboardError(
      recovery.userMsg || error.message,
      errorCode,
      { original: error, context }
    );
  }

  /**
   * Classify error by type and message
   */
  classifyError(error) {
    const msg = error?.message?.toLowerCase() || '';
    const code = error?.code || '';

    // Auth errors
    if (msg.includes('jwt') || msg.includes('session expired') || code === 'PGRST301') {
      return 'AUTH_EXPIRED';
    }
    if (msg.includes('unauthorized') || msg.includes('not authenticated') || code === 'PGRST301') {
      return 'AUTH_INVALID';
    }

    // Network errors
    if (msg.includes('network') || msg.includes('fetch failed') || code === 'NETWORK_ERROR') {
      return 'NETWORK_ERROR';
    }

    // Conflict errors
    if (msg.includes('conflict') || code === '23505') {
      return 'SYNC_CONFLICT';
    }

    // Quota errors
    if (msg.includes('quota') || msg.includes('limit') || code === '429') {
      return 'QUOTA_EXCEEDED';
    }

    // Database errors
    if (msg.includes('database') || msg.includes('postgres') || code === '42') {
      return 'DATABASE_ERROR';
    }

    // OAuth errors
    if (msg.includes('oauth') || msg.includes('cancelled')) {
      return 'OAUTH_CANCELLED';
    }

    return 'UNKNOWN_ERROR';
  }

  /**
   * Get recovery action for error type
   */
  getRecoveryAction(errorCode) {
    const recoveryMap = {
      AUTH_EXPIRED: { recoverable: true, delay: 1000, userMsg: 'Session expired. Signing in again...' },
      AUTH_INVALID: { recoverable: true, delay: 2000, userMsg: 'Please sign in again.' },
      NETWORK_ERROR: { recoverable: true, delay: 3000, userMsg: 'Reconnecting...' },
      SYNC_CONFLICT: { recoverable: true, delay: 2000, userMsg: 'Resolving sync conflict...' },
      QUOTA_EXCEEDED: { recoverable: false, delay: 0, userMsg: 'Upgrade required.' },
      INVALID_CONTENT: { recoverable: false, delay: 0, userMsg: 'Invalid content.' },
      DATABASE_ERROR: { recoverable: true, delay: 5000, userMsg: 'Database error. Retrying...' },
      SIGNIN_FAILED: { recoverable: true, delay: 2000, userMsg: 'Sign in failed. Please try again.' },
      OAUTH_CANCELLED: { recoverable: false, delay: 0, userMsg: 'Sign in cancelled.' },
      SUPABASE_INIT: { recoverable: true, delay: 3000, userMsg: 'Initializing...' },
      UNKNOWN_ERROR: { recoverable: true, delay: 2000, userMsg: 'Something went wrong. Retrying...' }
    };

    return recoveryMap[errorCode] || recoveryMap.UNKNOWN_ERROR;
  }

  /**
   * Wrap async function with error handling
   */
  async wrap(fn, context = {}) {
    try {
      return await fn();
    } catch (error) {
      return this.handle(error, { context });
    }
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(error) {
    const errorCode = this.classifyError(error);
    const errorInfo = ERROR_CODES[errorCode];
    return errorInfo?.userMsg || 'An error occurred. Please try again.';
  }

  /**
   * Subscribe to error events
   */
  on(event, callback) {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, new Set());
    }
    this.subscribers.get(event).add(callback);

    return () => this.subscribers.get(event).delete(callback);
  }

  /**
   * Notify error subscribers
   */
  notify(event, data) {
    const callbacks = this.subscribers.get(event);
    if (!callbacks) return;

    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (err) {
        console.error('[FreeClipboard] Subscriber error:', err);
      }
    });
  }

  /**
   * Get error log
   */
  getLog(limit = 50) {
    return this.errorLog.slice(-limit);
  }

  /**
   * Clear error log
   */
  clearLog() {
    this.errorLog = [];
  }

  /**
   * Helper: Delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();
