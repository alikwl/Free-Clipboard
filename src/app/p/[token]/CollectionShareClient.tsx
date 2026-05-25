'use client';

import React, { useState, useEffect } from 'react';
import { ArrowRight, Check, Clipboard, Clock3, Copy, Layers, Lock } from 'lucide-react';

interface Clip {
  id: string;
  title: string | null;
  content: string;
  tags: string[];
  pinned: boolean;
  created_at: string;
}

interface CollectionShareClientProps {
  clips: Clip[];
  shareExpiresAt: string | null;
}

export default function CollectionShareClient({
  clips,
  shareExpiresAt,
}: CollectionShareClientProps) {
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedClipId, setCopiedClipId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Expiry countdown timer
  useEffect(() => {
    if (!shareExpiresAt) return;

    const tick = () => {
      const ms = new Date(shareExpiresAt).getTime() - Date.now();
      if (ms <= 0) {
        setTimeLeft('Expired');
        return;
      }
      const d = Math.floor(ms / (1000 * 60 * 60 * 24));
      const h = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((ms % (1000 * 60)) / 1000);
      if (d > 0) setTimeLeft(`${d}d ${h}h ${m}m remaining`);
      else if (h > 0) setTimeLeft(`${h}h ${m}m ${s}s remaining`);
      else setTimeLeft(`${m}m ${s}s remaining`);
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [shareExpiresAt]);

  const handleCopyAll = () => {
    const combinedContent = clips.map(c => c.content).join('\n\n---\n\n');
    navigator.clipboard.writeText(combinedContent).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    });
  };

  const handleCopySingle = (id: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedClipId(id);
      setTimeout(() => setCopiedClipId(null), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900 flex flex-col">
      <title>{`Collection (${clips.length} clips) — FreeClipboard`}</title>

      {/* Header bar */}
      <header className="sticky top-0 z-30 shrink-0 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
        <a href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_12px_26px_rgba(99,102,241,0.24)]">
            <Clipboard className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-black tracking-tight text-slate-950 transition-colors group-hover:text-indigo-600">FreeClipboard</span>
        </a>

        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <button
            onClick={handleCopyAll}
            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all ${
              copiedAll
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-transparent bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-[0_12px_26px_rgba(99,102,241,0.22)] hover:translate-y-[-1px]'
            }`}
          >
            {copiedAll ? (
              <>
                <Check className="h-3.5 w-3.5" />
                All Copied!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy All
              </>
            )}
          </button>
          
          <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 sm:flex">
            <Lock className="h-3 w-3" />
            Collection
          </div>
        </div>
        </div>
      </header>

      {/* Main content grid */}
      <main className="flex-grow bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_48%,#eef2ff_100%)] px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        
        {/* Collection summary header */}
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(148,163,184,0.14)] md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">
              Shared Collection Page
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 font-mono text-xs font-bold text-indigo-700">
                {clips.length} {clips.length === 1 ? 'Clip' : 'Clips'}
              </span>
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Select and copy individual snippets or copy the entire page content.
            </p>
          </div>

          {shareExpiresAt && mounted && (
            <div className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[11px] font-bold ${
              timeLeft === 'Expired'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}>
              <Clock3 className="h-3.5 w-3.5" />
              <span>{timeLeft}</span>
            </div>
          )}
        </div>

        {/* Clip cards grid */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {clips.map((clip, index) => {
            const dateStr = mounted
              ? new Date(clip.created_at).toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric', year: 'numeric'
                })
              : '';

            return (
              <div
                key={clip.id}
                className="flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_40px_rgba(148,163,184,0.12)] transition-transform duration-200 hover:-translate-y-0.5"
              >
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-4 sm:px-5">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-slate-950">{clip.title || `Clip #${index + 1}`}</h3>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-500">{dateStr}</p>
                  </div>

                  <button
                    onClick={() => handleCopySingle(clip.id, clip.content)}
                    className={`flex shrink-0 items-center justify-center rounded-lg border p-2 transition-all ${
                      copiedClipId === clip.id
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700'
                    }`}
                    title="Copy clip content"
                  >
                    {copiedClipId === clip.id ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                {/* Content area */}
                <div className="flex-grow p-4 sm:p-5">
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[12px] leading-6 text-slate-700 select-text">
                    {clip.content}
                  </pre>
                </div>

                {/* Tags footer */}
                {clip.tags.length > 0 && (
                  <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-slate-200 bg-slate-50/70 px-4 py-3 sm:px-5">
                    {clip.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-indigo-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* CTA footer */}
        <div className="mt-8 text-center flex flex-col items-center gap-3 shrink-0">
          <p className="text-xs text-slate-500">
            Shared via <span className="font-bold text-indigo-600">FreeClipboard</span> — your premium cloud clipboard
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-xs font-bold text-indigo-700 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50"
          >
            <Layers className="h-3.5 w-3.5" />
            Create your own clip page
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>

        </div>
      </main>
    </div>
  );
}
