'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { RoomManager } from '@/components/RoomManager';
import { ClipboardInput } from '@/components/ClipboardInput';
import { Clip, ClipCard } from '@/components/ClipCard';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { AlertCircle, HelpCircle, Loader2, Sparkles, Wifi } from 'lucide-react';
import confetti from 'canvas-confetti';

function ClipboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [isConfigured, setIsConfigured] = useState(false);
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 5. Join Room Handler (Declared early to avoid hoisting issues in hooks)
  const joinRoom = React.useCallback(async (code: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      if (isConfigured) {
        // Query Supabase for room
        const { data: roomData, error } = await supabase
          .from('rooms')
          .select('id, code')
          .eq('code', code)
          .single();

        let room = roomData;

        if (error || !room) {
          // If room doesn't exist, create it dynamically (frictionless room creation)
          const { data: newRoom, error: createError } = await supabase
            .from('rooms')
            .insert({ code, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
            .select()
            .single();

          if (createError) throw createError;
          room = newRoom;
        }

        if (room) {
          setActiveRoomId(room.id);
          setActiveRoomCode(room.code);
          router.replace(`/?room=${room.code}`);
        }
      } else {
        // Local simulation fallback
        setActiveRoomCode(code);
        setActiveRoomId('local-room-' + code);
        const stored = localStorage.getItem(`freeclipboard_clips_${code}`);
        if (stored) {
          setClips(JSON.parse(stored));
        } else {
          setClips([]);
        }
        router.replace(`/?room=${code}`);
      }
    } catch (err: unknown) {
      console.error('Error joining room:', err);
      setErrorMsg('Failed to connect to the sync room.');
    } finally {
      setIsLoading(false);
    }
  }, [isConfigured, router]);

  // 1. Check configuration on mount
  useEffect(() => {
    setIsConfigured(isSupabaseConfigured());
  }, []);

  // 2. Auto-join room from URL search parameter
  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam && roomParam.length === 6 && /^\d+$/.test(roomParam)) {
      joinRoom(roomParam);
    }
  }, [searchParams, joinRoom]);

  // 3. Supabase Realtime Subscription setup
  useEffect(() => {
    if (!isConfigured || !activeRoomId) return;

    // Load initial clips for the room
    const loadClips = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('clips')
          .select('*')
          .eq('room_id', activeRoomId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setClips(data || []);
      } catch (err: unknown) {
        console.error('Error fetching clips:', err);
        setErrorMsg('Failed to load clips. Please refresh.');
      } finally {
        setIsLoading(false);
      }
    };

    loadClips();

    // Subscribe to realtime database channel for clips inside this room
    const channel = supabase
      .channel(`room_clips_${activeRoomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clips',
          filter: `room_id=eq.${activeRoomId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newClip = payload.new as Clip;
            setClips((prev) => {
              // Prevent duplicate inserts (e.g. from local optimistic insert or multiple triggers)
              if (prev.some((c) => c.id === newClip.id)) return prev;
              
              // Trigger a small confetti burst when another device syncs a clip!
              confetti({
                particleCount: 20,
                spread: 40,
                origin: { y: 0.7 },
                colors: ['#6366f1', '#10b981']
              });

              return [newClip, ...prev];
            });
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as Clip).id;
            setClips((prev) => prev.filter((c) => c.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeRoomId, isConfigured]);

  // 4. Generate random 6-digit code
  const generatePasscode = (): string => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };


  // 6. Create Room Handler
  const createRoom = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const code = generatePasscode();
      if (isConfigured) {
        const { data: room, error } = await supabase
          .from('rooms')
          .insert({ code, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
          .select()
          .single();

        if (error) throw error;
        if (room) {
          setActiveRoomId(room.id);
          setActiveRoomCode(room.code);
          setClips([]);
          router.replace(`/?room=${room.code}`);
        }
      } else {
        // Local simulation
        setActiveRoomCode(code);
        setActiveRoomId('local-room-' + code);
        setClips([]);
        localStorage.setItem(`freeclipboard_clips_${code}`, JSON.stringify([]));
        router.replace(`/?room=${code}`);
      }

      // Success confetti!
      confetti({
        particleCount: 60,
        spread: 80,
        origin: { y: 0.6 }
      });
    } catch (err: unknown) {
      console.error('Error creating room:', err);
      setErrorMsg('Failed to create a new sync room.');
    } finally {
      setIsLoading(false);
    }
  };

  // 7. Leave Room Handler
  const leaveRoom = () => {
    setActiveRoomCode(null);
    setActiveRoomId(null);
    setClips([]);
    setErrorMsg(null);
    router.replace('/');
  };

  // 8. Add Clip Handler
  const addClip = async (content: string, type: 'text' | 'code' | 'url', title?: string) => {
    if (!activeRoomCode) {
      // If not in a room, save to local standalone clipboard
      const newClip: Clip = {
        id: Math.random().toString(),
        content,
        type,
        title,
        created_at: new Date().toISOString(),
      };
      const updated = [newClip, ...clips];
      setClips(updated);
      localStorage.setItem('freeclipboard_standalone_clips', JSON.stringify(updated));
      
      confetti({
        particleCount: 15,
        spread: 30,
        origin: { y: 0.8 },
        colors: ['#a78bfa']
      });
      return;
    }

    try {
      if (isConfigured && activeRoomId) {
        // Save to Supabase
        const { error } = await supabase
          .from('clips')
          .insert({
            room_id: activeRoomId,
            content,
            type,
            title,
          });

        if (error) throw error;
        // Real-time subscription will trigger local update
      } else {
        // Local simulation room
        const newClip: Clip = {
          id: Math.random().toString(),
          content,
          type,
          title,
          created_at: new Date().toISOString(),
        };
        const updated = [newClip, ...clips];
        setClips(updated);
        localStorage.setItem(`freeclipboard_clips_${activeRoomCode}`, JSON.stringify(updated));

        confetti({
          particleCount: 20,
          spread: 40,
          origin: { y: 0.8 },
          colors: ['#6366f1', '#8b5cf6']
        });
      }
    } catch (err: unknown) {
      console.error('Error saving clip:', err);
      setErrorMsg('Failed to sync clip. Please try again.');
    }
  };

  // 9. Delete Clip Handler
  const deleteClip = async (id: string) => {
    if (!activeRoomCode) {
      // Standalone deletion
      const updated = clips.filter((c) => c.id !== id);
      setClips(updated);
      localStorage.setItem('freeclipboard_standalone_clips', JSON.stringify(updated));
      return;
    }

    try {
      if (isConfigured) {
        const { error } = await supabase
          .from('clips')
          .delete()
          .eq('id', id);

        if (error) throw error;
      } else {
        // Local simulation deletion
        const updated = clips.filter((c) => c.id !== id);
        setClips(updated);
        localStorage.setItem(`freeclipboard_clips_${activeRoomCode}`, JSON.stringify(updated));
      }
    } catch (err: unknown) {
      console.error('Error deleting clip:', err);
      setErrorMsg('Failed to delete clip.');
    }
  };

  // 10. Load standalone clips if not in a room on mount
  useEffect(() => {
    if (!activeRoomCode) {
      const stored = localStorage.getItem('freeclipboard_standalone_clips');
      if (stored) {
        setClips(JSON.parse(stored));
      } else {
        setClips([]);
      }
    }
  }, [activeRoomCode]);

  return (
    <div className="min-h-screen bg-[#07070a] text-neutral-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* Decorative ambient background glows */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-violet-600/5 rounded-full blur-[100px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[120px] -z-10 pointer-events-none" />

      {/* Header */}
      <Header isConfigured={isConfigured} activeRoomCode={activeRoomCode} />

      {/* Main Container */}
      <main className="flex-grow max-w-5xl w-full mx-auto px-4 py-8 flex flex-col gap-6">
        
        {/* Error Alert Bar */}
        {errorMsg && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-400 text-sm shadow-md animate-fade-in shrink-0">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div className="flex-1">{errorMsg}</div>
            <button 
              onClick={() => setErrorMsg(null)} 
              className="text-xs text-rose-400/70 hover:text-rose-300 font-bold px-2 py-1 rounded hover:bg-rose-500/10 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Dynamic Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          
          {/* Side Panel: Room Controls & Guidelines */}
          <div className="md:col-span-1 flex flex-col gap-6">
            <RoomManager
              activeRoomCode={activeRoomCode}
              isLoading={isLoading}
              onJoinRoom={joinRoom}
              onCreateRoom={createRoom}
              onLeaveRoom={leaveRoom}
            />

            {/* Premium Guide Box */}
            <div className="border border-white/5 bg-neutral-900/20 backdrop-blur-md rounded-xl p-5 shadow-lg relative overflow-hidden flex flex-col gap-3.5">
              <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-white/5 pb-2">
                <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                How It Works
              </h4>
              <ul className="text-xs text-neutral-400 leading-relaxed flex flex-col gap-3">
                <li className="flex gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px] font-black shrink-0">1</span>
                  <span><strong>Create or Join:</strong> Generate a new passcode or enter an existing 6-digit room code on any device.</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px] font-black shrink-0">2</span>
                  <span><strong>Share URL:</strong> Copy the shareable link and open it in a browser on your other phone or laptop.</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px] font-black shrink-0">3</span>
                  <span><strong>Live Sync:</strong> Paste text, URLs, or code. Clips instantly push to all devices in the room in under a second!</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Main Area: Input Field and Clip Cards */}
          <div className="md:col-span-2 flex flex-col gap-6">
            
            {/* Clipboard Input form */}
            <ClipboardInput
              onAddClip={addClip}
              isLoading={isLoading}
              activeRoomCode={activeRoomCode}
            />

            {/* Clips Section Header */}
            <div className="flex items-center justify-between mt-2 px-1">
              <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                {activeRoomCode ? 'Synced Clipboard' : 'Saved Locally'}
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />}
              </h3>
              <span className="text-xs text-neutral-500 font-semibold">{clips.length} {clips.length === 1 ? 'item' : 'items'}</span>
            </div>

            {/* Clips List */}
            {clips.length > 0 ? (
              <div className="flex flex-col gap-4 animate-fade-in">
                {clips.map((clip) => (
                  <ClipCard
                    key={clip.id}
                    clip={clip}
                    onDeleteClip={deleteClip}
                    isLoading={isLoading}
                  />
                ))}
              </div>
            ) : (
              /* High-fidelity Empty State welcome card */
              <div className="border border-white/5 border-dashed bg-neutral-900/10 rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-4 relative overflow-hidden">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-md">
                  <Wifi className="w-6 h-6 animate-pulse" />
                </div>
                <div className="flex flex-col gap-1.5 max-w-[280px]">
                  <h4 className="text-sm font-semibold text-neutral-300">Your clipboard is empty</h4>
                  <p className="text-xs text-neutral-500 leading-normal">
                    {activeRoomCode 
                      ? "Waiting for clips to sync... Paste some content above or on another connected device to see it appear here!"
                      : "Paste text or code above to save items locally, or connect a sync room to share with other devices."}
                  </p>
                </div>
                {activeRoomCode && (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-black/40 border border-white/5 text-[10px] text-neutral-400 font-bold uppercase tracking-wider animate-pulse mt-2">
                    <Sparkles className="w-3 h-3 text-indigo-400 animate-spin-slow" />
                    <span>Listening in Realtime...</span>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 bg-black/60 z-10">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-neutral-600 text-xs">
          <div>
            &copy; {new Date().getFullYear()} FreeClipboard. All rights reserved.
          </div>
          <div className="flex gap-4">
            <span className="hover:text-neutral-400 transition-colors cursor-pointer">Privacy</span>
            <span className="hover:text-neutral-400 transition-colors cursor-pointer">Terms</span>
            <span className="hover:text-neutral-400 transition-colors cursor-pointer">GitHub</span>
          </div>
        </div>
      </footer>

    </div>
  );
}

// Wrapping main page logic in Suspense to prevent build-time static errors due to useSearchParams
export default function Page() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#07070a] text-neutral-100 flex items-center justify-center flex-col gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <span className="text-xs text-neutral-500 font-semibold uppercase tracking-widest">Loading FreeClipboard...</span>
      </div>
    }>
      <ClipboardContent />
    </Suspense>
  );
}
