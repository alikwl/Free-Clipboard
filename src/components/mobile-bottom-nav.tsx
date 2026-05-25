'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Clipboard, Sparkles, BarChart3, User } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Clips', icon: Clipboard },
  { path: '/clipmind', label: 'ClipMind', icon: Sparkles },
  { path: '/analytics', label: 'Stats', icon: BarChart3 },
  { path: '/upgrade', label: 'Pro', icon: User },
];

interface MobileBottomNavProps {
  themeMode?: 'dark' | 'light';
}

export function MobileBottomNav({ themeMode = 'light' }: MobileBottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isDarkTheme = themeMode === 'dark';

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-50 md:hidden border-t backdrop-blur-xl safe-area-bottom transition-colors duration-300 ${
        isDarkTheme
          ? 'border-white/8 bg-neutral-950/92'
          : 'border-slate-200/80 bg-white/92 shadow-[0_-12px_35px_rgba(148,163,184,0.16)]'
      }`}
    >
      <div className="grid grid-cols-4 items-center h-16 px-2.5 pb-[max(env(safe-area-inset-bottom),0.35rem)]">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const isActive = pathname === path || (path !== '/' && pathname.startsWith(path));
          return (
            <button
              key={path}
              onClick={() => router.push(path)}
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-0 ${
                isActive
                  ? isDarkTheme
                    ? 'text-indigo-400'
                    : 'text-indigo-600'
                  : isDarkTheme
                    ? 'text-neutral-500 hover:text-neutral-300'
                    : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              <Icon
                className={`w-5 h-5 ${
                  isActive
                    ? isDarkTheme
                      ? 'text-indigo-400'
                      : 'text-indigo-600'
                    : ''
                }`}
              />
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
