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

export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-white/5 bg-neutral-950/95 backdrop-blur-md safe-area-bottom">
      <div className="flex items-center justify-around h-14 px-2">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const isActive = pathname === path || (path !== '/' && pathname.startsWith(path));
          return (
            <button
              key={path}
              onClick={() => router.push(path)}
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-0 ${
                isActive
                  ? 'text-indigo-400'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-400' : ''}`} />
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
