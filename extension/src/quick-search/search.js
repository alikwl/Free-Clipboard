import { getSupabase } from '../lib/supabase-client.js';

const SECTION_ORDER = ['pinned', 'recent', 'snippets', 'secrets', 'notes'];
const SECTION_TITLES = {
  pinned: 'Pinned clips',
  recent: 'Recent clips',
  snippets: 'Snippets',
  secrets: 'API keys & secrets',
  notes: 'Notes'
};

const SENSITIVE_PATTERNS = [
  /\bapi[_ -]?key\b/i,
  /\bsecret\b/i,
  /\btoken\b/i,
  /\bpassword\b/i,
  /\bpasswd\b/i,
  /\bprivate[_ -]?key\b/i,
  /\bclient[_ -]?secret\b/i,
  /\baccess[_ -]?key\b/i,
  /\brefresh[_ -]?token\b/i,
  /\bssh-rsa\b/i,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
  /\bsk_(live|test)_[a-z0-9]{12,}\b/i,
  /\bghp_[a-z0-9]{20,}\b/i,
  /\bgithub_pat_[a-z0-9_]{20,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z\-_]{20,}\b/,
  /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/
];

const PASSWORD_PATTERNS = [/\bpassword\b/i, /\bpasswd\b/i, /\bpwd\b/i];

let supabase = null;
let entries = [];
let flatEntries = [];
let selectedIndex = 0;
let query = '';
const revealedEntries = new Map();
let pendingSensitiveEntry = null;

const searchInput = document.getElementById('search-input');
const resultsEl = document.getElementById('results');
const statusBanner = document.getElementById('status-banner');
const sensitiveBanner = document.getElementById('sensitive-banner');
const closeBtn = document.getElementById('close-btn');

function detectSensitive(text, title = '', tags = []) {
  const haystack = `${title}\n${tags.join(' ')}\n${text}`;
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(haystack));
}

function detectPasswordLike(text, title = '', tags = []) {
  const haystack = `${title}\n${tags.join(' ')}\n${text}`;
  return PASSWORD_PATTERNS.some((pattern) => pattern.test(haystack));
}

function maskSensitive(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Hidden sensitive clip';
  const start = normalized.slice(0, Math.min(4, normalized.length));
  const end = normalized.length > 10 ? normalized.slice(-4) : '';
  return `${start}${'•'.repeat(Math.max(6, normalized.length - start.length - end.length))}${end}`.slice(0, 90);
}

