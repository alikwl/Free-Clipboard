/**
 * FreeClipboard Extension - OAuth Helper for Chrome Extensions
 * Handles OAuth flow using chrome.identity API properly
 */

import { FC_CONFIG } from './constants-module.js';

export class ChromeOAuthHandler {
  constructor() {
    this.extensionId = chrome.runtime.id;
    this.redirectUrl = chrome.identity.getRedirectURL ? 
      chrome.identity.getRedirectURL() : 
      `chrome-extension://${this.extensionId}/`;
    
    console.log('[OAuth] Extension ID:', this.extensionId);
    console.log('[OAuth] Redirect URL:', this.redirectUrl);
  }

  /**
   * Perform OAuth flow using chrome.identity
   */
  async authenticate(provider = 'google') {
    console.log(`[OAuth] Starting ${provider} authentication...`);

    if (!chrome.identity) {
      throw new Error('Chrome Identity API not available');
    }

    try {
      // Build the authorization URL
      const authUrl = this.buildAuthUrl(provider);
      console.log('[OAuth] Auth URL built, launching web auth flow...');

      // Launch the browser auth flow
      const responseUrl = await this.launchWebAuthFlow(authUrl);
      console.log('[OAuth] Got response from auth flow');

      // Parse the response
      const session = this.parseAuthResponse(responseUrl);
      console.log('[OAuth] Session parsed successfully');

      return session;
    } catch (error) {
      console.error('[OAuth] Authentication failed:', error);
      throw new Error(`OAuth authentication failed: ${error.message}`);
    }
  }

  /**
   * Build the Supabase authorization URL
   */
  buildAuthUrl(provider) {
    const params = new URLSearchParams({
      client_id: FC_CONFIG.SUPABASE_ANON_KEY.split('.')[0] || '',
      redirect_to: this.redirectUrl,
      response_type: 'code',
      scope: 'openid profile email',
      provider: provider
    });

    const url = `${FC_CONFIG.SUPABASE_URL}/auth/v1/authorize?${params.toString()}`;
    console.log('[OAuth] Auth URL:', url.substring(0, 100) + '...');
    return url;
  }

  /**
   * Launch the web auth flow using chrome.identity
   */
  launchWebAuthFlow(authUrl) {
    return new Promise((resolve, reject) => {
      try {
        const interactive = true; // Show UI for user interaction

        chrome.identity.launchWebAuthFlow({ url: authUrl, interactive }, (redirectUrl) => {
          // Check for Chrome errors
          if (chrome.runtime.lastError) {
            const errObj = chrome.runtime.lastError;
            // Normalize message extraction for different shapes
            let errMsg = '';
            try {
              errMsg = errObj && (errObj.message || errObj.error || String(errObj)) || 'Unknown chrome.runtime.lastError';
            } catch (e) {
              errMsg = String(errObj);
            }

            // Log full object for diagnostics (stringify safe)
            let errJson;
            try { errJson = JSON.stringify(errObj); } catch (e) { errJson = String(errObj); }
            console.error('[OAuth] Chrome runtime lastError:', errMsg, errJson);

            // Provide clearer, actionable rejections
            const lower = (errMsg || '').toLowerCase();
            if (lower.includes('user') || lower.includes('cancelled')) {
              reject(new Error('User cancelled the authentication'));
            } else if (lower.includes('authorization') || lower.includes('load') || lower.includes('net::')) {
              // Include diagnostic hint
              const diag = ChromeOAuthHandler.getDiagnostics();
              reject(new Error(`Authorization page could not be loaded. ${errMsg}. Diagnostics: ${JSON.stringify(diag)}`));
            } else if (lower.includes('permission') || lower.includes('not granted')) {
              reject(new Error('Chrome Identity permission required - ensure "identity" is in manifest and reload the extension'));
            } else {
              reject(new Error(`Chrome Identity error: ${errMsg}`));
            }
            return;
          }

          if (!redirectUrl) {
            reject(new Error('No redirect URL received - auth flow may have been cancelled'));
            return;
          }

          console.log('[OAuth] Redirect URL received, parsing response...');
          resolve(redirectUrl);
        });
      } catch (error) {
        console.error('[OAuth] Failed to launch web auth flow:', error);
        reject(error);
      }
    });
  }

  /**
   * Parse the authentication response from Supabase
   */
  parseAuthResponse(redirectUrl) {
    try {
      const url = new URL(redirectUrl);
      
      // Check for error in URL
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');
      
      if (error) {
        throw new Error(`OAuth provider returned error: ${error} - ${errorDescription || ''}`);
      }

      // Get authorization code
      const code = url.searchParams.get('code');
      if (!code) {
        throw new Error('No authorization code in response');
      }

      console.log('[OAuth] Authorization code received');

      // Return session with code - will be exchanged server-side
      return {
        code,
        redirectUrl: this.redirectUrl,
        provider: 'google'
      };
    } catch (error) {
      console.error('[OAuth] Failed to parse auth response:', error);
      throw error;
    }
  }

  /**
   * Exchange authorization code for session tokens (server-side)
   * This should be called from the backend
   */
  async exchangeCodeForSession(code) {
    try {
      const response = await fetch(`${FC_CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=authorization_code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': FC_CONFIG.SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          code,
          grant_type: 'authorization_code'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Token exchange failed: ${error.message || response.statusText}`);
      }

      const session = await response.json();
      console.log('[OAuth] Token exchange successful');
      return session;
    } catch (error) {
      console.error('[OAuth] Token exchange failed:', error);
      throw error;
    }
  }

  /**
   * Check if chrome.identity is properly initialized
   */
  static isAvailable() {
    return typeof chrome !== 'undefined' && 
           typeof chrome.identity !== 'undefined' &&
           typeof chrome.identity.getRedirectURL === 'function' &&
           typeof chrome.identity.launchWebAuthFlow === 'function';
  }

  /**
   * Get diagnostic info
   */
  static getDiagnostics() {
    return {
      chromeAvailable: typeof chrome !== 'undefined',
      identityAvailable: typeof chrome !== 'undefined' && typeof chrome.identity !== 'undefined',
      getRedirectURLAvailable: typeof chrome !== 'undefined' && 
                              typeof chrome.identity !== 'undefined' &&
                              typeof chrome.identity.getRedirectURL === 'function',
      launchWebAuthFlowAvailable: typeof chrome !== 'undefined' && 
                                 typeof chrome.identity !== 'undefined' &&
                                 typeof chrome.identity.launchWebAuthFlow === 'function'
    };
  }
}

export default ChromeOAuthHandler;
