import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  // Verify Vercel Cron authorization header in production
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
  }

  try {
    const supabase = await createClient();
    
    // Call the security definer Postgres function to safely clear expired share tokens
    const { error } = await supabase.rpc('cleanup_expired_shares');
    
    if (error) {
      console.error('RPC cleanup function failed:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Expired tokens cleared successfully.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Cron job exception:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
