import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { callAI } from '@/lib/openrouter';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('plan')
      .eq('id', user.id)
      .single();

    if (profile?.plan !== 'pro') {
      return NextResponse.json({ error: 'Pro only.' }, { status: 403 });
    }

    const { count } = await supabase
      .from('clip_metadata')
      .select('id', { count: 'exact', head: true });

    if (count && count > 0) {
      return NextResponse.json({ message: 'Already done. Metadata exists.', count });
    }

    const { data: clips } = await supabase
      .from('clips')
      .select('id, content')
      .eq('user_id', user.id);

    if (!clips || clips.length === 0) {
      return NextResponse.json({ success: true, analyzed: 0, message: 'No clips found.' });
    }

    const systemPrompt = `Analyze this text and return ONLY valid JSON:
{
  "type": "code|email|url|note|quote|other",
  "topics": ["max 5 short topic strings"],
  "keywords": ["max 10 important words"],
  "entities": {
    "people": [],
    "companies": [],
    "technologies": [],
    "dates": []
  }
}
No explanation. Just JSON.`;

    let analyzed = 0;
    const errors: string[] = [];

    for (const clip of clips) {
      try {
        const responseText = await callAI(systemPrompt, clip.content, 500);

        if (!responseText) {
          errors.push(`Clip ${clip.id}: empty response`);
          continue;
        }

        const cleanJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const analysis = JSON.parse(cleanJson);

        const { error: upsertError } = await supabase
          .from('clip_metadata')
          .upsert({
            user_id: user.id,
            clip_id: clip.id,
            clip_type: analysis.type || 'other',
            topics: analysis.topics || [],
            keywords: analysis.keywords || [],
            entities: analysis.entities || { people: [], companies: [], technologies: [], dates: [] },
          }, { onConflict: 'clip_id' });

        if (upsertError) {
          errors.push(`Clip ${clip.id}: ${upsertError.message}`);
        } else {
          analyzed++;
        }
      } catch (err) {
        errors.push(`Clip ${clip.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return NextResponse.json({
      success: true,
      analyzed,
      total: clips.length,
      errors,
    });

  } catch (error: unknown) {
    console.error('Bulk analyze error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
