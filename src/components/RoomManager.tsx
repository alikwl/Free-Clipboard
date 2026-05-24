'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogOut, Plus, Share2, Users } from 'lucide-react';
import confetti from 'canvas-confetti';

interface RoomManagerProps {
  activeRoomCode: string | null;
  isLoading: boolean;
  onJoinRoom: (code: string) => Promise<void>;
  onCreateRoom: () => Promise<void>;
  onLeaveRoom: () => void;
}

export const RoomManager: React.FC<RoomManagerProps> = ({
  activeRoomCode,
  isLoading,
  onJoinRoom,
  onCreateRoom,
  onLeaveRoom,
}) => {
  const [inputCode, setInputCode] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputCode.length === 6) {
      await onJoinRoom(inputCode);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, ''); // Numbers only
    if (value.length <= 6) {
      setInputCode(value);
    }
  };

  const copyRoomLink = () => {
    if (!activeRoomCode) return;
    const shareUrl = `${window.location.origin}?room=${activeRoomCode}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    
    // Play confetti explosion!
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#6366f1', '#8b5cf6', '#a78bfa']
    });

    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <Card className="border border-white/5 bg-neutral-900/60 backdrop-blur-md shadow-2xl relative overflow-hidden">
      {/* Background radial accent */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {activeRoomCode ? (
        <CardContent className="pt-6 flex flex-col gap-5">
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              <div>
                <CardTitle className="text-sm font-semibold text-neutral-200">Active Sync Room</CardTitle>
                <CardDescription className="text-xs text-neutral-500">Device sharing active</CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onLeaveRoom}
              className="text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Leave Room"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex flex-col items-center justify-center py-4 bg-black/30 border border-white/5 rounded-xl gap-2">
            <span className="text-xs text-neutral-500 font-bold uppercase tracking-widest">Room Passcode</span>
            <span className="text-4xl font-black font-mono tracking-widest bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-violet-400">
              {activeRoomCode}
            </span>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={copyRoomLink}
              className="flex-1 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white border-0 shadow-lg shadow-indigo-500/20 text-xs font-semibold relative overflow-hidden transition-all duration-300"
            >
              {copiedLink ? (
                <span className="flex items-center gap-1.5 justify-center">
                  Copied Room Link!
                </span>
              ) : (
                <span className="flex items-center gap-1.5 justify-center">
                  <Share2 className="w-3.5 h-3.5" />
                  Copy Share Link
                </span>
              )}
            </Button>
          </div>
        </CardContent>
      ) : (
        <>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400 animate-pulse" />
              <CardTitle className="text-base font-semibold text-neutral-200">Multi-Device Sync</CardTitle>
            </div>
            <CardDescription className="text-xs text-neutral-500">
              Create or join a temporary room to instantly sync clips across mobile & desktop.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            <form onSubmit={handleJoin} className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Enter 6-digit passcode"
                  value={inputCode}
                  onChange={handleInputChange}
                  className="bg-black/30 border-white/10 text-center font-mono text-lg font-bold tracking-widest focus:border-indigo-500/50 focus:ring-0 focus:outline-none placeholder:text-neutral-600 placeholder:text-sm placeholder:font-sans placeholder:tracking-normal"
                  required
                />
                <Button
                  type="submit"
                  disabled={inputCode.length !== 6 || isLoading}
                  className="bg-white/10 text-white border border-white/10 hover:bg-white/20 transition-all font-semibold px-4 text-xs"
                >
                  Join
                </Button>
              </div>
            </form>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-white/5"></div>
              <span className="flex-shrink mx-3 text-[10px] text-neutral-600 font-bold uppercase tracking-wider">or</span>
              <div className="flex-grow border-t border-white/5"></div>
            </div>

            <Button
              onClick={onCreateRoom}
              disabled={isLoading}
              variant="outline"
              className="w-full border-dashed border-white/10 bg-transparent text-neutral-300 hover:text-white hover:bg-white/5 transition-all text-xs font-semibold py-5"
            >
              <Plus className="w-4 h-4 mr-2 text-indigo-400" />
              Create New Sync Room
            </Button>
          </CardContent>
        </>
      )}
    </Card>
  );
};
