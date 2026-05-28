'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import {
  Archive,
  Bot,
  CheckCircle2,
  Crown,
  FileText,
  FolderOpen,
  Home,
  Loader2,
  Menu,
  Moon,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Sparkles,
  StickyNote,
  SunMedium,
  Trash2,
  X,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { isProUser } from '@/lib/clip-limits';
import { MobileBottomNav } from '@/components/mobile-bottom-nav';
import ProGate from '@/components/pro-gate';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DASHBOARD_FOLDERS_PAGE_SIZE, STICKY_NOTES_PAGE_SIZE } from '@/lib/egress';

interface Folder {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

interface StickyNoteRow {
  id: string;
  user_id: string;
  title: string;
  content: string;
  color: string;
  is_pinned: boolean;
  is_archived: boolean;
  folder_id: string | null;
  source_clip_id: string | null;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  tags?: string[] | null;
  created_at: string;
  updated_at: string;
}

interface LegacyStickyNoteRow {
  id: string;
  user_id: string;
  title?: string | null;
  content: string;
  color?: string | null;
  pinned?: boolean | null;
  archived?: boolean | null;
  folder_id?: string | null;
  clip_id?: string | null;
  position?: { x?: number; y?: number } | null;
  size?: { w?: number; h?: number } | null;
  tags?: string[] | null;
  created_at: string;
  updated_at: string;
}

interface StickyNoteCard {
  id: string;
  user_id: string;
  title: string;
  content: string;
  color: string;
  isPinned: boolean;
  isArchived: boolean;
  folderId: string | null;
  sourceClipId: string | null;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'warning' | 'info';
}

type StickySchemaMode = 'modern' | 'legacy';

const NOTE_COLOR_SWATCHES = [
  { label: 'yellow', value: '#FDE68A' },
  { label: 'pink', value: '#FBCFE8' },
  { label: 'blue', value: '#BFDBFE' },
  { label: 'green', value: '#BBF7D0' },
  { label: 'violet', value: '#DDD6FE' },
  { label: 'amber', value: '#FCD34D' },
];

const DEFAULT_EDITOR = {
  id: '',
  title: '',
  content: '',
  color: NOTE_COLOR_SWATCHES[0].value,
  folderId: '',
  tags: '',
  isPinned: false,
  isArchived: false,
};

const generateUUID = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const normalizeColor = (value: string | null | undefined) => {
  if (!value) return NOTE_COLOR_SWATCHES[0].value;
  const preset = NOTE_COLOR_SWATCHES.find((swatch) => swatch.label === value.toLowerCase());
  return preset?.value || value;
};

const colorNameFromValue = (value: string) => {
  const preset = NOTE_COLOR_SWATCHES.find((swatch) => swatch.value === value);
  return preset?.label || value;
};

const deriveTags = (content: string) => {
  const lowered = content.toLowerCase();
  const tags = new Set<string>();
  if (/(task|todo|checklist|deadline)/.test(lowered)) tags.add('TASKS');
  if (/(bug|issue|error|fix)/.test(lowered)) tags.add('BUGS');
  if (/(feature|roadmap|idea|enhancement)/.test(lowered)) tags.add('FEATURES');
  if (/(summary|overview|research|meeting)/.test(lowered)) tags.add('NOTES');
  if (/(code|api|react|next|stripe|typescript|javascript)/.test(lowered)) tags.add('CODE');
  tags.add('STICKY');
  return Array.from(tags).slice(0, 8);
};

const normalizeNote = (row: StickyNoteRow | LegacyStickyNoteRow): StickyNoteCard => ({
  id: row.id,
  user_id: row.user_id,
  title: row.title || '',
  content: row.content || '',
  color: normalizeColor(row.color),
  isPinned: Boolean('is_pinned' in row ? row.is_pinned : row.pinned),
  isArchived: Boolean('is_archived' in row ? row.is_archived : row.archived),
  folderId: row.folder_id || null,
  sourceClipId: ('source_clip_id' in row ? row.source_clip_id : row.clip_id) || null,
  positionX: Number('position_x' in row ? row.position_x ?? 0 : row.position?.x ?? 0),
  positionY: Number('position_y' in row ? row.position_y ?? 0 : row.position?.y ?? 0),
  width: Math.max(220, Number('width' in row ? row.width ?? 280 : row.size?.w ?? 280)),
  height: Math.max(180, Number('height' in row ? row.height ?? 220 : row.size?.h ?? 220)),
  tags: Array.isArray(row.tags) ? row.tags.filter(Boolean) : [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const noteToPayload = (note: StickyNoteCard, schemaMode: StickySchemaMode) => {
  if (schemaMode === 'legacy') {
    return {
      title: note.title || null,
      content: note.content,
      color: note.color,
      pinned: note.isPinned,
      archived: note.isArchived,
      folder_id: note.folderId,
      clip_id: note.sourceClipId,
      position: { x: note.positionX, y: note.positionY },
      size: { w: note.width, h: note.height },
      tags: note.tags,
    };
  }

  return {
    title: note.title || 'Untitled note',
    content: note.content,
    color: colorNameFromValue(note.color),
    is_pinned: note.isPinned,
    is_archived: note.isArchived,
    folder_id: note.folderId,
    source_clip_id: note.sourceClipId,
    position_x: note.positionX,
    position_y: note.positionY,
    width: note.width,
    height: note.height,
    tags: note.tags,
  };
};

const stringifySupabaseError = (error: unknown) => {
  if (!error) return 'Unknown error';
  if (error instanceof Error) return error.message;
  if (typeof error === 'object') {
    const maybeError = error as Record<string, unknown>;
    return String(
      maybeError.message ||
      maybeError.error_description ||
      maybeError.details ||
      maybeError.hint ||
      JSON.stringify(error)
    );
  }
  return String(error);
};

const getAlternateSchemaMode = (schemaMode: StickySchemaMode): StickySchemaMode =>
  schemaMode === 'modern' ? 'legacy' : 'modern';

interface StickyNoteCardProps {
  note: StickyNoteCard;
  folders: Folder[];
  themeMode: 'light' | 'dark';
  summarizingId: string | null;
  saving: boolean;
  onEdit: (note: StickyNoteCard) => void;
  onCopy: (note: StickyNoteCard) => void;
  onSummarize: (note: StickyNoteCard) => void;
  onArchive: (note: StickyNoteCard, archive: boolean) => void;
  onDelete: (id: string) => void;
  onConvert: (note: StickyNoteCard) => void;
  onTogglePin: (note: StickyNoteCard) => void;
}

function StickyNoteCardComponent({
  note,
  folders,
  themeMode,
  summarizingId,
  saving,
  onEdit,
  onCopy,
  onSummarize,
  onArchive,
  onDelete,
  onConvert,
  onTogglePin,
}: StickyNoteCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const folder = folders.find((item) => item.id === note.folderId);
  const visibleTags = note.tags.slice(0, 3);
  const extraTags = note.tags.length > 3 ? note.tags.length - 3 : 0;

  return (
    <div
      ref={cardRef}
      className={`relative flex flex-col justify-between rounded-[20px] p-5 shadow-sm border border-black/5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        themeMode === 'dark' ? 'shadow-black/20 border-white/5' : 'shadow-slate-100'
      }`}
      style={{
        backgroundColor: note.color,
        minHeight: '220px',
        width: '100%',
      }}
    >
      <div>
        {/* Header */}
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="truncate text-sm font-bold text-slate-900 leading-snug">
              {note.title || 'Untitled Note'}
            </h4>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500/80">
              {folder ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: folder.color }} />
                  <span className="truncate">{folder.name}</span>
                </>
              ) : (
                <span>Uncategorized</span>
              )}
              {note.sourceClipId && (
                <span className="rounded bg-black/5 px-1 py-0.2 text-[9px] uppercase tracking-wide text-slate-600">
                  Clip
                </span>
              )}
            </p>
          </div>
          
          <div className="flex items-center gap-1 shrink-0">
            {note.isPinned && (
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-600 border border-indigo-100 flex items-center gap-0.5">
                <Pin className="h-2.5 w-2.5 fill-current" />
                Pinned
              </span>
            )}
            <button
              type="button"
              onClick={() => onTogglePin(note)}
              className={`rounded-full p-1.5 transition ${
                note.isPinned 
                  ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100' 
                  : 'bg-white/50 text-slate-500 hover:bg-white/80'
              }`}
              title={note.isPinned ? 'Unpin note' : 'Pin note'}
            >
              <Pin className={`h-3.5 w-3.5 ${note.isPinned ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>

        {/* Content Preview */}
        <p className="line-clamp-4 md:line-clamp-5 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800 font-medium">
          {note.content || <span className="italic text-slate-500/60">Empty sticky note</span>}
        </p>
      </div>

      <div>
        {/* Tags */}
        {note.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {visibleTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-white/50 border border-black/[0.03] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-700"
              >
                {tag}
              </span>
            ))}
            {extraTags > 0 && (
              <span className="rounded-full bg-white/50 border border-black/[0.03] px-2 py-0.5 text-[9px] font-bold text-slate-600">
                +{extraTags}
              </span>
            )}
          </div>
        )}

        {/* Footer actions */}
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-black/5 pt-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onEdit(note)}
              className="inline-flex h-7 items-center justify-center rounded-lg bg-white/60 px-2.5 text-[11px] font-bold text-slate-700 border border-black/[0.02] hover:bg-white/90 active:bg-white transition"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onCopy(note)}
              className="inline-flex h-7 items-center justify-center rounded-lg bg-white/60 px-2.5 text-[11px] font-bold text-slate-700 border border-black/[0.02] hover:bg-white/90 active:bg-white transition"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => onSummarize(note)}
              disabled={summarizingId === note.id}
              className="hidden md:inline-flex h-7 items-center justify-center rounded-lg bg-white/60 px-2.5 text-[11px] font-bold text-slate-700 border border-black/[0.02] hover:bg-white/90 active:bg-white transition disabled:opacity-50"
            >
              {summarizingId === note.id ? (
                <Loader2 className="h-3 w-3 animate-spin text-slate-500" />
              ) : (
                <Sparkles className="h-3 w-3 text-indigo-500 mr-0.5" />
              )}
              Summarize
            </button>
          </div>

          <div className="flex items-center gap-2">
            {saving && (
              <span className="text-[10px] font-semibold text-slate-500 animate-pulse">
                Saving...
              </span>
            )}
            
            {/* Custom Popover Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/60 border border-black/[0.02] text-slate-600 hover:bg-white/90 active:bg-white transition"
                title="More actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>

              {menuOpen && (
                <div
                  className={`absolute right-0 bottom-full mb-2 z-30 w-48 rounded-xl border p-1 shadow-xl backdrop-blur-md ${
                    themeMode === 'dark'
                      ? 'border-white/10 bg-[#0b1426]/95 text-neutral-200'
                      : 'border-slate-200/80 bg-white/95 text-slate-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onConvert(note);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    Convert to Task
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onArchive(note, !note.isArchived);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 transition"
                  >
                    <Archive className="h-3.5 w-3.5 text-indigo-500" />
                    {note.isArchived ? 'Restore note' : 'Archive note'}
                  </button>
                  <div className="my-1 border-t border-black/5 dark:border-white/5" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Are you sure you want to permanently delete this sticky note?')) {
                        onDelete(note.id);
                      }
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                    Delete note
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StickyNotesWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [userPlan, setUserPlan] = useState<'free' | 'pro'>('free');
  const [userTrialEndsAt, setUserTrialEndsAt] = useState<string | null>(null);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [schemaMode, setSchemaMode] = useState<StickySchemaMode>('modern');
  const [stickyNotesReady, setStickyNotesReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notes, setNotes] = useState<StickyNoteCard[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notesHasMore, setNotesHasMore] = useState(false);
  const [foldersHasMore, setFoldersHasMore] = useState(false);
  const [loadingMoreNotes, setLoadingMoreNotes] = useState(false);
  const [loadingMoreFolders, setLoadingMoreFolders] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'pinned' | 'uncategorized' | 'archived'>('all');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorState, setEditorState] = useState(DEFAULT_EDITOR);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const notesRef = useRef<StickyNoteCard[]>([]);
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const addToast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
    const id = generateUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  }, []);

