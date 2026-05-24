const API_BASE = 'https://freeclipboard.com';
const DASHBOARD_URL = 'https://freeclipboard.com/dashboard';
const LOGIN_URL = 'https://freeclipboard.com/login';

const icons = { text: '\u{1F4C4}', code: '\u{1F4BB}', url: '\u{1F517}', other: '\u{1F4CB}' };

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

function clipIcon(type) {
  return icons[type] || icons.other;
}

// ── Render: Logged-out ────────────────────────────────────
function renderLoggedOut() {
  document.getElementById('app').innerHTML = `
    <div class="logged-out">
      <div class="logo">FreeClipboard</div>
      <div class="features">
        <div class="feature">
          <div class="feature-dot" style="background:#818cf8"></div>
          <span>Save text from any webpage instantly</span>
        </div>
        <div class="feature">
          <div class="feature-dot" style="background:#a78bfa"></div>
          <span>Quick-paste your last 5 saved clips</span>
        </div>
        <div class="feature">
          <div class="feature-dot" style="background:#c084fc"></div>
          <span>Auto-expand ;;snippets in any text field</span>
        </div>
      </div>
      <button class="btn btn-primary" id="loginBtn">Log in to FreeClipboard</button>
    </div>
  `;
  document.getElementById('loginBtn').onclick = () => {
    chrome.tabs.create({ url: LOGIN_URL });
  };
}

// ── Render: Logged-in ─────────────────────────────────────
let clips = [];
let userProfile = null;

function renderLoggedIn() {
  const email = userProfile?.email || 'user@freeclipboard.com';
  const initial = email.slice(0, 2).toUpperCase();
  const plan = userProfile?.plan || 'free';

  document.getElementById('app').innerHTML = `
    <div class="logged-in">
      <div class="header">
        <div class="avatar">${initial}</div>
        <div class="user-info">
          <div class="user-email">${email}</div>
          <span class="plan-badge ${plan === 'pro' ? 'plan-pro' : 'plan-free'}">
            ${plan === 'pro' ? 'Pro' : 'Free'}
          </span>
        </div>
      </div>
      <div class="search-bar">
        <input class="search-input" id="searchInput" type="text" placeholder="Search clips..." />
      </div>
      <div class="clip-list" id="clipList"></div>
      <div class="quick-add">
        <textarea id="quickAddTextarea" placeholder="Quick-add a clip..."></textarea>
        <div class="quick-add-actions">
          <button class="btn-save" id="quickSaveBtn" disabled>Save</button>
        </div>
      </div>
      <div class="bottom-nav">
        <a href="#" id="navDashboard"><span class="nav-icon">\u{1F4CA}</span> Dashboard</a>
        <a href="#" id="navSnippets"><span class="nav-icon">\u{270F}\u{FE0F}</span> Snippets</a>
        <a href="#" id="navSettings"><span class="nav-icon">\u{2699}\u{FE0F}</span> Settings</a>
      </div>
    </div>
  `;

  document.getElementById('searchInput').oninput = renderClipList;
  document.getElementById('quickAddTextarea').oninput = (e) => {
    document.getElementById('quickSaveBtn').disabled = !e.target.value.trim();
  };
  document.getElementById('quickSaveBtn').onclick = quickAddClip;
  document.getElementById('navDashboard').onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: DASHBOARD_URL }); };
  document.getElementById('navSnippets').onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: DASHBOARD_URL }); };
  document.getElementById('navSettings').onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: DASHBOARD_URL }); };
  renderClipList();
}

function renderClipList() {
  const query = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const filtered = clips.filter(c => (c.content || '').toLowerCase().includes(query));
  const shown = filtered.slice(0, 8);
  const container = document.getElementById('clipList');
  if (!container) return;

  if (shown.length === 0) {
    container.innerHTML = '<div class="empty-state">' +
      (clips.length === 0 ? 'No clips yet. Save something!' : 'No clips match your search.') +
      '</div>';
    return;
  }

  container.innerHTML = shown.map(c => {
    const text = (c.content || '').substring(0, 55);
    return `<div class="clip-row" data-id="${c.id}">
      <span class="clip-icon">${clipIcon(c.type)}</span>
      <span class="clip-text">${escapeHtml(text)}</span>
      <button class="clip-copy-btn" data-id="${c.id}">\u{1F4CB}</button>
    </div>`;
  }).join('');

  container.querySelectorAll('.clip-row').forEach(row => {
    row.onclick = () => copyClip(row.dataset.id);
  });
  container.querySelectorAll('.clip-copy-btn').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); copyClip(btn.dataset.id); };
  });
}

function copyClip(id) {
  const clip = clips.find(c => c.id === id);
  if (!clip) return;
  navigator.clipboard.writeText(clip.content).then(() => {
    showToast('Copied!');
    setTimeout(() => window.close(), 600);
  }).catch(() => showToast('Failed to copy'));
}

async function quickAddClip() {
  const ta = document.getElementById('quickAddTextarea');
  const content = ta.value.trim();
  if (!content) return;

  const token = await getToken();
  if (!token) { showToast('Not authenticated'); return; }

  try {
    const res = await fetch(API_BASE + '/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ content, source_url: '' })
    });
    if (!res.ok) throw new Error('Save failed');
    ta.value = '';
    document.getElementById('quickSaveBtn').disabled = true;
    showToast('Saved!');
    loadClips();
  } catch (err) {
    showToast('Failed to save clip');
  }
}

// ── Helpers ───────────────────────────────────────────────
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

async function getToken() {
  return new Promise(resolve => {
    chrome.storage.local.get(['fc_token'], (r) => resolve(r.fc_token || null));
  });
}

async function loadProfile() {
  const token = await getToken();
  if (!token) return null;
  try {
    const res = await fetch(API_BASE + '/api/profile', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function loadClips() {
  const token = await getToken();
  if (!token) { clips = []; return; }
  try {
    const res = await fetch(API_BASE + '/api/clips?limit=20', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    clips = data.clips || data || [];
    chrome.storage.local.set({ cached_clips: clips });
  } catch {
    const cached = await new Promise(r => chrome.storage.local.get(['cached_clips'], r));
    clips = cached.cached_clips || [];
  }
}

// ── Message listener ──────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'CLIP_SAVED') {
    loadClips();
    if (document.getElementById('clipList')) renderClipList();
  }
});

// ── Init ──────────────────────────────────────────────────
(async function init() {
  const token = await getToken();
  if (!token) { renderLoggedOut(); return; }

  userProfile = await loadProfile();
  if (!userProfile) { renderLoggedOut(); return; }

  await loadClips();
  renderLoggedIn();
})();
