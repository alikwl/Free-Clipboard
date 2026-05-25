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

    const rateLimit = await checkRateLimit(user.id, plan, 'rewrite', profile?.trial_ends_at);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 });
    }

    const { content, tone } = await request.json();

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Content must be a non-empty string.' }, { status: 400 });
    }

    const allowedTones = ['formal', 'casual', 'shorter', 'expand'];
    if (!tone || !allowedTones.includes(tone)) {
      return NextResponse.json(
        { error: `Tone must be one of: ${allowedTones.join(', ')}` },
        { status: 400 }
      );
    }

    const tonePrompts: Record<string, string> = {
      formal: 'Rewrite the text to be formal, professional, polished, and structured.',
      casual: 'Rewrite the text to be casual, friendly, approachable, and engaging.',
      shorter: 'Rewrite the text to be significantly shorter, extremely concise, and brief.',
      expand: 'Rewrite the text to expand on the ideas, adding context, elaboration, and depth while maintaining the core message.',
    };

    const systemPrompt = `${tonePrompts[tone]} Return only the rewritten text.`;

    const rewritten = await callAI(systemPrompt, content, 1000);

    if (!rewritten) {
      return NextResponse.json(
        { error: 'Failed to rewrite content. AI service unavailable.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      rewritten: rewritten.trim(),
      remaining: rateLimit.remaining,
    });

  } catch (error: unknown) {
    console.error('Rewrite API Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to rewrite content: ${errorMessage}` },
      { status: 500 }
    );
  }
}
