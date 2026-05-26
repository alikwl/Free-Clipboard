import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { callAI } from '@/lib/openrouter';
import { checkRateLimit } from '@/lib/ai-rate-limit';

type ClipMindAction =
  | 'summarize'
  | 'rewrite'
  | 'translate'
  | 'fix-grammar'
  | 'make-professional'
  | 'make-short'
  | 'make-friendly'
  | 'extract-tasks'
  | 'extract-keywords'
  | 'generate-title'
  | 'generate-tags'
  | 'detect-language'
  | 'explain-text'
  | 'convert-email'
  | 'convert-thread'
  | 'convert-blog-outline'
  | 'convert-checklist'
  | 'convert-json'
  | 'convert-table'
  | 'detect-sensitive-data';

type ActionConfig = {
  label: string;
  prompt: string;
  maxTokens: number;
  applyTarget?: 'content' | 'title' | 'tags' | null;
  output?: 'text' | 'list';
};

const ACTIONS: Record<ClipMindAction, ActionConfig> = {
  summarize: {
    label: 'Summarize',
    prompt: 'Summarize this clip in one clear, useful sentence. Return only the summary.',
    maxTokens: 220,
    applyTarget: null,
  },
  rewrite: {
    label: 'Rewrite',
    prompt: 'Rewrite this clip for clarity while preserving the meaning. Return only the rewritten text.',
    maxTokens: 900,
    applyTarget: 'content',
  },
  translate: {
    label: 'Translate',
    prompt: 'Translate this clip into simple English. Preserve meaning and formatting. Return only the translation.',
    maxTokens: 900,
    applyTarget: 'content',
  },
  'fix-grammar': {
    label: 'Fix grammar',
    prompt: 'Fix grammar, spelling, punctuation, and awkward phrasing. Preserve meaning. Return only the corrected text.',
    maxTokens: 900,
    applyTarget: 'content',
  },
  'make-professional': {
    label: 'Make professional',
    prompt: 'Rewrite this clip to sound professional, polished, and workplace-ready. Return only the rewritten text.',
    maxTokens: 900,
    applyTarget: 'content',
  },
  'make-short': {
    label: 'Make short',
    prompt: 'Make this clip much shorter while keeping the key meaning. Return only the shortened text.',
    maxTokens: 500,
    applyTarget: 'content',
  },
  'make-friendly': {
    label: 'Make friendly',
    prompt: 'Rewrite this clip in a warm, friendly, approachable tone. Return only the rewritten text.',
    maxTokens: 900,
    applyTarget: 'content',
  },
  'extract-tasks': {
    label: 'Extract tasks',
    prompt: 'Extract actionable tasks from this clip. Return a checklist with one task per line starting with "- ". If there are no tasks, say "No actionable tasks found."',
    maxTokens: 500,
    applyTarget: null,
  },
  'extract-keywords': {
    label: 'Extract keywords',
    prompt: 'Extract 5 to 10 concise keywords from this clip. Return only a comma-separated list.',
    maxTokens: 180,
    applyTarget: 'tags',
  },
  'generate-title': {
    label: 'Generate title',
    prompt: 'Generate a short, clear title for this clip. Return only the title, under 60 characters if possible.',
    maxTokens: 80,
    applyTarget: 'title',
  },
  'generate-tags': {
    label: 'Generate tags',
    prompt: 'Generate 4 to 8 short uppercase tags for this clip. Return only a comma-separated list.',
    maxTokens: 120,
    applyTarget: 'tags',
  },
  'detect-language': {
    label: 'Detect language',
    prompt: 'Detect the primary language of this clip. Return only the language name and, if obvious, the script.',
    maxTokens: 80,
    applyTarget: null,
  },
  'explain-text': {
    label: 'Explain text',
    prompt: 'Explain this clip in simple, plain language for a non-expert. Keep it concise. Return only the explanation.',
    maxTokens: 500,
    applyTarget: null,
  },
  'convert-email': {
    label: 'Convert to email',
    prompt: 'Turn this clip into a professional email draft with subject line and body. Return only the email.',
    maxTokens: 900,
    applyTarget: 'content',
  },
  'convert-thread': {
    label: 'Convert to tweet/thread',
    prompt: 'Turn this clip into a concise social thread. Number each post like "1/" "2/" and keep it punchy. Return only the thread.',
    maxTokens: 900,
    applyTarget: 'content',
  },
  'convert-blog-outline': {
    label: 'Convert to blog outline',
    prompt: 'Turn this clip into a blog outline with headline and section bullets. Return only the outline.',
    maxTokens: 900,
    applyTarget: 'content',
  },
  'convert-checklist': {
    label: 'Convert to checklist',
    prompt: 'Convert this clip into a practical checklist. Return only checklist items prefixed with "- ".',
    maxTokens: 700,
    applyTarget: 'content',
  },
  'convert-json': {
    label: 'Convert to JSON',
    prompt: 'Convert this clip into a clean JSON structure that preserves the main information. Return only valid JSON.',
    maxTokens: 900,
    applyTarget: 'content',
  },
  'convert-table': {
    label: 'Convert to table',
    prompt: 'Convert this clip into a markdown table when appropriate. If a table does not fit well, produce a compact two-column key/value table. Return only markdown.',
    maxTokens: 900,
    applyTarget: 'content',
  },
  'detect-sensitive-data': {
    label: 'Detect sensitive data',
    prompt: 'Inspect this clip for sensitive data such as passwords, API keys, tokens, secrets, emails, phone numbers, addresses, bank data, or personal identifiers. Return a short risk summary and bullet list of findings. If nothing sensitive appears, say "No obvious sensitive data detected."',
    maxTokens: 400,
    applyTarget: null,
  },
};

