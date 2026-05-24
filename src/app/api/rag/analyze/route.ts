import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { callAI } from '@/lib/openrouter';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { clip_id, content } = await request.json();

    if (!clip_id || !content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'clip_id and content are required.' },
        { status: 400 }
      );
    }

    const { data: profile } = await supabase
      .from('users')
      .select('plan, trial_ends_at')
      .eq('id', user.id)
      .single();

    const isTrial = profile?.trial_ends_at && new Date(profile.trial_ends_at) > new Date();
    const plan = profile?.plan || 'free';

    if (plan !== 'pro' && !isTrial) {
      return NextResponse.json(
        { error: 'RAG analysis is a premium feature.' },
        { status: 403 }
      );
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

    const responseText = await callAI(systemPrompt, content, 500);

    if (!responseText) {
      return NextResponse.json(
        { error: 'Failed to analyze content. AI service unavailable.' },
        { status: 500 }
      );
    }

    let analysis: {
      type: string;
      topics: string[];
      keywords: string[];
      entities: { people: string[]; companies: string[]; technologies: string[]; dates: string[] };
    };

    try {
      const cleanJson = responseText
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      analysis = JSON.parse(cleanJson);
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse AI analysis response.' },
        { status: 500 }
      );
    }

    const { error: upsertError } = await supabase
      .from('clip_metadata')
      .upsert({
        user_id: user.id,
        clip_id,
        clip_type: analysis.type || 'other',
        topics: analysis.topics || [],
        keywords: analysis.keywords || [],
        entities: analysis.entities || { people: [], companies: [], technologies: [], dates: [] },
      }, {
        onConflict: 'clip_id',
      });

    if (upsertError) {
      console.error('Error upserting clip metadata:', upsertError);
      return NextResponse.json(
        { error: 'Failed to save clip metadata.' },
        { status: 500 }
      );
    }

    const { data: relatedClips } = await supabase
      .from('clips')
      .select('id, content, title')
      .eq('user_id', user.id)
      .neq('id', clip_id)
      .or(
        `clip_metadata.topics.cs.{${(analysis.topics || []).join(',')}},clip_metadata.keywords.cs.{${(analysis.keywords || []).join(',')}}`
      )
      .limit(5);

    const relationshipsToInsert = (relatedClips || []).map((related: { id: string }) => ({
      user_id: user.id,
      clip_a_id: clip_id,
      clip_b_id: related.id,
      strength: 0.5,
    }));

    if (relationshipsToInsert.length > 0) {
      const { error: relError } = await supabase
        .from('clip_relationships')
        .insert(relationshipsToInsert);

      if (relError) {
        console.error('Error inserting relationships:', relError);
      }
    }

    return NextResponse.json({
      success: true,
      analysis,
      relatedClips: relatedClips || [],
    });

  } catch (error: unknown) {
    console.error('RAG Analyze API Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to analyze content: ${errorMessage}` },
      { status: 500 }
    );
  }
}
