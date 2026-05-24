'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { BarChart3, ArrowLeft, Loader2, TrendingUp, Clock, Tag, Folder } from 'lucide-react';
import ProGate from '@/components/pro-gate';
import { isProUser } from '@/lib/clip-limits';

interface AnalyticsData {
  totalClips: number;
  totalFolders: number;
  totalSnippets: number;
  aiCallsToday: number;
  aiCallsTotal: number;
  topTags: { tag: string; count: number }[];
  clipsByType: { type: string; count: number }[];
  clipsThisWeek: number;
  clipsThisMonth: number;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [userPlan, setUserPlan] = useState<'free' | 'pro'>('free');
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);

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

    const { count: clipCount } = await supabase
      .from('clips')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { count: folderCount } = await supabase
      .from('folders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { count: snippetCount } = await supabase
      .from('snippets')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { count: aiToday } = await supabase
      .from('ai_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', todayStart);

    const { count: aiTotal } = await supabase
      .from('ai_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { count: weekClips } = await supabase
      .from('clips')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', weekStart);

    const { count: monthClips } = await supabase
      .from('clips')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', monthStart);

    const { data: allClips } = await supabase
      .from('clips')
      .select('tags')
      .eq('user_id', userId);

    const tagCounts: Record<string, number> = {};
    allClips?.forEach(clip => {
      clip.tags?.forEach((tag: string) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count }));

    const { data: metadata } = await supabase
      .from('clip_metadata')
      .select('clip_type')
      .eq('user_id', userId);

    const typeCounts: Record<string, number> = {};
    metadata?.forEach(m => {
      const type = m.clip_type || 'other';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    const clipsByType = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));

    setData({
      totalClips: clipCount || 0,
      totalFolders: folderCount || 0,
      totalSnippets: snippetCount || 0,
      aiCallsToday: aiToday || 0,
      aiCallsTotal: aiTotal || 0,
      topTags,
      clipsByType,
      clipsThisWeek: weekClips || 0,
      clipsThisMonth: monthClips || 0,
    });
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-indigo-950/20 text-neutral-100">
      <header className="border-b border-white/5 bg-black/20 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-3 md:px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </button>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-bold text-neutral-200">Analytics</span>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 md:px-4 py-4 md:py-6">
        <ProGate isPro={isPro} feature="Analytics" message="Analytics is a Pro feature">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Clips', value: data?.totalClips || 0, icon: BarChart3, color: 'text-indigo-400' },
              { label: 'Folders', value: data?.totalFolders || 0, icon: Folder, color: 'text-violet-400' },
              { label: 'Snippets', value: data?.totalSnippets || 0, icon: Tag, color: 'text-emerald-400' },
              { label: 'AI Calls Today', value: data?.aiCallsToday || 0, icon: TrendingUp, color: 'text-amber-400' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-neutral-900/30 border border-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">{label}</span>
                </div>
                <p className="text-2xl font-black text-white">{value}</p>
              </div>
            ))}
          </div>

          {/* Weekly/Monthly */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-neutral-900/30 border border-white/5 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-neutral-300">Recent Activity</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-500">This week</span>
                  <span className="text-white font-bold">{data?.clipsThisWeek || 0} clips</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-500">This month</span>
                  <span className="text-white font-bold">{data?.clipsThisMonth || 0} clips</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-500">Total AI calls</span>
                  <span className="text-white font-bold">{data?.aiCallsTotal || 0}</span>
                </div>
              </div>
            </div>

            <div className="bg-neutral-900/30 border border-white/5 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-neutral-300">Top Tags</span>
              </div>
              {data?.topTags.length ? (
                <div className="space-y-2">
                  {data.topTags.map(({ tag, count }) => (
                    <div key={tag} className="flex items-center justify-between">
                      <span className="text-[10px] bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded font-bold uppercase">{tag}</span>
                      <span className="text-xs text-neutral-400 font-mono">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-neutral-500">No tags yet</p>
              )}
            </div>
          </div>

          {/* Clip Types */}
          <div className="bg-neutral-900/30 border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-violet-400" />
              <span className="text-xs font-bold text-neutral-300">Clip Types</span>
            </div>
            {data?.clipsByType.length ? (
              <div className="space-y-2">
                {data.clipsByType.map(({ type, count }) => (
                  <div key={type} className="flex items-center gap-3">
                    <span className="text-[10px] text-neutral-400 w-20 font-mono uppercase">{type}</span>
                    <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                        style={{ width: `${Math.min(100, (count / (data?.totalClips || 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-neutral-400 font-mono w-8 text-right">{count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-500">No clip type data yet</p>
            )}
          </div>
        </ProGate>
      </div>
    </div>
  );
}
