import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { notFound } from 'next/navigation';
import CollectionShareClient from './CollectionShareClient';

interface CollectionSharePageProps {
  params: Promise<{ token: string }>;
}

interface CollectionShareRecord {
  id: string;
  user_id: string;
  clip_ids: string[];
  expires_at: string | null;
  created_at: string;
}

interface SharedCollectionClipRecord {
  id: string;
  title: string | null;
  content: string;
  tags: string[] | null;
  pinned: boolean;
  created_at: string;
}

export default async function CollectionSharePage({ params }: CollectionSharePageProps) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const { token } = await params;

  // Fetch collection share metadata
  const shareResult = await adminSupabase
    .from('collection_shares')
    .select('id, user_id, clip_ids, expires_at, created_at')
    .eq('token', token)
    .single();
  const share = shareResult.data as CollectionShareRecord | null;
  const shareError = shareResult.error;

  if (shareError || !share) {
    notFound();
  }

  // Check expiration
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
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
        <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_50%,#eef2ff_100%)] p-4 font-sans sm:p-6">
          <div className="max-w-md w-full text-center flex flex-col items-center gap-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 shadow-sm">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="mb-2 text-xl font-black tracking-tight text-slate-950">This collection has expired</h1>
              <p className="mb-4 text-sm font-bold text-slate-700">
                Upgrade to Pro for permanent links
              </p>
              <p className="mx-auto max-w-sm text-sm leading-7 text-slate-600">
                Shared collection pages on the free plan expire after 7 days. Upgrade to Pro to get permanent sharing links, unlimited clip history, and larger page collections.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs">
              <a
                href="/dashboard"
                className="w-full rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-4 py-2.5 text-center text-xs font-black uppercase tracking-[0.16em] text-white shadow-[0_14px_30px_rgba(99,102,241,0.24)] transition-all hover:translate-y-[-1px]"
              >
                Upgrade to Pro
              </a>
              <a
                href="/"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-xs font-bold text-slate-700 transition-all hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
              >
                Back to Home
              </a>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_50%,#eef2ff_100%)] p-4 font-sans sm:p-6">
        <div className="max-w-md w-full text-center flex flex-col items-center gap-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 shadow-sm">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <h1 className="mb-2 text-lg font-black tracking-tight text-slate-950">Collection link expired</h1>
            <p className="text-sm leading-7 text-slate-600">
              This shared collection has expired. Ask the owner to share this collection again.
            </p>
          </div>
          <a
            href="/"
            className="inline-flex items-center gap-2 text-xs font-bold text-indigo-700 transition-colors hover:text-indigo-500"
          >
            Go to FreeClipboard
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    );
  }

  // Fetch the clips in the collection
  const clipsResult = await adminSupabase
    .from('clips')
    .select('id, title, content, tags, pinned, created_at')
    .in('id', share.clip_ids);
  const clips = (clipsResult.data as SharedCollectionClipRecord[] | null) ?? [];
  const clipsError = clipsResult.error;

  if (clipsError || !clips || clips.length === 0) {
    notFound();
  }

  // Preserve the user's custom clip order (clip_ids order) rather than default DB query order
  const orderedClips = share.clip_ids
    .map((id: string) => clips.find((clip) => clip.id === id))
    .filter((clip): clip is SharedCollectionClipRecord => Boolean(clip))
    .map((clip) => ({
      ...clip,
      tags: clip.tags ?? [],
    }));

  return (
    <CollectionShareClient
      clips={orderedClips}
      shareExpiresAt={share.expires_at}
    />
  );
}
