'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import {
  ArrowLeft,
  BarChart3,
  Folder,
  Loader2,
  Moon,
  Sparkles,
  SunMedium,
  Tag,
  TrendingUp,
  Clock,
} from 'lucide-react';
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
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('light');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedTheme = localStorage.getItem('fc_dashboard_theme');
    const nextTheme = storedTheme === 'dark' ? 'dark' : 'light';
    setThemeMode(nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    document.documentElement.style.colorScheme = nextTheme;
  }, []);

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

  const isDarkTheme = themeMode === 'dark';
  const isPro = isProUser(userPlan, trialEndsAt);

  const surfaceClass = isDarkTheme
    ? 'border-white/8 bg-neutral-950/70 text-neutral-100 shadow-[0_24px_90px_rgba(15,23,42,0.45)]'
    : 'border-slate-200/80 bg-white/88 text-slate-900 shadow-[0_24px_70px_rgba(148,163,184,0.22)]';
  const mutedSurfaceClass = isDarkTheme
    ? 'border-white/6 bg-white/[0.03]'
    : 'border-slate-200/90 bg-slate-50/90';
  const subtleTextClass = isDarkTheme ? 'text-neutral-400' : 'text-slate-500';
  const titleTextClass = isDarkTheme ? 'text-white' : 'text-slate-900';
  const appBgClass = isDarkTheme
    ? 'bg-[#07070a] text-neutral-100 selection:bg-indigo-500/30 selection:text-indigo-200'
    : 'bg-[radial-gradient(circle_at_top_left,_#ffffff,_#eef2ff_28%,_#f8fafc_60%,_#eef2ff_100%)] text-slate-900 selection:bg-indigo-200 selection:text-indigo-950';

  const handleToggleTheme = () => {
    const nextTheme = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(nextTheme);
    localStorage.setItem('fc_dashboard_theme', nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    document.documentElement.style.colorScheme = nextTheme;
  };

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
    allClips?.forEach((clip) => {
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
    metadata?.forEach((item) => {
      const type = item.clip_type || 'other';
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
      <div className={`safe-page flex min-h-screen items-center justify-center ${appBgClass}`}>
        <div className={`flex items-center gap-3 rounded-2xl border px-5 py-4 ${surfaceClass}`}>
          <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
          <span className={`text-sm font-semibold ${subtleTextClass}`}>Loading analytics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`safe-page min-h-screen ${appBgClass}`}>
      <div className={`absolute left-0 top-0 -z-10 h-[500px] w-[500px] rounded-full blur-[120px] ${isDarkTheme ? 'bg-violet-600/5' : 'bg-indigo-300/35'}`} />
      <div className={`absolute bottom-0 right-0 -z-10 h-[600px] w-[600px] rounded-full blur-[140px] ${isDarkTheme ? 'bg-indigo-600/5' : 'bg-cyan-200/45'}`} />

      <header className={`sticky top-0 z-30 border-b backdrop-blur-xl ${isDarkTheme ? 'border-white/6 bg-neutral-950/45' : 'border-slate-200/80 bg-white/70'}`}>
        <div className="safe-container mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => router.push('/dashboard')}
              className={`inline-flex h-10 items-center gap-2 rounded-2xl border px-3 text-xs font-bold transition-all ${
                isDarkTheme
                  ? 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10'
                  : 'border-slate-200 bg-white/80 text-slate-700 hover:bg-white'
              }`}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 shrink-0 text-indigo-400" />
                <span className={`truncate text-sm font-black ${titleTextClass}`}>Analytics</span>
              </div>
              <p className={`mt-0.5 truncate text-[11px] ${subtleTextClass}`}>Workspace activity and usage</p>
            </div>
          </div>

          <button
            onClick={handleToggleTheme}
            className={`inline-flex h-10 items-center gap-1.5 rounded-2xl border px-3 text-[11px] font-bold transition-all ${
              isDarkTheme
                ? 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10'
                : 'border-slate-200 bg-white/80 text-slate-700 hover:bg-white'
            }`}
            title={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {isDarkTheme ? <SunMedium className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{isDarkTheme ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </header>

      <div className="safe-container mx-auto max-w-6xl px-3 py-4 md:px-6 md:py-6">
        <ProGate isPro={isPro} feature="Analytics" message="Analytics is a Pro feature">
          <section className={`mb-4 rounded-[28px] border p-4 md:p-5 xl:p-6 ${surfaceClass}`}>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${
                  isDarkTheme
                    ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400'
                    : 'border-indigo-100 bg-indigo-50 text-indigo-500'
                }`}>
                  <BarChart3 className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <h1 className={`text-base font-black sm:text-lg ${titleTextClass}`}>FreeClipboard Analytics</h1>
                  <p className={`text-xs leading-5 ${subtleTextClass}`}>A quick read on your clips, folders, tags, and AI usage.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Total Clips', value: data?.totalClips || 0, icon: BarChart3, iconClass: 'text-indigo-400' },
                  { label: 'Folders', value: data?.totalFolders || 0, icon: Folder, iconClass: 'text-violet-400' },
                  { label: 'Snippets', value: data?.totalSnippets || 0, icon: Tag, iconClass: 'text-emerald-400' },
                  { label: 'AI Calls Today', value: data?.aiCallsToday || 0, icon: Sparkles, iconClass: 'text-amber-400' },
                ].map(({ label, value, icon: Icon, iconClass }) => (
                  <div key={label} className={`rounded-2xl border p-4 ${mutedSurfaceClass}`}>
                    <div className="mb-3 flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${iconClass}`} />
                      <span className={`text-[10px] font-black uppercase tracking-[0.18em] ${subtleTextClass}`}>{label}</span>
                    </div>
                    <p className={`text-2xl font-black ${titleTextClass}`}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className={`rounded-[28px] border p-4 md:p-5 ${surfaceClass}`}>
              <div className="mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4 text-indigo-400" />
                <h2 className={`text-sm font-black ${titleTextClass}`}>Recent Activity</h2>
              </div>
              <div className="space-y-2.5">
                {[
                  { label: 'This week', value: `${data?.clipsThisWeek || 0} clips` },
                  { label: 'This month', value: `${data?.clipsThisMonth || 0} clips` },
                  { label: 'Total AI calls', value: `${data?.aiCallsTotal || 0}` },
                ].map((item) => (
                  <div key={item.label} className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 ${mutedSurfaceClass}`}>
                    <span className={`text-xs font-semibold ${subtleTextClass}`}>{item.label}</span>
                    <span className={`text-sm font-black ${titleTextClass}`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className={`rounded-[28px] border p-4 md:p-5 ${surfaceClass}`}>
              <div className="mb-4 flex items-center gap-2">
                <Tag className="h-4 w-4 text-emerald-400" />
                <h2 className={`text-sm font-black ${titleTextClass}`}>Top Tags</h2>
              </div>
              {data?.topTags.length ? (
                <div className="space-y-2.5">
                  {data.topTags.map(({ tag, count }) => (
                    <div key={tag} className={`flex min-w-0 items-center justify-between gap-3 rounded-2xl border px-3 py-3 ${mutedSurfaceClass}`}>
                      <span className={`min-w-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] [overflow-wrap:anywhere] ${
                        isDarkTheme
                          ? 'border-indigo-400/20 bg-indigo-500/10 text-indigo-200'
                          : 'border-indigo-100 bg-indigo-50 text-indigo-700'
                      }`}>
                        {tag}
                      </span>
                      <span className={`shrink-0 text-xs font-black ${titleTextClass}`}>{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={`text-xs ${subtleTextClass}`}>No tags yet.</p>
              )}
            </section>
          </div>

          <section className={`mt-4 rounded-[28px] border p-4 md:p-5 ${surfaceClass}`}>
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-violet-400" />
              <h2 className={`text-sm font-black ${titleTextClass}`}>Clip Types</h2>
            </div>
            {data?.clipsByType.length ? (
              <div className="space-y-3">
                {data.clipsByType.map(({ type, count }) => (
                  <div key={type} className={`rounded-2xl border p-3 ${mutedSurfaceClass}`}>
                    <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
                      <span className={`min-w-0 text-[11px] font-black uppercase tracking-[0.14em] [overflow-wrap:anywhere] ${titleTextClass}`}>{type}</span>
                      <span className={`shrink-0 text-xs font-black ${subtleTextClass}`}>{count}</span>
                    </div>
                    <div className={`h-2 overflow-hidden rounded-full ${isDarkTheme ? 'bg-white/8' : 'bg-slate-200'}`}>
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                        style={{ width: `${Math.min(100, (count / (data?.totalClips || 1)) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className={`text-xs ${subtleTextClass}`}>No clip type data yet.</p>
            )}
          </section>
        </ProGate>
      </div>
    </div>
  );
}