  const insertStickyNote = useCallback(async (note: StickyNoteCard) => {
    const primaryMode = schemaMode;
    const fallbackMode = getAlternateSchemaMode(primaryMode);

    const primaryResult = await supabase.from('sticky_notes').insert({
      id: note.id,
      user_id: note.user_id,
      ...noteToPayload(note, primaryMode),
    });

    if (!primaryResult.error) {
      return { ok: true as const, mode: primaryMode };
    }

    const fallbackResult = await supabase.from('sticky_notes').insert({
      id: note.id,
      user_id: note.user_id,
      ...noteToPayload(note, fallbackMode),
    });

    if (!fallbackResult.error) {
      return { ok: true as const, mode: fallbackMode };
    }

    console.warn('Sticky note creation unavailable until migration is applied:', {
      primary: stringifySupabaseError(primaryResult.error),
      fallback: stringifySupabaseError(fallbackResult.error),
    });

    return {
      ok: false as const,
      mode: primaryMode,
      error: fallbackResult.error || primaryResult.error,
    };
  }, [schemaMode, supabase]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedTheme = localStorage.getItem('fc_dashboard_theme');
    setThemeMode(storedTheme === 'dark' ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    const load = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        router.push('/login');
        return;
      }

      setUser(currentUser);

      const { data: profile } = await supabase
        .from('users')
        .select('plan, trial_ends_at')
        .eq('id', currentUser.id)
        .single();

      if (profile) {
        setUserPlan(profile.plan || 'free');
        setUserTrialEndsAt(profile.trial_ends_at);
      }

      const [
        modernStickyResult,
        { data: folderRows, error: folderError },
      ] = await Promise.all([
        supabase
          .from('sticky_notes')
          .select('id, user_id, title, content, color, is_pinned, is_archived, folder_id, source_clip_id, position_x, position_y, width, height, tags, created_at, updated_at')
          .eq('user_id', currentUser.id)
          .order('is_pinned', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(STICKY_NOTES_PAGE_SIZE + 1),
        supabase
          .from('folders')
          .select('id, name, color, created_at')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: true })
          .limit(DASHBOARD_FOLDERS_PAGE_SIZE + 1),
      ]);

