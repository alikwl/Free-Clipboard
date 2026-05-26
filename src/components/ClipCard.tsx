'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Code2, Copy, Check, ExternalLink, Link, Trash2, Text, Calendar } from 'lucide-react';
import confetti from 'canvas-confetti';

export interface Clip {
  id: string;
  content: string;
  type: 'text' | 'code' | 'url';
  title?: string;
  created_at: string;
}

interface ClipCardProps {
  clip: Clip;
  onDeleteClip: (id: string) => Promise<void>;
  isLoading: boolean;
}

export const ClipCard: React.FC<ClipCardProps> = ({ clip, onDeleteClip, isLoading }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(clip.content);
    setCopied(true);

    // Play subtle checkmark confetti from the button's direction!
    confetti({
      particleCount: 15,
      spread: 30,
      origin: { y: 0.8 },
      colors: ['#818cf8', '#a78bfa']
    });

    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' - ' + date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  // Helper to render type-specific icons
  const getTypeIcon = () => {
    switch (clip.type) {
      case 'code':
        return (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Code2 className="w-4 h-4" />
          </div>
        );
      case 'url':
        return (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <Link className="w-4 h-4" />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-violet-500/10 text-violet-400 border border-violet-500/20">
            <Text className="w-4 h-4" />
          </div>
        );
    }
  };

  return (
    <Card className="border border-white/5 bg-neutral-900/40 backdrop-blur-sm overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-500/5 hover:border-white/10 group">
      
      {/* Top Header Section */}
      <div className="flex items-center justify-between gap-3 border-b border-white/5 bg-black/20 p-4">
        <div className="flex min-w-0 items-center gap-3">
          {getTypeIcon()}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-neutral-200 tracking-tight max-w-[200px] sm:max-w-[320px] truncate">
              {clip.title || (clip.type === 'url' ? 'Shared Link' : clip.type === 'code' ? 'Code Snippet' : 'Shared Text')}
            </h3>
            <span className="text-[10px] text-neutral-500 font-medium flex items-center gap-1 mt-0.5">
              <Calendar className="w-3 h-3" />
              {formatDate(clip.created_at)}
            </span>
          </div>
        </div>

        {/* Top Control Buttons */}
        <div className="flex shrink-0 items-center gap-1.5 opacity-60 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            className={`w-7-h-7 rounded-md transition-all ${
              copied ? 'text-emerald-400 bg-emerald-500/10' : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
            title="Copy content"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDeleteClip(clip.id)}
            disabled={isLoading}
            className="w-7 h-7 rounded-md text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
            title="Delete clip"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <CardContent className="p-4">
        {clip.type === 'url' ? (
          <div className="flex flex-col gap-2">
            <a
              href={clip.content.startsWith('http') ? clip.content : `https://${clip.content}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 p-3 rounded-lg border border-teal-500/10 bg-teal-500/5 text-teal-400 hover:bg-teal-500/10 transition-colors group/link overflow-hidden"
            >
              <span className="text-xs font-semibold truncate flex-1 underline decoration-teal-500/30 group-hover/link:decoration-teal-400">
                {clip.content}
              </span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0 transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5" />
            </a>
          </div>
        ) : clip.type === 'code' ? (
          <div className="relative">
            <pre className="p-3.5 rounded-lg border border-white/5 bg-black/40 overflow-x-auto text-[11px] font-mono text-neutral-300 leading-relaxed max-h-48 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              <code>{clip.content}</code>
            </pre>
            <div className="absolute right-2.5 top-2.5 text-[9px] text-neutral-600 font-bold bg-neutral-900/90 border border-white/5 rounded px-1.5 py-0.5 uppercase tracking-wider select-none pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity">
              code
            </div>
          </div>
        ) : (
          <div className="text-xs text-neutral-300 whitespace-pre-wrap break-words leading-relaxed">
            {clip.content}
          </div>
        )}
      </CardContent>

    </Card>
  );
};
