'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import {
  AlertCircle,
  Bot,
  Bug,
  CheckCircle2,
  Clipboard,
  Crown,
  FileText,
  FolderOpen,
  Home,
  Info,
  Lightbulb,
  ListChecks,
  Loader2,
  Menu,
  Mic,
  Moon,
  Paperclip,
  Plus,
  Search,
  Send,
  Share2,
  Sparkles,
  Star,
  SunMedium,
  User as UserIcon,
  Wand2,
} from 'lucide-react';
import ProGate from '@/components/pro-gate';
import { isProUser } from '@/lib/clip-limits';
import { createClient } from '@/utils/supabase/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  created_at: string;
  updated_at: string;
}

interface ClipRecord {
  id: string;
  content: string;
  title?: string | null;
  tags?: string[];
  pinned?: boolean;
  created_at: string;
}

type SidebarSection = 'overview' | 'clips' | 'tasks' | 'bugs' | 'features' | 'ai-actions';
type ToastType = 'success' | 'warning' | 'info';

const SIDEBAR_SECTIONS: {
  id: SidebarSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  prompt: string;
}[] = [
  { id: 'overview', label: 'Overview', icon: Home, prompt: 'Give me a clear overview of my most important recent clips.' },
  { id: 'clips', label: 'Clips', icon: FolderOpen, prompt: 'Show me the most useful clips related to my current work.' },
  { id: 'tasks', label: 'Tasks', icon: ListChecks, prompt: 'Create a task list from my saved development notes.' },
  { id: 'bugs', label: 'Bugs', icon: Bug, prompt: 'Find bug-related notes and summarize the issues.' },
  { id: 'features', label: 'Features', icon: Lightbulb, prompt: 'Collect feature ideas from my saved clips and organize them.' },
  { id: 'ai-actions', label: 'AI Actions', icon: Wand2, prompt: 'Suggest the best AI actions to run on my recent clips.' },
];

const QUICK_PROMPTS = [
  'Show me the links I copied last week.',
  'Summarize the clips related to this project.',
  'Create a task list from my development notes.',
  'Search my saved snippets for Stripe-related code.',
  'Combine all notes for this client.',
];

const AI_ACTION_PRESETS = [
  { id: 'summarize', label: 'Summarize', prompt: 'Summarize the most relevant clips for this topic.' },
  { id: 'task', label: 'Convert to Task', prompt: 'Turn the relevant notes into a concise task list.' },
  { id: 'translate', label: 'Translate', prompt: 'Translate the relevant saved content clearly.' },
  { id: 'edit', label: 'AI Edit', prompt: 'Rewrite the relevant content in a cleaner professional tone.' },
];

const deriveTitle = (content: string) => {
  const firstLine = content.trim().split('\n').map((line) => line.trim()).find(Boolean) || 'Saved ClipMind Output';
  return firstLine.length > 60 ? `${firstLine.slice(0, 57).trim()}...` : firstLine;
};

