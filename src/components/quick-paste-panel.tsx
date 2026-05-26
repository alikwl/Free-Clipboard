'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bot,
  Clipboard,
  Eye,
  KeyRound,
  Loader2,
  Lock,
  Pin,
  Search,
  ShieldAlert,
  Sparkles,
  StickyNote,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/utils/supabase/client';
import { filterQuickPasteEntries, type QuickPasteActionKind, type QuickPasteEntry } from '@/lib/quick-paste';

const ALLOWED_PREFIXES = ['/dashboard', '/clipmind', '/analytics', '/graph'];

type SectionKey = 'pinned' | 'recent' | 'snippets' | 'secrets' | 'notes';

type QuickPasteResponse = {
  success: boolean;
  entries: QuickPasteEntry[];
};

const SECTION_META: Record<SectionKey, { title: string; icon: React.ComponentType<{ className?: string }> }> = {
  pinned: { title: 'Pinned clips', icon: Pin },
  recent: { title: 'Recent clips', icon: Clipboard },
  snippets: { title: 'Snippets', icon: Sparkles },
  secrets: { title: 'API keys & secrets', icon: KeyRound },
  notes: { title: 'Notes', icon: StickyNote },
};

function isEditableElement(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return target.isContentEditable || tag === 'input' || tag === 'textarea';
}

