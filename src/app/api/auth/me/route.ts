import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit';

export async function GET(request: Request) {
  const rateLimit = checkRateLimit(
    getRateLimitKey(request, 'auth:me'),
    { limit: 60, windowMs: 60_000 }
  );
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: 'Too many auth lookups. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    );
  }

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json({ error: 'No token provided' }, { status: 401 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('plan, trial_ends_at')
      .eq('id', user.id)
      .single();

    return NextResponse.json({
      id: user.id,
      email: user.email,
      plan: profile?.plan || 'free',
    });
  } catch {
    return NextResponse.json({ error: 'Auth check failed' }, { status: 500 });
  }
}
