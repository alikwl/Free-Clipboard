'use client';

import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const onOffline = () => setIsOffline(true);
    const onOnline = () => setIsOffline(false);
    setIsOffline(!navigator.onLine);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="sticky top-0 z-50 w-full bg-amber-500/10 border-b border-amber-500/20 text-amber-300 backdrop-blur-md px-4 py-2.5 flex items-center justify-center gap-2 text-xs font-semibold animate-in slide-in-from-top duration-300">
      <WifiOff className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
      You&apos;re offline — changes will sync when back online
    </div>
  );
}
