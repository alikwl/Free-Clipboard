import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { executeAutomation } from '@/lib/automations-engine';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { automation, clip_id } = await request.json();

    if (!automation || !clip_id) {
      return NextResponse.json({ error: 'automation and clip_id are required parameters.' }, { status: 400 });
    }

    // Load the selected clip to test, ensuring it belongs to the user
    const { data: clip, error: clipError } = await supabase
      .from('clips')
      .select('id, user_id, content, title, tags, pinned, folder_id, created_at')
      .eq('id', clip_id)
      .eq('user_id', user.id)
      .single();

    if (clipError || !clip) {
      return NextResponse.json({ error: 'Target clip not found or access denied.' }, { status: 404 });
    }

    // Run the automation engine in DRY RUN mode!
    const result = await executeAutomation(automation, clip, supabase, true);

    return NextResponse.json({
      success: true,
      status: result.status,
      logs: result.logs,
      errorMessage: result.errorMessage,
    });

  } catch (error: unknown) {
    console.error('Automations Test Run Exception:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Server exception during dry-run: ${msg}` }, { status: 500 });
  }
}
