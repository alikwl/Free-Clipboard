'use client';

import React, { useState, useEffect } from 'react';
import { ArrowRight, Check, Clipboard, Clock3, Copy, Lock } from 'lucide-react';

interface SharedClipClientProps {
  title: string | null;
  content: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  shareExpiresAt: string | null;
}

export default function SharedClipClient({
  title,
  content,
  tags,
  pinned,
  createdAt,
  shareExpiresAt,
}: SharedClipClientProps) {
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  // Live countdown
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
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [shareExpiresAt]);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const formattedDate = mounted 
    ? new Date(createdAt).toLocaleDateString(undefined, {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : '';

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900 flex flex-col">
      {/* Meta */}
      <title>{title ? `${title} — FreeClipboard` : 'Shared Clip — FreeClipboard'}</title>

      {/* Top nav bar */}
      <header className="border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
        <a href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_12px_26px_rgba(99,102,241,0.24)]">
            <Clipboard className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-black tracking-tight text-slate-950 transition-colors group-hover:text-indigo-600">FreeClipboard</span>
        </a>

        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
          <Lock className="h-3 w-3" />
          Read-Only
        </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-grow bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_48%,#eef2ff_100%)] px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto w-full max-w-2xl">
          
          {/* Card */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(148,163,184,0.18)]">
            
            {/* Card Header */}
            <div className="border-b border-slate-200 bg-slate-50/80 px-4 pb-4 pt-5 sm:px-6 sm:pt-6">
              <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-grow min-w-0">
                  <h1 className="break-words text-xl font-black leading-tight tracking-tight text-slate-950 sm:text-2xl">
                    {title || 'Untitled Clip'}
                  </h1>
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    Created {formattedDate}
                    {pinned && (
                      <span className="ml-2 inline-flex items-center gap-1 text-amber-600">
                        Pinned
                      </span>
                    )}
                  </p>
                </div>
                
                {/* Copy button */}
                <button
                  onClick={handleCopy}
                  className={`inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition-all duration-300 sm:w-auto ${
                    copied
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-transparent bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-[0_14px_30px_rgba(99,102,241,0.24)] hover:translate-y-[-1px]'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy Content
                    </>
                  )}
                </button>
              </div>

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-indigo-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Content body */}
            <div className="p-4 sm:p-6">
              <pre className="max-h-[64vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[13px] leading-7 text-slate-700 select-text sm:p-5 sm:text-sm">
                {content}
              </pre>
            </div>

            {/* Footer with expiry */}
            {shareExpiresAt && (
              <div className="px-4 pb-5 sm:px-6">
                <div className={`flex flex-wrap items-center gap-2.5 rounded-xl border p-3 text-xs font-semibold ${
                  timeLeft === 'Expired'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}>
                  <Clock3 className="h-3.5 w-3.5 shrink-0" />
                  <span>{timeLeft}</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-600">Free plan links expire after 7 days</span>
                </div>
              </div>
            )}
          </div>

          {/* CTA footer */}
          <div className="mt-8 text-center flex flex-col items-center gap-3">
            <p className="text-xs text-slate-500">
              Shared via <span className="font-bold text-indigo-600">FreeClipboard</span> — your premium cloud clipboard
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-xs font-bold text-indigo-700 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50"
            >
              Start saving your own clips
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>

        </div>
      </main>
    </div>
  );
}
