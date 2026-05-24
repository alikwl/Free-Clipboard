import { createClient } from '@/utils/supabase/server';
import { notFound } from 'next/navigation';
import SharedClipClient from './SharedClipClient';

interface SharedClipPageProps {
  params: { token: string };
}

export default async function SharedClipPage({ params }: SharedClipPageProps) {
  const supabase = await createClient();
  const { token } = params;

  // Fetch the clip by share_token
  const { data: clip, error } = await supabase
    .from('clips')
    .select('id, title, content, tags, pinned, created_at, share_expires_at')
    .eq('share_token', token)
    .single();

  if (error || !clip) {
    notFound();
  }

  // Check expiry
  if (clip.share_expires_at && new Date(clip.share_expires_at) < new Date()) {
    // Determine if visitor is a free user
    let isFreeUser = true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('plan')
          .eq('id', user.id)
          .single();
        if (profile && profile.plan === 'pro') {
          isFreeUser = false;
        }
      }
    } catch {
      isFreeUser = true;
    }

    if (isFreeUser) {
      return (
        <div className="min-h-screen bg-[#07070a] flex items-center justify-center p-6 font-sans relative overflow-hidden">
          {/* Ambient background decoration */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-rose-600/5 rounded-full blur-[120px] -z-10 pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-violet-600/5 rounded-full blur-[100px] -z-10 pointer-events-none" />

          <div className="max-w-md w-full text-center flex flex-col items-center gap-6">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-rose-500/10 border border-rose-500/20 text-rose-400 shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
            </div>
            <div>
              <h1 className="text-xl font-black text-neutral-100 tracking-tight mb-2">This link has expired</h1>
              <p className="text-sm text-neutral-400 font-bold mb-4">
                Upgrade to Pro for permanent links
              </p>
              <p className="text-xs text-neutral-500 leading-relaxed max-w-sm mx-auto">
                Shared links on the free plan expire after 7 days. Upgrade to Pro to get permanent sharing links, unlimited clip history, and larger page collections.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs">
              <a
                href="/dashboard"
                className="w-full text-center px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-amber-500 text-neutral-950 hover:bg-amber-400 transition-all shadow-lg hover:shadow-amber-500/10"
              >
                Upgrade to Pro
              </a>
              <a
                href="/"
                className="w-full text-center px-4 py-2.5 rounded-xl text-xs font-bold bg-white/5 border border-white/10 text-neutral-300 hover:bg-white/10 transition-all"
              >
                Back to Home
              </a>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#07070a] flex items-center justify-center p-6 font-sans relative overflow-hidden">
        <div className="max-w-md w-full text-center flex flex-col items-center gap-6">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-rose-600/5 rounded-full blur-[120px] -z-10 pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-violet-600/5 rounded-full blur-[100px] -z-10 pointer-events-none" />

          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-rose-500/10 border border-rose-500/20 text-rose-400 shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
          </div>
          <div>
            <h1 className="text-lg font-black text-neutral-100 tracking-tight mb-2">This link has expired</h1>
            <p className="text-sm text-neutral-500 leading-relaxed">
              This shared clip link has expired. Ask the owner to generate a new share link.
            </p>
          </div>
          <a
            href="/"
            className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Go to FreeClipboard →
          </a>
        </div>
      </div>
    );
  }

  return (
    <SharedClipClient
      title={clip.title}
      content={clip.content}
      tags={clip.tags || []}
      pinned={clip.pinned}
      createdAt={clip.created_at}
      shareExpiresAt={clip.share_expires_at}
    />
  );
}
