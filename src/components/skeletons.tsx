'use client';

import React from 'react';

export function ClipCardSkeleton() {
  return (
    <div className="border border-white/5 bg-neutral-900/20 rounded-xl p-4 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-3 bg-white/5 rounded w-32" />
        <div className="flex gap-1">
          <div className="w-6 h-6 bg-white/5 rounded" />
          <div className="w-6 h-6 bg-white/5 rounded" />
          <div className="w-6 h-6 bg-white/5 rounded" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-white/5 rounded w-full" />
        <div className="h-3 bg-white/5 rounded w-3/4" />
        <div className="h-3 bg-white/5 rounded w-1/2" />
      </div>
      <div className="flex gap-2 mt-3">
        <div className="h-5 bg-white/5 rounded-full w-14" />
        <div className="h-5 bg-white/5 rounded-full w-10" />
      </div>
    </div>
  );
}

export function ClipListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ClipCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ChatMessageSkeleton() {
  return (
    <div className="flex gap-3 animate-pulse">
      <div className="w-8 h-8 rounded-full bg-white/5 shrink-0" />
      <div className="flex-1 max-w-[75%] space-y-2">
        <div className="h-3 bg-white/5 rounded w-16" />
        <div className="space-y-1.5 p-3.5 rounded-2xl bg-neutral-900/40 border border-white/5">
          <div className="h-3 bg-white/5 rounded w-full" />
          <div className="h-3 bg-white/5 rounded w-2/3" />
          <div className="h-3 bg-white/5 rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}

export function ConversationSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-xl animate-pulse">
          <div className="w-3.5 h-3.5 bg-white/5 rounded shrink-0" />
          <div className="h-3 bg-white/5 rounded flex-1" />
        </div>
      ))}
    </div>
  );
}
