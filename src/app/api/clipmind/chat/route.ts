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

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user and verify plan status from database
    const supabase = createClient();
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

    // 2. Ensure API Key is configured
    if (!apiKey) {
      console.error('OPENROUTER_API_KEY environment variable is not defined.');
      return NextResponse.json(
        { error: 'OpenRouter API key is not configured on the server.' },
        { status: 500 }
      );
    }

    // 3. Parse request payload
    const { message, conversationId, history = [] } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message must be a non-empty string.' }, { status: 400 });
    }

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required.' }, { status: 400 });
    }

    // 4. Retrieve context: Metadata-based search + Recent clips
    // Fetch clip metadata
    const { data: metaList } = await supabase
      .from('clip_metadata')
      .select('*')
      .eq('user_id', user.id);

    // Fetch clips
    const { data: clipsList } = await supabase
      .from('clips')
      .select('*')
      .eq('user_id', user.id);

    const clipsMap = new Map();
    if (clipsList) {
      clipsList.forEach(c => clipsMap.set(c.id, c));
    }

    // Extract keywords and find matches
    const queryKeywords = extractKeywords(message);
    const rankedClips: RankedClip[] = [];

    if (metaList && clipsList) {
      for (const meta of metaList) {
        const clip = clipsMap.get(meta.clip_id);
        if (!clip) continue;

        let score = 0;

        // Overlap in topics
        if (Array.isArray(meta.topics)) {
          meta.topics.forEach((t: string) => {
            const cleanT = t.toLowerCase();
            if (queryKeywords.includes(cleanT) || message.toLowerCase().includes(cleanT)) {
              score += 3;
            }
          });
        }

        // Overlap in keywords
        if (Array.isArray(meta.keywords)) {
          meta.keywords.forEach((k: string) => {
            const cleanK = k.toLowerCase();
            if (queryKeywords.includes(cleanK)) {
              score += 1.5;
            }
          });
        }

        // Exact match in clip tags
        if (Array.isArray(clip.tags)) {
          clip.tags.forEach((tag: string) => {
            const cleanTag = tag.toLowerCase();
            if (queryKeywords.includes(cleanTag)) {
              score += 2;
            }
          });
        }

        if (score > 0) {
          rankedClips.push({ clip, meta, score });
        }
      }
    }

    // Sort ranked clips by score descending
    rankedClips.sort((a, b) => b.score - a.score);
    const top8Clips = rankedClips.slice(0, 8).map(x => x.clip);

    // Get last 20 clips by date
    const recentClips = clipsList
      ? [...clipsList]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 20)
      : [];

    // Combine top8 semantic matches and last 20 recent, maintaining uniqueness
    const contextMap = new Map();
    top8Clips.forEach(c => contextMap.set(c.id, c));
    for (const c of recentClips) {
      if (contextMap.size >= 15) break; // cap context at 15 clips
      contextMap.set(c.id, c);
    }
    const contextClips = Array.from(contextMap.values());

    // Generate clipboard metrics for system prompt
    // Total clip count
    const totalClipsCount = clipsList?.length || 0;

    // Aggregate top 5 topics
    const topicCounts: Record<string, number> = {};
    metaList?.forEach(m => {
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
    metaList?.forEach(m => {
      const type = m.clip_type || 'text';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    const mostCommonType = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 1)
      .map(x => x[0])[0] || 'text';

    // Format top 8 semantic clips (or contextual clips) as prompt reference blocks
    const injectedContext = contextClips
      .map((clip, idx) => {
        const meta = metaList?.find(m => m.clip_id === clip.id);
        const type = meta?.clip_type || 'text';
        const cleanContent = clip.content.trim().replace(/\s+/g, ' ').substring(0, 200);
        const tagsStr = Array.isArray(clip.tags) ? clip.tags.join(', ') : 'none';
        const savedDate = new Date(clip.created_at).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
        return `Clip [${idx + 1}]: "${cleanContent}${clip.content.length > 200 ? '...' : ''}"\n   Tags: [${tagsStr}] | Type: [${type}] | Saved: [${savedDate}]`;
      })
      .join('\n\n');

    // Build standard system prompt
    const systemPrompt = `You are ClipMind, a personal AI assistant with access ONLY to this user's clipboard history. Help them find, understand, and build on their saved content.

User's knowledge summary:
- Total clips: ${totalClipsCount}
- Main topics: ${mainTopics}
- Most saved type: ${mostCommonType}

Relevant clips for this query:
${injectedContext || 'No relevant clips found matching this specific query.'}

Rules:
1. ONLY reference content that is directly supported by the user's clips listed above.
2. If the user asks about something not present in their clips or not matching the injected context, respond exactly with: "I don't see that in your clipboard history yet." Then, if helpful, suggest checking their dashboard filters.
3. Be highly specific: mention which clip you are referring to, and mention exactly when it was saved (e.g. "Saved: May 24, 2026").
4. Keep answers concise, premium, and structured using clean markdown bullet points where appropriate.
5. Proactively suggest related tags or clips from their context when relevant to expand their ideas.`;

    // Map history to standard chat format
    const formattedHistory = history.map((h: HistoryMessage) => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.content
    })).slice(-10); // feed last 10 messages for memory conservation

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
        model: 'deepseek/deepseek-v4-flash:free',
        messages: [
          { role: 'system', content: systemPrompt },
          ...formattedHistory,
          { role: 'user', content: message }
        ],
        stream: true,
        temperature: 0.4,
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
          temperature: 0.4,
          max_tokens: 1200,
        }),
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error('All OpenRouter endpoints failed streaming:', errText);
      return NextResponse.json({ error: 'Failed to contact the AI model.' }, { status: 502 });
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
