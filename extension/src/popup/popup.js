/**
 * FreeClipboard Extension - Popup Logic
 * Uses chrome.runtime.sendMessage instead of direct imports
 */

// ============================================
// STATE
// ============================================

const state = {
  clips: [],
  filteredClips: [],
  currentFilter: 'all',
  searchQuery: '',
  isLoading: false,
  hasMore: true,
  offset: 0,
  user: null,
  session: null,
  confirmResolver: null,
  settings: {
    auto_capture: true,
    show_tooltip: true,
    ai_tags: true,
    mobile_sync: false
  }
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  showView('loading');

  try {
    console.log('[FreeClipboard] Initializing popup...');
    
    // Check session via background script with timeout
    const sessionResponse = await getSessionWithRetry();

    if (sessionResponse?.success && sessionResponse.data?.authenticated) {
      state.user = sessionResponse.data.user;
      state.session = sessionResponse.data.session;
      console.log('[FreeClipboard] Session valid, showing dashboard');
      await showDashboard();
    } else {
      console.log('[FreeClipboard] No valid session, showing login');
      showView('login');
    }

    // Setup listeners
    setupEventListeners();
    setupRealtimeListener();

  } catch (err) {
    console.error('[FreeClipboard] Initialization error:', err);
    showView('login');
    
    // Show user-friendly error message
    const errorMsg = err?.message?.includes('timeout') 
      ? 'Connection timeout. Please try again.'
      : 'Failed to connect. Please refresh.';
    showError(errorMsg);
  }
}

async function getSessionWithRetry() {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await Promise.race([
        sendMessage({ type: 'GET_SESSION' }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Session check timeout')), 5000)
        )
      ]);
    } catch (err) {
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }

  throw lastError || new Error('Session check failed');
}

// ============================================
// MESSAGE HELPERS
// ============================================

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// ============================================
// VIEW MANAGEMENT
// ============================================

function showView(viewName) {
  document.querySelectorAll('.view').forEach(el => {
    el.classList.add('hidden');
  });

  const view = document.getElementById(`view-${viewName}`);
  if (view) {
    view.classList.remove('hidden');
  }
}

function showError(message) {
  const errorEl = document.getElementById('login-error');
  if (errorEl) {
    errorEl.textContent = message;
    setTimeout(() => errorEl.textContent = '', 5000);
  }
}

