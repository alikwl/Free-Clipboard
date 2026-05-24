'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Code2, Link, Send, Sparkles, Text } from 'lucide-react';

interface ClipboardInputProps {
  onAddClip: (content: string, type: 'text' | 'code' | 'url', title?: string) => Promise<void>;
  isLoading: boolean;
  activeRoomCode: string | null;
}

export const ClipboardInput: React.FC<ClipboardInputProps> = ({ onAddClip, isLoading, activeRoomCode }) => {
  const [content, setContent] = useState('');
  const [type, setType] = useState<'text' | 'code' | 'url'>('text');
  const [title, setTitle] = useState('');

  // Auto-detect format type based on content structure
  useEffect(() => {
    const trimmed = content.trim();
    if (!trimmed) return;

    // Detect URL
    if (/^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(trimmed)) {
      setType('url');
      return;
    }

    // Detect common Code keywords/structures
    const codeIndicators = [
      'const ', 'let ', 'function', 'import ', 'export ', 'class ', 
      '<html>', 'body {', 'public static void', 'def ', 'elif ', 
      '<?php', 'namespace ', 'using System;'
    ];
    const isCode = codeIndicators.some(indicator => trimmed.includes(indicator)) || 
                   (trimmed.includes('{') && trimmed.includes('}') && trimmed.includes(';'));
    
    if (isCode && type === 'text') {
      setType('code');
    }
  }, [content, type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    await onAddClip(content, type, title.trim() || undefined);
    
    // Clear fields
    setContent('');
    setTitle('');
    setType('text');
  };

  return (
    <Card className="border border-white/5 bg-neutral-900/60 backdrop-blur-md shadow-2xl relative overflow-hidden">
      {/* Background soft lighting */}
      <div className="absolute top-0 right-1/4 w-32 h-32 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />

      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          
          {/* Header & Title optional field */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              type="text"
              placeholder="Clip Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-black/20 border-white/10 text-xs text-neutral-300 placeholder:text-neutral-600 focus:border-indigo-500/40"
              maxLength={80}
            />

            {/* Type selector tabs */}
            <div className="flex rounded-lg bg-black/40 p-0.5 border border-white/5 shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setType('text')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  type === 'text'
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Text className="w-3.5 h-3.5" />
                <span>Text</span>
              </button>
              
              <button
                type="button"
                onClick={() => setType('code')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  type === 'code'
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Code</span>
              </button>

              <button
                type="button"
                onClick={() => setType('url')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  type === 'url'
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Link className="w-3.5 h-3.5" />
                <span>Link</span>
              </button>
            </div>
          </div>

          {/* Text Area Input */}
          <div className="relative">
            <Textarea
              placeholder={
                activeRoomCode
                  ? "Paste anything here to instantly sync across all devices..."
                  : "Paste text, code snippets, or links here. Join a sync room to share with other devices!"
              }
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[160px] bg-black/30 border-white/10 rounded-xl py-3 px-4 text-sm leading-relaxed text-neutral-200 placeholder:text-neutral-600 focus:border-indigo-500/40 focus:ring-0 resize-y"
              required
            />
            {content && (
              <div className="absolute right-3 bottom-3 flex items-center gap-1 text-[10px] text-neutral-500 font-bold bg-neutral-900/80 px-2 py-1 rounded border border-white/5 uppercase tracking-wider animate-pulse">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span>Detected Format</span>
              </div>
            )}
          </div>

          {/* Submit button */}
          <div className="flex items-center justify-between mt-1">
            <span className="text-[11px] text-neutral-500">
              {content.length} characters
            </span>
            
            <Button
              type="submit"
              disabled={isLoading || !content.trim()}
              className="bg-indigo-500 hover:bg-indigo-600 text-white border-0 shadow-lg shadow-indigo-500/20 font-bold text-xs px-5 py-5 gap-2 transition-all duration-300"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{activeRoomCode ? 'Sync Clip' : 'Save Locally'}</span>
            </Button>
          </div>

        </form>
      </CardContent>
    </Card>
  );
};
