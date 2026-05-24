const API_BASE = 'https://freeclipboard.com';

// ── Get stored auth token ─────────────────────────────────
async function getToken() {
  return new Promise(resolve => {
    chrome.storage.local.get(['fc_token'], r => resolve(r.fc_token || null));
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
    const clips = data.clips || data || [];
    chrome.storage.local.set({ cached_clips: clips });
  } catch (err) {
    // silent fail — will retry next cycle
  }
}

// ── Show notification ─────────────────────────────────────
function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon48.png',
    title,
    message,
    priority: 0
  });
}

// ── Save clip helper ──────────────────────────────────────
async function saveSelectedText(selectedText, sourceUrl) {
  const token = await getToken();
  if (!token) { notify('FreeClipboard', 'Please log in first'); return false; }

  try {
    const res = await fetch(API_BASE + '/api/clips', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ content: selectedText, source_url: sourceUrl || '' })
    });
    if (res.ok) {
      notify('FreeClipboard', '\u2705 Saved to FreeClipboard');
      chrome.runtime.sendMessage({ type: 'CLIP_SAVED' }).catch(() => {});
      syncClips();
      return true;
    } else {
      notify('FreeClipboard', 'Failed to save clip');
      return false;
    }
  } catch (err) {
    notify('FreeClipboard', 'Error saving clip');
    return false;
  }
}

// ── Keyboard commands ─────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'save-clip') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() || ''
    });

    const selectedText = (results[0]?.result || '').trim();
    if (!selectedText) { notify('FreeClipboard', 'No text selected'); return; }

    await saveSelectedText(selectedText, tab.url);
  }

  if (command === 'quick-paste') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { type: 'SHOW_QUICK_PASTE' }, () => {
          if (chrome.runtime.lastError) {
            notify('FreeClipboard', 'Quick paste not available on this page');
          }
        });
      }
    } catch (err) {
      notify('FreeClipboard', 'Quick paste error');
    }
  }
});

// ── Context menu: Save to FreeClipboard ───────────────────
chrome.runtime.onInstalled.addListener(() => {
  console.log('FreeClipboard extension installed');

  chrome.contextMenus.create({
    id: 'save-to-freeclipboard',
    title: 'Save to FreeClipboard',
    contexts: ['selection']
  });

  startSyncTimer();
  syncClips();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-to-freeclipboard' && info.selectionText) {
    await saveSelectedText(info.selectionText, tab?.url || '');
  }
});

// ── Listen for messages from content/popup ────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SYNC_CLIPS') {
    syncClips().then(() => {
      chrome.storage.local.get(['cached_clips'], r => {
        sendResponse({ clips: r.cached_clips || [] });
      });
    }).catch(() => sendResponse({ clips: [] }));
    return true;
  }

  if (msg.type === 'SET_TOKEN') {
    chrome.storage.local.set({ fc_token: msg.token }, () => {
      startSyncTimer();
      syncClips();
      // Notify popup to re-render
      chrome.runtime.sendMessage({ type: 'AUTH_CHANGED' }).catch(() => {});
    });
    sendResponse({ success: true });
  }

  if (msg.type === 'EXPAND_SNIPPET') {
    fetch(API_BASE + '/api/snippets/expand?trigger=' + encodeURIComponent(msg.trigger), {
      headers: { 'Authorization': 'Bearer ' + (msg.token || '') }
    })
    .then(res => res.json())
    .then(data => sendResponse(data))
    .catch(() => sendResponse(null));
    return true;
  }
});

// ── Init ──────────────────────────────────────────────────
chrome.runtime.onStartup.addListener(() => {
  startSyncTimer();
  syncClips();
});

startSyncTimer();
syncClips();