function showToast(message) {
  document.querySelectorAll('.toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2500);
}

// ============================================
// DASHBOARD
// ============================================

async function showDashboard() {
  showView('dashboard');

  // Update user info
  if (state.user) {
    document.getElementById('user-email').textContent = state.user.email || 'User';
    
    const plan = state.user.user_metadata?.plan || 'free';
    const planBadge = document.getElementById('plan-badge');
    planBadge.textContent = plan === 'pro' ? 'PRO' : 'Free';
    planBadge.classList.toggle('pro', plan === 'pro');
  }

  // Load clips
  await loadClips();

  // Update stats
  updateStats();
}

async function loadClips(reset = false) {
  if (reset) {
    state.offset = 0;
    state.hasMore = true;
    state.clips = [];
  }

  if (state.isLoading || !state.hasMore) return;

  state.isLoading = true;
  updateStats('Loading...');

  try {
    const response = await sendMessage({
      type: 'GET_CLIPS',
      data: {
        limit: 20,
        offset: state.offset,
        search: state.searchQuery,
        type: state.currentFilter === 'all' ? null : state.currentFilter,
        favorite: state.currentFilter === 'favorite' ? true : undefined
      }
    });

    if (response?.success) {
      const { clips, total } = response.data;

      if (clips.length === 0) {
        state.hasMore = false;
        if (state.clips.length === 0) {
          showEmptyState(true);
        }
      } else {
        state.clips.push(...clips);
        state.offset += clips.length;
        showEmptyState(false);
        renderClips();
      }

      updateStats(`${state.clips.length} clip${state.clips.length !== 1 ? 's' : ''}`);
    } else {
      throw new Error(response?.error || 'Failed to load clips');
    }

  } catch (err) {
    console.error('[FreeClipboard] Load clips error:', err);
    showToast('Failed to load clips');

    // Try loading from local cache
    const cachedResponse = await sendMessage({
      type: 'GET_CLIPS',
      data: { limit: 50, useCache: true }
    });

    if (cachedResponse?.success && cachedResponse.data?.clips?.length > 0) {
      state.clips = cachedResponse.data.clips;
      renderClips();
    }
  }

  state.isLoading = false;
}

function renderClips() {
  const container = document.getElementById('clips-list');
  const clipsToRender = state.searchQuery
    ? state.clips.filter(c => matchesSearch(c, state.searchQuery))
    : state.clips;

  if (clipsToRender.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>No matches found</p>
      </div>
    `;
    return;
  }

  container.innerHTML = clipsToRender.map(clip => createClipHTML(clip)).join('');

  // Attach event listeners
  container.querySelectorAll('.clip-card').forEach(card => {
    const id = card.dataset.id;
    const clip = state.clips.find(c => c.id === id);
    if (!clip) return;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.clip-action-btn')) return;
      expandClip(clip);
    });

    const copyBtn = card.querySelector('[data-action="copy"]');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => copyClip(clip, copyBtn));
    }

    const favBtn = card.querySelector('[data-action="favorite"]');
    if (favBtn) {
      favBtn.addEventListener('click', () => toggleFavorite(clip, favBtn));
    }

    const deleteBtn = card.querySelector('[data-action="delete"]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => deleteClip(clip));
    }
  });
}

function createClipHTML(clip) {
  const typeIcons = {
    text: '📝',
    code: '💻',
    link: '🔗',
    image: '🖼️',
    email: '📧',
    todo: '✅',
    note: '📌'
  };

  const isCode = clip.content_type === 'code';
  const isLink = clip.content_type === 'link';
  const isFavorite = clip.is_favorite;

  let contentHTML;
  if (isCode) {
    contentHTML = `<pre class="clip-code">${escapeHtml(truncate(clip.content, 200))}</pre>`;
  } else if (isLink) {
    contentHTML = `<a href="${escapeHtml(clip.content)}" class="clip-link" target="_blank">${escapeHtml(truncate(clip.content, 80))}</a>`;
  } else {
    contentHTML = `<div class="clip-content">${escapeHtml(truncate(clip.content, 150))}</div>`;
  }

  return `
    <div class="clip-card ${isFavorite ? 'favorited' : ''}" data-id="${clip.id}">
      <div class="clip-header">
        <span class="clip-type-icon">${typeIcons[clip.content_type] || '📄'}</span>
        <div class="clip-meta">
          <span class="clip-source">${escapeHtml(clip.source_app || 'Unknown')}</span>
          <span class="clip-time">${timeAgo(clip.created_at)}</span>
        </div>
        <span class="clip-favorite">${isFavorite ? '⭐' : '☆'}</span>
      </div>
      ${contentHTML}
      <div class="clip-actions">
        <button class="clip-action-btn" data-action="copy">📋 Copy</button>
        <button class="clip-action-btn" data-action="favorite">${isFavorite ? '⭐' : '☆'} ${isFavorite ? 'Fav' : 'Fav'}</button>
        <button class="clip-action-btn" data-action="delete">🗑️</button>
      </div>
    </div>
  `;
}

// ============================================
// CLIP ACTIONS
// ============================================

async function copyClip(clip, btn) {
  try {
    await navigator.clipboard.writeText(clip.content);
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    showToast('Copied to clipboard');

    setTimeout(() => {
      btn.textContent = '📋 Copy';
      btn.classList.remove('copied');
    }, 2000);
  } catch (err) {
    showToast('Failed to copy');
  }
}

async function toggleFavorite(clip, btn) {
  const newState = !clip.is_favorite;

  try {
    const response = await sendMessage({
      type: 'TOGGLE_FAVORITE',
      data: { id: clip.id, isFavorite: newState }
    });

    if (response?.success) {
      clip.is_favorite = newState;
      renderClips();
      showToast(newState ? 'Added to favorites' : 'Removed from favorites');
    } else {
      throw new Error(response?.error);
    }
  } catch (err) {
    showToast('Failed to update');
  }
}

async function deleteClip(clip) {
  const confirmed = await showConfirm({
    title: 'Delete Clip',
    message: 'Delete this clip? This action will remove it from your extension list and sync to the server.'
  });

  if (!confirmed) return;

  try {
    const response = await sendMessage({
      type: 'DELETE_CLIP',
      data: { id: clip.id }
    });

    if (response?.success) {
      state.clips = state.clips.filter(c => c.id !== clip.id);
      renderClips();
      updateStats();
      showToast('Clip deleted');
    } else {
      throw new Error(response?.error);
    }
  } catch (err) {
    showToast('Failed to delete');
  }
}

function expandClip(clip) {
  chrome.tabs.create({
    url: `https://freeclipboard.com/dashboard?clip=${clip.id}`
  });
}

// ============================================
// SEARCH & FILTER
// ============================================

