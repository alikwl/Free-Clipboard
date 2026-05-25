import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const trigger = searchParams.get('trigger');

    if (!trigger) {
      return NextResponse.json({ error: 'trigger query param is required.' }, { status: 400 });
    }

    const { data: snippet } = await supabase
      .from('snippets')
      .select('*')
      .eq('user_id', user.id)
      .eq('trigger_key', trigger)
      .single();

    if (!snippet) {
      return NextResponse.json({ error: 'Snippet not found.' }, { status: 404 });
    }

    await supabase
      .from('snippets')
      .update({ use_count: (snippet.use_count || 0) + 1 })
      .eq('id', snippet.id);

    return NextResponse.json({ success: true, snippet });

  } catch (error: unknown) {
    console.error('Expand snippet error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
