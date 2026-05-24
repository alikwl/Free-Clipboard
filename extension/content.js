(function () {
  'use strict';

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
