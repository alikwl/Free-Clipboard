import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

const apiKey = process.env.OPENROUTER_API_KEY || '';

interface HistoryMessage {
  role: string;
  content: string;
}

interface RankedClip {
  clip: Record<string, unknown>;
  meta: Record<string, unknown>;
  score: number;
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['and', 'the', 'for', 'you', 'with', 'what', 'find', 'show', 'here', 'this', 'that', 'from', 'about', 'most', 'have', 'been', 'were', 'any', 'how', 'who', 'why', 'can'].includes(w));
}

function formatClipContext(clip: Record<string, unknown>, index: number) {
  const title = typeof clip.title === 'string' && clip.title.trim() ? clip.title.trim() : `Clip ${index + 1}`;
  const content = typeof clip.content === 'string' ? clip.content.trim().replace(/\s+/g, ' ') : '';
  const tags = Array.isArray(clip.tags) ? clip.tags.map(String).filter(Boolean) : [];
  const savedDate = typeof clip.created_at === 'string'
    ? new Date(clip.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : 'unknown date';

  return {
    title,
    content,
    tags,
    savedDate,
  };
}

function createLocalClipMindAnswer(
  message: string,
  contextClips: Record<string, unknown>[],
  totalClipsCount: number,
  mainTopics: string,
  mostCommonType: string
) {
  const query = message.toLowerCase();
  const formatted = contextClips.slice(0, 6).map(formatClipContext);

  if (formatted.length === 0) {
    return `I don't see that in your clipboard history yet.\n\nTry saving a few related clips first, then ask ClipMind again. Your workspace currently has ${totalClipsCount} clip${totalClipsCount === 1 ? '' : 's'}.`;
  }

  const matching = formatted.filter((clip) => {
    const haystack = `${clip.title} ${clip.content} ${clip.tags.join(' ')}`.toLowerCase();
    return extractKeywords(query).some(keyword => haystack.includes(keyword));
  });
  const selected = matching.length > 0 ? matching : formatted.slice(0, 4);

  const bullets = selected.map((clip, index) => {
    const preview = clip.content.length > 180 ? `${clip.content.slice(0, 177).trim()}...` : clip.content;
    const tagsText = clip.tags.length > 0 ? ` Tags: ${clip.tags.slice(0, 4).join(', ')}.` : '';
    return `- **${clip.title}** (${clip.savedDate}): ${preview || 'No text preview available.'}${tagsText}`;
  }).join('\n');

  const prefix = query.includes('summary') || query.includes('summarize')
    ? 'Here is a local summary from your saved clips:'
    : 'OpenRouter is unavailable right now, so I searched your local clipboard context instead:';

  return `${prefix}\n\n${bullets}\n\nWorkspace signal: ${totalClipsCount} total clips, main topics: ${mainTopics}, most common type: ${mostCommonType}.\n\nThis is a local fallback answer, so it only uses the clips already visible to ClipMind context.`;
}

function streamClipMindText(
  text: string,
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  userMessage: string
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const chunks = text.match(/.{1,90}(\s|$)/g) || [text];
      let fullResponse = '';

      for (const chunk of chunks) {
        fullResponse += chunk;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
      }

      await saveConversationMessage(supabase, conversationId, userId, userMessage, fullResponse.trim());
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

async function saveConversationMessage(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  userMessage: string,
  aiMessage: string
) {
  try {
    const { data: conv } = await supabase
      .from('clipmind_conversations')
      .select('messages, title')
      .eq('id', conversationId)
      .single();

    const currentMessages = Array.isArray(conv?.messages) ? conv.messages : [];
    const newMessages = [
      ...currentMessages,
      { role: 'user', content: userMessage, created_at: new Date().toISOString() },
      { role: 'assistant', content: aiMessage, created_at: new Date().toISOString() }
    ];

    const updates: Record<string, unknown> = {
      messages: newMessages,
      updated_at: new Date().toISOString()
    };

    if (!conv?.title || conv.title === 'New Chat' || conv.title.trim() === '') {
      const cleanMsg = userMessage.trim().replace(/\n+/g, ' ');
      updates.title = cleanMsg.length > 35 ? `${cleanMsg.substring(0, 35)}...` : cleanMsg;
    }

    await supabase
      .from('clipmind_conversations')
      .update(updates)
      .eq('id', conversationId);
  } catch (err) {
    console.error('Error saving conversation messages:', err);
  }
}

import { getEmbedding } from '@/lib/embeddings';

/**
 * Identify and mask sensitive secrets in text to prevent credentials leaks
 */
function maskSensitiveCredentials(text: string): string {
  if (!text) return '';
  let masked = text;
  
  // Stripe Keys (sk_live... and sk_test...)
  masked = masked.replace(/(sk_live_[a-zA-Z0-9]{20,})/g, 'sk_live_...[MASKED STRIPE KEY]');
  masked = masked.replace(/(sk_test_[a-zA-Z0-9]{20,})/g, 'sk_test_...[MASKED STRIPE KEY]');
  
  // OpenAI & OpenRouter keys
  masked = masked.replace(/(sk-or-v1-[a-zA-Z0-9]{24,})/g, 'sk-or-v1-...[MASKED OPENROUTER KEY]');
  masked = masked.replace(/(sk-[a-zA-Z0-9]{24,})/g, 'sk-...[MASKED OPENAI KEY]');
  
  // Database URLs
  masked = masked.replace(/(db_url|database_url|postgresql:\/\/|postgres:\/\/|mongodb\+srv:\/\/)(:[^@]+)?@([a-zA-Z0-9.-]+)/gi, '$1:[MASKED_CREDENTIALS]@$3');
  
  // General passwords/secrets
  masked = masked.replace(/(password|passwd|secret)(["'\s:=]+)([a-zA-Z0-9_!@#$%^&*()+-]{4,100})/gi, '$1$2[MASKED SECRET]');
  
  return masked;
}

interface ParsedIntent {
  dateFilter: Date | null;
  typeFilter: string | null;
  tagFilter: string | null;
  folderFilter: string | null;
  keywords: string[];
}

/**
 * Heuristic parser to extract semantic filters and queries from a prompt
 */
async function parseSearchIntent(query: string, userFolders: { id: string; name: string }[], userTags: string[]): Promise<ParsedIntent> {
  const lowered = query.toLowerCase();
  
  // 1. Date Range Filters
  let dateFilter: Date | null = null;
  if (lowered.includes('today')) {
    dateFilter = new Date();
    dateFilter.setHours(0, 0, 0, 0);
  } else if (lowered.includes('yesterday')) {
    dateFilter = new Date();
    dateFilter.setDate(dateFilter.getDate() - 1);
    dateFilter.setHours(0, 0, 0, 0);
  } else if (lowered.includes('last week') || lowered.includes('past week')) {
    dateFilter = new Date();
    dateFilter.setDate(dateFilter.getDate() - 7);
  } else if (lowered.includes('last month') || lowered.includes('past month')) {
    dateFilter = new Date();
    dateFilter.setDate(dateFilter.getDate() - 30);
  }

  // 2. Content Type Filters
  let typeFilter: string | null = null;
  if (/(code|snippet|function|script)/.test(lowered)) {
    typeFilter = 'code';
  } else if (/(link|url|website|href)/.test(lowered)) {
    typeFilter = 'url';
  } else if (/(email|mail)/.test(lowered)) {
    typeFilter = 'email';
  } else if (/(bug|error|exception|crash|stacktrace)/.test(lowered)) {
    typeFilter = 'bug';
  } else if (/(task|todo|todo list|checklist)/.test(lowered)) {
    typeFilter = 'task';
  }

  // 3. Tag Filters
  let tagFilter: string | null = null;
  // Look for exact matches in user's tags
  for (const tag of userTags) {
    if (lowered.includes(tag.toLowerCase())) {
      tagFilter = tag;
      break;
    }
  }
  // Support explicit #tag or tag:tag notation
  const tagMatch = query.match(/(?:#|tag:)([a-zA-Z0-9_-]+)/i);
  if (tagMatch && tagMatch[1]) {
    tagFilter = tagMatch[1];
  }

  // 4. Folder Filters
  let folderFilter: string | null = null;
  for (const folder of userFolders) {
    if (lowered.includes(folder.name.toLowerCase())) {
      folderFilter = folder.id;
      break;
    }
  }

  // 5. Query keywords
  const keywords = extractKeywords(query);

  return {
    dateFilter,
    typeFilter,
    tagFilter,
    folderFilter,
    keywords,
  };
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user and verify plan status from database
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('plan, trial_ends_at')
      .eq('id', user.id)
      .single();

    const isTrial = profile?.trial_ends_at && new Date(profile.trial_ends_at) > new Date();
    const isPro = profile?.plan === 'pro' || isTrial;

    if (!profile || !isPro) {
      return NextResponse.json(
        { error: 'ClipMind is a premium Pro feature. Upgrade now to unlock your personal clipboard AI!' },
        { status: 403 }
      );
    }

    // 2. Parse request payload
    const { message, conversationId, history = [] } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message must be a non-empty string.' }, { status: 400 });
    }

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required.' }, { status: 400 });
    }

    // 3. Load user folders and metadata for intent parsing
    const { data: userFolders } = await supabase
      .from('folders')
      .select('id, name')
      .eq('user_id', user.id);

    const { data: userClips } = await supabase
      .from('clips')
      .select('tags')
      .eq('user_id', user.id);

    const userTagsSet = new Set<string>();
    userClips?.forEach(c => {
      if (Array.isArray(c.tags)) {
        c.tags.forEach(t => userTagsSet.add(String(t)));
      }
    });

    const parsedIntent = await parseSearchIntent(message, userFolders || [], Array.from(userTagsSet));

    // 4. Retrieve Context via Hybrid Search: Semantic Vector + Keyword Match
    const queryEmbedding = await getEmbedding(message);
    
    // Perform Semantic Search RPC
    const { data: vectorMatches, error: matchError } = await supabase.rpc('match_clips', {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: 30,
      p_user_id: user.id,
    });

    if (matchError) {
      console.warn('pgvector semantic match RPC failed. Falling back to keyword search only:', matchError.message);
    }

    // Perform Keyword/Text Search
    let textMatchesQuery = supabase
      .from('clips')
      .select('id, content, title, tags, folder_id, created_at')
      .eq('user_id', user.id);

    // Apply basic text matching based on derived keywords
    if (parsedIntent.keywords.length > 0) {
      const matchConditions = parsedIntent.keywords.map(kw => `content.ilike.%${kw}%,title.ilike.%${kw}%`).join(',');
      textMatchesQuery = textMatchesQuery.or(matchConditions);
    }

    const { data: textMatches } = await textMatchesQuery.limit(30);

    // Retrieve clip details for vector matches
    const vectorClipIds = (vectorMatches || []).map((v: { clip_id: string }) => v.clip_id);
    let vectorClips: Record<string, any>[] = [];
    
    if (vectorClipIds.length > 0) {
      const { data: fetchedVectorClips } = await supabase
        .from('clips')
        .select('id, content, title, tags, folder_id, created_at')
        .in('id', vectorClipIds);
      vectorClips = fetchedVectorClips || [];
    }

    // Merge streams and apply hybrid scoring (RRF / reciprocal rank fusion style scoring)
    const clipsMap = new Map<string, Record<string, any>>();
    const textScores = new Map<string, number>();
    const vectorScores = new Map<string, number>();

    // Setup text rankings
    if (textMatches) {
      textMatches.forEach((clip, index) => {
        clipsMap.set(clip.id, clip);
        textScores.set(clip.id, 1 - (index / 30));
      });
    }

    // Setup vector rankings
    if (vectorMatches) {
      vectorMatches.forEach((match: { clip_id: string; similarity: number }, index: number) => {
        const clip = vectorClips.find(c => c.id === match.clip_id);
        if (clip) {
          clipsMap.set(clip.id, clip);
          vectorScores.set(clip.id, match.similarity);
        }
      });
    }

    // Combine all clips
    const hybridClips: { clip: Record<string, any>; score: number }[] = [];
    
    for (const [id, clip] of clipsMap.entries()) {
      const semScore = vectorScores.get(id) || 0;
      const keyScore = textScores.get(id) || 0;
      // Weighted score: 70% Semantic Vector, 30% Keyword overlap
      const totalScore = (semScore * 0.7) + (keyScore * 0.3);
      hybridClips.push({ clip, score: totalScore });
    }

    // Sort by hybrid score descending
    hybridClips.sort((a, b) => b.score - a.score);

    // Fetch matching clip_metadata for additional filter checks
    const { data: clipsMetadata } = await supabase
      .from('clip_metadata')
      .select('clip_id, clip_type, entities, topics, keywords')
      .eq('user_id', user.id);

    // Apply parsed filters
    const filteredClips = hybridClips
      .map(hc => hc.clip)
      .filter(clip => {
        const meta = clipsMetadata?.find(m => m.clip_id === clip.id);
        
        // 1. Date Filter
        if (parsedIntent.dateFilter) {
          const clipDate = new Date(clip.created_at);
          if (clipDate < parsedIntent.dateFilter) return false;
        }

        // 2. Type Filter
        if (parsedIntent.typeFilter) {
          const clipType = meta?.clip_type || 'note';
          if (clipType !== parsedIntent.typeFilter) return false;
        }

        // 3. Tag Filter
        if (parsedIntent.tagFilter) {
          const tagUpper = parsedIntent.tagFilter.toUpperCase();
          const hasTag = Array.isArray(clip.tags) && clip.tags.map((t: string) => t.toUpperCase()).includes(tagUpper);
          const hasMetaTag = Array.isArray(meta?.topics) && meta.topics.map((t: string) => t.toUpperCase()).includes(tagUpper);
          if (!hasTag && !hasMetaTag) return false;
        }

        // 4. Folder Filter
        if (parsedIntent.folderFilter) {
          if (clip.folder_id !== parsedIntent.folderFilter) return false;
        }

        return true;
      });

    // Mask sensitive keys and passwords in retrieved clips before passing to LLM context
    const contextClips: any[] = filteredClips.slice(0, 8).map((clip: any) => ({
      ...clip,
      content: maskSensitiveCredentials(clip.content)
    }));

    // Find the folder names for citations
    const getFolderName = (folderId: string | null) => {
      if (!folderId) return 'none';
      const folder = userFolders?.find(f => f.id === folderId);
      return folder ? folder.name : 'unknown folder';
    };

    // total clip count
    const totalClipsCount = clipsMap.size || filteredClips.length;

    // Aggregate top 5 topics for prompt context
    const topicCounts: Record<string, number> = {};
    clipsMetadata?.forEach(m => {
      if (Array.isArray(m.topics)) {
        m.topics.forEach((t: string) => {
          const topic = t.trim();
          if (topic) {
            topicCounts[topic] = (topicCounts[topic] || 0) + 1;
          }
        });
      }
    });
    
    const mainTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(x => x[0])
      .join(', ') || 'none';

    // Find most common clip type
    const typeCounts: Record<string, number> = {};
    clipsMetadata?.forEach(m => {
      const type = m.clip_type || 'text';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    
    const mostCommonType = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 1)
      .map(x => x[0])[0] || 'text';

    // Format top clips as prompt reference blocks
    const injectedContext = contextClips
      .map((clip: any, idx: number) => {
        const cleanContent = clip.content.trim().replace(/\s+/g, ' ').substring(0, 300);
        const tagsStr = Array.isArray(clip.tags) ? clip.tags.join(', ') : 'none';
        const folderName = getFolderName(clip.folder_id);
        const savedDate = new Date(clip.created_at).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
        
        return `Clip [${idx + 1}]: "${cleanContent}${clip.content.length > 300 ? '...' : ''}"\n   Title: "${clip.title || 'Untitled'}"\n   Folder: [${folderName}] | Tags: [${tagsStr}] | Saved: [${savedDate}]`;
      })
      .join('\n\n');

    // Build standard system prompt
    const systemPrompt = `You are ClipMind, a personal AI assistant with access ONLY to this user's clipboard history. Help them find, understand, and build on their saved content.

User's knowledge summary:
- Total clips: ${totalClipsCount}
- Main topics: ${mainTopics}
- Most saved type: ${mostCommonType}

Relevant clips retrieved from user's clipboard history matching this query:
${injectedContext || 'No relevant clips found matching this specific query.'}

Rules:
1. ONLY reference content that is directly supported by the user's clips listed above.
2. If the user asks about something not present in their clips or not matching the injected context, respond exactly with: "I don't see that in your clipboard history yet." Then, if helpful, suggest checking their dashboard filters.
3. Be highly specific: mention which clip you are referring to, and mention exactly when it was saved (e.g. "Saved: May 24, 2026") and which Folder it belongs to.
4. Keep answers concise, premium, and structured using clean markdown bullet points where appropriate.
5. Proactively suggest related tags or clips from their context when relevant to expand their ideas.
6. Some sensitive API keys or passwords in the clips above have been masked with [MASKED...] placeholders to protect user privacy. If a clip contains masked values, explain to the user that it contains a secure credential that is protected by default. Never attempt to guess or hallucinate the masked keys.`;

    // Map history to standard chat format
    const formattedHistory = history.map((h: HistoryMessage) => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.content
    })).slice(-10); // feed last 10 messages for memory conservation

    if (!apiKey) {
      console.error('OPENROUTER_API_KEY environment variable is not defined. Using local ClipMind fallback.');
      const fallbackAnswer = createLocalClipMindAnswer(message, contextClips, totalClipsCount, mainTopics, mostCommonType);
      return streamClipMindText(fallbackAnswer, supabase, conversationId, user.id, message);
    }

    // 5. OpenRouter streaming call
    let response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://freeclipboard.com',
        'X-Title': 'FreeClipboard',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat-v3-0324:free',
        messages: [
          { role: 'system', content: systemPrompt },
          ...formattedHistory,
          { role: 'user', content: message }
        ],
        stream: true,
        temperature: 0.3,
        max_tokens: 1200,
      }),
    });

    // Fallback if primary model fails
    if (!response.ok) {
      console.warn(`DeepSeek primary stream failed with status ${response.status}. Retrying fallback auto-router...`);
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://freeclipboard.com',
          'X-Title': 'FreeClipboard',
        },
        body: JSON.stringify({
          model: 'openrouter/free',
          messages: [
            { role: 'system', content: systemPrompt },
            ...formattedHistory,
            { role: 'user', content: message }
          ],
          stream: true,
          temperature: 0.3,
          max_tokens: 1200,
        }),
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error('All OpenRouter endpoints failed streaming:', errText);
      const fallbackAnswer = createLocalClipMindAnswer(message, contextClips, totalClipsCount, mainTopics, mostCommonType);
      return streamClipMindText(fallbackAnswer, supabase, conversationId, user.id, message);
    }

    // 6. Pipe SSE response to client
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = '';
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        try {
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep partial line in buffer

            for (const line of lines) {
              const cleanLine = line.trim();
              if (!cleanLine.startsWith('data:')) continue;
              const dataStr = cleanLine.replace(/^data:\s*/, '').trim();

              if (dataStr === '[DONE]') continue;

              try {
                const parsed = JSON.parse(dataStr);
                const text = parsed?.choices?.[0]?.delta?.content || '';
                if (text) {
                  fullResponse += text;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
                }
              } catch {
                // Ignore parsing errors for partial JSON chunks
              }
            }
          }

          // Handle any remaining lines in buffer
          if (buffer.trim().startsWith('data:')) {
            const dataStr = buffer.trim().replace(/^data:\s*/, '').trim();
            if (dataStr !== '[DONE]') {
              try {
                const parsed = JSON.parse(dataStr);
                const text = parsed?.choices?.[0]?.delta?.content || '';
                if (text) {
                  fullResponse += text;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
                }
              } catch {}
            }
          }

          // Async save to database
          if (fullResponse) {
            await saveConversationMessage(supabase, conversationId, user.id, message, fullResponse);
          }
        } catch (err) {
          console.error('Error during streaming read:', err);
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: unknown) {
    console.error('ClipMind Chat API critical error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}

