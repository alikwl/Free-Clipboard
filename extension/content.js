(function () {
  'use strict';

  const API_BASE = 'https://freeclipboard.com';
  let snippets = [];
  let cachedClips = [];
  let userContext = { name: '', email: '' };

  function isValid() {
    return !!(chrome.runtime && chrome.runtime.id);
  }

  function safeStorageGet(keys, cb) {
    if (!isValid()) return;
    try { chrome.storage.local.get(keys, cb); } catch (_) {}
  }

  function safeStorageSet(obj, cb) {
    if (!isValid()) return;
    try { chrome.storage.local.set(obj, cb); } catch (_) {}
  }

  function safeSendMessage(msg, cb) {
    if (!isValid()) return;
    try { chrome.runtime.sendMessage(msg, cb); } catch (_) {}
  }

  // ══════════════════════════════════════════════════════════
  //  Snippet expansion
  // ══════════════════════════════════════════════════════════

  function resolveVars(content) {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const first = (userContext.name || '').split(' ')[0] || userContext.name;

    return content
      .replace(/\{name\}/g, first)
      .replace(/\{email\}/g, userContext.email)
      .replace(/\{date\}/g, `${day}/${month}/${year}`)
      .replace(/\{time\}/g, `${h}:${m}`)
      .replace(/\{url\}/g, window.location.href)
      .replace(/\{title\}/g, document.title);
  }

  function detectTrigger(textarea) {
    const pos = textarea.selectionStart;
    const text = textarea.value;
    const before = text.substring(0, pos);
    const match = before.match(/;;[a-zA-Z0-9_-]*$/);
    if (!match || match[0].length < 3) return null;
    return { trigger: match[0], start: pos - match[0].length, end: pos };
  }

  function expandSnippet(textarea) {
    const d = detectTrigger(textarea);
    if (!d) return false;

    const snip = snippets.find(s => s.trigger_key === d.trigger);
    if (!snip) return false;

    const resolved = resolveVars(snip.content);
    const text = textarea.value;
    const newText = text.substring(0, d.start) + resolved + text.substring(d.end);
    textarea.value = newText;
    const cursor = d.start + resolved.length;
    textarea.selectionStart = cursor;
    textarea.selectionEnd = cursor;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));

    // Track usage
    safeSendMessage({
      type: 'EXPAND_SNIPPET',
      trigger: d.trigger
    });
    return true;
  }

  function attachSnippets(el) {
    if (el.dataset.fcSnippet) return;
    el.dataset.fcSnippet = '1';
    el.addEventListener('keyup', () => expandSnippet(el));
  }

  function scanInputs() {
    const inputs = document.querySelectorAll(
      'input[type="text"], input[type="search"], textarea, [contenteditable="true"]'
    );
    inputs.forEach(attachSnippets);
  }

  function loadSnippets() {
    safeStorageGet(['snippets', 'userContext'], r => {
      snippets = r.snippets || [];
      userContext = r.userContext || {};
    });
  }

  // ══════════════════════════════════════════════════════════
  //  Quick paste overlay (Ctrl+Shift+V)
  // ══════════════════════════════════════════════════════════

  let overlayEl = null;

  function removeOverlay() {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    document.removeEventListener('keydown', onOverlayKey);
  }

  function onOverlayKey(e) {
    if (e.key === 'Escape') removeOverlay();
  }

  function showQuickPaste() {
    removeOverlay();
    safeStorageGet(['cached_clips'], r => {
      cachedClips = (r.cached_clips || []).slice(0, 5);
      if (cachedClips.length === 0) {
        showToast('No clips saved yet');
        return;
      }
      buildOverlay();
    });
  }

  function buildOverlay() {
    overlayEl = document.createElement('div');
    overlayEl.id = 'fc-quick-paste';
    overlayEl.innerHTML = `
      <style>
        #fc-quick-paste { position:fixed; bottom:16px; right:16px; left:16px; z-index:999999;
          background:#0f172a; border:1px solid rgba(99,102,241,0.4); border-radius:14px;
          padding:12px; max-width:360px; box-shadow:0 20px 60px rgba(0,0,0,0.6);
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
          margin-left:auto; }
        #fc-quick-paste .fc-title { font-size:10px; font-weight:800; color:#818cf8;
          text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;
          display:flex; align-items:center; gap:6px; }
        #fc-quick-paste .fc-clip { display:flex; align-items:center; gap:8px;
          padding:8px 10px; border-radius:8px; cursor:pointer; transition:background .15s;
          background:rgba(255,255,255,0.02); margin-bottom:4px; }
        #fc-quick-paste .fc-clip:hover { background:rgba(99,102,241,0.1); }
        #fc-quick-paste .fc-clip-text { flex:1; font-size:11px; color:#cbd5e1;
          overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #fc-quick-paste .fc-clip-num { font-size:9px; color:#52525b; font-weight:700;
          min-width:16px; text-align:center; }
        #fc-quick-paste .fc-hint { font-size:9px; color:#52525b; text-align:center;
          margin-top:8px; }
      </style>
      <div class="fc-title">
        <span>\u{1F4CB}</span> Quick Paste
        <span style="flex:1"></span>
        <span style="font-size:9px;color:#52525b;font-weight:400">Esc to close</span>
      </div>
      ${cachedClips.map((c, i) => `
        <div class="fc-clip" data-idx="${i}">
          <span class="fc-clip-num">${i + 1}</span>
          <span class="fc-clip-text">${escapeHtml((c.content || '').substring(0, 80))}</span>
        </div>
      `).join('')}
      <div class="fc-hint">Click to paste into focused field</div>
    `;

    document.body.appendChild(overlayEl);

    overlayEl.querySelectorAll('.fc-clip').forEach(el => {
      el.onclick = () => {
        const idx = parseInt(el.dataset.idx);
        const clip = cachedClips[idx];
        if (!clip) return;
        const active = document.activeElement;
        if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT' || active.isContentEditable)) {
          if (active.isContentEditable) {
            document.execCommand('insertText', false, clip.content);
          } else {
            const start = active.selectionStart;
            const end = active.selectionEnd;
            active.value = active.value.substring(0, start) + clip.content + active.value.substring(end);
            active.selectionStart = active.selectionEnd = start + clip.content.length;
            active.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } else {
          navigator.clipboard.writeText(clip.content).then(() => {
            showToast('Copied to clipboard \u2705');
          });
        }
        removeOverlay();
      };
    });

    // Click outside closes
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!overlayEl?.contains(e.target)) { removeOverlay(); document.removeEventListener('click', handler); }
      });
    }, 0);

    document.addEventListener('keydown', onOverlayKey);
  }

  // ══════════════════════════════════════════════════════════
  //  Toast notification
  // ══════════════════════════════════════════════════════════

  function showToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `
      position:fixed; bottom:16px; left:50%; transform:translateX(-50%); z-index:9999999;
      padding:10px 18px; border-radius:10px; font-size:12px; font-weight:600;
      background:#0f172a; border:1px solid #22c55e; color:#86efac;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      pointer-events:none; transition:opacity 0.3s; opacity:1; white-space:nowrap;
    `;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2000);
  }

  // ══════════════════════════════════════════════════════════
  //  Context menu on text selection
  // ══════════════════════════════════════════════════════════

  document.addEventListener('mouseup', () => {
    const sel = window.getSelection()?.toString() || '';
    safeSendMessage({ type: 'HAS_SELECTION', hasSelection: sel.length > 0 });
  });

  // ══════════════════════════════════════════════════════════
  //  Keyboard shortcut: Ctrl+Shift+V triggers overlay (handled via background command)
  // ══════════════════════════════════════════════════════════

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'SHOW_QUICK_PASTE') showQuickPaste();
      if (msg.type === 'SAVE_SELECTION') {
        const sel = window.getSelection()?.toString()?.trim();
        if (sel) {
          safeStorageGet(['fc_token'], (r) => {
            if (!r.fc_token) { showToast('Please log in to FreeClipboard'); return; }
            fetch(API_BASE + '/api/clips', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + r.fc_token
              },
              body: JSON.stringify({ content: sel, source_url: window.location.href })
            })
            .then(res => { if (res.ok) showToast('\u2705 Saved to FreeClipboard'); else showToast('Failed to save'); })
            .catch(() => showToast('Failed to save'));
          });
        }
      }
    });
  } catch (_) {}

  // ══════════════════════════════════════════════════════════
  //  Auth bridge: receive token from web app login page
  // ══════════════════════════════════════════════════════════

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'FC_AUTH' && event.data.token && typeof event.data.token === 'string') {
      safeStorageSet({ fc_token: event.data.token }, () => {
        safeSendMessage({ type: 'SET_TOKEN', token: event.data.token });
        showToast('\u2705 Connected to FreeClipboard');
      });
    }
  });

  // ══════════════════════════════════════════════════════════
  //  Init
  // ══════════════════════════════════════════════════════════

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  scanInputs();
  loadSnippets();

  const observer = new MutationObserver(scanInputs);
  try { observer.observe(document.body, { childList: true, subtree: true }); } catch (_) {}

  // Safely refresh snippets every 30 minutes
  setInterval(() => {
    if (!chrome.runtime?.id) return;
    loadSnippets();
  }, 30 * 60 * 1000);

  // Safely refresh cached clips every 5 minutes
  setInterval(() => {
    if (!chrome.runtime?.id) return;
    try {
      safeStorageGet(['cached_clips'], r => { cachedClips = r.cached_clips || []; });
    } catch (_) {}
  }, 5 * 60 * 1000);
})();
