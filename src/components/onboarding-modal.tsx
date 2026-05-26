'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Clipboard, Puzzle, Sparkles, Share2, X, ChevronRight, Check } from 'lucide-react';

const STEPS = [
  {
    title: 'Save your first clip',
    description: 'Start building your clipboard collection. Paste any text, code, or link below to try it out.',
    icon: Clipboard,
    color: 'from-indigo-500 to-violet-600',
    bg: 'bg-indigo-500/10',
    action: { label: 'Try demo clip', demo: true },
  },
  {
    title: 'Install Chrome Extension',
    description: 'Save text from any webpage with one click. Snippets auto-expand in any text field.',
    icon: Puzzle,
    color: 'from-emerald-500 to-teal-600',
    bg: 'bg-emerald-500/10',
    action: { label: 'View extension guide', href: '/dashboard' },
  },
  {
    title: 'Try AI features',
    description: 'Summarize, rewrite, and translate your clips with AI. Free users get 5 calls per day.',
    icon: Sparkles,
    color: 'from-amber-500 to-yellow-600',
    bg: 'bg-amber-500/10',
    action: { label: 'Go to dashboard', href: '/dashboard' },
  },
  {
    title: 'Invite a friend',
    description: 'Share a sync room code and collaborate in real-time across any device.',
    icon: Share2,
    color: 'from-rose-500 to-pink-600',
    bg: 'bg-rose-500/10',
    action: { label: 'Get started', href: '/dashboard', done: true },
  },
];

export function OnboardingModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [demoText, setDemoText] = useState('');
  const [demoDone, setDemoDone] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const dismissed = localStorage.getItem('fc_onboarding_done');
    if (!dismissed) {
      // Small delay so the page renders first
      const t = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  if (!open) return null;

  const dismiss = () => {
    localStorage.setItem('fc_onboarding_done', 'true');
    setOpen(false);
  };

  const s = STEPS[step];
  const Icon = s.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={dismiss}>
      <div
        className="safe-card relative w-full max-w-sm rounded-t-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl animate-in slide-in-from-bottom-10 duration-300 sm:rounded-2xl sm:slide-in-from-bottom-0 sm:zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={dismiss} className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-300">
          <X className="w-4 h-4" />
        </button>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 mb-5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full flex-1 transition-colors ${
                i <= step ? 'bg-indigo-500' : 'bg-white/5'
              }`}
            />
          ))}
        </div>

        <div className="flex items-start gap-4 mb-4">
          <div className={`w-10 h-10 rounded-xl ${s.bg} border border-white/5 flex items-center justify-center shrink-0`}>
            <Icon className={`w-5 h-5 ${step === 0 ? 'text-indigo-400' : step === 1 ? 'text-emerald-400' : step === 2 ? 'text-amber-400' : 'text-rose-400'}`} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white mb-1">{s.title}</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">{s.description}</p>
          </div>
        </div>

        {/* Demo textarea for step 1 */}
        {step === 0 && !demoDone && (
          <div className="mb-4">
            <textarea
              value={demoText}
              onChange={(e) => setDemoText(e.target.value)}
              placeholder="Paste anything — a link, code snippet, or note..."
              className="w-full h-24 bg-black/30 border border-white/10 rounded-xl p-3 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-indigo-500/40 focus:outline-none resize-none"
            />
            <button
              onClick={() => {
                if (demoText.trim()) {
                  setDemoDone(true);
                  // Save to localStorage as a quick demo
                  const stored = localStorage.getItem('freeclipboard_dashboard_clips');
                  const clips = stored ? JSON.parse(stored) : [];
                  clips.unshift({
                    id: Math.random().toString(36).substring(2, 11),
                    content: demoText.trim(),
                    title: 'My first clip',
                    tags: ['DEMO'],
                    pinned: false,
                    created_at: new Date().toISOString(),
                  });
                  localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(clips));
                }
              }}
              className="w-full py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-xs font-bold disabled:opacity-30"
              disabled={!demoText.trim()}
            >
              Save demo clip
            </button>
          </div>
        )}

        {step === 0 && demoDone && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-xs text-emerald-300">
            <Check className="w-4 h-4 text-emerald-400" />
            Demo clip saved! You&apos;ll see it on your dashboard.
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <button
            onClick={dismiss}
            className="text-xs text-neutral-500 hover:text-neutral-300 font-semibold transition-colors"
          >
            Skip tour
          </button>
          <button
            onClick={() => {
              if (s.action.done) {
                dismiss();
                router.push(s.action.href || '/dashboard');
              } else if (step < STEPS.length - 1) {
                setStep(step + 1);
              } else {
                dismiss();
              }
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold transition-all"
          >
            {s.action.label}
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
