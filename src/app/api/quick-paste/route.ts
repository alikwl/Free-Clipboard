import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import {
  buildClipQuickPasteEntry,
  buildSnippetQuickPasteEntry,
  groupQuickPasteEntries,
} from '@/lib/quick-paste';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const [{ data: clips, error: clipsError }, { data: metadataRows, error: metadataError }, { data: snippets, error: snippetsError }] =
      await Promise.all([
        supabase
          .from('clips')
          .select('id, title, content, tags, pinned, created_at')
          .eq('user_id', user.id)
          .order('pinned', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(120),
        supabase
          .from('clip_metadata')
          .select('clip_id, entities')
          .eq('user_id', user.id),
        supabase
          .from('snippets')
          .select('id, trigger_key, content, use_count, created_at')
          .eq('user_id', user.id)
          .order('use_count', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(60),
      ]);

    if (clipsError) throw clipsError;
    if (metadataError) throw metadataError;
    if (snippetsError) throw snippetsError;

    const metadataMap = new Map(
      (metadataRows || []).map((row) => [row.clip_id, (row.entities || {}) as { source_app?: string | null; code_language?: string | null; last_used_at?: string | null }])
    );

    const entries = [
      ...(clips || []).map((clip) =>
        buildClipQuickPasteEntry({
          ...clip,
          metadata: metadataMap.get(clip.id) || null,
        })
      ),
      ...(snippets || []).map((snippet) => buildSnippetQuickPasteEntry(snippet)),
    ];

    return NextResponse.json({
      success: true,
      entries,
      sections: groupQuickPasteEntries(entries),
    });
  } catch (error: unknown) {
    console.error('Quick paste load error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

