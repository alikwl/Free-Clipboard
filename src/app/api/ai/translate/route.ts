import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { callAI } from '@/lib/openrouter';
import { checkRateLimit } from '@/lib/ai-rate-limit';

export async function POST(request: NextRequest) {
  try {
<<<<<<< HEAD
    const supabase = createClient();
=======
    const supabase = await createClient();
>>>>>>> 7a2e13a (Initial commit from PC)
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

    const rateLimit = await checkRateLimit(user.id, plan, 'translate', profile?.trial_ends_at);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 });
    }

    const { content, targetLanguage } = await request.json();

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Content must be a non-empty string.' }, { status: 400 });
    }

    if (!targetLanguage || typeof targetLanguage !== 'string') {
      return NextResponse.json({ error: 'Target language must be a non-empty string.' }, { status: 400 });
    }

    const systemPrompt = `Translate this text to ${targetLanguage}. Return only the translation.`;

    const translated = await callAI(systemPrompt, content, 1000);

    if (!translated) {
      return NextResponse.json(
        { error: 'Failed to translate content. AI service unavailable.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      translated: translated.trim(),
      remaining: rateLimit.remaining,
    });

  } catch (error: unknown) {
    console.error('Translation API Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to translate content: ${errorMessage}` },
      { status: 500 }
    );
  }
}
