const API_BASE = 'https://freeclipboard.com';

// ── Save clip ─────────────────────────────────────────────
async function handleSaveClip(content, sourceUrl) {
  const stored = await chrome.storage.local.get('fc_token');
  const token = stored.fc_token;
  if (!token) {
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icon48.png',
      title: 'FreeClipboard', message: 'Please sign in first. Open the extension popup.'
    });
    return;
  }

  try {
    const res = await fetch(API_BASE + '/api/clips', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content, source_url: sourceUrl, title: content.substring(0, 50) })
    });

    if (res.status === 401) {
      chrome.storage.local.remove('fc_token');
      chrome.notifications.create({
        type: 'basic', iconUrl: 'icon48.png',
        title: 'FreeClipboard', message: 'Session expired. Please sign in again.'
      });
      return;
    }

    if (res.ok) {
      chrome.notifications.create({
        type: 'basic', iconUrl: 'icon48.png',
        title: 'FreeClipboard', message: 'Clip saved!'
      });
    }
  } catch (e) {
    // silent
  }
}

// ── Keyboard shortcut: Ctrl+Shift+C ───────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'save-clip') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection()?.toString() || ''
  }).then(async ([result]) => {
    if (result?.result) await handleSaveClip(result.result, tab.url);
  });
});

// ── Context menu ──────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-fc',
    title: 'Save to FreeClipboard',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-fc' && info.selectionText) {
    await handleSaveClip(info.selectionText, tab?.url || '');
  }
});
