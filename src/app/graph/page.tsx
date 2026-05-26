'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Brain, ArrowLeft, Loader2, GitBranch } from 'lucide-react';
import ProGate from '@/components/pro-gate';
import { isProUser } from '@/lib/clip-limits';

interface ClipNode {
  id: string;
  title: string;
  type: string;
  topics: string[];
  keywords: string[];
}

interface Connection {
  source: string;
  target: string;
  strength: number;
}

export default function KnowledgeGraphPage() {
  const router = useRouter();
  const [userPlan, setUserPlan] = useState<'free' | 'pro'>('free');
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<ClipNode[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      if (!currentUser) {
        router.push('/login');
        return;
      }

      supabase
        .from('users')
        .select('plan, trial_ends_at')
        .eq('id', currentUser.id)
        .single()
        .then(({ data: profile }) => {
          if (profile) {
            setUserPlan(profile.plan || 'free');
            setTrialEndsAt(profile.trial_ends_at);
          }
          loadData(currentUser.id);
        });
    });
  }, [router]);

  const isPro = isProUser(userPlan, trialEndsAt);

  const loadData = async (userId: string) => {
    const supabase = createClient();

    const { data: metadata } = await supabase
      .from('clip_metadata')
      .select('clip_id, clip_type, topics, keywords')
      .eq('user_id', userId);

    const { data: clips } = await supabase
      .from('clips')
      .select('id, title')
      .eq('user_id', userId)
      .limit(50);

    const { data: relationships } = await supabase
      .from('clip_relationships')
      .select('clip_a_id, clip_b_id, strength')
      .eq('user_id', userId)
      .limit(100);

    const clipMap = new Map();
    clips?.forEach(c => clipMap.set(c.id, c));

    const clipNodes: ClipNode[] = (metadata || [])
      .filter(m => clipMap.has(m.clip_id))
      .map(m => ({
        id: m.clip_id,
        title: clipMap.get(m.clip_id)?.title || 'Untitled',
        type: m.clip_type || 'other',
        topics: m.topics || [],
        keywords: m.keywords || [],
      }));

    setNodes(clipNodes);
    setConnections((relationships || []).map(r => ({
      source: r.clip_a_id,
      target: r.clip_b_id,
      strength: r.strength || 0.5,
    })));
    setLoading(false);
  };

  useEffect(() => {
    if (!canvasRef.current || nodes.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || 800;
      canvas.height = canvas.parentElement?.clientHeight || 600;
    };
    resize();
    window.addEventListener('resize', resize);

    const nodePositions = new Map<string, { x: number; y: number }>();
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    nodes.forEach((node, i) => {
      const angle = (i / nodes.length) * Math.PI * 2;
      const radius = Math.min(canvas.width, canvas.height) * 0.3;
      nodePositions.set(node.id, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      });
    });

    let animFrame: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      connections.forEach(conn => {
        const source = nodePositions.get(conn.source);
        const target = nodePositions.get(conn.target);
        if (!source || !target) return;

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = `rgba(99, 102, 241, ${conn.strength * 0.3})`;
        ctx.lineWidth = conn.strength * 2;
        ctx.stroke();
      });

      nodes.forEach(node => {
        const pos = nodePositions.get(node.id);
        if (!pos) return;

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = '#6366f1';
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(node.title.substring(0, 12), pos.x, pos.y + 4);
      });

      animFrame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', resize);
    };
  }, [nodes, connections]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="safe-page min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-indigo-950/20 text-neutral-100">
      <header className="border-b border-white/5 bg-black/20 backdrop-blur-md">
        <div className="safe-container mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-3 py-4 md:px-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </button>
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-bold text-neutral-200">Knowledge Graph</span>
          </div>
        </div>
      </header>

      <div className="safe-container mx-auto max-w-7xl px-3 py-4 md:px-4 md:py-6">
        <ProGate isPro={isPro} feature="Knowledge Graph" message="Knowledge Graph is a Pro feature" className="rounded-2xl">
        <div className="relative bg-neutral-900/30 border border-white/5 rounded-2xl overflow-hidden" style={{ height: 'clamp(300px, 60vh, 600px)' }}>
          <div>
            {nodes.length === 0 ? (
              <div className="text-center py-20">
                <Brain className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-neutral-300 mb-2">No connections yet</h3>
                <p className="text-xs text-neutral-500 max-w-md mx-auto">
                  Save more clips and use AI features to build connections between your content.
                </p>
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                className="w-full h-full"
              />
            )}
          </div>
          {isPro && nodes.length > 0 && (
            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm rounded-xl p-3 border border-white/5">
              <p className="text-[10px] text-neutral-400 font-mono">
                {nodes.length} clips • {connections.length} connections
              </p>
            </div>
          )}
        </div>
        </ProGate>
      </div>
    </div>
  );
}
