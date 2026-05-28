import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { shortPrivateCache } from '@/lib/egress';

/**
 * GET: Fetch all automations & past 50 run logs for the authenticated user
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    // Fetch automations rules
    const { data: automations, error: autoError } = await supabase
      .from('automations')
      .select('id, name, enabled, trigger_type, conditions, actions, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (autoError) {
      console.error('Error fetching automations:', autoError);
      return NextResponse.json({ error: 'Failed to retrieve automation rules.' }, { status: 500 });
    }

    // Fetch last 50 automation runs
    const { data: runs, error: runsError } = await supabase
      .from('automation_runs')
      .select('id, automation_id, clip_id, status, logs, error_message, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (runsError) {
      console.error('Error fetching automation runs:', runsError);
    }

    return NextResponse.json(
      {
        automations: automations || [],
        runs: runs || [],
      },
      { headers: { 'Cache-Control': shortPrivateCache } }
    );

  } catch (error: unknown) {
    console.error('Automations GET Critical Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Server exception: ${msg}` }, { status: 500 });
  }
}

/**
 * POST: Create a new automation rule
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { name, trigger_type, conditions = [], actions = [], enabled = true } = await request.json();

    if (!name || typeof name !== 'string' || !trigger_type) {
      return NextResponse.json({ error: 'name and trigger_type are required.' }, { status: 400 });
    }

    const { data: newRule, error: insertError } = await supabase
      .from('automations')
      .insert({
        user_id: user.id,
        name: name.trim(),
        trigger_type,
        conditions,
        actions,
        enabled,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Rule creation database error:', insertError);
      return NextResponse.json({ error: `Database insert failed: ${insertError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, rule: newRule });

  } catch (error: unknown) {
    console.error('Automations POST Exception:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Server exception: ${msg}` }, { status: 500 });
  }
}

/**
 * PUT: Full or partial update of an existing automation rule (e.g. toggling enabled/disabled)
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { id, name, trigger_type, conditions, actions, enabled } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'id parameter is required.' }, { status: 400 });
    }

    // Verify ownership of the rule first
    const { data: existing } = await supabase
      .from('automations')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Automation rule not found or access denied.' }, { status: 404 });
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updatePayload.name = name;
    if (trigger_type !== undefined) updatePayload.trigger_type = trigger_type;
    if (conditions !== undefined) updatePayload.conditions = conditions;
    if (actions !== undefined) updatePayload.actions = actions;
    if (enabled !== undefined) updatePayload.enabled = enabled;

    const { data: updatedRule, error: updateError } = await supabase
      .from('automations')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Rule update failed:', updateError);
      return NextResponse.json({ error: `Update failed: ${updateError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, rule: updatedRule });

  } catch (error: unknown) {
    console.error('Automations PUT Exception:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Server exception: ${msg}` }, { status: 500 });
  }
}

/**
 * DELETE: Remove an automation rule
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id parameter is required.' }, { status: 400 });
    }

    const { error: deleteError } = await supabase
      .from('automations')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Rule delete database error:', deleteError);
      return NextResponse.json({ error: `Delete failed: ${deleteError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Rule successfully deleted.' });

  } catch (error: unknown) {
    console.error('Automations DELETE Critical Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Server exception: ${msg}` }, { status: 500 });
  }
}