function splitKeywords(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim().replace(/^[-*]\s*/, ''))
    .filter(Boolean);
}

function detectSensitiveDataLocal(content: string) {
  const findings: string[] = [];
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/i.test(content)) findings.push('Email address');
  if (/\b(?:\+?\d[\d\s().-]{7,}\d)\b/.test(content)) findings.push('Phone number');
  if (/\b(?:sk-[A-Za-z0-9]{16,}|AIza[0-9A-Za-z\-_]{20,}|ghp_[A-Za-z0-9]{20,})\b/.test(content)) findings.push('API key or token');
  if (/\bpassword\b|\bsecret\b|\btoken\b/i.test(content)) findings.push('Credential-related wording');
  if (/\b\d{13,19}\b/.test(content)) findings.push('Possible payment or account number');
  return findings;
}

function createLocalResult(action: ClipMindAction, content: string) {
  const normalized = content.trim();
  if (!normalized) return '';

  if (action === 'generate-title') {
    return normalized.split('\n').find(Boolean)?.slice(0, 60) || 'Untitled Clip';
  }

  if (action === 'generate-tags' || action === 'extract-keywords') {
    const words = Array.from(new Set(
      normalized
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 3)
    )).slice(0, 8);
    return words.map((word) => word.toUpperCase()).join(', ');
  }

  if (action === 'detect-language') {
    if (/[ء-ي]/.test(normalized)) return 'Urdu / Arabic script';
    if (/[一-龯ぁ-んァ-ン]/.test(normalized)) return 'East Asian language';
    return 'Likely English';
  }

  if (action === 'detect-sensitive-data') {
    const findings = detectSensitiveDataLocal(normalized);
    return findings.length > 0
      ? `Potentially sensitive data detected:\n- ${findings.join('\n- ')}`
      : 'No obvious sensitive data detected.';
  }

  if (action === 'summarize') {
    return normalized.slice(0, 180) + (normalized.length > 180 ? '...' : '');
  }

  if (action === 'convert-checklist' || action === 'extract-tasks') {
    return normalized
      .split(/(?<=[.!?])\s+|\n+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 6)
      .map((item) => `- ${item}`)
      .join('\n');
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

    const { content, action } = await request.json();

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Content must be a non-empty string.' }, { status: 400 });
    }

    if (!action || typeof action !== 'string' || !(action in ACTIONS)) {
      return NextResponse.json({ error: 'Unsupported ClipMind action.' }, { status: 400 });
    }

    const actionKey = action as ClipMindAction;
    const config = ACTIONS[actionKey];
    const result = await callAI(config.prompt, content, config.maxTokens);

    const finalResult = result?.trim() || createLocalResult(actionKey, content);
    if (!finalResult) {
      return NextResponse.json({ error: 'Failed to generate ClipMind output.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      action: actionKey,
      label: config.label,
      result: finalResult,
      applyTarget: config.applyTarget || null,
      isFallback: !result,
      warning: !result ? 'OpenRouter AI is unavailable right now, so a local ClipMind fallback was used.' : null,
      parsedTags: config.applyTarget === 'tags' ? splitKeywords(finalResult).map((item) => item.toUpperCase()) : null,
      remaining: rateLimit.remaining,
    });
  } catch (error: unknown) {
    console.error('ClipMind Action API Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to run ClipMind action: ${errorMessage}` },
      { status: 500 }
    );
  }
}