      let stickyRows: Array<StickyNoteRow | LegacyStickyNoteRow> | null =
        (modernStickyResult.data as StickyNoteRow[] | null);
      let stickyError = modernStickyResult.error;
      let resolvedSchemaMode: StickySchemaMode = 'modern';

      if (stickyError) {
        const legacyResult = await supabase
          .from('sticky_notes')
          .select('id, user_id, title, content, color, pinned, archived, folder_id, clip_id, position, size, tags, created_at, updated_at')
          .eq('user_id', currentUser.id)
          .order('pinned', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(STICKY_NOTES_PAGE_SIZE + 1);

        if (!legacyResult.error) {
          stickyRows = legacyResult.data;
          stickyError = null;
          resolvedSchemaMode = 'legacy';
        } else {
          console.warn('Sticky notes unavailable until migration is applied:', {
            modern: stringifySupabaseError(modernStickyResult.error),
            legacy: stringifySupabaseError(legacyResult.error),
          });
        }
      }

      if (stickyError) {
        setStickyNotesReady(false);
        addToast('Could not load sticky notes yet. The sticky notes table may still need the latest migration.', 'warning');
      } else {
        setStickyNotesReady(true);
        setSchemaMode(resolvedSchemaMode);
        const limitedRows = (stickyRows || []).slice(0, STICKY_NOTES_PAGE_SIZE);
        setNotesHasMore((stickyRows || []).length > STICKY_NOTES_PAGE_SIZE);
        setNotes(limitedRows.map((row) => normalizeNote(row as StickyNoteRow | LegacyStickyNoteRow)));
      }

      if (!folderError && folderRows) {
        setFoldersHasMore(folderRows.length > DASHBOARD_FOLDERS_PAGE_SIZE);
        setFolders(folderRows.slice(0, DASHBOARD_FOLDERS_PAGE_SIZE).map((folder) => ({
          id: folder.id,
          name: folder.name,
          color: folder.color || '#6366f1',
          created_at: folder.created_at,
        })));
      }

      setLoading(false);
    };

