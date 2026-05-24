'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Crown } from 'lucide-react';

interface ProGateProps {
  isPro: boolean;
  feature: string;
  children: React.ReactNode;
  message?: string;
  className?: string;
}

export default function ProGate({ isPro, feature, children, message, className = '' }: ProGateProps) {
  const router = useRouter();

  if (isPro) {
    return <>{children}</>;
  }

  return (
    <div className={`relative ${className}`}>
      <div className="filter blur-[4px] pointer-events-none select-none" aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/60 backdrop-blur-sm z-10 rounded-xl">
        <div className="text-center p-6">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-3">
            <Lock className="w-5 h-5 text-amber-400" />
          </div>
          <h4 className="text-sm font-bold text-white mb-1">
            {message || `${feature} is a Pro feature`}
          </h4>
          <p className="text-[11px] text-neutral-400 mb-4">
            Upgrade to unlock unlimited access
          </p>
          <div className="flex items-center gap-3 justify-center">
            <button
              onClick={() => router.push('/upgrade')}
              className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all flex items-center gap-1.5"
            >
              <Crown className="w-3.5 h-3.5" />
              Upgrade $5/mo
            </button>
            <button
              onClick={() => router.push('/upgrade')}
              className="text-[10px] text-neutral-400 hover:text-indigo-400 transition-colors font-semibold"
            >
              Start free trial
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function isProUser(plan: string | null | undefined, trialEndsAt: string | null | undefined): boolean {
  if (plan === 'pro') return true;
  if (trialEndsAt && new Date(trialEndsAt) > new Date()) return true;
  return false;
}