function setupSearch() {
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');

  let debounceTimer;

  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    const query = e.target.value.trim();

    searchClear.classList.toggle('hidden', !query);

    debounceTimer = setTimeout(() => {
      state.searchQuery = query;
      renderClips();
    }, 150); // FC_CONFIG.SEARCH_DEBOUNCE
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    searchClear.classList.add('hidden');
    renderClips();
    searchInput.focus();
  });

  // Filter tags
  document.querySelectorAll('.filter-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      document.querySelectorAll('.filter-tag').forEach(t => t.classList.remove('active'));
      tag.classList.add('active');
      state.currentFilter = tag.dataset.filter;
      loadClips(true);
    });
  });
}

function matchesSearch(clip, query) {
  const lower = query.toLowerCase();
  return (
    clip.content.toLowerCase().includes(lower) ||
    clip.source_app?.toLowerCase().includes(lower) ||
    clip.tags?.some(t => t.toLowerCase().includes(lower))
  );
}

// ============================================
// QUICK ADD
// ============================================

async function saveQuickClip() {
  const input = document.getElementById('quick-input');
  const btn = document.getElementById('btn-save');
  const content = input.value.trim();

  if (!content) return;

  btn.disabled = true;
  btn.textContent = '...';

  try {
    const response = await sendMessage({
      type: 'CAPTURE_CLIP',
      data: {
        content,
        content_type: detectContentType(content),
        source_app: 'FreeClipboard Popup',
        metadata: {
          word_count: content.split(/\s+/).length
        }
      }
    });

    if (response?.success) {
      input.value = '';
      showToast('Clip saved!');
      await loadClips(true);
    } else {
      throw new Error(response?.error || 'Failed to save');
    }

  } catch (err) {
    showToast('Failed to save');
  }

  btn.disabled = false;
  btn.textContent = 'Save';
}

// ============================================
// SETTINGS
// ============================================

async function loadSettings() {
  const result = await chrome.storage.local.get('fc_settings');
  if (result.fc_settings) {
    state.settings = { ...state.settings, ...result.fc_settings };
  }
}

async function saveSettings() {
  await chrome.storage.local.set({ fc_settings: state.settings });

  // Sync to server
  try {
    await sendMessage({
      type: 'SAVE_SETTINGS',
      data: { settings: state.settings }
    });
  } catch (err) {
    console.error('Settings sync failed:', err);
  }
}

function setupSettingsModal() {
  const modal = document.getElementById('settings-modal');
  const btn = document.getElementById('btn-settings');
  const close = document.getElementById('settings-close');
  const overlay = modal.querySelector('.modal-overlay');

  btn.addEventListener('click', () => {
    document.getElementById('setting-auto-capture').checked = state.settings.auto_capture;
    document.getElementById('setting-tooltip').checked = state.settings.show_tooltip;
    document.getElementById('setting-ai-tags').checked = state.settings.ai_tags;
    document.getElementById('setting-mobile-sync').checked = state.settings.mobile_sync;

    modal.classList.remove('hidden');
  });

  const closeModal = () => modal.classList.add('hidden');
  close.addEventListener('click', closeModal);
  overlay.addEventListener('click', closeModal);

  modal.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.addEventListener('change', async () => {
      state.settings = {
        auto_capture: document.getElementById('setting-auto-capture').checked,
        show_tooltip: document.getElementById('setting-tooltip').checked,
        ai_tags: document.getElementById('setting-ai-tags').checked,
        mobile_sync: document.getElementById('setting-mobile-sync').checked
      };
      await saveSettings();
      showToast('Settings saved');
    });
  });
}

function setupConfirmModal() {
  const modal = document.getElementById('confirm-modal');
  const close = document.getElementById('confirm-close');
  const cancel = document.getElementById('confirm-cancel');
  const ok = document.getElementById('confirm-ok');
  const overlay = modal.querySelector('.modal-overlay');

  const resolveAndClose = (value) => {
    modal.classList.add('hidden');
    const resolver = state.confirmResolver;
    state.confirmResolver = null;
    resolver?.(value);
  };

  close.addEventListener('click', () => resolveAndClose(false));
  cancel.addEventListener('click', () => resolveAndClose(false));
  overlay.addEventListener('click', () => resolveAndClose(false));
  ok.addEventListener('click', () => resolveAndClose(true));
}

function showConfirm({ title, message, confirmLabel = 'Delete' }) {
  const modal = document.getElementById('confirm-modal');
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-text').textContent = message;
  document.getElementById('confirm-ok').textContent = confirmLabel;
  modal.classList.remove('hidden');

  return new Promise((resolve) => {
    state.confirmResolver = resolve;
  });
}

// ============================================
// REAL-TIME UPDATES
// ============================================

function setupRealtimeListener() {
  // Listen for background updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'UI_UPDATE') {
      const { event, data } = message;
      
      if (event === 'clip_added' || event === 'clip_updated' || event === 'clip_deleted') {
        refreshClips();
      }
    }
  });
}

