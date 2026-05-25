import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { callAI } from '@/lib/openrouter';
import { checkRateLimit } from '@/lib/ai-rate-limit';

function createLocalSummary(content: string) {
  const normalized = content
    .replace(/\s+/g, ' ')
    .replace(/```[\s\S]*?```/g, ' code snippet ')
    .trim();

  if (!normalized) {
    return '';
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const preferredSentence =
    sentences.find((sentence) => sentence.length >= 40 && sentence.length <= 180) ||
    sentences.find((sentence) => sentence.length >= 20) ||
    normalized.slice(0, 180);

  const compactSummary = preferredSentence
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,:;]+$/, '');

  return compactSummary.length > 180
    ? `${compactSummary.slice(0, 177).trim()}...`
    : compactSummary;
}

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

    const rateLimit = await checkRateLimit(user.id, plan, 'summarize', profile?.trial_ends_at);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 });
    }

    const { content } = await request.json();

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Content must be a non-empty string.' }, { status: 400 });
    }

    const summary = await callAI(
      'Summarize this text in one clear sentence.',
      content,
      1000
    );

    if (!summary) {
      const fallbackSummary = createLocalSummary(content);

      if (!fallbackSummary) {
        return NextResponse.json(
          { error: 'Failed to generate summary. AI service unavailable.' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        summary: fallbackSummary,
        isFallback: true,
        warning: 'OpenRouter AI is unavailable right now, so a local smart summary was generated instead.',
        remaining: rateLimit.remaining,
      });
    }

    return NextResponse.json({
      success: true,
      summary: summary.trim(),
      remaining: rateLimit.remaining,
    });

  } catch (error: unknown) {
    console.error('Summarize API Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to summarize: ${errorMessage}` },
      { status: 500 }
    );
  }
}
