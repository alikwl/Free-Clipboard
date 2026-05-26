import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { executeAutomation } from '@/lib/automations-engine';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Support triggering from logged-in user OR direct server trigger (e.g. from embed CRON job)
    let activeUserId: string | null = null;
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      activeUserId = user.id;
    }

    const { trigger_type, clip_id, userId } = await request.json();

    if (!trigger_type || !clip_id) {
      return NextResponse.json({ error: 'trigger_type and clip_id are required.' }, { status: 400 });
    }

    const finalUserId = activeUserId || userId;

    if (!finalUserId) {
      return NextResponse.json({ error: 'User identity could not be verified.' }, { status: 401 });
    }

    // 1. Fetch the clip details
    const { data: clip, error: clipError } = await supabase
      .from('clips')
      .select('*')
      .eq('id', clip_id)
      .single();

    if (clipError || !clip) {
      return NextResponse.json({ error: 'Target clip not found.' }, { status: 404 });
    }

    // Double check clip belongs to the correct user
    if (clip.user_id !== finalUserId) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
    }

    // 2. Fetch all enabled automation rules of the user matching this trigger_type
    const { data: rules, error: rulesError } = await supabase
      .from('automations')
      .select('*')
      .eq('user_id', finalUserId)
      .eq('trigger_type', trigger_type)
      .eq('enabled', true);

    if (rulesError) {
      console.error('Trigger fetch rules error:', rulesError);
      return NextResponse.json({ error: 'Failed to load rules.' }, { status: 500 });
    }

    if (!rules || rules.length === 0) {
      return NextResponse.json({ success: true, executed: 0, message: 'No enabled rules match this trigger.' });
    }

    let executedCount = 0;
    const results = [];

    // 3. Process each automation rule
    for (const rule of rules) {
      const result = await executeAutomation(rule, clip, supabase, false);
      
      // Save logs in database
      const { error: logErr } = await supabase
        .from('automation_runs')
        .insert({
          user_id: finalUserId,
          automation_id: rule.id,
          clip_id: clip.id,
          status: result.status,
          logs: result.logs,
          error_message: result.errorMessage || null,
        });

      if (logErr) {
        console.error(`Run log save failed for rule ${rule.id}:`, logErr.message);
      }

      results.push({
        rule_id: rule.id,
        rule_name: rule.name,
        status: result.status,
      });
      executedCount++;
    }

    return NextResponse.json({
      success: true,
      executed: executedCount,
      results,
    });

  } catch (error: unknown) {
    console.error('Automations Trigger route error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Server exception: ${msg}` }, { status: 500 });
  }
}
