/**
 * FreeClipboard - Quick Search Overlay
 * Lightning fast clip search with keyboard navigation
 */

import { getSupabase } from '../lib/supabase-client.js';

// State
let supabase = null;
let clips = [];
let selectedIndex = -1;
let currentFilter = 'all';

// DOM
const searchInput = document.getElementById('search-input');
const resultsContainer = document.getElementById('results');
const filterButtons = document.querySelectorAll('.filter-btn');

// Initialize
async function init() {
  supabase = await getSupabase();

  // Load initial clips
  const { clips: initialClips } = await supabase.getClips({ limit: 50 });
  clips = initialClips;

  // Focus input
  searchInput.focus();

  // Event listeners
  searchInput.addEventListener('input', handleSearch);
  document.addEventListener('keydown', handleKeydown);

  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.type;
      performSearch(searchInput.value.trim());
    });
  });
}

async function handleSearch(e) {
  const query = e.target.value.trim();
  performSearch(query);
}

async function performSearch(query) {
  if (!query && currentFilter === 'all') {
    renderResults(clips.slice(0, 20));
    return;
  }

  // Local search first (instant)
  let results = clips.filter(clip => {
    const matchesQuery = !query ||
      clip.content.toLowerCase().includes(query.toLowerCase()) ||
      clip.source_app?.toLowerCase().includes(query.toLowerCase());

    const matchesFilter = currentFilter === 'all' ||
      currentFilter === 'recent' ||
      clip.content_type === currentFilter;

    return matchesQuery && matchesFilter;
  });

  if (currentFilter === 'recent') {
    results = results.slice(0, 20);
  }

  // Server search for more results
  if (query.length > 2) {
    try {
      const { clips: serverClips } = await supabase.getClips({
        search: query,
        type: currentFilter === 'all' ? null : currentFilter,
        limit: 50
      });
      results = serverClips;
    } catch (err) {
      console.error('Server search failed:', err);
    }
  }

  renderResults(results);
  selectedIndex = -1;
}

function renderResults(results) {
  if (results.length === 0) {
    resultsContainer.innerHTML = `
      <div class="results-empty">
        <span>No clips found. Try a different search.</span>
      </div>
    `;
    return;
  }

  resultsContainer.innerHTML = results.map((clip, index) => `
    <div class="result-item" data-index="${index}" data-id="${clip.id}">
      <div class="result-header">
        <span class="result-type">${getTypeIcon(clip.content_type)}</span>
        <span class="result-source">${escapeHtml(clip.source_app || 'Unknown')}</span>
        <span class="result-time">${timeAgo(clip.created_at)}</span>
      </div>
      <div class="result-content">${escapeHtml(truncate(clip.content, 120))}</div>
      <div class="result-meta">
        <span>${clip.content.split(/\s+/).length} words</span>
        ${clip.is_favorite ? '<span>⭐ Favorite</span>' : ''}
      </div>
    </div>
  `).join('');

  // Click handlers
  resultsContainer.querySelectorAll('.result-item').forEach(item => {
    item.addEventListener('click', () => {
      const clip = results[parseInt(item.dataset.index)];
      copyAndClose(clip);
    });
  });
}

function handleKeydown(e) {
  const items = resultsContainer.querySelectorAll('.result-item');

  switch(e.key) {
    case 'Escape':
      window.close();
      break;

    case 'ArrowDown':
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateSelection(items);
      break;

    case 'ArrowUp':
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateSelection(items);
      break;

    case 'Enter':
      e.preventDefault();
      if (selectedIndex >= 0 && items[selectedIndex]) {
        const clipId = items[selectedIndex].dataset.id;
        const clip = clips.find(c => c.id === clipId);
        if (clip) copyAndClose(clip);
      }
      break;
  }
}

function updateSelection(items) {
  items.forEach((item, index) => {
    item.classList.toggle('selected', index === selectedIndex);
  });

  // Scroll into view
  if (selectedIndex >= 0 && items[selectedIndex]) {
    items[selectedIndex].scrollIntoView({ block: 'nearest' });
  }
}

async function copyAndClose(clip) {
  try {
    await navigator.clipboard.writeText(clip.content);
    // Flash success
    const item = resultsContainer.querySelector(`[data-id="${clip.id}"]`);
    if (item) {
      item.style.background = '#22c55e22';
      item.style.borderColor = '#22c55e';
    }
    setTimeout(() => window.close(), 300);
  } catch (err) {
    console.error('Copy failed:', err);
  }
}

// Utilities
function getTypeIcon(type) {
  const icons = {
    text: '📝', code: '💻', link: '🔗',
    image: '🖼️', email: '📧', todo: '✅'
  };
  return icons[type] || '📄';
}

function truncate(str, len) {
  return str.length > len ? str.substring(0, len) + '...' : str;
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Start
init();
