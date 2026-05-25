import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { callAI } from '@/lib/openrouter';
import { checkRateLimit } from '@/lib/ai-rate-limit';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('plan, trial_ends_at')
      .eq('id', user.id)
      .single();

    const plan = profile?.plan || 'free';

    const rateLimit = await checkRateLimit(user.id, plan, 'autotag', profile?.trial_ends_at);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 });
    }

    const { content } = await request.json();

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Content must be a non-empty string.' }, { status: 400 });
    }

    const systemPrompt = `Return ONLY a JSON array of 3-5 short tags for this text. Example: ["code","javascript","function"]. No explanation, just the JSON array.`;

    const responseText = await callAI(systemPrompt, content, 500);

    if (!responseText) {
      return NextResponse.json(
        { error: 'Failed to generate tags. AI service unavailable.' },
        { status: 500 }
      );
    }

    let tags: string[] = [];
    try {
      const cleanJson = responseText
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      
      tags = JSON.parse(cleanJson);
    } catch {
      const matches = responseText.match(/"([^"]+)"/g);
      if (matches) {
        tags = matches.map(m => m.replace(/"/g, '').trim());
      } else {
        tags = responseText
          .replace(/[\[\]]/g, '')
          .split(/[\s,]+/)
          .map(t => t.trim())
          .filter(t => t.length > 0 && t.length < 20);
      }
    }

    tags = tags
      .map(t => t.toLowerCase().replace(/[^a-z0-9-]/gi, '').trim())
      .filter(t => t.length > 0 && t.length <= 15)
      .slice(0, 5);

    if (tags.length === 0) {
      tags = ['clip'];
    }

    return NextResponse.json({
      success: true,
      tags,
      remaining: rateLimit.remaining,
    });

  } catch (error: unknown) {
    console.error('Auto-tag API Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to generate tags: ${errorMessage}` },
      { status: 500 }
    );
  }
}