function deriveTitle(title, content, triggerKey = '') {
  if (title && title.trim()) return title.trim();
  if (triggerKey) return triggerKey;
  const firstLine = String(content || '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? firstLine.slice(0, 80) : 'Untitled clip';
}

function isCodeLike(content, metadata = {}) {
  return Boolean(metadata.code_language) || /```|const |function |class |SELECT |INSERT |<\w+/i.test(content || '');
}

function clipToEntry(clip) {
  const tags = Array.isArray(clip.tags) ? clip.tags.filter(Boolean) : [];
  const title = deriveTitle(clip.title, clip.content);
  const isSensitive = detectSensitive(clip.content, title, tags);
  const isPasswordLike = detectPasswordLike(clip.content, title, tags);
  const noteLike = !isSensitive && !isCodeLike(clip.content, clip.metadata || {});
  return {
    id: clip.id,
    kind: 'clip',
    title,
    content: clip.content,
    preview: isSensitive ? maskSensitive(clip.content) : clip.content,
    tags,
    pinned: Boolean(clip.pinned || clip.is_favorite),
    isSensitive,
    isPasswordLike,
    section: Boolean(clip.pinned || clip.is_favorite) ? 'pinned' : isSensitive ? 'secrets' : noteLike ? 'notes' : 'recent',
    sourceLabel: clip.source_app || clip.metadata?.source_app || 'Saved clip',
    triggerKey: '',
    useCount: 0
  };
}

function snippetToEntry(snippet) {
  const title = deriveTitle('', snippet.content, snippet.trigger_key);
  const isSensitive = detectSensitive(snippet.content, title, [snippet.trigger_key]);
  const isPasswordLike = detectPasswordLike(snippet.content, title, [snippet.trigger_key]);
  return {
    id: snippet.id,
    kind: 'snippet',
    title,
    content: snippet.content,
    preview: isSensitive ? maskSensitive(snippet.content) : snippet.content,
    tags: [snippet.trigger_key],
    pinned: false,
    isSensitive,
    isPasswordLike,
    section: isSensitive ? 'secrets' : 'snippets',
    sourceLabel: 'Snippet',
    triggerKey: snippet.trigger_key,
    useCount: snippet.use_count || 0
  };
}

function isRevealed(entry) {
  return (revealedEntries.get(entry.kind + entry.id) || 0) > Date.now();
}

function showStatus(message) {
  statusBanner.textContent = message;
  statusBanner.classList.remove('hidden');
  window.clearTimeout(showStatus._timer);
  showStatus._timer = window.setTimeout(() => statusBanner.classList.add('hidden'), 2800);
}

function showSensitivePrompt(entry) {
  pendingSensitiveEntry = entry;
  sensitiveBanner.innerHTML = `
    <strong>Sensitive clip confirmation.</strong>
    <div style="margin-top:6px">${entry.isPasswordLike ? 'This looks like a password or secret.' : 'This may contain an API key, token, or private secret.'} Reveal it before copying or pasting.</div>
    <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
      <button id="reveal-sensitive-btn" class="action-btn warn" type="button">Reveal for 10 seconds</button>
      <button id="cancel-sensitive-btn" class="action-btn" type="button">Cancel</button>
    </div>
  `;
  sensitiveBanner.classList.remove('hidden');
  document.getElementById('reveal-sensitive-btn')?.addEventListener('click', async () => {
    revealedEntries.set(entry.kind + entry.id, Date.now() + 10000);
    sensitiveBanner.classList.add('hidden');
    pendingSensitiveEntry = null;
    await trackUsage(entry, 'reveal');
    render();
    showStatus('Sensitive clip revealed for 10 seconds.');
  });
  document.getElementById('cancel-sensitive-btn')?.addEventListener('click', () => {
    sensitiveBanner.classList.add('hidden');
    pendingSensitiveEntry = null;
  });
}

function groupEntries(sourceEntries, search) {
  const normalized = search.trim().toLowerCase();
  const filtered = !normalized
    ? sourceEntries
    : sourceEntries.filter((entry) => {
        return (
          entry.title.toLowerCase().includes(normalized) ||
          entry.content.toLowerCase().includes(normalized) ||
          entry.tags.some((tag) => tag.toLowerCase().includes(normalized)) ||
          entry.sourceLabel.toLowerCase().includes(normalized) ||
          (entry.triggerKey || '').toLowerCase().includes(normalized)
        );
      });

  return {
    pinned: filtered.filter((entry) => entry.kind === 'clip' && entry.pinned).slice(0, 12),
    recent: filtered.filter((entry) => entry.kind === 'clip' && !entry.pinned && !entry.isSensitive && entry.section === 'recent').slice(0, 12),
    snippets: filtered.filter((entry) => entry.kind === 'snippet' && !entry.isSensitive).slice(0, 12),
    secrets: filtered.filter((entry) => entry.isSensitive).slice(0, 12),
    notes: filtered.filter((entry) => entry.kind === 'clip' && !entry.pinned && !entry.isSensitive && entry.section === 'notes').slice(0, 12)
  };
}

function flattenSections(grouped) {
  const next = [];
  SECTION_ORDER.forEach((section) => {
    grouped[section].forEach((entry) => {
      if (!next.some((item) => item.kind === entry.kind && item.id === entry.id)) {
        next.push(entry);
      }
    });
  });
  return next;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function render() {
  const grouped = groupEntries(entries, query);
  flatEntries = flattenSections(grouped);
  selectedIndex = Math.min(selectedIndex, Math.max(flatEntries.length - 1, 0));

  if (flatEntries.length === 0) {
    resultsEl.innerHTML = `<div class="empty-state">No clips matched that search. Try a tag, a snippet trigger, or a recent note phrase.</div>`;
    return;
  }

  resultsEl.innerHTML = SECTION_ORDER.map((section) => {
    const sectionEntries = grouped[section];
    if (!sectionEntries.length) return '';

    return `
      <section class="section">
        <h2 class="section-title">${SECTION_TITLES[section]}</h2>
        <div class="entry-list">
          ${sectionEntries.map((entry) => {
            const flatIndex = flatEntries.findIndex((item) => item.kind === entry.kind && item.id === entry.id);
            const selected = flatIndex === selectedIndex;
            const revealed = isRevealed(entry);
            return `
              <div class="entry ${selected ? 'selected' : ''}" data-kind="${entry.kind}" data-id="${entry.id}">
                <div class="entry-head">
                  <div class="entry-title-wrap">
                    <div class="entry-title-row">
                      ${flatIndex < 9 ? `<span class="quick-index">${flatIndex + 1}</span>` : ''}
                      <span class="entry-title">${escapeHtml(entry.title)}</span>
                      ${entry.pinned ? '<span class="pill pin">Pinned</span>' : ''}
                      ${entry.isSensitive ? '<span class="pill secret">Sensitive</span>' : ''}
                    </div>
                    <p class="entry-preview">${escapeHtml(entry.isSensitive && !revealed ? entry.preview : entry.content.slice(0, 180))}</p>
                  </div>
                  <div class="meta-col">
                    <div class="meta-source">${escapeHtml(entry.sourceLabel)}</div>
                    ${entry.triggerKey ? `<div class="meta-pill">${escapeHtml(entry.triggerKey)}</div>` : ''}
                  </div>
                </div>
                <div class="tag-row">
                  ${entry.tags.slice(0, 3).map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join('')}
                </div>
                <div class="action-row">
                  <button class="action-btn primary" type="button" data-action="copy" data-kind="${entry.kind}" data-id="${entry.id}">Copy</button>
                  <button class="action-btn" type="button" data-action="paste" data-kind="${entry.kind}" data-id="${entry.id}">Paste</button>
                  ${entry.kind === 'clip' ? `<button class="action-btn" type="button" data-action="pin" data-kind="${entry.kind}" data-id="${entry.id}">${entry.pinned ? 'Unpin' : 'Pin'}</button>` : ''}
                  ${entry.kind === 'clip' ? `<button class="action-btn" type="button" data-action="open" data-kind="${entry.kind}" data-id="${entry.id}">Open full clip</button>` : ''}
                  <button class="action-btn" type="button" data-action="clipmind" data-kind="${entry.kind}" data-id="${entry.id}">Ask ClipMind</button>
                  ${entry.isSensitive && !revealed ? `<button class="action-btn warn" type="button" data-action="reveal" data-kind="${entry.kind}" data-id="${entry.id}">Reveal for 10 seconds</button>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }).join('');

  resultsEl.querySelectorAll('.entry').forEach((node) => {
    node.addEventListener('click', async (event) => {
      const entry = getEntryFromNode(node);
      if (!entry) return;
      selectedIndex = flatEntries.findIndex((item) => item.kind === entry.kind && item.id === entry.id);
      render();
      if (event.target instanceof HTMLElement && event.target.closest('[data-action]')) {
        return;
      }
      await handlePrimaryAction(entry);
    });
  });

  resultsEl.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const target = event.currentTarget;
      if (!(target instanceof HTMLElement)) return;
      const entry = findEntry(target.dataset.kind, target.dataset.id);
      if (!entry) return;
      await runEntryAction(entry, target.dataset.action);
    });
  });

  const selectedNode = resultsEl.querySelector('.entry.selected');
  selectedNode?.scrollIntoView({ block: 'nearest' });
}

