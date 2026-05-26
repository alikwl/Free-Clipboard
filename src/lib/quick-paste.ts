export type QuickPasteActionKind = 'copy' | 'paste' | 'reveal' | 'pin' | 'open' | 'clipmind';

export interface QuickPasteClipRecord {
  id: string;
  title: string | null;
  content: string;
  tags: string[] | null;
  pinned: boolean | null;
  created_at: string;
  metadata?: {
    source_app?: string | null;
    code_language?: string | null;
    last_used_at?: string | null;
  } | null;
}

export interface QuickPasteSnippetRecord {
  id: string;
  trigger_key: string;
  content: string;
  use_count: number | null;
  created_at?: string | null;
}

export interface QuickPasteEntry {
  id: string;
  kind: 'clip' | 'snippet';
  title: string;
  content: string;
  maskedPreview: string;
  tags: string[];
  pinned: boolean;
  isSensitive: boolean;
  isPasswordLike: boolean;
  section: 'recent' | 'pinned' | 'snippet' | 'secret' | 'note';
  createdAt: string;
  sourceLabel: string;
  shortcutHint?: string;
  snippetTrigger?: string | null;
  useCount?: number;
}

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
  /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/,
  /\bea[0-9a-z]{20,}\b/i,
];

const PASSWORD_PATTERNS = [
  /\bpassword\b/i,
  /\bpasswd\b/i,
  /\bpwd\b/i,
  /\blogin\b/i,
];

export function deriveQuickPasteTitle(input: { title?: string | null; content: string; triggerKey?: string | null }) {
  const explicit = input.title?.trim();
  if (explicit) return explicit;
  if (input.triggerKey) return input.triggerKey;
  const firstLine = input.content
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? firstLine.slice(0, 80) : 'Untitled clip';
}

export function detectSensitiveContent(content: string, title = '', tags: string[] = []) {
  const haystack = `${title}\n${tags.join(' ')}\n${content}`;
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function detectPasswordLikeContent(content: string, title = '', tags: string[] = []) {
  const haystack = `${title}\n${tags.join(' ')}\n${content}`;
  return PASSWORD_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function maskSensitivePreview(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Hidden sensitive clip';
  const visibleStart = normalized.slice(0, Math.min(4, normalized.length));
  const visibleEnd = normalized.length > 10 ? normalized.slice(-4) : '';
  const maskedMiddleLength = Math.max(6, normalized.length - visibleStart.length - visibleEnd.length);
  const maskedMiddle = '•'.repeat(maskedMiddleLength);
  return `${visibleStart}${maskedMiddle}${visibleEnd}`.slice(0, 96);
}

export function buildClipQuickPasteEntry(clip: QuickPasteClipRecord): QuickPasteEntry {
  const tags = Array.isArray(clip.tags) ? clip.tags.filter(Boolean) : [];
  const title = deriveQuickPasteTitle({ title: clip.title, content: clip.content });
  const isSensitive = detectSensitiveContent(clip.content, title, tags);
  const isPasswordLike = detectPasswordLikeContent(clip.content, title, tags);
  const isCodeLike = Boolean(clip.metadata?.code_language) || /```|const |function |class |SELECT |INSERT |<\w+/i.test(clip.content);
  const isNoteLike = !isCodeLike && !isSensitive;

  return {
    id: clip.id,
    kind: 'clip',
    title,
    content: clip.content,
    maskedPreview: isSensitive ? maskSensitivePreview(clip.content) : clip.content,
    tags,
    pinned: Boolean(clip.pinned),
    isSensitive,
    isPasswordLike,
    section: clip.pinned ? 'pinned' : isSensitive ? 'secret' : isNoteLike ? 'note' : 'recent',
    createdAt: clip.created_at,
    sourceLabel: clip.metadata?.source_app || 'Saved clip',
  };
}

export function buildSnippetQuickPasteEntry(snippet: QuickPasteSnippetRecord): QuickPasteEntry {
  const title = deriveQuickPasteTitle({ content: snippet.content, triggerKey: snippet.trigger_key });
  const isSensitive = detectSensitiveContent(snippet.content, title, [snippet.trigger_key]);
  const isPasswordLike = detectPasswordLikeContent(snippet.content, title, [snippet.trigger_key]);

  return {
    id: snippet.id,
    kind: 'snippet',
    title,
    content: snippet.content,
    maskedPreview: isSensitive ? maskSensitivePreview(snippet.content) : snippet.content,
    tags: [snippet.trigger_key],
    pinned: false,
    isSensitive,
    isPasswordLike,
    section: isSensitive ? 'secret' : 'snippet',
    createdAt: snippet.created_at || new Date(0).toISOString(),
    sourceLabel: 'Snippet',
    shortcutHint: snippet.trigger_key,
    snippetTrigger: snippet.trigger_key,
    useCount: snippet.use_count || 0,
  };
}

export function groupQuickPasteEntries(entries: QuickPasteEntry[]) {
  const recent = entries
    .filter((entry) => entry.kind === 'clip' && !entry.isSensitive && !entry.pinned)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 8);

  const pinned = entries
    .filter((entry) => entry.kind === 'clip' && entry.pinned)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 8);

  const snippets = entries
    .filter((entry) => entry.kind === 'snippet' && !entry.isSensitive)
    .sort((a, b) => (b.useCount || 0) - (a.useCount || 0) || +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 8);

  const secrets = entries
    .filter((entry) => entry.isSensitive)
    .sort((a, b) => Number(b.isPasswordLike) - Number(a.isPasswordLike) || +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 8);

  const notes = entries
    .filter((entry) => entry.kind === 'clip' && entry.section === 'note' && !entry.pinned && !entry.isSensitive)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 8);

  return { recent, pinned, snippets, secrets, notes };
}

export function filterQuickPasteEntries(entries: QuickPasteEntry[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return groupQuickPasteEntries(entries);

  const filtered = entries.filter((entry) => {
    return (
      entry.title.toLowerCase().includes(normalized) ||
      entry.content.toLowerCase().includes(normalized) ||
      entry.tags.some((tag) => tag.toLowerCase().includes(normalized)) ||
      entry.sourceLabel.toLowerCase().includes(normalized) ||
      (entry.snippetTrigger || '').toLowerCase().includes(normalized)
    );
  });

  return {
    recent: filtered.filter((entry) => entry.kind === 'clip' && !entry.pinned && !entry.isSensitive).slice(0, 12),
    pinned: filtered.filter((entry) => entry.pinned).slice(0, 12),
    snippets: filtered.filter((entry) => entry.kind === 'snippet' && !entry.isSensitive).slice(0, 12),
    secrets: filtered.filter((entry) => entry.isSensitive).slice(0, 12),
    notes: filtered.filter((entry) => entry.section === 'note' && !entry.isSensitive).slice(0, 12),
  };
}
