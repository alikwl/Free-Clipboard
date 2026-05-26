import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { QuickPasteActionKind } from '@/lib/quick-paste';

type RequestBody = {
  action: QuickPasteActionKind;
  source: 'web' | 'extension';
  entryKind: 'clip' | 'snippet';
  entryId: string;
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = (await request.json()) as RequestBody;
    const action = body.action;
    const source = body.source || 'web';
    const entryKind = body.entryKind;
    const entryId = body.entryId;

    if (!action || !entryKind || !entryId) {
      return NextResponse.json({ error: 'Missing quick paste usage fields.' }, { status: 400 });
    }

    const now = new Date().toISOString();

    const { data: existingUsage, error: usageSelectError } = await supabase
      .from('quick_paste_shortcuts')
      .select('id, usage_count')
      .eq('user_id', user.id)
      .eq('entry_kind', entryKind)
      .eq('entry_ref', entryId)
      .eq('source_app', source)
      .eq('action_kind', action)
      .maybeSingle();

    if (usageSelectError) throw usageSelectError;

    if (existingUsage?.id) {
      const { error: updateUsageError } = await supabase
        .from('quick_paste_shortcuts')
        .update({
          usage_count: (existingUsage.usage_count || 0) + 1,
          last_used_at: now,
          updated_at: now,
        })
        .eq('id', existingUsage.id);
      if (updateUsageError) throw updateUsageError;
    } else {
      const { error: insertUsageError } = await supabase.from('quick_paste_shortcuts').insert({
        user_id: user.id,
        entry_kind: entryKind,
        entry_ref: entryId,
        source_app: source,
        action_kind: action,
        usage_count: 1,
        last_used_at: now,
        updated_at: now,
      });
      if (insertUsageError) throw insertUsageError;
    }

    if (entryKind === 'snippet' && (action === 'copy' || action === 'paste')) {
      const { data: snippet, error: snippetError } = await supabase
        .from('snippets')
        .select('id, use_count')
        .eq('user_id', user.id)
        .eq('id', entryId)
        .maybeSingle();

      if (snippetError) throw snippetError;

      if (snippet?.id) {
        const { error: updateSnippetError } = await supabase
          .from('snippets')
          .update({ use_count: (snippet.use_count || 0) + 1 })
          .eq('id', snippet.id);
        if (updateSnippetError) throw updateSnippetError;
      }
    }

    if (entryKind === 'clip') {
      const { data: existingMetadata, error: metadataError } = await supabase
        .from('clip_metadata')
        .select('id, clip_type, entities')
        .eq('user_id', user.id)
        .eq('clip_id', entryId)
        .maybeSingle();

      if (metadataError) throw metadataError;

      const nextEntities = {
        ...(existingMetadata?.entities || {}),
        last_used_at: now,
      };

      if (existingMetadata?.id) {
        const { error: updateMetadataError } = await supabase
          .from('clip_metadata')
          .update({
            entities: nextEntities,
            clip_type: existingMetadata.clip_type || 'other',
          })
          .eq('id', existingMetadata.id);
        if (updateMetadataError) throw updateMetadataError;
      } else {
        const { error: insertMetadataError } = await supabase.from('clip_metadata').insert({
          user_id: user.id,
          clip_id: entryId,
          clip_type: 'other',
          entities: nextEntities,
        });
        if (insertMetadataError) throw insertMetadataError;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Quick paste usage error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