function getEntryFromNode(node) {
  return findEntry(node.getAttribute('data-kind'), node.getAttribute('data-id'));
}

function findEntry(kind, id) {
  return flatEntries.find((entry) => entry.kind === kind && entry.id === id) || null;
}

async function trackUsage(entry, action) {
  try {
    await supabase.trackQuickPasteUsage({
      entryKind: entry.kind,
      entryId: entry.id,
      action,
      source: 'extension'
    });
  } catch (error) {
    console.error('Quick paste usage tracking failed:', error);
  }
}

async function copyEntry(entry) {
  await navigator.clipboard.writeText(entry.content);
  await trackUsage(entry, 'copy');
  showStatus(`${entry.kind === 'snippet' ? 'Snippet' : 'Clip'} copied.`);
  window.setTimeout(() => window.close(), 220);
}

async function pasteEntry(entry) {
  const response = await chrome.runtime.sendMessage({
    type: 'PASTE_QUICK_PASTE',
    data: { content: entry.content }
  });

  if (response?.success && response.data?.pasted) {
    await trackUsage(entry, 'paste');
    showStatus('Pasted into the active field.');
    window.setTimeout(() => window.close(), 220);
    return;
  }

  await navigator.clipboard.writeText(entry.content);
  await trackUsage(entry, 'copy');
  showStatus('Copied instead. Paste directly on the page.');
}

