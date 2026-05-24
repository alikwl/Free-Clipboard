'use client';

import React, { useState, useEffect } from 'react';

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
    <div className="min-h-screen bg-[#07070a] text-neutral-100 font-sans selection:bg-indigo-500/30 selection:text-indigo-200 flex flex-col relative overflow-hidden">
      <title>{`Collection (${clips.length} clips) — FreeClipboard`}</title>

      {/* Ambient background decoration */}
      <div className="fixed top-0 left-1/4 w-[500px] h-[500px] bg-violet-600/5 rounded-full blur-[130px] -z-10 pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[140px] -z-10 pointer-events-none" />
      <div className="fixed top-1/2 left-0 w-[300px] h-[300px] bg-purple-600/3 rounded-full blur-[100px] -z-10 pointer-events-none" />

      {/* Header bar */}
      <header className="border-b border-white/5 bg-neutral-950/60 backdrop-blur-md px-6 py-4 flex items-center justify-between shrink-0 sticky top-0 z-30">
        <a href="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
          </div>
          <span className="text-sm font-black tracking-tight bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent group-hover:opacity-80 transition-opacity">
            FreeClipboard
          </span>
        </a>

        <div className="flex items-center gap-3">
          <button
            onClick={handleCopyAll}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              copiedAll
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20'
            }`}
          >
            {copiedAll ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                All Copied!
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
                Copy All
              </>
            )}
          </button>
          
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-[10px] text-neutral-500 font-bold uppercase tracking-wider">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Collection
          </div>
        </div>
      </header>

      {/* Main content grid */}
      <main className="flex-grow p-6 md:p-12 max-w-5xl w-full mx-auto flex flex-col gap-6">
        
        {/* Collection summary header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/[0.02] border border-white/5 rounded-2xl p-5 backdrop-blur-lg">
          <div>
            <h1 className="text-lg md:text-xl font-black text-neutral-100 tracking-tight flex items-center gap-2">
              Shared Collection Page
              <span className="text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2.5 py-0.5 rounded-full font-mono font-bold">
                {clips.length} {clips.length === 1 ? 'Clip' : 'Clips'}
              </span>
            </h1>
            <p className="text-xs text-neutral-500 mt-1">
              Select and copy individual snippets or copy the entire page content.
            </p>
          </div>

          {shareExpiresAt && mounted && (
            <div className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-[11px] font-bold ${
              timeLeft === 'Expired'
                ? 'bg-rose-500/5 border-rose-500/25 text-rose-300'
                : 'bg-amber-500/5 border-amber-500/25 text-amber-300'
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-pulse"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>{timeLeft}</span>
            </div>
          )}
        </div>

        {/* Clip cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {clips.map((clip, index) => {
            const dateStr = mounted
              ? new Date(clip.created_at).toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric', year: 'numeric'
                })
              : '';

            return (
              <div
                key={clip.id}
                className="border border-white/5 bg-neutral-900/30 backdrop-blur-md rounded-2xl flex flex-col justify-between overflow-hidden shadow-lg transition-transform hover:-translate-y-0.5 duration-200"
              >
                {/* Header */}
                <div className="px-5 py-4 border-b border-white/5 bg-black/15 flex items-center justify-between gap-3 shrink-0">
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-neutral-200 truncate">{clip.title || `Clip #${index + 1}`}</h3>
                    <p className="text-[10px] text-neutral-500 font-mono mt-0.5">{dateStr}</p>
                  </div>

                  <button
                    onClick={() => handleCopySingle(clip.id, clip.content)}
                    className={`shrink-0 flex items-center justify-center p-2 rounded-lg transition-all border ${
                      copiedClipId === clip.id
                        ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                        : 'bg-white/[0.02] border-white/10 text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.06]'
                    }`}
                    title="Copy clip content"
                  >
                    {copiedClipId === clip.id ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
                    )}
                  </button>
                </div>

                {/* Content area */}
                <div className="p-5 flex-grow">
                  <pre className="text-[11px] text-neutral-300 font-mono leading-relaxed whitespace-pre-wrap break-words bg-black/20 border border-white/5 rounded-xl p-4 max-h-48 overflow-y-auto select-text">
                    {clip.content}
                  </pre>
                </div>

                {/* Tags footer */}
                {clip.tags.length > 0 && (
                  <div className="px-5 py-3 border-t border-white/[0.03] bg-black/5 flex flex-wrap gap-1 shrink-0">
                    {clip.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[9px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider"
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
          <p className="text-xs text-neutral-600">
            Shared via <span className="text-indigo-400 font-bold">FreeClipboard</span> — your premium cloud clipboard
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/40 transition-all shadow-md shadow-indigo-500/5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
            Create your own clip page →
          </a>
        </div>

      </main>
    </div>
  );
}
