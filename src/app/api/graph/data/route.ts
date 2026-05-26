import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Quick local mask to sanitize graph visual payloads
 */
function maskText(text: string): string {
  if (!text) return '';
  let masked = text;
  
  // Stripe Keys (sk_live... and sk_test...)
  masked = masked.replace(/(sk_live_[a-zA-Z0-9]{20,})/g, 'sk_live_...[MASKED]');
  masked = masked.replace(/(sk_test_[a-zA-Z0-9]{20,})/g, 'sk_test_...[MASKED]');
  
  // OpenAI & OpenRouter keys
  masked = masked.replace(/(sk-or-v1-[a-zA-Z0-9]{24,})/g, 'sk-or-v1-...[MASKED]');
  masked = masked.replace(/(sk-[a-zA-Z0-9]{24,})/g, 'sk-...[MASKED]');
  
  // Database URLs
  masked = masked.replace(/(db_url|database_url|postgresql:\/\/|postgres:\/\/|mongodb\+srv:\/\/)(:[^@]+)?@([a-zA-Z0-9.-]+)/gi, '$1:[MASKED]@$3');
  
  // General passwords/secrets
  masked = masked.replace(/(password|passwd|secret)(["'\s:=]+)([a-zA-Z0-9_!@#$%^&*()+-]{4,100})/gi, '$1$2[MASKED]');
  
  return masked;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    // Verify Pro/Trial plan status
    const { data: profile } = await supabase
      .from('users')
      .select('plan, trial_ends_at')
      .eq('id', user.id)
      .single();

    const isTrial = profile?.trial_ends_at && new Date(profile.trial_ends_at) > new Date();
    const isPro = profile?.plan === 'pro' || isTrial;

    if (!profile || !isPro) {
      return NextResponse.json({ error: 'Knowledge Graph is a Pro feature.' }, { status: 403 });
    }

    // Fetch all nodes
    const { data: nodesData, error: nodesError } = await supabase
      .from('knowledge_nodes')
      .select('*')
      .eq('user_id', user.id);

    if (nodesError) {
      console.error('Error fetching knowledge nodes:', nodesError);
      return NextResponse.json({ error: 'Failed to fetch graph nodes.' }, { status: 500 });
    }

    // Fetch all edges
    const { data: edgesData, error: edgesError } = await supabase
      .from('knowledge_edges')
      .select('*')
      .eq('user_id', user.id);

    if (edgesError) {
      console.error('Error fetching knowledge edges:', edgesError);
      return NextResponse.json({ error: 'Failed to fetch graph relationships.' }, { status: 500 });
    }

    // Sanitize node names & properties to ensure zero credential leaks
    const sanitizedNodes = (nodesData || []).map(node => {
      const sanitizedName = maskText(node.name);
      const properties = { ...(node.properties || {}) };
      
      if (properties.content_preview) {
        properties.content_preview = maskText(properties.content_preview);
      }

      return {
        id: node.id,
        name: sanitizedName,
        type: node.type,
        properties,
      };
    });

    const formattedEdges = (edgesData || []).map(edge => ({
      id: edge.id,
      source: edge.source_node_id,
      target: edge.target_node_id,
      type: edge.relation_type,
      strength: edge.properties?.strength || 0.5,
    }));

    return NextResponse.json({
      nodes: sanitizedNodes,
      edges: formattedEdges,
    });

  } catch (error: unknown) {
    console.error('Graph Data API Exception:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Server exception: ${msg}` }, { status: 500 });
  }
}
