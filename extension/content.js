(function () {
  'use strict';

  const HOST = window.location.hostname;
  const IS_FC = HOST.includes('freeclipboard.com') || HOST === 'localhost';

  if (!IS_FC) {
    handleSnippetExpansion();
    return;
  }

  // ══════════════════════════════════════════════════════════
  //  On freeclipboard.com: listen for auth token from website
  // ══════════════════════════════════════════════════════════
  window.addEventListener('message', (event) => {
    if (!IS_FC) return;
    if (event.data?.type !== 'FC_AUTH_TOKEN') return;
    if (!event.data?.token) return;

    console.log('FreeClipboard: Token received, sending to extension');

    chrome.runtime.sendMessage({
      type: 'SAVE_TOKEN',
      token: event.data.token
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('Extension message error:', chrome.runtime.lastError.message);
        return;
      }
      console.log('Token saved:', response);
    });
  });

  // Also handle snippet expansion on freeclipboard.com
  handleSnippetExpansion();

  // ══════════════════════════════════════════════════════════
  //  Snippet expansion
  // ══════════════════════════════════════════════════════════
  function handleSnippetExpansion() {
    document.addEventListener('keyup', (e) => {
      const el = e.target;
      if (!['INPUT', 'TEXTAREA'].includes(el.tagName) && !el.isContentEditable) return;

      let value = el.value || el.textContent || '';
      const match = value.match(/;;(\w+)$/);
      if (!match) return;

      const trigger = ';;' + match[1];
      chrome.storage.local.get('fc_snippets', (stored) => {
        const snippets = stored.fc_snippets || [];
        const snippet = snippets.find(s => s.trigger_key === trigger);
        if (!snippet) return;

        const newValue = value.replace(trigger, snippet.content);
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          el.value = newValue;
        } else {
          el.textContent = newValue;
        }
        showToast('Snippet expanded');
      });
    });
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position:fixed;bottom:20px;right:20px;background:#7C3AED;color:white;
      padding:10px 16px;border-radius:8px;font-size:14px;z-index:999999;
      box-shadow:0 4px 12px rgba(0,0,0,0.2);animation:fcSlideIn .3s ease;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    `;
    toast.textContent = '\u{1F4CB} ' + message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }
})();
