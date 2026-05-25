import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { callAI } from '@/lib/openrouter';
import { checkRateLimit } from '@/lib/ai-rate-limit';

function splitSentences(content: string) {
  return content
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function createLocalRewrite(content: string, tone: string) {
  const normalized = content.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!normalized) return '';

  const sentences = splitSentences(normalized);

  if (tone === 'shorter') {
    const compact = sentences.length > 1
      ? sentences.slice(0, 3).join(' ')
      : normalized;
    return compact.length > 320 ? `${compact.slice(0, 317).trim()}...` : compact;
  }

  if (tone === 'expand') {
    const base = normalized.endsWith('.') || normalized.endsWith('!') || normalized.endsWith('?')
      ? normalized
      : `${normalized}.`;
    return `${base}\n\nKey context: this note can be used as a starting point for follow-up, documentation, or a clearer action plan.`;
  }

  if (tone === 'formal') {
    return normalized
      .replace(/\bi\b/g, 'I')
      .replace(/\bcan't\b/gi, 'cannot')
      .replace(/\bwon't\b/gi, 'will not')
      .replace(/\bdon't\b/gi, 'do not')
      .replace(/\bdoesn't\b/gi, 'does not')
      .replace(/\bisn't\b/gi, 'is not')
      .replace(/\baren't\b/gi, 'are not')
      .replace(/\bgot\b/gi, 'received')
      .replace(/\bneed to\b/gi, 'should')
      .trim();
  }

  if (tone === 'casual') {
    const first = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    return first
      .replace(/\btherefore\b/gi, 'so')
      .replace(/\bhowever\b/gi, 'but')
      .replace(/\butilize\b/gi, 'use')
      .replace(/\bapproximately\b/gi, 'about')
      .trim();
  }

  return normalized;
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
      const fallbackRewrite = createLocalRewrite(content, tone);

      if (!fallbackRewrite) {
        return NextResponse.json(
          { error: 'Failed to rewrite content. AI service unavailable.' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        rewritten: fallbackRewrite,
        isFallback: true,
        warning: 'OpenRouter AI is unavailable right now, so a local smart rewrite was generated instead.',
        remaining: rateLimit.remaining,
      });
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
