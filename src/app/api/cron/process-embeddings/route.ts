import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getEmbedding } from '@/lib/embeddings';
import { callAI } from '@/lib/openrouter';

interface EntityResult {
  type: string;
  topics: string[];
  keywords: string[];
  entities: {
    people: string[];
    apps: string[];
    urls: string[];
    apis: string[];
    projects: string[];
    tools: string[];
    tasks: string[];
  };
}

/**
 * Standard utility to normalize names for database node keys (no spaces, lowercased, safe symbols)
 */
function normalizeNodeId(prefix: string, name: string): string {
  const safeName = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100);
  return `${prefix}_${safeName || 'unknown'}`;
}

/**
 * Basic regex extraction fallback to make graph creation 100% resilient 
 * even when OpenRouter or the internet is completely offline.
 */
function runHeuristicEntityExtraction(content: string): EntityResult {
  const lowered = content.toLowerCase();
  const topics: string[] = [];
  const keywords: string[] = [];
  const entities = {
    people: [] as string[],
    apps: [] as string[],
    urls: [] as string[],
    apis: [] as string[],
    projects: [] as string[],
    tools: [] as string[],
    tasks: [] as string[],
  };

  // 1. Detect links / URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = content.match(urlRegex) || [];
  urls.forEach(url => {
    try {
      const hostname = new URL(url).hostname;
      entities.urls.push(hostname);
    } catch {
      entities.urls.push(url.substring(0, 40));
    }
  });

  // 2. Identify common tech tools / APIs
  const techKeywords = ['stripe', 'supabase', 'firebase', 'vercel', 'nextjs', 'react', 'tailwind', 'github', 'git', 'postgres', 'sqlite', 'mongodb', 'docker', 'npm', 'pip', 'python', 'typescript', 'javascript', 'aws', 'gcp', 'openai', 'claude', 'gemini'];
  techKeywords.forEach(tech => {
    if (lowered.includes(tech)) {
      entities.tools.push(tech);
      keywords.push(tech);
    }
  });

  // 3. Detect tasks
  if (/(todo|task|checklist|fix|implement|bug|issue|deadline)/.test(lowered)) {
    entities.tasks.push('General Task');
    topics.push('tasks');
  }

  // 4. Derive basic content type
  let type = 'note';
  if (urls.length > 0) type = 'url';
  else if (/(function|const |class |import |def |impl |package )/.test(content)) type = 'code';
  else if (/(bug|error|exception|stacktrace|thread)/i.test(content)) type = 'bug';

  // Fill in placeholders
  if (topics.length === 0) topics.push('general');
  
  return {
    type,
    topics,
    keywords: keywords.slice(0, 5),
    entities,
  };
}

export async function GET(request: NextRequest) {
  return handleProcessQueue(request);
}

export async function POST(request: NextRequest) {
  return handleProcessQueue(request);
}