function insertTextIntoEditable(target: HTMLElement | null, text: string) {
  if (!target) return false;
  target.focus();

  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    target.setRangeText(text, start, end, 'end');
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (target.isContentEditable) {
    const selection = window.getSelection();
    if (!selection) return false;
    if (!selection.rangeCount) {
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    selection.deleteFromDocument();
    selection.getRangeAt(0).insertNode(document.createTextNode(text));
    selection.collapseToEnd();
    target.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  return false;
}

export function QuickPastePanel() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const isEnabledRoute = ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<QuickPasteEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingSensitiveEntry, setPendingSensitiveEntry] = useState<QuickPasteEntry | null>(null);
  const [revealedEntries, setRevealedEntries] = useState<Record<string, number>>({});
  const [lastLoadedAt, setLastLoadedAt] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const resultRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const groupedEntries = useMemo(() => filterQuickPasteEntries(entries, query), [entries, query]);

  const flatEntries = useMemo(() => {
    const list: QuickPasteEntry[] = [];
    (['pinned', 'recent', 'snippets', 'secrets', 'notes'] as SectionKey[]).forEach((section) => {
      groupedEntries[section].forEach((entry) => {
        if (!list.some((existing) => existing.kind === entry.kind && existing.id === entry.id)) {
          list.push(entry);
        }
      });
    });
    return list;
  }, [groupedEntries]);

  const loadEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/quick-paste', { cache: 'no-store' });
      const payload = (await response.json()) as QuickPasteResponse & { error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load quick paste data.');
      }
      setEntries(payload.entries || []);
      setLastLoadedAt(Date.now());
    } catch (error) {
      console.error('Quick paste load failed:', error);
      setStatusMessage(error instanceof Error ? error.message : 'Quick Paste failed to load.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openPanel = useCallback(() => {
    returnFocusRef.current = isEditableElement(document.activeElement) ? document.activeElement : null;
    setIsOpen(true);
    setStatusMessage(null);
    setQuery('');
    setSelectedIndex(0);
    if (Date.now() - lastLoadedAt > 10_000 || entries.length === 0) {
      void loadEntries();
    }
  }, [entries.length, lastLoadedAt, loadEntries]);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    setPendingSensitiveEntry(null);
    setStatusMessage(null);
    setQuery('');
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    searchInputRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isEnabledRoute) {
      setIsOpen(false);
    }
  }, [isEnabledRoute]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isEnabledRoute) return;
      const commandPressed = navigator.platform.toLowerCase().includes('mac') ? event.metaKey : event.ctrlKey;

      if (commandPressed && event.shiftKey && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        if (isOpen) {
          closePanel();
        } else {
          openPanel();
        }
        return;
      }

      if (!isOpen) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        closePanel();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(current + 1, Math.max(flatEntries.length - 1, 0)));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(current - 1, 0));
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
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closePanel, isEnabledRoute, isOpen, openPanel, selectedIndex]);

  useEffect(() => {
    const selectedEntry = flatEntries[selectedIndex];
    if (!selectedEntry) return;
    resultRefs.current[selectedEntry.kind + selectedEntry.id]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => {
      setRevealedEntries((current) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(current).filter(([, expiresAt]) => expiresAt > now));
        return Object.keys(next).length === Object.keys(current).length ? current : next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(flatEntries.length - 1, 0)));
  }, [flatEntries.length]);

  const isEntryRevealed = useCallback(
    (entry: QuickPasteEntry) => (revealedEntries[entry.kind + entry.id] || 0) > Date.now(),
    [revealedEntries]
  );

  const trackUsage = useCallback(async (entry: QuickPasteEntry, action: QuickPasteActionKind) => {
    try {
      await fetch('/api/quick-paste/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          source: 'web',
          entryKind: entry.kind,
          entryId: entry.id,
        }),
      });
    } catch (error) {
      console.error('Quick paste usage tracking failed:', error);
    }
  }, []);

  const copyEntry = useCallback(async (entry: QuickPasteEntry) => {
    await navigator.clipboard.writeText(entry.content);
    await trackUsage(entry, 'copy');
    setStatusMessage(`${entry.kind === 'snippet' ? 'Snippet' : 'Clip'} copied.`);
    closePanel();
  }, [closePanel, trackUsage]);

  const pasteEntry = useCallback(async (entry: QuickPasteEntry) => {
    const pasted = insertTextIntoEditable(returnFocusRef.current, entry.content);
    if (!pasted) {
      await navigator.clipboard.writeText(entry.content);
      setStatusMessage('Copied instead. Paste directly where you need it.');
    } else {
      setStatusMessage('Pasted into the active field.');
    }
    await trackUsage(entry, 'paste');
    closePanel();
  }, [closePanel, trackUsage]);

  const revealEntry = useCallback(async (entry: QuickPasteEntry) => {
    setPendingSensitiveEntry(null);
    setRevealedEntries((current) => ({
      ...current,
      [entry.kind + entry.id]: Date.now() + 10_000,
    }));
    await trackUsage(entry, 'reveal');
    setStatusMessage('Sensitive clip revealed for 10 seconds.');
  }, [trackUsage]);

  const handlePrimaryAction = useCallback(async (entry: QuickPasteEntry) => {
    if (entry.isSensitive && !isEntryRevealed(entry)) {
      setPendingSensitiveEntry(entry);
      return;
    }
    await copyEntry(entry);
  }, [copyEntry, isEntryRevealed]);

  const handleTogglePin = useCallback(async (entry: QuickPasteEntry) => {
    if (entry.kind !== 'clip') return;
    try {
      const nextPinned = !entry.pinned;
      const { error } = await supabase.from('clips').update({ pinned: nextPinned }).eq('id', entry.id);
      if (error) throw error;
      setEntries((current) =>
        current.map((item) =>
          item.kind === 'clip' && item.id === entry.id
            ? { ...item, pinned: nextPinned, section: nextPinned ? 'pinned' : item.isSensitive ? 'secret' : 'recent' }
            : item
        )
      );
      await trackUsage(entry, 'pin');
      setStatusMessage(nextPinned ? 'Pinned clip.' : 'Unpinned clip.');
    } catch (error) {
      console.error('Pin update failed:', error);
      setStatusMessage('Could not update pin right now.');
    }
  }, [supabase, trackUsage]);

  const openFullClip = useCallback(async (entry: QuickPasteEntry) => {
    if (entry.kind !== 'clip') return;
    await trackUsage(entry, 'open');
    closePanel();
    router.push(`/dashboard?clip=${encodeURIComponent(entry.id)}`);
  }, [closePanel, router, trackUsage]);

  const openClipMind = useCallback(async (entry: QuickPasteEntry) => {
    await trackUsage(entry, 'clipmind');
    closePanel();
    const prompt = `Use this saved ${entry.kind} in ClipMind:\n\n${entry.content}`;
    router.push(`/clipmind?prompt=${encodeURIComponent(prompt)}`);
  }, [closePanel, router, trackUsage]);

  const renderSection = (section: SectionKey) => {
    const items = groupedEntries[section];
    if (items.length === 0) return null;
    const Icon = SECTION_META[section].icon;

    return (
      <section key={section} className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Icon className="h-4 w-4 text-indigo-500" />
          <h3 className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-neutral-400">
            {SECTION_META[section].title}
          </h3>
        </div>
        <div className="space-y-2">
          {items.map((entry) => {
            const key = entry.kind + entry.id;
            const selected = flatEntries[selectedIndex]?.kind === entry.kind && flatEntries[selectedIndex]?.id === entry.id;
            const revealed = isEntryRevealed(entry);
            return (
              <div
                key={key}
                ref={(node) => {
                  resultRefs.current[key] = node;
                }}
                onClick={() => {
                  setSelectedIndex(flatEntries.findIndex((item) => item.kind === entry.kind && item.id === entry.id));
                  void handlePrimaryAction(entry);
                }}
                role="button"
                tabIndex={-1}
                className={`safe-card flex w-full flex-col gap-2 rounded-[18px] border px-3 py-3 text-left transition ${
                  selected
                    ? 'border-indigo-300 bg-indigo-50 shadow-[0_14px_30px_rgba(99,102,241,0.14)] dark:border-indigo-500/30 dark:bg-indigo-500/10'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-white/8 dark:bg-neutral-950/70 dark:hover:border-white/15'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {flatEntries.findIndex((item) => item.kind === entry.kind && item.id === entry.id) < 9 && (
                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-black text-indigo-700 dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-200">
                          {flatEntries.findIndex((item) => item.kind === entry.kind && item.id === entry.id) + 1}
                        </span>
                      )}
                      <span className="line-clamp-1 text-sm font-black text-slate-900 dark:text-white">{entry.title}</span>
                      {entry.pinned && <Pin className="h-3.5 w-3.5 text-amber-500" />}
                      {entry.isSensitive && <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />}
                    </div>
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600 dark:text-neutral-300">
                      {entry.isSensitive && !revealed ? entry.maskedPreview : entry.content}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-neutral-500">
                      {entry.sourceLabel}
                    </div>
                    {entry.shortcutHint && (
                      <div className="mt-1 rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:border-white/10 dark:text-neutral-400">
                        {entry.shortcutHint}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {entry.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" className="h-8 rounded-xl px-3 text-xs" onClick={(event) => { event.stopPropagation(); void handlePrimaryAction(entry); }}>
                    Copy
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 rounded-xl px-3 text-xs" onClick={(event) => {
                    event.stopPropagation();
                    if (entry.isSensitive && !revealed) {
                      setPendingSensitiveEntry(entry);
                      return;
                    }
                    void pasteEntry(entry);
                  }}>
                    Paste
                  </Button>
                  {entry.kind === 'clip' && (
                    <Button size="sm" variant="outline" className="h-8 rounded-xl px-3 text-xs" onClick={(event) => { event.stopPropagation(); void handleTogglePin(entry); }}>
                      {entry.pinned ? 'Unpin' : 'Pin'}
                    </Button>
                  )}
                  {entry.kind === 'clip' && (
                    <Button size="sm" variant="outline" className="h-8 rounded-xl px-3 text-xs" onClick={(event) => { event.stopPropagation(); void openFullClip(entry); }}>
                      Open full clip
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-8 rounded-xl px-3 text-xs" onClick={(event) => { event.stopPropagation(); void openClipMind(entry); }}>
                    Ask ClipMind
                  </Button>
                  {entry.isSensitive && !revealed && (
                    <Button size="sm" variant="outline" className="h-8 rounded-xl px-3 text-xs" onClick={(event) => { event.stopPropagation(); setPendingSensitiveEntry(entry); }}>
                      Reveal for 10 seconds
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  if (!isEnabledRoute) return null;

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-950/55 backdrop-blur-sm" onClick={closePanel} />
      )}

      {isOpen && (
        <div className={`fixed inset-x-0 z-[121] mx-auto w-full px-3 ${isMobile ? 'bottom-0 top-auto max-w-none pb-0' : 'top-[7vh] max-w-4xl'}`}>
          <div
            className={`safe-card safe-modal-frame border shadow-2xl ${
              isMobile
                ? 'max-h-[85dvh] rounded-t-[28px] rounded-b-none border-slate-200 bg-white dark:border-white/10 dark:bg-[#09090c]'
                : 'max-h-[82vh] rounded-[26px] border-slate-200 bg-white dark:border-white/10 dark:bg-[#09090c]'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="safe-modal-header border-b border-slate-200 px-4 py-3 dark:border-white/10">
              {isMobile && <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-300 dark:bg-white/15" />}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-black tracking-[0.08em] text-slate-900 dark:text-white">Quick Paste</h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">Arrow keys to move, Enter to copy, Esc to close, Ctrl/Cmd + 1-9 for quick copy.</p>
                </div>
                <button
                  type="button"
                  onClick={closePanel}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                <Search className="h-4 w-4 text-slate-500 dark:text-neutral-400" />
                <Input
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search clips, snippets, notes, and secrets"
                  className="border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                />
              </div>
              {statusMessage && (
                <div className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200">
                  {statusMessage}
                </div>
              )}
              {pendingSensitiveEntry && (
                <div className="mt-3 rounded-[20px] border border-rose-200 bg-rose-50 px-3 py-3 dark:border-rose-500/20 dark:bg-rose-500/10">
                  <div className="flex items-start gap-3">
                    <Lock className="mt-0.5 h-4 w-4 text-rose-600 dark:text-rose-300" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-rose-700 dark:text-rose-200">Sensitive clip confirmation</p>
                      <p className="mt-1 text-xs leading-5 text-rose-700/90 dark:text-rose-100/85">
                        {pendingSensitiveEntry.isPasswordLike
                          ? 'This looks like a password or secret. Reveal it first before copy or paste.'
                          : 'This clip may contain an API key, token, or private secret. Confirm before revealing or copying it.'}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" className="h-8 rounded-xl px-3 text-xs" onClick={() => void revealEntry(pendingSensitiveEntry)}>
                          Reveal for 10 seconds
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 rounded-xl px-3 text-xs" onClick={() => setPendingSensitiveEntry(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="safe-modal-body px-4 py-4">
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="animate-pulse rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3 dark:border-white/10 dark:bg-white/[0.04]">
                      <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-white/10" />
                      <div className="mt-3 h-3 w-full rounded bg-slate-200 dark:bg-white/10" />
                      <div className="mt-2 h-3 w-2/3 rounded bg-slate-200 dark:bg-white/10" />
                    </div>
                  ))}
                </div>
              ) : flatEntries.length === 0 ? (
                <div className="flex min-h-[240px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center dark:border-white/10 dark:bg-white/[0.03]">
                  <AlertTriangle className="h-6 w-6 text-slate-400 dark:text-neutral-500" />
                  <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-neutral-200">No saved items match this search.</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">Try a title, a tag, a snippet trigger, or a recent note phrase.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {(['pinned', 'recent', 'snippets', 'secrets', 'notes'] as SectionKey[]).map(renderSection)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
