const SITE = 'https://freeclipboard.com';

(async function init() {
  showView('loading');

  // 1. Try stored token first
  const stored = await getStorage('fc_token');
  if (stored.fc_token) {
    const valid = await validateToken(stored.fc_token);
    if (valid) {
      showView('dashboard');
      document.getElementById('user-email').textContent = stored.fc_email || '';
      updatePlanBadge(stored.fc_plan || 'free');
      await loadClips(stored.fc_token);
      return;
    }
  }

  // 2. No stored token — try cookie-based auto-login
  await tryCookieLogin();
})();

async function tryCookieLogin() {
  showView('loading');

  try {
    const res = await fetch(SITE + '/api/auth/extension-session', {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });

    if (res.ok) {
      const data = await res.json();
      await setStorage({
        fc_token: data.token,
        fc_email: data.email,
        fc_plan: data.plan
      });
      showView('dashboard');
      document.getElementById('user-email').textContent = data.email;
      updatePlanBadge(data.plan);
      await loadClips(data.token);
    } else {
      showView('login');
    }
  } catch (e) {
    showView('login');
    document.getElementById('login-status').textContent =
      'Could not reach freeclipboard.com';
  }
}

async function validateToken(token) {
  try {
    const res = await fetch(SITE + '/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function loadClips(token) {
  const list = document.getElementById('clips-list');
  list.innerHTML = '<div class="loading-text">Loading clips...</div>';

  try {
    const res = await fetch(SITE + '/api/clips?limit=8', {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (!res.ok) {
      if (res.status === 401) {
        await clearStorage();
        showView('login');
      }
      return;
    }

    const data = await res.json();
    const clips = data.clips || data || [];
    renderClips(clips);
    await setStorage({ fc_clips_cache: clips });
  } catch (e) {
    const cached = await getStorage('fc_clips_cache');
    if (cached.fc_clips_cache && cached.fc_clips_cache.length) {
      renderClips(cached.fc_clips_cache);
    } else {
      list.innerHTML = '<div class="loading-text">Offline - no cached clips</div>';
    }
  }
}

function renderClips(clips) {
  const list = document.getElementById('clips-list');
  if (!clips.length) {
    list.innerHTML = '<div class="empty-state">No clips yet!<br><small>Copy text and save it here</small></div>';
    return;
  }
  list.innerHTML = clips.map(clip => `
    <div class="clip-row" data-content="${escAttr(clip.content)}">
      <div class="clip-text">${escHtml((clip.content || '').substring(0, 65))}${(clip.content || '').length > 65 ? '\u2026' : ''}</div>
      <span class="copy-indicator">Copy</span>
    </div>
  `).join('');

  list.querySelectorAll('.clip-row').forEach(row => {
    row.addEventListener('click', () => copyText(row.dataset.content, row));
  });
}

async function copyText(content, el) {
  await navigator.clipboard.writeText(content);
  const ind = el.querySelector('.copy-indicator');
  if (ind) {
    ind.textContent = '\u2713';
    ind.style.color = '#22c55e';
    setTimeout(() => { ind.textContent = 'Copy'; ind.style.color = ''; }, 1500);
  }
}

async function saveQuickClip() {
  const input = document.getElementById('quick-input');
  const content = input.value.trim();
  if (!content) return;

  const btn = document.getElementById('save-btn');
  btn.textContent = '...';
  btn.disabled = true;

  const stored = await getStorage('fc_token');

  try {
    const res = await fetch(SITE + '/api/clips', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + stored.fc_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content, title: content.substring(0, 40) })
    });

    if (res.ok) {
      input.value = '';
      btn.textContent = '\u2713';
      setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 1500);
      await loadClips(stored.fc_token);
    } else {
      btn.textContent = 'Error';
      btn.disabled = false;
    }
  } catch (e) {
    btn.textContent = 'Error';
    btn.disabled = false;
  }
}

function showView(view) {
  document.getElementById('view-loading').style.display = view === 'loading' ? 'flex' : 'none';
  document.getElementById('view-login').style.display = view === 'login' ? 'flex' : 'none';
  document.getElementById('view-dashboard').style.display = view === 'dashboard' ? 'flex' : 'none';
}

function updatePlanBadge(plan) {
  const badge = document.getElementById('plan-badge');
  badge.textContent = plan === 'pro' ? '\u{1F451} PRO' : 'Free';
  badge.style.background = plan === 'pro' ? '#f59e0b22' : '#7C3AED22';
  badge.style.color = plan === 'pro' ? '#fbbf24' : '#a78bfa';
}

function getStorage(key) { return new Promise(r => chrome.storage.local.get(key, r)); }
function setStorage(obj) { return new Promise(r => chrome.storage.local.set(obj, r)); }
function clearStorage() { return new Promise(r => chrome.storage.local.clear(r)); }

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
function escAttr(s) { return (s || '').replace(/'/g, "\\'").replace(/\n/g, ' '); }

// ── Button listeners ──────────────────────────────────────
document.getElementById('login-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: SITE + '/login' });
  window.close();
});

document.getElementById('refresh-btn').addEventListener('click', () => window.location.reload());
document.getElementById('refresh-btn-dash').addEventListener('click', () => window.location.reload());
document.getElementById('logout-btn').addEventListener('click', async () => {
  await clearStorage();
  showView('login');
});
document.getElementById('save-btn').addEventListener('click', saveQuickClip);
document.getElementById('quick-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveQuickClip(); }
});
document.getElementById('open-site').addEventListener('click', () => {
  chrome.tabs.create({ url: SITE + '/dashboard' });
});
