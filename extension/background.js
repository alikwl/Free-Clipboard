const API_BASE = 'https://freeclipboard.com';

// ── Message handler ───────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'SAVE_TOKEN') {
    chrome.storage.local.set({
      fc_token: message.token,
      fc_token_saved_at: Date.now()
    }, () => {
      console.log('FreeClipboard: Token saved successfully');
      sendResponse({ success: true });
      chrome.notifications.create('login_success', {
        type: 'basic',
        iconUrl: 'icon48.png',
        title: 'FreeClipboard',
        message: 'Logged in! Your clips will sync now.'
      });
    });
    return true;
  }

  if (message.type === 'SAVE_CLIP') {
    handleSaveClip(message.content, message.url).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'GET_CLIPS') {
    getClipsFromAPI().then(clips => {
      sendResponse({ clips });
    });
    return true;
  }
});

// ── Save clip ─────────────────────────────────────────────
async function handleSaveClip(content, sourceUrl) {
  const stored = await chrome.storage.local.get('fc_token');
  const token = stored.fc_token;
  if (!token) return;

  try {
    const res = await fetch(API_BASE + '/api/clips', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content,
        source_url: sourceUrl,
        title: content.substring(0, 50)
      })
    });

    if (res.status === 401) {
      chrome.storage.local.remove('fc_token');
      return;
    }

    if (res.ok) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: 'FreeClipboard',
        message: 'Clip saved!'
      });
    }
  } catch (e) {
    console.log('Save clip error:', e);
  }
}

// ── Get clips from API ────────────────────────────────────
async function getClipsFromAPI() {
  const stored = await chrome.storage.local.get('fc_token');
  const token = stored.fc_token;
  if (!token) return [];

  try {
    const res = await fetch(API_BASE + '/api/clips?limit=8', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return [];
    const data = await res.json();
    const clips = data.clips || data || [];
    chrome.storage.local.set({ fc_clips_cache: clips });
    return clips;
  } catch (e) {
    const cached = await chrome.storage.local.get('fc_clips_cache');
    return cached.fc_clips_cache || [];
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
    if (result?.result) {
      await handleSaveClip(result.result, tab.url);
    }
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
