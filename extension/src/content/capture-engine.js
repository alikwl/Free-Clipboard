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

  function init() {
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
