(function () {
  const API_BASE = 'https://freeclipboard.com';
  const LOGIN_URL = 'https://freeclipboard.com/login';
  const icons = { text: '\u{1F4C4}', code: '\u{1F4BB}', url: '\u{1F517}', other: '\u{1F4CB}' };

  let clips = [];
  let userProfile = null;
  let pollTimer = null;

  function showToast(msg) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }

  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function clipIcon(t) { return icons[t] || icons.other; }

  function getToken() {
    return new Promise(resolve => {
      chrome.storage.local.get(['fc_token'], r => resolve(r.fc_token || null));
    });
  }

  async function loadProfile() {
    const t = await getToken();
    if (!t) return null;
    try {
      const r = await fetch(API_BASE + '/api/profile', { headers: { 'Authorization': 'Bearer ' + t } });
      return r.ok ? await r.json() : null;
    } catch (_) { return null; }
  }

  async function loadClips() {
    const t = await getToken();
    if (!t) { clips = []; return; }
    try {
      const r = await fetch(API_BASE + '/api/clips?limit=20', { headers: { 'Authorization': 'Bearer ' + t } });
      if (r.ok) { const d = await r.json(); clips = d.clips || d || []; return; }
    } catch (_) {}
    // Fallback to cache
    chrome.storage.local.get(['cached_clips'], r => { clips = r.cached_clips || []; });
  }

  // ── RENDER ────────────────────────────────────────────────

  function renderLoggedOut() {
    clearInterval(pollTimer);
    document.getElementById('app').innerHTML = `
      <div class="logged-out">
        <div class="logo">FreeClipboard</div>
        <div class="features">
          <div class="feature"><div class="feature-dot" style="background:#818cf8"></div><span>Save text from any webpage instantly</span></div>
          <div class="feature"><div class="feature-dot" style="background:#a78bfa"></div><span>Quick-paste your last 5 saved clips</span></div>
          <div class="feature"><div class="feature-dot" style="background:#c084fc"></div><span>Auto-expand ;;snippets in any text field</span></div>
        </div>
        <button class="btn btn-primary" id="loginBtn">Log in to FreeClipboard</button>
        <button class="btn" style="margin-top:10px;background:transparent;color:#52525b;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:8px 20px;font-size:11px;cursor:pointer" id="recheckBtn">I already logged in — refresh</button>
      </div>
    `;
    document.getElementById('loginBtn').onclick = () => chrome.tabs.create({ url: LOGIN_URL });
    document.getElementById('recheckBtn').onclick = init;
  }

  function renderLoggedIn() {
    clearInterval(pollTimer);
    const email = (userProfile && userProfile.email) || 'user@freeclipboard.com';
    const plan = (userProfile && userProfile.plan) || 'free';
    const initial = email.slice(0, 2).toUpperCase();

    document.getElementById('app').innerHTML = `
      <div class="logged-in">
        <div class="header">
          <div class="avatar">${initial}</div>
          <div class="user-info">
            <div class="user-email">${email}</div>
            <span class="plan-badge ${plan === 'pro' ? 'plan-pro' : 'plan-free'}">${plan === 'pro' ? 'Pro' : 'Free'}</span>
          </div>
        </div>
        <div class="search-bar"><input class="search-input" id="searchInput" type="text" placeholder="Search clips..." /></div>
        <div class="clip-list" id="clipList"></div>
        <div class="quick-add">
          <textarea id="quickAddTextarea" placeholder="Quick-add a clip..."></textarea>
          <div class="quick-add-actions"><button class="btn-save" id="quickSaveBtn" disabled>Save</button></div>
        </div>
        <div class="bottom-nav">
          <a href="#" id="navDash"><span class="nav-icon">\u{1F4CA}</span> Dashboard</a>
          <a href="#" id="navSnip"><span class="nav-icon">\u{270F}\u{FE0F}</span> Snippets</a>
          <a href="#" id="navSett"><span class="nav-icon">\u{2699}\u{FE0F}</span> Settings</a>
        </div>
      </div>`;

    document.getElementById('searchInput').oninput = renderClipList;
    document.getElementById('quickAddTextarea').oninput = e => { document.getElementById('quickSaveBtn').disabled = !e.target.value.trim(); };
    document.getElementById('quickSaveBtn').onclick = quickAdd;
    const D = 'https://freeclipboard.com/dashboard';
    document.getElementById('navDash').onclick = e => { e.preventDefault(); chrome.tabs.create({ url: D }); };
    document.getElementById('navSnip').onclick = e => { e.preventDefault(); chrome.tabs.create({ url: D }); };
    document.getElementById('navSett').onclick = e => { e.preventDefault(); chrome.tabs.create({ url: D }); };
    renderClipList();
  }

  function renderClipList() {
    const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
    const filtered = clips.filter(c => (c.content || '').toLowerCase().includes(q)).slice(0, 8);
    const ctr = document.getElementById('clipList');
    if (!ctr) return;
    if (!filtered.length) {
      ctr.innerHTML = '<div class="empty-state">' + (clips.length ? 'No clips match your search.' : 'No clips yet. Save something!') + '</div>';
      return;
    }
    ctr.innerHTML = filtered.map(c => `<div class="clip-row" data-id="${c.id}"><span class="clip-icon">${clipIcon(c.type)}</span><span class="clip-text">${escapeHtml((c.content||'').substring(0,55))}</span><button class="clip-copy-btn" data-id="${c.id}">\u{1F4CB}</button></div>`).join('');
    ctr.querySelectorAll('.clip-row').forEach(r => r.onclick = () => copy(r.dataset.id));
    ctr.querySelectorAll('.clip-copy-btn').forEach(b => b.onclick = e => { e.stopPropagation(); copy(b.dataset.id); });
  }

  function copy(id) {
    const c = clips.find(x => x.id === id);
    if (!c) return;
    navigator.clipboard.writeText(c.content).then(() => { showToast('Copied!'); setTimeout(window.close, 600); }).catch(() => showToast('Failed'));
  }

  async function quickAdd() {
    const ta = document.getElementById('quickAddTextarea');
    const content = ta.value.trim();
    if (!content) return;
    const t = await getToken();
    if (!t) { showToast('Not logged in'); return; }
    try {
      const r = await fetch(API_BASE + '/api/clips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t },
        body: JSON.stringify({ content, source_url: '' })
      });
      if (!r.ok) throw new Error('fail');
      ta.value = '';
      document.getElementById('quickSaveBtn').disabled = true;
      showToast('Saved!');
      loadClips().then(renderClipList);
    } catch (_) { showToast('Failed to save'); }
  }

  // ── INIT ──────────────────────────────────────────────────

  async function init() {
    const token = await getToken();
    if (!token) { renderLoggedOut(); return; }
    userProfile = await loadProfile();
    if (!userProfile) { renderLoggedOut(); return; }
    await loadClips();
    renderLoggedIn();
  }

  // ── AUTO-POLL for auth (every 2 seconds when logged out) ──
  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      const token = await getToken();
      if (token) {
        clearInterval(pollTimer);
        init();
      }
    }, 2000);
  }

  // Override renderLoggedOut to start polling
  const origRenderLoggedOut = renderLoggedOut;
  renderLoggedOut = function () {
    origRenderLoggedOut();
    startPolling();
  };

  // ── Storage change listener ───────────────────────────────
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.fc_token && changes.fc_token.newValue) {
      clearInterval(pollTimer);
      init();
    }
  });

  // ── Message listener from background ──────────────────────
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'AUTH_CHANGED' || msg.type === 'CLIP_SAVED') {
      clearInterval(pollTimer);
      init();
    }
  });

  // ── Start ─────────────────────────────────────────────────
  init();
})();
