const API_BASE = 'https://freeclipboard.com';

// ── Token management ──────────────────────────────────────
async function getToken() {
  return new Promise(resolve => {
    chrome.storage.local.get(['fc_token'], r => resolve(r.fc_token || null));
  });
}

async function setToken(token) {
  return new Promise(resolve => {
    chrome.storage.local.set({ fc_token: token }, () => {
      // Also cache clips for offline access
      startSyncTimer();
      syncClips();
      // Notify all extension views
      chrome.runtime.sendMessage({ type: 'AUTH_CHANGED' }).catch(() => {});
      resolve();
    });
  });
}

// ── Sync clips every 10 minutes ───────────────────────────
let syncTimer = null;
function startSyncTimer() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(syncClips, 10 * 60 * 1000);
}

async function syncClips() {
  const token = await getToken();
  if (!token) return;
  try {
    const res = await fetch(API_BASE + '/api/clips?limit=20', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return;
    const data = await res.json();
    chrome.storage.local.set({ cached_clips: data.clips || data || [] });
  } catch (_) {}
}

// ── Notification helper ───────────────────────────────────
function notify(title, msg) {
  chrome.notifications.create({
    type: 'basic', iconUrl: 'icon48.png', title, message: msg, priority: 0
  });
}

// ── Save clip helper ──────────────────────────────────────
async function saveSelected(text, url) {
  const token = await getToken();
  if (!token) { notify('FreeClipboard', 'Please log in first'); return; }
  try {
    const res = await fetch(API_BASE + '/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ content: text, source_url: url || '' })
    });
    if (res.ok) {
      notify('FreeClipboard', '\u2705 Saved to FreeClipboard');
      syncClips();
      chrome.runtime.sendMessage({ type: 'CLIP_SAVED' }).catch(() => {});
    } else {
      notify('FreeClipboard', 'Failed to save');
    }
  } catch (_) { notify('FreeClipboard', 'Error saving'); }
}

// ── Keyboard shortcuts ────────────────────────────────────
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd === 'save-clip') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() || ''
    });
    const text = (result?.result || '').trim();
    if (!text) { notify('FreeClipboard', 'No text selected'); return; }
    saveSelected(text, tab.url);
  }
  if (cmd === 'quick-paste') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'SHOW_QUICK_PASTE' }).catch(() => {});
  }
});

// ── Context menu ──────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'save-fc', title: 'Save to FreeClipboard', contexts: ['selection'] });
  startSyncTimer();
  syncClips();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-fc' && info.selectionText) {
    saveSelected(info.selectionText, tab?.url || '');
  }
});

// ── Message handler ───────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SYNC_CLIPS') {
    syncClips().then(() => {
      chrome.storage.local.get(['cached_clips'], r => sendResponse({ clips: r.cached_clips || [] }));
    }).catch(() => sendResponse({ clips: [] }));
    return true;
  }

  if (msg.type === 'SET_TOKEN') {
    setToken(msg.token).then(() => sendResponse({ success: true }));
    return true;
  }
});

// ── Init ──────────────────────────────────────────────────
chrome.runtime.onStartup.addListener(() => { startSyncTimer(); syncClips(); });
startSyncTimer();
syncClips();
