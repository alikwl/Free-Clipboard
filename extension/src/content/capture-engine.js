/**
 * FreeClipboard Extension - Content Capture Engine
 * Handles passive capture paths only. Selection tooltip UI lives in smart-tooltip.js.
 */

(function() {
  'use strict';

  if (window.__fcCaptureEngine) return;
  window.__fcCaptureEngine = true;

  const CONFIG = {
    MIN_SELECTION_LENGTH: 10,
    SMART_DETECT_INTERVAL: 500,
    MAX_CLIP_LENGTH: 100000
  };

  let lastSelection = '';
  let isEnabled = true;
  let authHandoffInFlight = false;

  function init() {
    if (completeExtensionAuthFromPage()) {
      return;
    }

    setupWebsiteAuthMessageBridge();

    chrome.storage.local.get('fc_settings', (result) => {
      const settings = result.fc_settings || {};
      isEnabled = settings.capture_enabled !== false;
    });

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.fc_settings) {
        isEnabled = changes.fc_settings.newValue?.capture_enabled !== false;
      }
    });

    setupCopyListener();
    setupSelectionListener();
    setupKeyboardListener();
  }

  function completeExtensionAuthFromPage() {
    const isFreeClipboardPage = /(^|\.)freeclipboard\.com$/i.test(window.location.hostname) ||
      /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
    const params = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash);
    const hasAuthToken = params.has('access_token') || params.has('refresh_token');

    if (!isFreeClipboardPage || !hasAuthToken) {
      return false;
    }

    if (authHandoffInFlight) {
      return true;
    }

    authHandoffInFlight = true;
    const callbackUrl = window.location.href;
    try {
      window.history.replaceState(null, document.title, `${window.location.origin}/extension-connected`);
    } catch {}

    chrome.runtime.sendMessage({
      type: 'COMPLETE_WEB_AUTH',
      data: { url: callbackUrl, closeAuthWindow: true }
    }, (response) => {
      authHandoffInFlight = false;
      if (chrome.runtime.lastError || !response?.success) {
        console.error('[FreeClipboard] Extension auth handoff failed:', chrome.runtime.lastError?.message || response?.error);
        renderAuthFailed();
        return;
      }

      renderAuthComplete();
      requestAuthWindowClose();
    });

    renderAuthCompleting();
    return true;
  }

  function setupWebsiteAuthMessageBridge() {
    const isFreeClipboardPage = /(^|\.)freeclipboard\.com$/i.test(window.location.hostname) ||
      /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

    if (!isFreeClipboardPage) {
      return;
    }

    consumeStoredWebsiteAuth();
    setTimeout(consumeStoredWebsiteAuth, 800);

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;

      const data = event.data || {};
      if (data.type !== 'FC_AUTH' && data.type !== 'FC_AUTH_TOKEN') {
        return;
      }

      const accessToken = data.token || data.access_token || data.accessToken;
      if (!accessToken) {
        return;
      }

      completeAuthTokenHandoff({
        accessToken,
        refreshToken: data.refresh_token || data.refreshToken || null,
        expiresIn: data.expires_in || data.expiresIn || 3600,
        source: 'website-message',
        closeAuthWindow: false
      });
    });
  }

  function completeAuthTokenHandoff({ accessToken, refreshToken = null, expiresIn = 3600, source = 'website', closeAuthWindow = false }) {
    if (authHandoffInFlight || !accessToken) {
      return;
    }

    authHandoffInFlight = true;
    chrome.runtime.sendMessage({
      type: 'COMPLETE_WEB_AUTH_TOKEN',
      data: { accessToken, refreshToken, expiresIn, closeAuthWindow }
    }, (response) => {
      authHandoffInFlight = false;
      if (chrome.runtime.lastError || !response?.success) {
        console.error('[FreeClipboard] Auth token handoff failed:', chrome.runtime.lastError?.message || response?.error);
        return;
      }
      console.log(`[FreeClipboard] ${source} auth connected to extension`);
      if (closeAuthWindow) {
        requestAuthWindowClose();
      }
    });
  }

  function requestAuthWindowClose() {
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'CLOSE_AUTH_WINDOW' }, () => {});
    }, 450);
  }

  function consumeStoredWebsiteAuth() {
    let raw = null;
    try {
      raw = window.localStorage.getItem('fc_extension_auth');
    } catch {
      return;
    }

    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const accessToken = parsed.token || parsed.access_token || parsed.accessToken;
      if (!accessToken) return;

      try {
        window.localStorage.removeItem('fc_extension_auth');
      } catch {}

      completeAuthTokenHandoff({
        accessToken,
        refreshToken: parsed.refreshToken || parsed.refresh_token || null,
        expiresIn: parsed.expiresIn || parsed.expires_in || 3600,
        source: 'stored website',
        closeAuthWindow: false
      });
    } catch (err) {
      console.error('[FreeClipboard] Stored auth payload could not be parsed:', err);
    }
  }

  function renderAuthCompleting() {
    document.documentElement.innerHTML = `
      <head>
        <title>FreeClipboard - Signing in</title>
        <style>
          body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fbff;color:#101828;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
          .card{width:min(360px,calc(100vw - 32px));padding:28px;border:1px solid #e5e7eb;border-radius:18px;background:white;box-shadow:0 20px 60px rgba(15,23,42,.12);text-align:center}
          .mark{width:52px;height:52px;margin:0 auto 16px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(135deg,#5b5cf6,#c33df2);color:white;font-size:26px}
          h1{margin:0 0 8px;font-size:22px;letter-spacing:0}
          p{margin:0;color:#667085;font-size:14px;line-height:1.5}
        </style>
      </head>
      <body><div class="card"><div class="mark">✓</div><h1>Connecting extension</h1><p>FreeClipboard is finishing sign in and syncing your saved clips.</p></div></body>
    `;
  }

  function renderAuthComplete() {
    const title = document.querySelector('h1');
    const text = document.querySelector('p');
    if (title) title.textContent = 'Extension connected';
    if (text) text.textContent = 'Signed in. This window will close automatically.';
  }

  function renderAuthFailed() {
    const title = document.querySelector('h1');
    const text = document.querySelector('p');
    if (title) title.textContent = 'Extension connection failed';
    if (text) text.textContent = 'Reload the extension, then sign in again from the toolbar.';
  }

  function setupCopyListener() {
    document.addEventListener('copy', () => {
      if (!isEnabled) return;

      const selection = window.getSelection()?.toString();
      if (selection && selection.length >= CONFIG.MIN_SELECTION_LENGTH) {
        capture(selection, 'copy-event');
      }
    });
  }

  function setupSelectionListener() {
    let selectionTimeout;

    document.addEventListener('selectionchange', () => {
      if (!isEnabled) return;

      clearTimeout(selectionTimeout);
      selectionTimeout = setTimeout(() => {
        const selection = window.getSelection()?.toString();
        if (selection) {
          lastSelection = selection;
        }
      }, CONFIG.SMART_DETECT_INTERVAL);
    });
  }

  function setupKeyboardListener() {
    document.addEventListener('keydown', (event) => {
      if (!isEnabled) return;

      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'C') {
        event.preventDefault();
        const selection = window.getSelection()?.toString();
        if (selection) {
          capture(selection, 'keyboard-shortcut');
          showFlashMessage('Saved to FreeClipboard');
        }
      }
    });
  }

  function capture(content, sourceMethod, options = {}) {
    if (!content || content.length < CONFIG.MIN_SELECTION_LENGTH) return;
    let normalizedContent = content;
    if (normalizedContent.length > CONFIG.MAX_CLIP_LENGTH) {
      normalizedContent = normalizedContent.substring(0, CONFIG.MAX_CLIP_LENGTH);
    }

    if (isSensitive(normalizedContent)) {
      console.log('[FreeClipboard] Sensitive content detected, skipping');
      return;
    }

    chrome.runtime.sendMessage({
      type: 'CAPTURE_CLIP',
      data: {
        content: normalizedContent,
        source_method: sourceMethod,
        content_type: detectContentType(normalizedContent),
        page_title: document.title,
        page_url: window.location.href,
        page_domain: window.location.hostname,
        timestamp: Date.now(),
        metadata: {
          ...options,
          word_count: normalizedContent.split(/\s+/).length,
          char_count: normalizedContent.length,
          has_code: /function|const|let|var|import|export/.test(normalizedContent),
          has_url: /https?:\/\//.test(normalizedContent),
          has_email: /\S+@\S+\.\S+/.test(normalizedContent)
        }
      }
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('[FreeClipboard] Capture failed:', chrome.runtime.lastError.message);
      }
    });
  }

  function showFlashMessage(message) {
    const flash = document.createElement('div');
    flash.className = 'fc-flash-message';
    flash.textContent = message;
    flash.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #7C3AED;
      color: white;
      padding: 12px 20px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      z-index: 2147483647;
      animation: fcSlideIn 0.25s ease, fcFadeOut 0.25s ease 2.25s;
      box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    `;

    addAnimationStyles();
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 2500);
  }

  function addAnimationStyles() {
    if (document.getElementById('fc-animation-styles')) return;

    const style = document.createElement('style');
    style.id = 'fc-animation-styles';
    style.textContent = `
      @keyframes fcSlideIn {
        from { opacity: 0; transform: translateX(20px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes fcFadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
    `;

    document.head.appendChild(style);
  }

  function detectContentType(content) {
    if (/^https?:\/\//.test(content)) return 'link';
    if (/<[^>]+>/.test(content)) return 'html';
    if (/function|const|let|var|import|export/.test(content)) return 'code';
    return 'text';
  }

  function isSensitive(content) {
    const patterns = [
      /password[:=]\s*\S+/i,
      /api[_-]?key[:=]\s*\S+/i,
      /secret[:=]\s*\S+/i,
      /token[:=]\s*\S+/i,
      /\b\d{16}\b/,
      /\b\d{3}-\d{2}-\d{4}\b/
    ];
    return patterns.some((pattern) => pattern.test(content));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