const deriveTags = (content: string) => {
  const lowered = content.toLowerCase();
  const tags = new Set<string>();
  if (/(task|todo|checklist|deadline)/.test(lowered)) tags.add('TASKS');
  if (/(bug|issue|error|fix)/.test(lowered)) tags.add('BUGS');
  if (/(feature|roadmap|idea|enhancement)/.test(lowered)) tags.add('FEATURES');
  if (/(https?:\/\/|link)/.test(lowered)) tags.add('LINK');
  if (/(code|api|react|next|stripe|typescript|javascript)/.test(lowered)) tags.add('CODE');
  if (/(summary|overview|research|meeting)/.test(lowered)) tags.add('NOTES');
  tags.add('AI');
  return Array.from(tags).slice(0, 6);
};

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function ClipMindPage() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [userPlan, setUserPlan] = useState<'free' | 'pro'>('free');
  const [userTrialEndsAt, setUserTrialEndsAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>('overview');
  const [chatTab, setChatTab] = useState<'recent' | 'pinned'>('recent');
  const [searchClipsEnabled, setSearchClipsEnabled] = useState(true);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [clips, setClips] = useState<ClipRecord[]>([]);
  const [pinnedConversationIds, setPinnedConversationIds] = useState<string[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: ToastType }[]>([]);
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  const addToast = (message: string, type: ToastType = 'success') => {
    const id = generateUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlHeight = html.style.height;
    const previousBodyHeight = body.style.height;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.height = '100%';
    body.style.height = '100%';

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      html.style.height = previousHtmlHeight;
      body.style.height = previousBodyHeight;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedTheme = localStorage.getItem('fc_clipmind_theme');
    setThemeMode(storedTheme === 'dark' ? 'dark' : 'light');

    const storedPinned = localStorage.getItem('fc_clipmind_page_pins');
    if (!storedPinned) return;
    try {
      const parsed = JSON.parse(storedPinned);
      if (Array.isArray(parsed)) {
        setPinnedConversationIds(parsed.filter((id): id is string => typeof id === 'string'));
      }
    } catch {
      localStorage.removeItem('fc_clipmind_page_pins');
    }
  }, []);

  useEffect(() => {
    const checkAuthAndFetchData = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        router.push('/login');
        return;
      }

      setUser(currentUser);

      const { data: profile } = await supabase
        .from('users')
        .select('plan, trial_ends_at')
        .eq('id', currentUser.id)
        .single();

      if (profile) {
        setUserPlan(profile.plan || 'free');
        setUserTrialEndsAt(profile.trial_ends_at);
      }

      const { data: clipRows } = await supabase
        .from('clips')
        .select('id, content, title, tags, pinned, created_at')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (clipRows) {
        setClips(clipRows);
      }

      const { data: chats, error } = await supabase
        .from('clipmind_conversations')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('updated_at', { ascending: false });

      if (!error && chats) {
        setConversations(chats);
        if (chats.length > 0) {
          setActiveConversationId(chats[0].id);
          setMessages(chats[0].messages || []);
        }
      }

      setLoading(false);
    };

    checkAuthAndFetchData();
  }, [router, supabase]);

  useEffect(() => {
    const node = chatMessagesRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  const handleToggleTheme = () => {
    const nextTheme = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(nextTheme);
    localStorage.setItem('fc_clipmind_theme', nextTheme);
  };

  const handleTogglePinnedConversation = (id: string) => {
    setPinnedConversationIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [id, ...prev].slice(0, 12);
      localStorage.setItem('fc_clipmind_page_pins', JSON.stringify(next));
      return next;
    });
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    const conv = conversations.find((conversation) => conversation.id === id);
    setMessages(conv?.messages || []);
    setSidebarOpen(false);
  };

  const handleSidebarPrompt = (section: SidebarSection) => {
    setSidebarSection(section);
    const selected = SIDEBAR_SECTIONS.find((item) => item.id === section);
    if (selected) {
      setInputText(selected.prompt);
    }
    setSidebarOpen(false);
  };

  const handleNewChat = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('clipmind_conversations')
        .insert({
          user_id: user.id,
          title: 'New Chat',
          messages: [],
        })
        .select()
        .single();

      if (error || !data) throw error || new Error('Could not create conversation.');

      setConversations((prev) => [data, ...prev]);
      setActiveConversationId(data.id);
      setMessages([]);
      setInputText('');
      addToast('New chat started.', 'success');
    } catch (err) {
      console.error('Error starting new chat:', err);
      addToast('Failed to start a new chat.', 'warning');
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isStreaming || !user) return;

    let convId = activeConversationId;

    if (!convId) {
      try {
        const { data, error } = await supabase
          .from('clipmind_conversations')
          .insert({
            user_id: user.id,
            title: text.length > 42 ? `${text.slice(0, 39)}...` : text,
            messages: [],
          })
          .select()
          .single();

        if (error || !data) throw error || new Error('Could not create conversation.');

        convId = data.id;
        setActiveConversationId(data.id);
        setConversations((prev) => [data, ...prev]);
      } catch (err) {
        console.error('Failed to initialize conversation:', err);
        addToast('Could not start a chat session.', 'warning');
        return;
      }
    }

    setInputText('');
    setShowActionMenu(false);

    const userMessage: Message = { role: 'user', content: text, created_at: new Date().toISOString() };
    const assistantPlaceholder: Message = { role: 'assistant', content: '', created_at: new Date().toISOString() };
    const outgoingHistory = [...messages, userMessage];

    setMessages([...outgoingHistory, assistantPlaceholder]);
    setIsStreaming(true);

    try {
      const response = await fetch('/api/clipmind/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationId: convId,
          history: searchClipsEnabled ? messages : [],
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP Error ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let aiResponseText = '';

      if (!reader) throw new Error('No readable stream available on response body.');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter((line) => line.trim().startsWith('data:'));

        for (const line of lines) {
          const payload = line.replace(/^data:\s*/, '').trim();
          if (payload === '[DONE]') continue;

          try {
            const parsed = JSON.parse(payload);
            const textChunk = parsed.text || '';
            if (!textChunk) continue;
            aiResponseText += textChunk;
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'assistant') {
                last.content = aiResponseText;
              }
              return next;
            });
          } catch {
            // ignore malformed chunks
          }
        }
      }

      const { data: updatedConv } = await supabase
        .from('clipmind_conversations')
        .select('*')
        .eq('id', convId)
        .single();

      if (updatedConv) {
        setConversations((prev) =>
          prev
            .map((conversation) => (conversation.id === convId ? updatedConv : conversation))
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        );
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to stream response.';
      console.error('Error fetching stream response:', err);
      addToast(errorMessage, 'warning');
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant' && last.content === '') {
          next.pop();
        }
        return next;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSaveAssistantMessage = async (message: Message, mode: 'clip' | 'task') => {
    if (!user || !message.content.trim()) return;
    const messageId = `${message.created_at}-${mode}`;
    setSavingMessageId(messageId);

    try {
      const content = message.content.trim();
      await navigator.clipboard.writeText(content);

      const baseTags = deriveTags(content);
      const tags = mode === 'task' ? [...new Set([...baseTags, 'TYPE:TASK', 'STATUS:PENDING'])] : baseTags;

      const { data: insertedClip, error } = await supabase
        .from('clips')
        .insert({
          user_id: user.id,
          title: deriveTitle(content),
          content,
          tags,
          pinned: false,
        })
        .select('id, content, title, tags, pinned, created_at')
        .single();

      if (error || !insertedClip) throw error || new Error('Failed to save clip.');

      setClips((prev) => [insertedClip, ...prev]);

      await fetch('/api/ai/autotag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }).catch(() => null);

      await fetch('/api/rag/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clip_id: insertedClip.id, content }),
      }).catch(() => null);

      addToast(mode === 'task' ? 'Saved as task clip.' : 'Saved as clip.', 'success');
    } catch (err) {
      console.error('Save assistant message error:', err);
      addToast('Could not save this assistant result.', 'warning');
    } finally {
      setSavingMessageId(null);
    }
  };

  const handleShareAssistantMessage = async (message: Message) => {
    const content = message.content.trim();
    if (!content) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title: deriveTitle(content),
          text: content,
        });
      } else {
        await navigator.clipboard.writeText(content);
        addToast('Reply copied for sharing.', 'success');
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        console.error('Share assistant message error:', err);
        addToast('Could not share this reply.', 'warning');
      }
    }
  };

  const renderInlineMarkdown = (text: string) => {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={index}
            className={`rounded-md border px-1.5 py-0.5 font-mono text-[12px] ${
              themeMode === 'dark' ? 'border-white/10 bg-white/6 text-cyan-200' : 'border-slate-200 bg-slate-100 text-indigo-700'
            }`}
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return <React.Fragment key={index}>{part}</React.Fragment>;
    });
  };

  const renderMarkdown = (text: string) => {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const nodes: React.ReactNode[] = [];
    let index = 0;

    while (index < lines.length) {
      const raw = lines[index];
      const line = raw.trim();

      if (!line) {
        index += 1;
        continue;
      }

      if (line.startsWith('```')) {
        const language = line.replace(/```/, '').trim();
        const codeLines: string[] = [];
        index += 1;
        while (index < lines.length && !lines[index].trim().startsWith('```')) {
          codeLines.push(lines[index]);
          index += 1;
        }
        index += 1;
        nodes.push(
          <div key={`code-${index}`} className={`overflow-hidden rounded-[10px] border ${
            themeMode === 'dark' ? 'border-white/8 bg-[#0b1426]' : 'border-[#EBEBF0] bg-slate-50'
          }`}>
            {language ? (
              <div className={`border-b px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] ${
                themeMode === 'dark' ? 'border-white/8 text-neutral-400' : 'border-[#EBEBF0] text-[#8888A0]'
              }`}>
                {language}
              </div>
            ) : null}
            <pre className={`overflow-x-auto px-3 py-3 text-[12px] leading-6 ${
              themeMode === 'dark' ? 'text-cyan-100' : 'text-slate-800'
            }`}>
              <code>{codeLines.join('\n')}</code>
            </pre>
          </div>
        );
        continue;
      }

      if (/^#{1,6}\s+/.test(line)) {
        nodes.push(
          <h3 key={`h-${index}`} className={`text-[15px] font-semibold leading-6 ${
            themeMode === 'dark' ? 'text-white' : 'text-slate-900'
          }`}>
            {line.replace(/^#{1,6}\s+/, '')}
          </h3>
        );
        index += 1;
        continue;
      }

      if (/^(-|\*)\s+/.test(line)) {
        const items: string[] = [];
        while (index < lines.length && /^(-|\*)\s+/.test(lines[index].trim())) {
          items.push(lines[index].trim().replace(/^(-|\*)\s+/, ''));
          index += 1;
        }
        nodes.push(
          <ul key={`ul-${index}`} className={`list-disc space-y-1.5 pl-5 text-[14px] leading-6 ${
            themeMode === 'dark' ? 'text-neutral-200 marker:text-indigo-300' : 'text-slate-700 marker:text-indigo-500'
          }`}>
            {items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item)}</li>)}
          </ul>
        );
        continue;
      }

      if (/^\d+\.\s+/.test(line)) {
        const items: string[] = [];
        while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
          items.push(lines[index].trim().replace(/^\d+\.\s+/, ''));
          index += 1;
        }
        nodes.push(
          <ol key={`ol-${index}`} className={`list-decimal space-y-1.5 pl-5 text-[14px] leading-6 ${
            themeMode === 'dark' ? 'text-neutral-200 marker:text-indigo-300' : 'text-slate-700 marker:text-indigo-500'
          }`}>
            {items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item)}</li>)}
          </ol>
        );
        continue;
      }

      if (line.includes('|')) {
        const tableRows: string[][] = [];
        while (index < lines.length && lines[index].includes('|')) {
          const normalized = lines[index].trim();
          if (!/^\|?[\s:-]+\|[\s|:-]*$/.test(normalized)) {
            tableRows.push(
              normalized
                .split('|')
                .map((cell) => cell.trim())
                .filter((cell, cellIndex, arr) => !(cell === '' && (cellIndex === 0 || cellIndex === arr.length - 1)))
            );
          }
          index += 1;
        }

        if (tableRows.length > 0) {
          const [head, ...body] = tableRows;
          nodes.push(
            <div key={`table-${index}`} className="overflow-x-auto">
              <table className={`min-w-full border-collapse text-left text-[13px] ${
                themeMode === 'dark' ? 'text-neutral-200' : 'text-slate-700'
              }`}>
                <thead>
                  <tr>
                    {head.map((cell, cellIndex) => (
                      <th key={cellIndex} className={`border px-3 py-2 font-semibold ${
                        themeMode === 'dark' ? 'border-white/8 bg-white/6' : 'border-[#EBEBF0] bg-slate-100'
                      }`}>
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className={`border px-3 py-2 align-top ${
                          themeMode === 'dark' ? 'border-white/8' : 'border-[#EBEBF0]'
                        }`}>
                          {renderInlineMarkdown(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          continue;
        }
      }

      const paragraph = [line];
      index += 1;
      while (
        index < lines.length &&
        lines[index].trim() &&
        !/^#{1,6}\s+/.test(lines[index].trim()) &&
        !/^(-|\*)\s+/.test(lines[index].trim()) &&
        !/^\d+\.\s+/.test(lines[index].trim()) &&
        !lines[index].trim().startsWith('```') &&
        !lines[index].includes('|')
      ) {
        paragraph.push(lines[index].trim());
        index += 1;
      }

      nodes.push(
        <p key={`p-${index}`} className={`text-[14px] leading-7 ${
          themeMode === 'dark' ? 'text-neutral-200' : 'text-slate-700'
        }`}>
          {renderInlineMarkdown(paragraph.join(' '))}
        </p>
      );
    }

    return <div className="space-y-3">{nodes}</div>;
  };

  const isPro = isProUser(userPlan, userTrialEndsAt);
  const isDarkTheme = themeMode === 'dark';

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) || null,
    [activeConversationId, conversations]
  );

  const filteredConversations = useMemo(() => {
    return conversations.filter((conversation) => {
      if (sidebarSection === 'overview') return true;
      const haystack = `${conversation.title} ${conversation.messages.map((message) => message.content).join(' ')}`.toLowerCase();
      if (sidebarSection === 'tasks') return /(task|todo|checklist|deadline)/.test(haystack);
      if (sidebarSection === 'bugs') return /(bug|issue|error|fix)/.test(haystack);
      if (sidebarSection === 'features') return /(feature|idea|roadmap|enhancement)/.test(haystack);
      if (sidebarSection === 'ai-actions') return /(ai|rewrite|translate|summarize|prompt)/.test(haystack);
      return /(clip|note|saved|research|meeting)/.test(haystack);
    });
  }, [conversations, sidebarSection]);

  const pinnedChats = useMemo(
    () => conversations.filter((conversation) => pinnedConversationIds.includes(conversation.id)),
    [conversations, pinnedConversationIds]
  );

  const visibleChatList = chatTab === 'pinned'
    ? pinnedChats.filter((conversation) => filteredConversations.some((item) => item.id === conversation.id))
    : filteredConversations;

  const conversationType = (conversation: Conversation) => {
    const haystack = `${conversation.title} ${conversation.messages.map((message) => message.content).join(' ')}`.toLowerCase();
    if (/(task|todo|checklist|deadline)/.test(haystack)) return { label: 'Task', icon: ListChecks };
    if (/(bug|issue|error|fix)/.test(haystack)) return { label: 'Bug', icon: Bug };
    if (/(feature|idea|roadmap|enhancement)/.test(haystack)) return { label: 'Feature', icon: Lightbulb };
    return { label: 'Chat', icon: Sparkles };
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950">
        <div className="flex items-center gap-3 text-sm text-neutral-400">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
          Loading ClipMind...
        </div>
      </div>
    );
  }

  return (
    <div className={`safe-page relative h-screen ${isDarkTheme ? 'bg-[#08111f] text-neutral-100' : 'bg-[#F8F8FC] text-slate-900'}`}>
      <div className={`pointer-events-none absolute inset-0 ${isDarkTheme ? 'bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.14),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(168,85,247,0.12),_transparent_24%)]' : 'bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.10),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(168,85,247,0.08),_transparent_20%)]'}`} />

      <ProGate isPro={isPro} feature="ClipMind" message="Unlock ClipMind" className="relative z-10 flex h-screen w-full max-w-full overflow-hidden">
        <aside className={`fixed inset-y-0 left-0 z-40 h-screen w-[min(280px,calc(100vw_-_1rem))] max-w-[calc(100vw_-_1rem)] transition-transform duration-200 md:static md:w-[280px] md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div className={`flex h-full flex-col overflow-hidden border-r ${isDarkTheme ? 'border-white/8 bg-[#0b1426]' : 'border-[#EBEBF0] bg-white'}`}>
            <div className={`shrink-0 border-b p-4 ${isDarkTheme ? 'border-white/8' : 'border-[#EBEBF0]'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${isDarkTheme ? 'text-indigo-300' : 'text-indigo-700'}`}>ClipMind</p>
                    <h1 className={`text-sm font-semibold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>AI Workspace</h1>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/dashboard')}
                  className={`rounded-xl p-2 transition ${isDarkTheme ? 'text-neutral-400 hover:bg-white/6 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
                  title="Back to dashboard"
                >
                  <Home className="h-4 w-4" />
                </button>
              </div>

              <button
                onClick={handleNewChat}
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-4 text-xs font-semibold text-white transition hover:translate-y-[-1px]"
              >
                <Plus className="h-4 w-4" />
                Create New
              </button>
            </div>

            <div className="shrink-0 p-4 pb-3">
              <p className={`mb-2 text-[10px] font-black uppercase tracking-[0.22em] ${isDarkTheme ? 'text-neutral-500' : 'text-[#8888A0]'}`}>Workspace</p>
              <div className="space-y-2">
                {SIDEBAR_SECTIONS.map((section) => {
                  const Icon = section.icon;
                  const isActive = sidebarSection === section.id;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => handleSidebarPrompt(section.id)}
                      className={`flex w-full min-w-0 items-center gap-3 rounded-2xl border px-3 py-2.5 text-left text-sm transition ${
                        isActive
                          ? isDarkTheme ? 'border-indigo-400/25 bg-indigo-500/10 text-white' : 'border-indigo-200 bg-indigo-50 text-slate-950'
                          : isDarkTheme ? 'border-white/8 bg-white/[0.02] text-neutral-300 hover:bg-white/[0.04]' : 'border-[#EBEBF0] bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${isActive ? (isDarkTheme ? 'text-indigo-300' : 'text-indigo-600') : (isDarkTheme ? 'text-neutral-500' : 'text-slate-400')}`} />
                      <span className="min-w-0 [overflow-wrap:anywhere] font-medium">{section.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4">
              <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
                <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${isDarkTheme ? 'text-neutral-500' : 'text-[#8888A0]'}`}>Chats</p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setChatTab('recent')}
                    className={`h-7 rounded-full px-2.5 text-[11px] font-medium transition ${
                      chatTab === 'recent'
                        ? isDarkTheme ? 'bg-white text-slate-950' : 'bg-slate-900 text-white'
                        : isDarkTheme ? 'bg-white/6 text-neutral-400' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    Recent
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatTab('pinned')}
                    className={`h-7 rounded-full px-2.5 text-[11px] font-medium transition ${
                      chatTab === 'pinned'
                        ? isDarkTheme ? 'bg-white text-slate-950' : 'bg-slate-900 text-white'
                        : isDarkTheme ? 'bg-white/6 text-neutral-400' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    Pinned
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="space-y-2">
                  {visibleChatList.length > 0 ? visibleChatList.map((conversation) => {
                    const meta = conversationType(conversation);
                    const Icon = meta.icon;
                    const isActive = conversation.id === activeConversationId;
                    const isPinned = pinnedConversationIds.includes(conversation.id);
                    return (
                      <div
                        key={conversation.id}
                        className={`rounded-xl border px-3 py-2.5 transition ${
                          isActive
                            ? isDarkTheme ? 'border-indigo-400/25 bg-indigo-500/10' : 'border-indigo-200 bg-indigo-50'
                            : isDarkTheme ? 'border-white/8 bg-white/[0.02]' : 'border-[#EBEBF0] bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button type="button" onClick={() => handleSelectConversation(conversation.id)} className="min-w-0 flex-1 text-left">
                            <div className="flex items-center gap-2">
                              <span className={`flex h-7 w-7 items-center justify-center rounded-full ${isDarkTheme ? 'bg-white/6 text-indigo-300' : 'bg-indigo-50 text-indigo-600'}`}>
                                <Icon className="h-3.5 w-3.5" />
                              </span>
                              <div className="min-w-0">
                                <p className={`truncate text-[13px] font-medium ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{conversation.title || 'New Chat'}</p>
                                <p className={`text-[11px] ${isDarkTheme ? 'text-neutral-500' : 'text-[#8888A0]'}`}>
                                  {new Date(conversation.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </p>
                              </div>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTogglePinnedConversation(conversation.id)}
                            className={`rounded-lg p-1.5 transition ${
                              isPinned
                                ? isDarkTheme ? 'text-amber-300' : 'text-amber-500'
                                : isDarkTheme ? 'text-neutral-500 hover:bg-white/6' : 'text-slate-400 hover:bg-slate-100'
                            }`}
                            title={isPinned ? 'Unpin chat' : 'Pin chat'}
                          >
                            <Star className={`h-3.5 w-3.5 ${isPinned ? 'fill-current' : ''}`} />
                          </button>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className={`rounded-xl border px-3 py-3 text-[12px] ${isDarkTheme ? 'border-white/8 bg-white/[0.02] text-neutral-500' : 'border-[#EBEBF0] bg-white text-[#8888A0]'}`}>
                      No chats found for this view.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={`mt-auto shrink-0 border-t p-4 ${isDarkTheme ? 'border-white/8 bg-black/20' : 'border-[#EBEBF0] bg-slate-50/70'}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${isDarkTheme ? 'bg-indigo-500/10 text-indigo-300' : 'bg-indigo-50 text-indigo-600'}`}>
                  <UserIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className={`truncate text-xs font-medium ${isDarkTheme ? 'text-neutral-200' : 'text-slate-800'}`}>{user?.email || 'Active User'}</p>
                  <div className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${isDarkTheme ? 'bg-white/6 text-indigo-300' : 'bg-indigo-50 text-indigo-700'}`}>
                    <Crown className="h-3 w-3" />
                    Pro
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            className={`fixed inset-0 z-30 md:hidden ${isDarkTheme ? 'bg-black/50' : 'bg-slate-950/20'}`}
          />
        )}

        <main className={`flex h-screen min-w-0 flex-1 flex-col overflow-hidden ${isDarkTheme ? 'bg-[#08111f]' : 'bg-[#F8F8FC]'}`}>
          <header className={`flex h-14 min-h-14 shrink-0 items-center justify-between gap-3 border-b px-3 sm:px-5 ${isDarkTheme ? 'border-white/8 bg-[#0d172b]' : 'border-[#EBEBF0] bg-white'}`}>
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className={`rounded-xl p-2 md:hidden ${isDarkTheme ? 'text-neutral-400' : 'text-slate-500'}`}
                title="Open sidebar"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <p className={`truncate text-[14px] font-semibold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>ClipMind AI</p>
                <p className={`truncate text-[12px] ${isDarkTheme ? 'text-neutral-400' : 'text-[#8888A0]'}`}>Search, summarize, organize</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-1.5 md:flex">
                <span className="rounded-full bg-[#F0EFFE] px-2.5 py-1 text-[11px] font-medium text-[#6B5CE7]">📎 {clips.length}</span>
                <span className="rounded-full bg-[#F0EFFE] px-2.5 py-1 text-[11px] font-medium text-[#6B5CE7]">👁 {filteredConversations.length}</span>
                <span className="rounded-full bg-[#F0EFFE] px-2.5 py-1 text-[11px] font-medium text-[#6B5CE7]">💬 {conversations.length}</span>
              </div>
              <button
                onClick={handleToggleTheme}
                className={`rounded-xl p-2 transition ${isDarkTheme ? 'text-neutral-300 hover:bg-white/6' : 'text-slate-500 hover:bg-slate-100'}`}
                title={isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDarkTheme ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </header>

          <div
            ref={chatMessagesRef}
            className={`flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-5 ${isDarkTheme ? 'bg-[#08111f]' : 'bg-[#F8F8FC]'}`}
          >
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
              {messages.length === 0 ? (
                <div className={`safe-card self-start rounded-[10px] border p-5 ${isDarkTheme ? 'border-white/8 bg-neutral-950' : 'border-[#EBEBF0] bg-white'}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className={`text-[15px] font-semibold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>Ask ClipMind anything from your saved work</h3>
                      <p className={`mt-1 text-[14px] leading-7 ${isDarkTheme ? 'text-neutral-400' : 'text-[#8888A0]'}`}>
                        Search notes, summarize research, find links, or turn saved ideas into tasks.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((message, index) => {
                  const isUser = message.role === 'user';
                  const saveClipId = `${message.created_at}-clip`;
                  const saveTaskId = `${message.created_at}-task`;
                  return (
                    <div key={`${message.created_at}-${index}`} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className={`w-full min-w-0 ${isUser ? 'max-w-[92%] sm:max-w-[75%]' : 'max-w-[94%] sm:max-w-[80%]'}`}>
                        <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                          {!isUser && (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white">
                              <Bot className="h-3.5 w-3.5" />
                            </div>
                          )}

                          <div className={`safe-card min-w-0 rounded-[10px] border px-4 py-3 ${
                            isUser
                              ? 'border-[#6B5CE7] bg-[#6B5CE7] text-white'
                              : isDarkTheme
                                ? 'border-white/8 bg-neutral-950 text-neutral-100'
                                : 'border-[#EBEBF0] bg-white text-slate-800'
                          }`}>
                            {message.content === '' && isStreaming && index === messages.length - 1 ? (
                              <div className={`flex items-center gap-2 text-[13px] ${isDarkTheme ? 'text-neutral-400' : 'text-[#8888A0]'}`}>
                                <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                                ClipMind is searching your saved clips...
                              </div>
                            ) : isUser ? (
                              <p className="whitespace-pre-wrap break-words text-[14px] leading-6">{message.content}</p>
                            ) : (
                              renderMarkdown(message.content)
                            )}
                          </div>

                          {isUser && (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-700">
                              Y
                            </div>
                          )}
                        </div>

                        <div className={`mt-1.5 ${isUser ? 'mr-10 text-right' : 'ml-10 text-left'}`}>
                          <p className={`text-[11px] ${isDarkTheme ? 'text-neutral-500' : 'text-[#8888A0]'}`}>
                            {new Date(message.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </p>

                          {!isUser && message.content.trim() && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <button
                                onClick={() => navigator.clipboard.writeText(message.content).then(() => addToast('Copied assistant reply.', 'success'))}
                                className={`inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] transition ${isDarkTheme ? 'border-white/8 text-neutral-400 hover:bg-white/6 hover:text-indigo-300' : 'border-[#EBEBF0] text-[#8888A0] hover:bg-[#F5F5FA] hover:text-[#6B5CE7]'}`}
                              >
                                <Clipboard className="h-3.5 w-3.5" />
                                Copy
                              </button>
                              <button
                                onClick={() => handleSaveAssistantMessage(message, 'clip')}
                                disabled={savingMessageId === saveClipId}
                                className={`inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] transition ${isDarkTheme ? 'border-white/8 text-neutral-400 hover:bg-white/6 hover:text-cyan-300 disabled:text-neutral-600' : 'border-[#EBEBF0] text-[#8888A0] hover:bg-[#F5F5FA] hover:text-[#6B5CE7] disabled:text-slate-300'}`}
                              >
                                {savingMessageId === saveClipId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                                Save Clip
                              </button>
                              <button
                                onClick={() => handleSaveAssistantMessage(message, 'task')}
                                disabled={savingMessageId === saveTaskId}
                                className={`inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] transition ${isDarkTheme ? 'border-white/8 text-neutral-400 hover:bg-white/6 hover:text-emerald-300 disabled:text-neutral-600' : 'border-[#EBEBF0] text-[#8888A0] hover:bg-[#F5F5FA] hover:text-[#6B5CE7] disabled:text-slate-300'}`}
                              >
                                {savingMessageId === saveTaskId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListChecks className="h-3.5 w-3.5" />}
                                Create Task
                              </button>
                              <button
                                onClick={() => handleShareAssistantMessage(message)}
                                className={`inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] transition ${isDarkTheme ? 'border-white/8 text-neutral-400 hover:bg-white/6 hover:text-indigo-300' : 'border-[#EBEBF0] text-[#8888A0] hover:bg-[#F5F5FA] hover:text-[#6B5CE7]'}`}
                              >
                                <Share2 className="h-3.5 w-3.5" />
                                Share
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className={`shrink-0 border-t px-3 py-2 sm:px-5 ${isDarkTheme ? 'border-white/8 bg-[#0d172b]' : 'border-[#EBEBF0] bg-white'}`}>
            <div className="safe-scroll-x mx-auto flex max-w-4xl gap-2 [scrollbar-width:none]">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => setInputText(prompt)}
                  className={`h-8 shrink-0 rounded-full border px-3 text-[12px] transition ${isDarkTheme ? 'border-white/8 bg-white/[0.03] text-neutral-300 hover:border-indigo-400/30 hover:bg-indigo-500/10 hover:text-indigo-200' : 'border-[#EBEBF0] bg-[#FAFAFA] text-slate-600 hover:border-[#6B5CE7] hover:bg-[#F0EFFE] hover:text-[#6B5CE7]'}`}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className={`shrink-0 border-t px-3 py-3 sm:px-5 ${isDarkTheme ? 'border-white/8 bg-[#0d172b]' : 'border-[#EBEBF0] bg-white'}`}>
            <div className="mx-auto flex w-full max-w-4xl min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => addToast('Attachments are coming next.', 'info')}
                className={`hidden h-9 w-9 items-center justify-center rounded-lg transition md:inline-flex ${isDarkTheme ? 'text-neutral-400 hover:bg-white/6 hover:text-indigo-300' : 'text-[#8888A0] hover:bg-[#F0EFFE] hover:text-[#6B5CE7]'}`}
                title="Attach"
              >
                <Paperclip className="h-4 w-4" />
              </button>

              <input
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Ask ClipMind..."
                className={`h-10 min-w-0 flex-1 rounded-[10px] border px-3 text-[14px] outline-none transition ${
                  isDarkTheme
                    ? 'border-white/8 bg-[#08111f] text-neutral-100 placeholder:text-neutral-500 focus:border-indigo-400/40'
                    : 'border-[#EBEBF0] bg-[#F8F8FC] text-slate-900 placeholder:text-[#8888A0] focus:border-[#6B5CE7] focus:bg-white'
                }`}
              />

              <div className="hidden items-center gap-1 sm:flex">
                <button
                  type="button"
                  onClick={() => addToast('Voice input is not ready yet.', 'info')}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition ${isDarkTheme ? 'text-neutral-400 hover:bg-white/6 hover:text-indigo-300' : 'text-[#8888A0] hover:bg-[#F0EFFE] hover:text-[#6B5CE7]'}`}
                  title="Voice"
                >
                  <Mic className="h-4 w-4" />
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowActionMenu((prev) => !prev)}
                    className={`inline-flex h-9 items-center gap-1 rounded-lg px-2.5 transition ${isDarkTheme ? 'text-neutral-400 hover:bg-white/6 hover:text-indigo-300' : 'text-[#8888A0] hover:bg-[#F0EFFE] hover:text-[#6B5CE7]'}`}
                    title="AI actions"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span className="text-[12px] font-medium">AI</span>
                  </button>

                  {showActionMenu && (
                    <div className={`absolute bottom-11 right-0 z-20 w-[min(11rem,calc(100vw_-_2rem))] max-w-full rounded-[10px] border p-1.5 shadow-lg ${isDarkTheme ? 'border-white/8 bg-neutral-950' : 'border-[#EBEBF0] bg-white'}`}>
                      {AI_ACTION_PRESETS.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => {
                            setInputText(action.prompt);
                            setShowActionMenu(false);
                          }}
                          className={`block w-full rounded-lg px-3 py-2 text-left text-[12px] transition ${isDarkTheme ? 'text-neutral-300 hover:bg-white/6' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setSearchClipsEnabled((prev) => !prev)}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition ${
                    searchClipsEnabled
                      ? isDarkTheme ? 'bg-indigo-500/12 text-indigo-200' : 'bg-[#F0EFFE] text-[#6B5CE7]'
                      : isDarkTheme ? 'text-neutral-400 hover:bg-white/6 hover:text-indigo-300' : 'text-[#8888A0] hover:bg-[#F0EFFE] hover:text-[#6B5CE7]'
                  }`}
                  title="Search clips"
                >
                  <Search className="h-4 w-4" />
                </button>
              </div>

              <button
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim() || isStreaming}
                className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] px-3.5 text-[13px] font-medium transition ${
                  !inputText.trim() || isStreaming
                    ? isDarkTheme ? 'bg-white/6 text-neutral-500' : 'bg-slate-100 text-slate-400'
                    : 'bg-[#6B5CE7] text-white hover:bg-[#5e50d8]'
                }`}
              >
                {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span className="hidden sm:inline">Send</span>
              </button>
            </div>
          </div>
        </main>
      </ProGate>

      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100%_-_2rem)] max-w-sm flex-col gap-2.5">
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isWarning = toast.type === 'warning';
          return (
            <div
              key={toast.id}
              className={`flex items-start gap-3 rounded-xl border p-3.5 shadow-2xl backdrop-blur-md ${
                isSuccess
                  ? 'border-emerald-500/20 bg-emerald-950/80 text-emerald-200'
                  : isWarning
                    ? 'border-amber-500/20 bg-amber-950/80 text-amber-200'
                    : 'border-indigo-500/20 bg-indigo-950/80 text-indigo-200'
              }`}
            >
              {isSuccess ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : isWarning ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
              ) : (
                <Info className="h-4 w-4 shrink-0 text-indigo-400" />
              )}
              <span className="text-xs leading-normal">{toast.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
