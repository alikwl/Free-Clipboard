'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { X, Crown, Sparkles, Infinity, Share2, Zap } from 'lucide-react';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
}

const FEATURES = [
  {
    icon: Infinity,
    title: 'Unlimited Clips & Devices',
    desc: 'No limits on clip storage. Sync across all your devices seamlessly.',
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
  },
  {
    icon: Sparkles,
    title: 'AI-Powered Features',
    desc: '100 AI calls/day, ClipMind assistant, smart search, auto-tagging & RAG analysis.',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
  },
  {
    icon: Share2,
    title: 'Advanced Sharing & Export',
    desc: 'Permanent share links, JSON/Markdown exports, snippet triggers & analytics.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
];

export default function UpgradeModal({ open, onClose, title, message }: UpgradeModalProps) {
  const router = useRouter();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-indigo-500/20">
            <Crown className="w-7 h-7 text-white" />
          </div>
          <h3 className="text-lg font-black text-white mb-1">{title || 'Unlock Pro'}</h3>
          <p className="text-xs text-neutral-400">{message || 'Start your 7-day free trial today'}</p>
        </div>

        <div className="space-y-2.5 mb-6">
          {FEATURES.map(({ icon: Icon, title: featTitle, desc, color, bg }, i) => (
            <div key={i} className="flex items-start gap-3 bg-white/5 rounded-xl p-3">
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0 mt-0.5`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-neutral-200">{featTitle}</span>
                <p className="text-[10px] text-neutral-500 leading-relaxed mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => { onClose(); router.push('/upgrade'); }}
          className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white text-xs font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
        >
          Start 7-Day Free Trial
          <Zap className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onClose}
          className="w-full text-[10px] text-neutral-500 hover:text-neutral-300 mt-3 transition-colors font-semibold"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
