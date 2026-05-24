'use client';

import React from 'react';
import { Clipboard, ShieldAlert, Sparkles, Wifi, WifiOff } from 'lucide-react';

interface HeaderProps {
  isConfigured: boolean;
  activeRoomCode: string | null;
}

export const Header: React.FC<HeaderProps> = ({ isConfigured, activeRoomCode }) => {
  return (
    <header className="w-full relative z-10 border-b border-white/5 bg-black/40 backdrop-blur-md">
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-12 bg-indigo-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

      <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Logo and Brand */}
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20">
            <Clipboard className="w-5 h-5 text-white animate-pulse" />
            <div className="absolute inset-0 rounded-xl bg-white/20 opacity-0 hover:opacity-100 transition-opacity" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-neutral-200 to-neutral-400">
              FreeClipboard
            </h1>
            <p className="text-xs text-neutral-500 font-medium">Real-time device synchronizer</p>
          </div>
        </div>

        {/* Sync Status Info */}
        <div className="flex items-center gap-3">
          {isConfigured ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs font-semibold shadow-inner animate-pulse">
              <Wifi className="w-3.5 h-3.5" />
              <span>Realtime Enabled</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/5 text-amber-400 text-xs font-semibold">
              <WifiOff className="w-3.5 h-3.5" />
              <span>Local Offline Mode</span>
            </div>
          )}

          {activeRoomCode && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 text-indigo-300 text-xs font-bold font-mono tracking-wider">
              <Sparkles className="w-3 h-3 text-indigo-400 animate-spin-slow" />
              Room: {activeRoomCode}
            </div>
          )}
        </div>
      </div>

      {/* Graceful configuration instructions banner */}
      {!isConfigured && (
        <div className="border-t border-amber-500/10 bg-amber-500/5 text-amber-300/90 text-xs py-2 px-4 shadow-sm animate-fade-in">
          <div className="max-w-5xl mx-auto flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold text-amber-200">Supabase Connection Missing:</span> Running in local simulation mode. To enable real-time device-to-device sync, replace placeholders in <code className="px-1.5 py-0.5 rounded bg-black/40 text-amber-300 font-mono border border-white/5 font-bold">.env.local</code> with your actual Supabase credentials and restart the dev server.
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
