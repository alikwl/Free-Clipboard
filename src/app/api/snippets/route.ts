import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { SNIPPETS_PAGE_SIZE, shortPrivateCache } from '@/lib/egress';
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { data: snippets } = await supabase
      .from('snippets')
      .select('id, trigger_key, content, use_count')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(SNIPPETS_PAGE_SIZE);

    return NextResponse.json(
      { success: true, snippets: snippets || [] },
      { headers: { 'Cache-Control': shortPrivateCache } }
    );

  } catch (error: unknown) {
    console.error('Snippets list error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const rateLimit = checkRateLimit(
      getRateLimitKey(request, 'snippets:create', user.id),
      { limit: 20, windowMs: 60_000 }
    );
    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: 'Too many snippet create requests. Please slow down.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      );
    }

    const { trigger_key, content } = await request.json();

    if (!trigger_key || !content) {
      return NextResponse.json({ error: 'trigger_key and content are required.' }, { status: 400 });
    }

    if (!trigger_key.startsWith(';;') || trigger_key.length < 3) {
      return NextResponse.json({ error: 'Trigger must start with ;; and be at least 3 characters.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('snippets')
      .insert({ user_id: user.id, trigger_key, content })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Trigger already exists.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, snippet: data });

  } catch (error: unknown) {
    console.error('Create snippet error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
