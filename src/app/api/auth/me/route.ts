import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json({ error: 'No token provided' }, { status: 401 });
  }

  try {
<<<<<<< HEAD
    const supabase = createClient();
=======
    const supabase = await createClient();
>>>>>>> 7a2e13a (Initial commit from PC)
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