    load();
  }, [addToast, router, supabase]);

  const loadMoreFolders = useCallback(async () => {
    if (!user || loadingMoreFolders || !foldersHasMore) return;
    setLoadingMoreFolders(true);
    try {
      const { data, error } = await supabase
        .from('folders')
        .select('id, name, color, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .range(folders.length, folders.length + DASHBOARD_FOLDERS_PAGE_SIZE);
      if (error) throw error;
      const nextRows = data || [];
      setFoldersHasMore(nextRows.length > DASHBOARD_FOLDERS_PAGE_SIZE);
      setFolders((prev) => [
        ...prev,
        ...nextRows.slice(0, DASHBOARD_FOLDERS_PAGE_SIZE).map((folder) => ({
          id: folder.id,
          name: folder.name,
          color: folder.color || '#6366f1',
          created_at: folder.created_at,
        })),
      ]);
    } catch (error) {
      console.error('Load more sticky-note folders failed:', error);
      addToast('Could not load more folders.', 'warning');
    } finally {
      setLoadingMoreFolders(false);
    }
  }, [addToast, folders.length, foldersHasMore, loadingMoreFolders, supabase, user]);

  const loadMoreNotes = useCallback(async () => {
    if (!user || loadingMoreNotes || !notesHasMore) return;
    setLoadingMoreNotes(true);
    try {
      const modernResult = await supabase
        .from('sticky_notes')
        .select('id, user_id, title, content, color, is_pinned, is_archived, folder_id, source_clip_id, position_x, position_y, width, height, tags, created_at, updated_at')
        .eq('user_id', user.id)
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false })
        .range(notes.length, notes.length + STICKY_NOTES_PAGE_SIZE);

      let nextRows = modernResult.data as Array<StickyNoteRow | LegacyStickyNoteRow> | null;
      let nextError = modernResult.error;

      if (nextError) {
        const legacyResult = await supabase
          .from('sticky_notes')
          .select('id, user_id, title, content, color, pinned, archived, folder_id, clip_id, position, size, tags, created_at, updated_at')
          .eq('user_id', user.id)
          .order('pinned', { ascending: false })
          .order('updated_at', { ascending: false })
          .range(notes.length, notes.length + STICKY_NOTES_PAGE_SIZE);
        nextRows = legacyResult.data as Array<StickyNoteRow | LegacyStickyNoteRow> | null;
        nextError = legacyResult.error;
      }

      if (nextError) throw nextError;

      const rows = nextRows || [];
      setNotesHasMore(rows.length > STICKY_NOTES_PAGE_SIZE);
      setNotes((prev) => [
        ...prev,
        ...rows.slice(0, STICKY_NOTES_PAGE_SIZE).map((row) => normalizeNote(row)),
      ]);
    } catch (error) {
      console.error('Load more sticky notes failed:', error);
      addToast('Could not load more sticky notes.', 'warning');
    } finally {
      setLoadingMoreNotes(false);
    }
  }, [addToast, loadingMoreNotes, notes.length, notesHasMore, supabase, user]);

  const persistNote = useCallback(async (noteId: string, nextState?: StickyNoteCard) => {
    const source = nextState || notesRef.current.find((note) => note.id === noteId);
    if (!source) return;

    setSavingIds((prev) => ({ ...prev, [noteId]: true }));
    try {
      const { error } = await supabase
        .from('sticky_notes')
        .update(noteToPayload(source, schemaMode))
        .eq('id', noteId);
      if (error) throw error;
    } catch (error) {
      console.error('Failed to save sticky note:', error);
      addToast('Could not save sticky note changes.', 'warning');
    } finally {
      setSavingIds((prev) => {
        const next = { ...prev };
        delete next[noteId];
        return next;
      });
    }
  }, [addToast, schemaMode, supabase]);

  useEffect(() => {
    if (!editingNoteId || !editorDirty) return;

    if (saveTimersRef.current[editingNoteId]) {
      clearTimeout(saveTimersRef.current[editingNoteId]);
    }

    let nextState: StickyNoteCard | null = null;
    setNotes((prev) => prev.map((note) => {
      if (note.id !== editingNoteId) return note;
      nextState = {
        ...note,
        title: editorState.title,
        content: editorState.content,
        color: editorState.color,
        folderId: editorState.folderId || null,
        tags: editorState.tags
          .split(',')
          .map((tag) => tag.trim().toUpperCase())
          .filter(Boolean)
          .slice(0, 8),
      };
      return nextState;
    }));

    if (!nextState) {
      return;
    }

    saveTimersRef.current[editingNoteId] = setTimeout(() => {
      void persistNote(editingNoteId, nextState || undefined);
      delete saveTimersRef.current[editingNoteId];
    }, 500);

    return () => {
      if (saveTimersRef.current[editingNoteId]) {
        clearTimeout(saveTimersRef.current[editingNoteId]);
      }
    };
  }, [editingNoteId, editorDirty, editorState, persistNote]);

  const handleToggleTheme = () => {
    const nextTheme = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(nextTheme);
    localStorage.setItem('fc_dashboard_theme', nextTheme);
  };

  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');

  const openEditor = useCallback((note?: StickyNoteCard) => {
    if (note) {
      setEditorMode('edit');
      setEditingNoteId(note.id);
      setEditorState({
        id: note.id,
        title: note.title,
        content: note.content,
        color: note.color,
        folderId: note.folderId || '',
        tags: note.tags.join(', '),
        isPinned: note.isPinned,
        isArchived: note.isArchived,
      });
    } else {
      setEditorMode('create');
      setEditingNoteId(null);
      setEditorState({
        ...DEFAULT_EDITOR,
        color: NOTE_COLOR_SWATCHES[notesRef.current.length % NOTE_COLOR_SWATCHES.length].value,
        folderId: selectedFolderId || '',
      });
    }
    setEditorDirty(false);
    setIsEditorOpen(true);
  }, [selectedFolderId]);

  const handleCreateNote = () => {
    openEditor();
  };

  const handleCreateSticky = async () => {
    if (!user) return;
    if (!stickyNotesReady) {
      addToast('Sticky Notes needs the latest database migration before new notes can be created.', 'warning');
      return;
    }

    const noteId = generateUUID();
    const nextNote: StickyNoteCard = {
      id: noteId,
      user_id: user.id,
      title: editorState.title.trim() || 'Untitled note',
      content: editorState.content,
      color: editorState.color,
      isPinned: editorState.isPinned,
      isArchived: editorState.isArchived,
      folderId: editorState.folderId || null,
      sourceClipId: null,
      positionX: 0,
      positionY: 0,
      width: 280,
      height: 220,
      tags: editorState.tags
        .split(',')
        .map((tag) => tag.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 8),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const result = await insertStickyNote(nextNote);
      if (!result.ok) throw result.error;
      if (result.mode !== schemaMode) {
        setSchemaMode(result.mode);
      }

      setNotes((prev) => [nextNote, ...prev]);
      setIsEditorOpen(false);
      addToast('Sticky note created.', 'success');
    } catch (error) {
      addToast('Could not create sticky note.', 'warning');
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      const { error } = await supabase.from('sticky_notes').delete().eq('id', noteId);
      if (error) throw error;
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
      if (editingNoteId === noteId) {
        setIsEditorOpen(false);
        setEditingNoteId(null);
      }
      addToast('Sticky note deleted.', 'info');
    } catch (error) {
      console.error('Failed to delete sticky note:', error);
      addToast('Could not delete this sticky note.', 'warning');
    }
  };

  const handleArchiveNote = async (note: StickyNoteCard, nextArchived = true) => {
    const updated = { ...note, isArchived: nextArchived };
    setNotes((prev) => prev.map((item) => item.id === note.id ? updated : item));
    await persistNote(note.id, updated);
    addToast(nextArchived ? 'Sticky note archived.' : 'Sticky note restored.', 'info');
  };

  const handleTogglePin = async (note: StickyNoteCard) => {
    const updated = { ...note, isPinned: !note.isPinned };
    setNotes((prev) => prev.map((item) => item.id === note.id ? updated : item));
    await persistNote(note.id, updated);
    addToast(updated.isPinned ? 'Sticky note pinned.' : 'Sticky note unpinned.', 'success');
  };

  const handleCopyNote = async (note: StickyNoteCard) => {
    try {
      await navigator.clipboard.writeText(note.content);
      addToast('Sticky note copied.', 'success');
    } catch (error) {
      console.error('Copy sticky note failed:', error);
      addToast('Could not copy this note.', 'warning');
    }
  };

  const handleSummarizeNote = async (note: StickyNoteCard) => {
    setSummarizingId(note.id);
    try {
      const response = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId: note.id, content: note.content }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.summary) throw new Error(data.error || 'Failed to summarize note.');

      const updated = {
        ...note,
        content: data.summary,
        tags: Array.from(new Set([...(note.tags || []), 'SUMMARY'])).slice(0, 8),
      };
      setNotes((prev) => prev.map((item) => item.id === note.id ? updated : item));
      await persistNote(note.id, updated);
      addToast(data.isFallback ? 'Summary generated with local fallback.' : 'Sticky note summarized.', data.isFallback ? 'warning' : 'success');
    } catch (error) {
      console.error('Summarize sticky note failed:', error);
      addToast('Could not summarize this note.', 'warning');
    } finally {
      setSummarizingId(null);
    }
  };

  const handleConvertNoteToTask = async (note: StickyNoteCard) => {
    if (!user) return;
    try {
      const taskTags = Array.from(new Set([...(note.tags || []), 'TASKS', 'TYPE:TASK', 'STATUS:PENDING'])).slice(0, 8);
      const { error } = await supabase
        .from('clips')
        .insert({
          user_id: user.id,
          title: note.title || 'Sticky Note Task',
          content: note.content,
          tags: taskTags,
          pinned: note.isPinned,
          folder_id: note.folderId || null,
        });
      if (error) throw error;
      addToast('Task created from sticky note.', 'success');
    } catch (error) {
      console.error('Convert sticky note to task failed:', error);
      addToast('Could not convert note to task.', 'warning');
    }
  };

  const handleImportSampleNotes = async () => {
    if (!user) return;
    if (!stickyNotesReady) {
      addToast('Sticky Notes needs the latest database migration before sample notes can be imported.', 'warning');
      return;
    }
    const samples: StickyNoteCard[] = [
      {
        id: generateUUID(),
        user_id: user.id,
        title: 'Weekly summary',
        content: 'Summarize the product feedback clips from this week and group them into bugs, ideas, and wins.',
        color: NOTE_COLOR_SWATCHES[0].value,
        isPinned: true,
        isArchived: false,
        folderId: null,
        sourceClipId: null,
        positionX: 0,
        positionY: 0,
        width: 280,
        height: 220,
        tags: ['STICKY', 'SUMMARY'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: generateUUID(),
        user_id: user.id,
        title: 'Client follow-up',
        content: 'Prepare a follow-up email from the client meeting notes and keep the final draft in Clips.',
        color: NOTE_COLOR_SWATCHES[2].value,
        isPinned: false,
        isArchived: false,
        folderId: null,
        sourceClipId: null,
        positionX: 0,
        positionY: 0,
        width: 280,
        height: 220,
        tags: ['STICKY', 'TASKS'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: generateUUID(),
        user_id: user.id,
        title: 'Feature cluster',
        content: 'Group enhancement ideas into navigation, performance, and AI workflows before the next planning review.',
        color: NOTE_COLOR_SWATCHES[4].value,
        isPinned: false,
        isArchived: false,
        folderId: null,
        sourceClipId: null,
        positionX: 0,
        positionY: 0,
        width: 280,
        height: 220,
        tags: ['STICKY', 'FEATURES'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    try {
      let resolvedMode = schemaMode;
      for (const note of samples) {
        const result = await insertStickyNote(note);
        if (!result.ok) throw result.error;
        resolvedMode = result.mode;
      }
      if (resolvedMode !== schemaMode) {
        setSchemaMode(resolvedMode);
      }
      setNotes((prev) => [...samples, ...prev]);
      addToast('Sample notes imported.', 'success');
    } catch (error) {
      console.warn('Sample note import failed:', stringifySupabaseError(error));
      addToast('Could not import sample notes.', 'warning');
    }
  };

  useEffect(() => {
    const focusNoteId = searchParams.get('note');
    if (!focusNoteId) return;
    const target = notes.find((note) => note.id === focusNoteId);
    if (target) {
      openEditor(target);
    }
  }, [notes, openEditor, searchParams]);

  const filteredNotes = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return notes.filter((note) => {
      // 1. Archive filter is absolute
      if (activeFilter === 'archived') {
        if (!note.isArchived) return false;
      } else {
        if (note.isArchived) return false;
      }

      // 2. Specific main filters (when active and not archived)
      if (activeFilter === 'pinned' && !note.isPinned) return false;
      if (activeFilter === 'uncategorized' && note.folderId !== null && note.folderId !== '') return false;

      // 3. Folder filter
      if (selectedFolderId && note.folderId !== selectedFolderId) return false;

      // 4. Search query
      if (!normalizedSearch) return true;
      return `${note.title} ${note.content} ${note.tags.join(' ')}`.toLowerCase().includes(normalizedSearch);
    });
  }, [activeFilter, notes, search, selectedFolderId]);

  const orderedNotes = useMemo(() => {
    return [...filteredNotes].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [filteredNotes]);

  const isPro = isProUser(userPlan, userTrialEndsAt);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950">
        <div className="flex items-center gap-3 text-sm text-neutral-400">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
          Loading sticky notes...
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-screen overflow-hidden ${themeMode === 'dark' ? 'bg-[#08111f] text-neutral-100' : 'bg-[#F8F8FC] text-slate-900'}`}>
      <ProGate isPro={isPro} feature="Sticky Notes" message="Unlock Sticky Notes" className="flex h-screen w-full overflow-hidden">
        <aside className={`fixed inset-y-0 left-0 z-40 h-screen w-[280px] min-w-[280px] transition-transform duration-200 md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div className={`flex h-full flex-col overflow-hidden border-r ${themeMode === 'dark' ? 'border-white/8 bg-[#0b1426]' : 'border-[#EBEBF0] bg-white'}`}>
            <div className={`shrink-0 border-b p-4 ${themeMode === 'dark' ? 'border-white/8' : 'border-[#EBEBF0]'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white">
                    <StickyNote className="h-5 w-5" />
                  </div>
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${themeMode === 'dark' ? 'text-indigo-300' : 'text-indigo-700'}`}>FreeClipboard</p>
                    <h1 className={`text-sm font-semibold ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>Sticky Notes</h1>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/dashboard')}
                  className={`rounded-xl p-2 transition ${themeMode === 'dark' ? 'text-neutral-400 hover:bg-white/6 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
                  title="Back to dashboard"
                >
                  <Home className="h-4 w-4" />
                </button>
              </div>

              <button
                onClick={handleCreateNote}
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-4 text-xs font-semibold text-white transition hover:translate-y-[-1px]"
              >
                <Plus className="h-4 w-4" />
                Create Sticky
              </button>
            </div>

            <div className="shrink-0 p-4 pb-3">
              <div className="space-y-2">
                {[
                  { id: 'all', label: 'All Notes', icon: FileText, count: notes.filter((note) => !note.isArchived).length },
                  { id: 'pinned', label: 'Pinned', icon: Pin, count: notes.filter((note) => note.isPinned && !note.isArchived).length },
                  { id: 'uncategorized', label: 'Uncategorized', icon: FileText, count: notes.filter((note) => !note.folderId && !note.isArchived).length },
                  { id: 'archived', label: 'Archived', icon: Archive, count: notes.filter((note) => note.isArchived).length },
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = activeFilter === item.id && selectedFolderId === null;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveFilter(item.id as any);
                        setSelectedFolderId(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left text-sm transition ${
                        isActive
                          ? themeMode === 'dark' ? 'border-indigo-400/25 bg-indigo-500/10 text-white' : 'border-indigo-200 bg-indigo-50 text-slate-950'
                          : themeMode === 'dark' ? 'border-white/8 bg-white/[0.02] text-neutral-300 hover:bg-white/[0.04]' : 'border-[#EBEBF0] bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span className="font-medium">{item.label}</span>
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${themeMode === 'dark' ? 'bg-white/6 text-neutral-400' : 'bg-slate-100 text-slate-500'}`}>{item.count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              <div className="mb-3 flex items-center gap-2">
                <FolderOpen className={`h-4 w-4 ${themeMode === 'dark' ? 'text-neutral-500' : 'text-slate-400'}`} />
                <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${themeMode === 'dark' ? 'text-neutral-500' : 'text-[#8888A0]'}`}>Folders</p>
              </div>

              <div className="space-y-2">
                {folders.map((folder) => {
                  const isActive = selectedFolderId === folder.id;
                  const noteCount = notes.filter((note) => note.folderId === folder.id && !note.isArchived).length;
                  const isZero = noteCount === 0;
                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => {
                        setSelectedFolderId(folder.id);
                        setActiveFilter('all');
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left text-sm transition ${
                        isActive
                          ? themeMode === 'dark' ? 'border-indigo-400/25 bg-indigo-500/10 text-white' : 'border-indigo-200 bg-indigo-50 text-slate-950'
                          : themeMode === 'dark' ? 'border-white/8 bg-white/[0.02] text-neutral-300 hover:bg-white/[0.04]' : 'border-[#EBEBF0] bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: folder.color }} />
                        <span className="truncate font-medium">{folder.name}</span>
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] transition ${
                        isZero
                          ? 'opacity-40 font-normal bg-black/5 dark:bg-white/5 text-neutral-500'
                          : themeMode === 'dark' ? 'bg-white/6 text-neutral-300 font-semibold' : 'bg-slate-100 text-slate-700 font-semibold'
                      }`}>
                        {noteCount}
                      </span>
                    </button>
                  );
                })}
                {foldersHasMore && (
                  <button
                    type="button"
                    onClick={() => void loadMoreFolders()}
                    disabled={loadingMoreFolders}
                    className={`flex w-full items-center justify-center rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                      themeMode === 'dark'
                        ? 'border-white/8 bg-white/[0.02] text-neutral-300 hover:bg-white/[0.04] disabled:opacity-60'
                        : 'border-[#EBEBF0] bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60'
                    }`}
                  >
                    {loadingMoreFolders ? 'Loading...' : 'Load more folders'}
                  </button>
                )}
              </div>
            </div>

            <div className={`mt-auto shrink-0 border-t p-4 ${themeMode === 'dark' ? 'border-white/8 bg-black/20' : 'border-[#EBEBF0] bg-slate-50/70'}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${themeMode === 'dark' ? 'bg-indigo-500/10 text-indigo-300' : 'bg-indigo-50 text-indigo-600'}`}>
                  <Crown className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className={`truncate text-xs font-medium ${themeMode === 'dark' ? 'text-neutral-200' : 'text-slate-800'}`}>{user?.email || 'Active User'}</p>
                  <p className={`text-[11px] ${themeMode === 'dark' ? 'text-neutral-500' : 'text-[#8888A0]'}`}>{isPro ? 'Pro workspace' : 'Free workspace'}</p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className={`fixed inset-0 z-30 md:hidden ${themeMode === 'dark' ? 'bg-black/50' : 'bg-slate-950/20'}`}
          />
        )}

        <main className={`flex h-screen flex-1 flex-col overflow-hidden ${themeMode === 'dark' ? 'bg-[#08111f]' : 'bg-[#F8F8FC]'}`}>
          <header className={`flex h-14 min-h-14 shrink-0 items-center justify-between border-b px-3 sm:px-5 ${themeMode === 'dark' ? 'border-white/8 bg-[#0d172b]' : 'border-[#EBEBF0] bg-white'}`}>
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className={`rounded-xl p-2 md:hidden ${themeMode === 'dark' ? 'text-neutral-400' : 'text-slate-500'}`}
                title="Open sidebar"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <p className={`truncate text-[14px] font-semibold ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>Sticky Notes</p>
                <p className={`truncate text-[12px] ${themeMode === 'dark' ? 'text-neutral-400' : 'text-[#8888A0]'}`}>
                  Compact notes for ideas, tasks, and client context
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-1.5 md:flex">
                <span className="rounded-full bg-[#F0EFFE] px-2.5 py-1 text-[11px] font-medium text-[#6B5CE7]">🗒 {notes.filter((note) => !note.isArchived).length}</span>
                <span className="rounded-full bg-[#F0EFFE] px-2.5 py-1 text-[11px] font-medium text-[#6B5CE7]">📌 {notes.filter((note) => note.isPinned && !note.isArchived).length}</span>
                <span className="rounded-full bg-[#F0EFFE] px-2.5 py-1 text-[11px] font-medium text-[#6B5CE7]">📁 {folders.length}</span>
              </div>
              <button
                onClick={handleToggleTheme}
                className={`rounded-xl p-2 transition ${themeMode === 'dark' ? 'text-neutral-300 hover:bg-white/6' : 'text-slate-500 hover:bg-slate-100'}`}
                title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {themeMode === 'dark' ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </header>

          <div className={`shrink-0 border-b px-3 py-3 sm:px-5 ${themeMode === 'dark' ? 'border-white/8 bg-[#0d172b]' : 'border-[#EBEBF0] bg-white'}`}>
            <div className="flex items-center justify-between gap-3">
              <div className={`flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[10px] border px-3 ${themeMode === 'dark' ? 'border-white/8 bg-[#08111f]' : 'border-[#EBEBF0] bg-[#F8F8FC]'}`}>
                <Search className={`h-4 w-4 ${themeMode === 'dark' ? 'text-neutral-500' : 'text-[#8888A0]'}`} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search sticky notes..."
                  className={`h-full min-w-0 flex-1 border-0 bg-transparent text-[14px] outline-none ${themeMode === 'dark' ? 'text-neutral-100 placeholder:text-neutral-500' : 'text-slate-900 placeholder:text-[#8888A0]'}`}
                />
              </div>
              <Button
                type="button"
                onClick={handleCreateNote}
                disabled={!stickyNotesReady}
                className="h-10 rounded-xl border-0 bg-[#6B5CE7] px-4 text-sm font-semibold text-white hover:bg-[#5e50d8] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 shrink-0"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New Sticky
              </Button>
            </div>

            {/* Horizontal Filter Chips on Mobile */}
            <div className="flex md:hidden overflow-x-auto gap-2 mt-3 pb-1 scrollbar-none shrink-0 select-none">
              {[
                { id: 'all', label: 'All Notes', count: notes.filter((n) => !n.isArchived).length },
                { id: 'pinned', label: 'Pinned', count: notes.filter((n) => n.isPinned && !n.isArchived).length },
                { id: 'uncategorized', label: 'Uncategorized', count: notes.filter((n) => !n.folderId && !n.isArchived).length },
                { id: 'archived', label: 'Archived', count: notes.filter((n) => n.isArchived).length },
              ].map((item) => {
                const isActive = activeFilter === item.id && selectedFolderId === null;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveFilter(item.id as any);
                      setSelectedFolderId(null);
                    }}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition ${
                      isActive
                        ? themeMode === 'dark' ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                        : themeMode === 'dark' ? 'bg-white/[0.02] border-white/8 text-neutral-300' : 'bg-white border-[#EBEBF0] text-slate-700'
                    }`}
                  >
                    {item.label} <span className="opacity-60 ml-0.5">{item.count}</span>
                  </button>
                );
              })}
              
              {/* Folder Chips */}
              {folders.map((folder) => {
                const isActive = selectedFolderId === folder.id;
                const count = notes.filter((n) => n.folderId === folder.id && !n.isArchived).length;
                return (
                  <button
                    key={folder.id}
                    onClick={() => {
                      setSelectedFolderId(folder.id);
                      setActiveFilter('all');
                    }}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold border transition flex items-center gap-1.5 ${
                      isActive
                        ? themeMode === 'dark' ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                        : themeMode === 'dark' ? 'bg-white/[0.02] border-white/8 text-neutral-300' : 'bg-white border-[#EBEBF0] text-slate-700'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: folder.color }} />
                    <span>{folder.name}</span>
                    <span className="opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>

            {!stickyNotesReady ? (
              <div className={`mt-3 rounded-2xl border px-3 py-2 text-xs ${
                themeMode === 'dark'
                  ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
              }`}>
                Sticky Notes is waiting on the latest database migration. Apply <span className="font-semibold">supabase-migrations-sticky-notes-v2.sql</span> to enable create and save.
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 pb-24 sm:px-5">
            {orderedNotes.length > 0 ? (
              <div className="space-y-4">
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {orderedNotes.map((note) => (
                    <StickyNoteCardComponent
                      key={note.id}
                      note={note}
                      folders={folders}
                      themeMode={themeMode}
                      summarizingId={summarizingId}
                      saving={savingIds[note.id] || false}
                      onEdit={openEditor}
                      onCopy={handleCopyNote}
                      onSummarize={handleSummarizeNote}
                      onArchive={handleArchiveNote}
                      onDelete={handleDeleteNote}
                      onConvert={handleConvertNoteToTask}
                      onTogglePin={handleTogglePin}
                    />
                  ))}
                </div>
                {notesHasMore && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => void loadMoreNotes()}
                      disabled={loadingMoreNotes}
                      className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                        themeMode === 'dark'
                          ? 'border-white/8 bg-white/[0.02] text-neutral-200 hover:bg-white/[0.04] disabled:opacity-60'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60'
                      }`}
                    >
                      {loadingMoreNotes ? 'Loading notes...' : 'Load more notes'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className={`mx-auto flex max-w-2xl flex-col items-center rounded-[24px] border p-8 text-center ${themeMode === 'dark' ? 'border-white/8 bg-[#0b1426] text-neutral-300 shadow-2xl shadow-black/30' : 'border-slate-200/80 bg-white text-slate-700 shadow-xl shadow-slate-100'}`}>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/20">
                  <StickyNote className="h-6 w-6" />
                </div>
                <h3 className={`mt-6 text-lg font-bold ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>No sticky notes yet</h3>
                <p className={`mt-2 max-w-lg text-sm leading-relaxed ${themeMode === 'dark' ? 'text-neutral-400' : 'text-slate-500'}`}>
                  Capture quick ideas, reminders, reusable snippets, and client context. Keep pinned context ready for the next thing you do.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                  <Button
                    type="button"
                    onClick={handleCreateNote}
                    disabled={!stickyNotesReady}
                    className="h-10 rounded-xl border-0 bg-[#6B5CE7] px-5 text-sm font-semibold text-white hover:bg-[#5e50d8] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 hover:translate-y-[-1px] transition shadow-md shadow-indigo-500/10"
                  >
                    Create Sticky
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push('/dashboard')}
                    className="h-10 rounded-xl text-sm font-semibold border-slate-200 hover:bg-slate-50"
                  >
                    Convert a Clip
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push('/dashboard')}
                    className="h-10 rounded-xl text-sm font-semibold border-slate-200 hover:bg-slate-50"
                  >
                    View Clips
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </ProGate>

      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-full w-full h-[90dvh] max-h-[90dvh] rounded-b-none rounded-t-[24px] self-end mt-auto md:max-w-[720px] md:h-auto md:max-h-[86vh] md:rounded-[20px] md:self-center md:my-auto border border-slate-200/80 bg-white p-0 overflow-hidden flex flex-col shadow-2xl">
          <DialogHeader className="border-b border-slate-100 px-6 py-4 text-left shrink-0">
            <DialogTitle className="text-base font-bold text-slate-900">
              {editorMode === 'create' ? 'Create sticky note' : 'Edit sticky note'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500/80 font-medium">
              {editorMode === 'create'
                ? 'Capture a quick idea, reminder, or reusable note.'
                : 'Changes save automatically after a short pause.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Title & Pin Toggle */}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-1.5">
                  Title
                </label>
                <Input
                  value={editorState.title}
                  onChange={(event) => {
                    setEditorState((prev) => ({ ...prev, title: event.target.value }));
                    setEditorDirty(true);
                  }}
                  placeholder="Sticky note title"
                  className="h-10 rounded-xl border-slate-200/80 focus:border-indigo-500 focus:ring-indigo-500 text-sm font-semibold text-slate-800"
                />
              </div>
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditorState((prev) => {
                      const nextPinned = !prev.isPinned;
                      setEditorDirty(true);
                      return { ...prev, isPinned: nextPinned };
                    });
                  }}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                    editorState.isPinned
                      ? 'border-indigo-200 bg-indigo-50 text-indigo-600'
                      : 'border-slate-200/80 text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                  }`}
                  title={editorState.isPinned ? 'Pinned' : 'Pin note'}
                >
                  <Pin className={`h-4 w-4 ${editorState.isPinned ? 'fill-current' : ''}`} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-1.5">
                Content
              </label>
              <Textarea
                value={editorState.content}
                onChange={(event) => {
                  const nextContent = event.target.value;
                  setEditorState((prev) => ({
                    ...prev,
                    content: nextContent,
                    tags: prev.tags || deriveTags(nextContent).join(', '),
                  }));
                  setEditorDirty(true);
                }}
                placeholder="Write your note here..."
                className="min-h-[140px] max-h-[220px] rounded-xl border-slate-200/80 focus:border-indigo-500 focus:ring-indigo-500 text-sm leading-relaxed text-slate-800 font-medium"
              />
            </div>

            {/* Folder & Color Picker (2 columns on desktop, stacked on mobile) */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-1.5">
                  Folder
                </label>
                <select
                  value={editorState.folderId}
                  onChange={(event) => {
                    setEditorState((prev) => ({ ...prev, folderId: event.target.value }));
                    setEditorDirty(true);
                  }}
                  className="h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-indigo-500 font-medium transition"
                >
                  <option value="">Uncategorized / No folder</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-2">
                  Color Background
                </label>
                <div className="flex flex-wrap items-center gap-1.5 h-10">
                  {NOTE_COLOR_SWATCHES.map((swatch) => (
                    <button
                      key={swatch.value}
                      type="button"
                      onClick={() => {
                        setEditorState((prev) => ({ ...prev, color: swatch.value }));
                        setEditorDirty(true);
                      }}
                      className={`h-7 w-7 rounded-full border-2 transition ${
                        editorState.color === swatch.value
                          ? 'border-slate-900 scale-110 shadow-sm'
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: swatch.value }}
                      title={swatch.label}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-1.5">
                Tags (comma separated)
              </label>
              <Input
                value={editorState.tags}
                onChange={(event) => {
                  setEditorState((prev) => ({ ...prev, tags: event.target.value }));
                  setEditorDirty(true);
                }}
                placeholder="e.g., TASKS, NOTES, STICKY"
                className="h-10 rounded-xl border-slate-200/80 focus:border-indigo-500 focus:ring-indigo-500 text-sm font-semibold text-slate-800"
              />
            </div>

            {/* Archive Toggle (only in edit mode) */}
            {editorMode === 'edit' && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="archive-toggle"
                  checked={editorState.isArchived}
                  onChange={(event) => {
                    const nextArchived = event.target.checked;
                    setEditorState((prev) => ({ ...prev, isArchived: nextArchived }));
                    setEditorDirty(true);
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <label
                  htmlFor="archive-toggle"
                  className="text-xs font-bold text-slate-600 select-none cursor-pointer hover:text-slate-800 transition"
                >
                  Archive this note (hides from active grid and folders)
                </label>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col gap-2 border-t border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between shrink-0 bg-slate-50/50">
            <div className="text-xs font-semibold text-slate-500">
              {editorMode === 'edit' && editingNoteId ? (
                savingIds[editingNoteId] ? (
                  <span className="flex items-center gap-1.5 text-indigo-600">
                    <Loader2 className="h-3 w-3 animate-spin" /> Saving changes...
                  </span>
                ) : (
                  <span className="text-slate-400 font-medium">Auto-saved</span>
                )
              ) : (
                <span className="text-slate-400 font-medium">Auto-save disabled for drafts</span>
              )}
            </div>
            <div className="flex gap-2">
              {editorMode === 'edit' && editingNoteId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleDeleteNote(editingNoteId)}
                  className="rounded-xl border-slate-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 h-9 text-xs font-bold px-3"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete Note
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditorOpen(false)}
                className="rounded-xl border-slate-200 h-9 text-xs font-bold px-3 text-slate-600 hover:bg-slate-50"
              >
                Close
              </Button>
              {editorMode === 'create' ? (
                <Button
                  type="button"
                  onClick={handleCreateSticky}
                  className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white h-9 text-xs font-bold px-4 border-0 hover:translate-y-[-1px] transition shadow-md shadow-indigo-500/10"
                >
                  Create Sticky
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={async () => {
                    if (editingNoteId) {
                      await persistNote(editingNoteId);
                    }
                    setIsEditorOpen(false);
                  }}
                  className="rounded-xl bg-[#6B5CE7] hover:bg-[#5e50d8] text-white h-9 text-xs font-bold px-4 border-0 shadow-md shadow-indigo-500/10"
                >
                  Done
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileBottomNav themeMode={themeMode} />

      <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex max-w-sm flex-col gap-2.5">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-start gap-3 rounded-xl border p-3.5 shadow-2xl backdrop-blur-md ${
              toast.type === 'success'
                ? 'border-emerald-500/20 bg-emerald-950/80 text-emerald-200'
                : toast.type === 'warning'
                  ? 'border-amber-500/20 bg-amber-950/80 text-amber-200'
                  : 'border-indigo-500/20 bg-indigo-950/80 text-indigo-200'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : toast.type === 'warning' ? (
              <Loader2 className="h-4 w-4 shrink-0 text-amber-400" />
            ) : (
              <Bot className="h-4 w-4 shrink-0 text-indigo-400" />
            )}
            <span className="text-xs leading-normal">{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