async function togglePin(entry) {
  if (entry.kind !== 'clip') return;
  try {
    await supabase.toggleFavorite(entry.id, !entry.pinned);
    entry.pinned = !entry.pinned;
    entry.section = entry.pinned ? 'pinned' : entry.isSensitive ? 'secrets' : 'recent';
    await trackUsage(entry, 'pin');
    showStatus(entry.pinned ? 'Pinned clip.' : 'Unpinned clip.');
    render();
  } catch (error) {
    console.error('Pin failed:', error);
    showStatus('Could not update pin right now.');
  }
}

async function openFullClip(entry) {
  if (entry.kind !== 'clip') return;
  await trackUsage(entry, 'open');
  await chrome.runtime.sendMessage({
    type: 'OPEN_WEB_ROUTE',
    data: { route: `/dashboard?clip=${encodeURIComponent(entry.id)}` }
  });
  window.close();
}

async function askClipMind(entry) {
  await trackUsage(entry, 'clipmind');
  const prompt = encodeURIComponent(`Use this saved ${entry.kind} in ClipMind:\n\n${entry.content}`);
  await chrome.runtime.sendMessage({
    type: 'OPEN_WEB_ROUTE',
    data: { route: `/clipmind?prompt=${prompt}` }
  });
  window.close();
}

async function revealEntry(entry) {
  revealedEntries.set(entry.kind + entry.id, Date.now() + 10000);
  pendingSensitiveEntry = null;
  sensitiveBanner.classList.add('hidden');
  await trackUsage(entry, 'reveal');
  showStatus('Sensitive clip revealed for 10 seconds.');
  render();
}

async function runEntryAction(entry, action) {
  if ((action === 'copy' || action === 'paste') && entry.isSensitive && !isRevealed(entry)) {
    showSensitivePrompt(entry);
    return;
  }

  switch (action) {
    case 'copy':
      await copyEntry(entry);
      break;
    case 'paste':
      await pasteEntry(entry);
      break;
    case 'pin':
      await togglePin(entry);
      break;
    case 'open':
      await openFullClip(entry);
      break;
    case 'clipmind':
      await askClipMind(entry);
      break;
    case 'reveal':
      await revealEntry(entry);
      break;
    default:
      break;
  }
}

async function handlePrimaryAction(entry) {
  if (entry.isSensitive && !isRevealed(entry)) {
    showSensitivePrompt(entry);
    return;
  }
  await copyEntry(entry);
}

function handleKeydown(event) {
  const commandPressed = navigator.platform.toLowerCase().includes('mac') ? event.metaKey : event.ctrlKey;

  if (event.key === 'Escape') {
    event.preventDefault();
    window.close();
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, Math.max(flatEntries.length - 1, 0));
    render();
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    render();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    const entry = flatEntries[selectedIndex];
    if (entry) {
      void handlePrimaryAction(entry);
    }
    return;
  }

  if (commandPressed && /^[1-9]$/.test(event.key)) {
    event.preventDefault();
    const entry = flatEntries[Number(event.key) - 1];
    if (entry) {
      void handlePrimaryAction(entry);
    }
  }
}

async function init() {
  closeBtn.addEventListener('click', () => window.close());
  document.addEventListener('keydown', handleKeydown);
  searchInput.addEventListener('input', (event) => {
    query = event.target.value || '';
    selectedIndex = 0;
    render();
  });

  try {
    supabase = await getSupabase();
    const [{ clips }, snippets] = await Promise.all([
      supabase.getClips({ limit: 80, offset: 0 }),
      supabase.getSnippets(40)
    ]);

    entries = [...clips.map(clipToEntry), ...snippets.map(snippetToEntry)];
    render();
    searchInput.focus();
  } catch (error) {
    console.error('Quick paste init failed:', error);
    resultsEl.innerHTML = `<div class="empty-state">Quick Paste could not load your clips. Sign in again from the toolbar and reopen this panel.</div>`;
  }
}

window.setInterval(() => {
  if (revealedEntries.size === 0) return;
  const now = Date.now();
  let changed = false;
  for (const [key, expiresAt] of revealedEntries.entries()) {
    if (expiresAt <= now) {
      revealedEntries.delete(key);
      changed = true;
    }
  }
  if (changed) {
    render();
  }
}, 1000);

init();