async function refreshClips() {
  await loadClips(true);
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
  // Login
  document.getElementById('btn-signin')?.addEventListener('click', async () => {
    const signinBtn = document.getElementById('btn-signin');
    const originalText = signinBtn.textContent;
    
    try {
      signinBtn.disabled = true;
      signinBtn.textContent = 'Signing in...';
      
      console.log('[FreeClipboard] Starting sign in flow...');
      
      const response = await Promise.race([
        sendMessage({ type: 'SIGN_IN_GOOGLE' }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Sign in timeout after 60 seconds')), 60000)
        )
      ]);
      
      if (response?.success) {
        console.log('[FreeClipboard] Sign in successful');
        showToast('✓ Sign in successful! Loading...');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        const errorMsg = response?.error || 'Sign in failed';
        console.error('[FreeClipboard] Sign in error:', errorMsg, response?.errorCode);
        
        // Provide specific error guidance
        let userMessage = errorMsg;
        
        if (errorMsg.includes('Identity') || errorMsg.includes('identity')) {
          userMessage = '❌ Identity permission missing.\n\nFix: Check OAUTH_DEBUGGING.md or reload extension.';
        } else if (errorMsg.includes('reinstall')) {
          userMessage = '❌ Extension needs reinstalling.\n\nFix: Remove and reinstall the extension.';
        } else if (errorMsg.includes('redirect')) {
          userMessage = '❌ OAuth setup issue.\n\nFix: Reload extension or check manifest.json';
        } else if (errorMsg.includes('cancelled')) {
          userMessage = 'Sign in was cancelled. Please try again.';
        }
        
        showError(userMessage);
      }
    } catch (err) {
      const errorMsg = err?.message || 'Sign in failed. Please try again.';
      console.error('[FreeClipboard] Sign in exception:', err);
      
      let userMessage = errorMsg;
      
      if (err.message.includes('timeout')) {
        userMessage = 'Sign in took too long. Please check your internet and try again.';
      } else if (err.message.includes('cancelled')) {
        userMessage = 'Sign in was cancelled. Please try again.';
      } else if (err.message.includes('Identity') || err.message.includes('identity')) {
        userMessage = 'Identity API error - see OAUTH_DEBUGGING.md in extension folder.';
      } else if (err.message.includes('undefined')) {
        userMessage = 'Extension setup issue - try reloading (chrome://extensions/).';
      }
      
      showError(userMessage);
    } finally {
      signinBtn.disabled = false;
      signinBtn.textContent = originalText;
    }
  });

  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    window.location.reload();
  });

  // Dashboard
  document.getElementById('btn-save')?.addEventListener('click', saveQuickClip);
  document.getElementById('quick-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveQuickClip();
    }
  });

  document.getElementById('btn-sync')?.addEventListener('click', async () => {
    const icon = document.getElementById('sync-icon');
    icon.style.animation = 'spin 1s linear infinite';
    try {
      await loadClips(true);
      showToast('✓ Synced!');
    } catch (err) {
      showToast('Sync failed - using local cache');
      console.error('[FreeClipboard] Sync error:', err);
    } finally {
      icon.style.animation = '';
    }
  });

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    try {
      await sendMessage({ type: 'SIGN_OUT' });
      showView('login');
      showToast('Signed out');
    } catch (err) {
      console.error('[FreeClipboard] Sign out error:', err);
      showError('Sign out failed');
    }
  });

  document.getElementById('btn-open-web')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://freeclipboard.com/dashboard' });
  });

  document.getElementById('btn-quick-search')?.addEventListener('click', () => {
    chrome.windows.create({
      url: chrome.runtime.getURL('src/quick-search/search.html'),
      type: 'popup',
      width: 700,
      height: 600,
      focused: true
    });
  });

  // Search
  setupSearch();

  // Settings
  setupSettingsModal();
  setupConfirmModal();
}

// ============================================
// UTILITIES
// ============================================

function updateStats(text) {
  const el = document.getElementById('stats-text');
  if (text) {
    el.textContent = text;
  } else {
    el.textContent = `${state.clips.length} clip${state.clips.length !== 1 ? 's' : ''}`;
  }
}

function showEmptyState(show) {
  document.getElementById('empty-state').classList.toggle('hidden', !show);
  document.getElementById('clips-section').classList.toggle('hidden', show);
}

function detectContentType(content) {
  if (/^https?:\/\//.test(content)) return 'link';
  if (/function|const|let|var|import|export/.test(content)) return 'code';
  return 'text';
}

function truncate(str, length) {
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
