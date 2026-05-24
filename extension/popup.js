const API_BASE = 'https://freeclipboard.com';

async function init() {
  const stored = await chrome.storage.local.get(['fc_token']);

  if (stored.fc_token) {
    try {
      const res = await fetch(API_BASE + '/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + stored.fc_token }
      });

      if (res.ok) {
        const user = await res.json();
        showDashboard(user);
        loadClips();
      } else {
        chrome.storage.local.remove('fc_token');
        showLogin();
      }
    } catch (e) {
      const cached = await chrome.storage.local.get('fc_clips_cache');
      if (cached.fc_clips_cache && cached.fc_clips_cache.length) {
        showDashboard({ email: 'Offline mode', plan: 'free' });
        renderClips(cached.fc_clips_cache);
      } else {
        showLogin();
      }
    }
  } else {
    showLogin();
  }
}

// ── View toggles ──────────────────────────────────────────
function showLogin() {
  document.getElementById('view-login').style.display = 'flex';
  document.getElementById('view-dashboard').style.display = 'none';
}

function showDashboard(user) {
  document.getElementById('view-login').style.display = 'none';
  document.getElementById('view-dashboard').style.display = 'flex';
  document.getElementById('user-email').textContent = user.email || 'User';
  document.getElementById('avatar-initial').textContent = (user.email || 'FC').slice(0, 2).toUpperCase();

  const badge = document.getElementById('plan-badge');
  badge.textContent = user.plan === 'pro' ? 'PRO' : 'Free';
  badge.className = 'plan-badge ' + (user.plan === 'pro' ? 'plan-pro' : 'plan-free');
}

// ── Load clips from background ────────────────────────────
async function loadClips() {
  document.getElementById('clips-loading').style.display = 'block';
  document.getElementById('clips-list').innerHTML = '';

  const clips = await new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_CLIPS' }, res => {
      resolve(res?.clips || []);
    });
  });

  document.getElementById('clips-loading').style.display = 'none';
  renderClips(clips);
}

function renderClips(clips) {
  const container = document.getElementById('clips-list');

  if (!clips.length) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:#52525b;font-size:12px">No clips yet. Save something!</div>';
    return;
  }

  container.innerHTML = clips.map(c => `
    <div class="clip-item" data-id="${c.id}">
      <div class="clip-preview">${escHtml((c.content || '').substring(0, 60))}${c.content && c.content.length > 60 ? '...' : ''}</div>
      <button class="copy-btn" data-id="${c.id}">Copy</button>
    </div>
  `).join('');

  container.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyClip(btn.dataset.id);
    });
  });

  container.querySelectorAll('.clip-item').forEach(item => {
    item.addEventListener('click', () => copyClip(item.dataset.id));
  });
}

async function copyClip(clipId) {
  const cached = await chrome.storage.local.get('fc_clips_cache');
  const clips = cached.fc_clips_cache || [];
  const clip = clips.find(c => c.id === clipId);
  if (!clip) return;

  await navigator.clipboard.writeText(clip.content);

  const btn = document.querySelector(`.copy-btn[data-id="${clipId}"]`);
  if (btn) {
    btn.textContent = 'Copied!';
    btn.style.background = '#22c55e';
    btn.style.color = '#fff';
    setTimeout(() => {
      btn.textContent = 'Copy';
      btn.style.background = '';
      btn.style.color = '';
    }, 1500);
  }
}

// ── Quick save ────────────────────────────────────────────
async function saveQuickClip() {
  const input = document.getElementById('quick-input');
  const content = input.value.trim();
  if (!content) return;

  const btn = document.getElementById('save-btn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  const stored = await chrome.storage.local.get('fc_token');

  try {
    const res = await fetch(API_BASE + '/api/clips', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + stored.fc_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content })
    });

    if (res.ok) {
      input.value = '';
      btn.textContent = 'Saved!';
      btn.style.background = '#22c55e';
      setTimeout(() => {
        btn.textContent = 'Save';
        btn.style.background = '';
        btn.disabled = false;
      }, 1500);
      loadClips();
    } else {
      btn.textContent = 'Error';
      btn.disabled = false;
    }
  } catch (e) {
    btn.textContent = 'Error';
    btn.disabled = false;
  }
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Button listeners ──────────────────────────────────────
document.getElementById('login-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: API_BASE + '/login' });
});

document.getElementById('refresh-btn').addEventListener('click', () => init());

document.getElementById('save-btn').addEventListener('click', saveQuickClip);

document.getElementById('quick-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    saveQuickClip();
  }
});

document.getElementById('open-dashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: API_BASE + '/dashboard' });
});

document.getElementById('refresh-clips').addEventListener('click', () => loadClips());

document.getElementById('logout-link').addEventListener('click', () => {
  chrome.storage.local.clear(() => {
    showLogin();
  });
});

document.getElementById('logout-btn').addEventListener('click', () => {
  chrome.storage.local.clear(() => {
    showLogin();
  });
});

// ── Listen for auth from background ───────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'AUTH_CHANGED') init();
});

// ── Start ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
