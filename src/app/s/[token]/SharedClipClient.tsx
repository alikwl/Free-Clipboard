'use client';

import React, { useState, useEffect } from 'react';

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
    <div className="min-h-screen bg-[#07070a] text-neutral-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200 flex flex-col relative overflow-hidden">
      {/* Meta */}
      <title>{title ? `${title} — FreeClipboard` : 'Shared Clip — FreeClipboard'}</title>

      {/* Ambient orbs */}
      <div className="fixed top-0 left-1/4 w-[500px] h-[500px] bg-violet-600/5 rounded-full blur-[130px] -z-10 pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[140px] -z-10 pointer-events-none" />
      <div className="fixed top-1/2 left-0 w-[300px] h-[300px] bg-purple-600/3 rounded-full blur-[100px] -z-10 pointer-events-none" />

      {/* Top nav bar */}
      <header className="border-b border-white/5 bg-neutral-950/60 backdrop-blur-md px-6 py-4 flex items-center justify-between shrink-0">
        <a href="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
          </div>
          <span className="text-sm font-black tracking-tight bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent group-hover:opacity-80 transition-opacity">
            FreeClipboard
          </span>
        </a>

        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-[10px] text-neutral-500 font-bold uppercase tracking-wider">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Read-Only
        </div>
      </header>

      {/* Content */}
      <main className="flex-grow flex items-start justify-center p-6 pt-12 pb-16">
        <div className="w-full max-w-2xl">
          
          {/* Card */}
          <div className="border border-white/8 bg-neutral-900/40 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
            
            {/* Card Header */}
            <div className="px-6 pt-6 pb-4 border-b border-white/5 bg-black/20">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-grow min-w-0">
                  <h1 className="text-xl font-black tracking-tight text-neutral-100 leading-tight break-words">
                    {title || 'Untitled Clip'}
                  </h1>
                  <p className="text-xs text-neutral-500 mt-1.5 font-semibold">
                    Created {formattedDate}
                    {pinned && (
                      <span className="ml-2 inline-flex items-center gap-1 text-yellow-500/80">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                        Pinned
                      </span>
                    )}
                  </p>
                </div>
                
                {/* Copy button */}
                <button
                  onClick={handleCopy}
                  className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 border shadow-lg ${
                    copied
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 shadow-emerald-500/10 scale-95'
                      : 'bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-purple-500/10 border-indigo-500/20 text-indigo-300 hover:from-indigo-500/20 hover:to-purple-500/20 hover:border-indigo-500/40 hover:scale-105 shadow-indigo-500/5'
                  }`}
                >
                  {copied ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
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
                      className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Content body */}
            <div className="p-6">
              <pre className="text-sm text-neutral-300 font-mono leading-relaxed whitespace-pre-wrap break-words bg-black/20 border border-white/5 rounded-xl p-5 select-text overflow-x-auto">
                {content}
              </pre>
            </div>

            {/* Footer with expiry */}
            {shareExpiresAt && (
              <div className="px-6 pb-5">
                <div className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-semibold ${
                  timeLeft === 'Expired'
                    ? 'bg-rose-500/5 border-rose-500/20 text-rose-400'
                    : 'bg-amber-500/5 border-amber-500/20 text-amber-400/80'
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 animate-pulse"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span>{timeLeft}</span>
                  <span className="text-neutral-600">•</span>
                  <span className="text-neutral-600">Free plan — links expire after 7 days</span>
                </div>
              </div>
            )}
          </div>

          {/* CTA footer */}
          <div className="mt-8 text-center flex flex-col items-center gap-3">
            <p className="text-xs text-neutral-600">
              Shared via <span className="text-indigo-400 font-bold">FreeClipboard</span> — your premium cloud clipboard
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/40 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
              Start saving your own clips →
            </a>
          </div>

        </div>
      </main>
    </div>
  );
}