async function handleProcessQueue(request: NextRequest) {
  // 1. Authorization checks
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';
  
  let userFilter: string | null = null;
  const supabase = await createClient();

  if (isProduction && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // If not matching global cron token, check if there is an active authenticated user session
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
    // Only process this user's queue items
    userFilter = user.id;
  } else {
    // If running locally or with a valid CRON secret, check if called by a logged-in user
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userFilter = user.id;
    }
  }

  try {
    // 2. Fetch pending items from the queue
    let query = supabase
      .from('clip_embedding_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10); // Process in batches of 10

    if (userFilter) {
      query = query.eq('user_id', userFilter);
    }

    const { data: queueItems, error: fetchError } = await query;

    if (fetchError) {
      console.error('Queue fetch error:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch queue.' }, { status: 500 });
    }

    if (!queueItems || queueItems.length === 0) {
      return NextResponse.json({ success: true, processed: 0, message: 'Queue is empty.' });
    }

    let processedCount = 0;
    const errors: string[] = [];

    for (const item of queueItems) {
      try {
        // Mark item as processing
        await supabase
          .from('clip_embedding_queue')
          .update({ status: 'processing', attempts: (item.attempts || 0) + 1, updated_at: new Date().toISOString() })
          .eq('id', item.id);

        // Fetch clip content
        const { data: clip, error: clipError } = await supabase
          .from('clips')
          .select('*')
          .eq('id', item.clip_id)
          .single();

        if (clipError || !clip) {
          // If clip doesn't exist anymore, delete it from the queue
          await supabase.from('clip_embedding_queue').delete().eq('id', item.id);
          continue;
        }

        // Generate vector embedding
        const vector = await getEmbedding(clip.content);

        // Save vector in clip_embeddings
        const { error: embedError } = await supabase
          .from('clip_embeddings')
          .upsert({
            clip_id: clip.id,
            user_id: clip.user_id,
            embedding: vector,
          });

        if (embedError) {
          throw new Error(`Embedding save failed: ${embedError.message}`);
        }

        // Run structured entity extraction using OpenRouter
        const systemPrompt = `Analyze the provided clip content and extract structures for a semantic Knowledge Graph.
Return ONLY valid JSON in this exact schema. No markdown blocks, no formatting text, no trailing comments. Just clean, parsable JSON:
{
  "type": "code|email|url|note|quote|task|other",
  "topics": ["max 5 short topic strings"],
  "keywords": ["max 10 important words"],
  "entities": {
    "people": ["names of people mentioned"],
    "apps": ["applications/platforms, e.g. Slack, Stripe, Notion"],
    "urls": ["domain hostnames mentioned"],
    "apis": ["APIs or integration names, e.g. OpenAI API, Stripe SDK"],
    "projects": ["internal project names, initiatives, code repos"],
    "tools": ["software tools, libraries, or frameworks, e.g. React, Docker, Python"],
    "tasks": ["short descriptions of todo items, bugs, or checklist items in the text"]
  }
}`;

        let extractionResult: EntityResult;
        
        try {
          const aiResponseText = await callAI(systemPrompt, clip.content, 800);
          if (aiResponseText) {
            const cleanJson = aiResponseText
              .replace(/```json/gi, '')
              .replace(/```/g, '')
              .trim();
            extractionResult = JSON.parse(cleanJson);
          } else {
            console.warn(`AI Extraction returned empty result for clip ${clip.id}. Using heuristics fallback.`);
            extractionResult = runHeuristicEntityExtraction(clip.content);
          }
        } catch (aiErr) {
          console.warn(`AI entity extraction failed for clip ${clip.id}, running heuristic parser:`, aiErr);
          extractionResult = runHeuristicEntityExtraction(clip.content);
        }

        // Save back into standard clip_metadata table (to ensure current stats, tags continue syncing)
        await supabase
          .from('clip_metadata')
          .upsert({
            clip_id: clip.id,
            user_id: clip.user_id,
            clip_type: extractionResult.type || 'other',
            topics: extractionResult.topics || [],
            keywords: extractionResult.keywords || [],
            entities: extractionResult.entities || {},
          }, { onConflict: 'clip_id' });

        // Update the tags of the clip in the database
        const derivedClipTags = [...new Set([...(clip.tags || []), ...(extractionResult.topics || [])])].slice(0, 6);
        await supabase
          .from('clips')
          .update({ tags: derivedClipTags })
          .eq('id', clip.id);

        // Map Knowledge Graph nodes & edges
        
        // 1. Insert/Update CLIP node
        const clipTitle = clip.title || (clip.content.length > 40 ? `${clip.content.slice(0, 37).trim()}...` : clip.content);
        const isTaskNode = extractionResult.type === 'task' || extractionResult.entities.tasks.length > 0;
        await supabase
          .from('knowledge_nodes')
          .upsert({
            id: `clip_${clip.id}`,
            user_id: clip.user_id,
            name: clipTitle,
            type: isTaskNode ? 'task' : 'clip',
            properties: {
              content_preview: clip.content.substring(0, 300),
              clip_type: extractionResult.type || 'other',
              created_at: clip.created_at,
            },
          });

        // 2. Insert FOLDER node & edge (if clip is inside a folder)
        if (clip.folder_id) {
          const { data: folder } = await supabase
            .from('folders')
            .select('id, name')
            .eq('id', clip.folder_id)
            .single();

          const folderName = folder?.name || 'Folder';
          await supabase
            .from('knowledge_nodes')
            .upsert({
              id: `folder_${clip.folder_id}`,
              user_id: clip.user_id,
              name: folderName,
              type: 'folder',
              properties: {},
            });

          await supabase
            .from('knowledge_edges')
            .upsert({
              user_id: clip.user_id,
              source_node_id: `clip_${clip.id}`,
              target_node_id: `folder_${clip.folder_id}`,
              relation_type: 'belongs_to',
              properties: {},
            }, { onConflict: 'user_id,source_node_id,target_node_id,relation_type' });
        }

        // 3. Insert TAGS nodes & edges
        for (const tag of derivedClipTags) {
          const tagNodeId = normalizeNodeId('tag', tag);
          await supabase
            .from('knowledge_nodes')
            .upsert({
              id: tagNodeId,
              user_id: clip.user_id,
              name: tag.toUpperCase(),
              type: 'tag',
              properties: {},
            });

          await supabase
            .from('knowledge_edges')
            .upsert({
              user_id: clip.user_id,
              source_node_id: `clip_${clip.id}`,
              target_node_id: tagNodeId,
              relation_type: 'belongs_to',
              properties: {},
            }, { onConflict: 'user_id,source_node_id,target_node_id,relation_type' });
        }

        // 4. Insert ENTITIES nodes & edges
        const categories = Object.keys(extractionResult.entities) as Array<keyof typeof extractionResult.entities>;
        for (const category of categories) {
          const items = extractionResult.entities[category];
          if (!Array.isArray(items)) continue;

          for (const item of items) {
            if (!item || !item.trim()) continue;

            const entityNodeId = normalizeNodeId(`entity_${category}`, item);
            await supabase
              .from('knowledge_nodes')
              .upsert({
                id: entityNodeId,
                user_id: clip.user_id,
                name: item,
                type: 'entity',
                properties: { entity_type: category },
              });

            await supabase
              .from('knowledge_edges')
              .upsert({
                user_id: clip.user_id,
                source_node_id: `clip_${clip.id}`,
                target_node_id: entityNodeId,
                relation_type: 'mentions',
                properties: {},
              }, { onConflict: 'user_id,source_node_id,target_node_id,relation_type' });
          }
        }

        // 5. Connect semantically similar clips (cosine vector matching)
        const { data: similarMatches } = await supabase.rpc('match_clips', {
          query_embedding: vector,
          match_threshold: 0.6, // Similarity strength threshold
          match_count: 4,       // Get top 4 matches
          p_user_id: clip.user_id,
        });

        if (similarMatches && similarMatches.length > 0) {
          for (const match of similarMatches) {
            if (match.clip_id === clip.id) continue; // Skip matching itself

            // Ensure the target node exists in our graph
            const { count } = await supabase
              .from('knowledge_nodes')
              .select('*', { count: 'exact', head: true })
              .eq('id', `clip_${match.clip_id}`);

            if (count && count > 0) {
              await supabase
                .from('knowledge_edges')
                .upsert({
                  user_id: clip.user_id,
                  source_node_id: `clip_${clip.id}`,
                  target_node_id: `clip_${match.clip_id}`,
                  relation_type: 'similar_to',
                  properties: { strength: match.similarity },
                }, { onConflict: 'user_id,source_node_id,target_node_id,relation_type' });
            }
          }
        }

        // 6. Trigger Automations rules asynchronously
        try {
          // If clip was created in the last 60 seconds, fire clip_created, else clip_updated
          const isNewClip = new Date().getTime() - new Date(clip.created_at).getTime() < 60000;
          const triggerType = isNewClip ? 'clip_created' : 'clip_updated';

          const { data: rules } = await supabase
            .from('automations')
            .select('*')
            .eq('user_id', clip.user_id)
            .eq('trigger_type', triggerType)
            .eq('enabled', true);

          if (rules && rules.length > 0) {
            const { executeAutomation } = await import('@/lib/automations-engine');
            for (const rule of rules) {
              const result = await executeAutomation(rule, clip, supabase, false);
              
              // Insert run history log
              await supabase
                .from('automation_runs')
                .insert({
                  user_id: clip.user_id,
                  automation_id: rule.id,
                  clip_id: clip.id,
                  status: result.status,
                  logs: result.logs,
                  error_message: result.errorMessage || null,
                });
            }
          }
        } catch (autoErr) {
          console.error(`Automations trigger failure on clip ${clip.id}:`, autoErr);
        }

        // Mark item as completed in queue
        await supabase
          .from('clip_embedding_queue')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', item.id);

        processedCount++;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`Error processing queue item ${item.id}:`, errorMsg);
        errors.push(`QueueItem ${item.id}: ${errorMsg}`);

        // Update queue item as failed
        await supabase
          .from('clip_embedding_queue')
          .update({
            status: item.attempts >= 3 ? 'failed' : 'pending', // retry up to 3 times
            error_message: errorMsg,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);
      }
    }

    return NextResponse.json({
      success: true,
      processed: processedCount,
      total: queueItems.length,
      errors,
    });

  } catch (error: unknown) {
    console.error('Embedding Queue CRON Critical Error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Server exception: ${msg}` }, { status: 500 });
  }
}
