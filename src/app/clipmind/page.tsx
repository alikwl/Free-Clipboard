'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import ProGate from '@/components/pro-gate';
import { isProUser } from '@/lib/clip-limits';
import {
  MessageSquare,
  Plus,
  Trash2,
  Send,
  Home,
  Menu,
  Crown,
  Sparkles,
  Loader2,
  User as UserIcon,
  CheckCircle2,
  AlertCircle,
  Info
} from 'lucide-react';

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

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function ClipMindPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [userPlan, setUserPlan] = useState<'free' | 'pro'>('free');
  const [userTrialEndsAt, setUserTrialEndsAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Conversations list & active states
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  
  // Text area & sending states
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Toast notifications state
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'warning' | 'info' }[]>([]);
  
  // Scrollable container reference
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Add toast helper
  const addToast = (message: string, type: 'success' | 'warning' | 'info' = 'success') => {
    const id = generateUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  // Scroll to bottom helper
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initial Auth & Plan checks
  useEffect(() => {
    const supabase = createClient();
    
    const checkAuthAndFetchData = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        router.push('/login');
        return;
      }
      setUser(currentUser);

      // Fetch user profile plan
      const { data: profile } = await supabase
        .from('users')
        .select('plan, trial_ends_at')
        .eq('id', currentUser.id)
        .single();
      
      if (profile) {
        setUserPlan(profile.plan || 'free');
        setUserTrialEndsAt(profile.trial_ends_at);
      }

      // Fetch user conversations
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
  }, [router]);

  // Sidebar: Start new conversation
  const handleNewChat = async () => {
    if (!user) return;
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('clipmind_conversations')
        .insert({
          user_id: user.id,
          title: 'New Chat',
          messages: []
        })
        .select()
        .single();

      if (!error && data) {
        setConversations(prev => [data, ...prev]);
        setActiveConversationId(data.id);
        setMessages([]);
        addToast('New chat started!', 'success');
      } else {
        throw error;
      }
    } catch (err) {
      console.error('Error starting new chat:', err);
      addToast('Failed to start a new chat.', 'warning');
    }
  };

  // Sidebar: Delete active/inactive conversation
  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat history?')) return;

    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('clipmind_conversations')
        .delete()
        .eq('id', id);

      if (!error) {
        setConversations(prev => prev.filter(c => c.id !== id));
        if (activeConversationId === id) {
          const remaining = conversations.filter(c => c.id !== id);
          if (remaining.length > 0) {
            setActiveConversationId(remaining[0].id);
            setMessages(remaining[0].messages || []);
          } else {
            setActiveConversationId(null);
            setMessages([]);
          }
        }
        addToast('Conversation deleted.', 'info');
      } else {
        throw error;
      }
    } catch (err) {
      console.error('Error deleting conversation:', err);
      addToast('Failed to delete conversation.', 'warning');
    }
  };

  // Sidebar: Select an existing conversation
  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    const conv = conversations.find(c => c.id === id);
    setMessages(conv?.messages || []);
  };

  // Chat: Send message (standard submit & starter questions trigger)
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isStreaming || !user) return;

    let convId = activeConversationId;
    const supabase = createClient();

    // Create a new conversation row dynamically if none is selected
    if (!convId) {
      try {
        const { data, error } = await supabase
          .from('clipmind_conversations')
          .insert({
            user_id: user.id,
            title: text.length > 30 ? `${text.substring(0, 30)}...` : text,
            messages: []
          })
          .select()
          .single();

        if (error || !data) throw error || new Error('Invalid insert payload');

        convId = data.id;
        setActiveConversationId(data.id);
        setConversations(prev => [data, ...prev]);
      } catch (err) {
        console.error('Failed to initialize conversation:', err);
        addToast('Could not start a chat session.', 'warning');
        return;
      }
    }

    // Update state to render user's message and loading spinner for AI response
    setInputText('');
    const userMsg: Message = { role: 'user', content: text, created_at: new Date().toISOString() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsStreaming(true);

    const aiTempMsg: Message = { role: 'assistant', content: '', created_at: new Date().toISOString() };
    setMessages([...newMessages, aiTempMsg]);

    try {
      const response = await fetch('/api/clipmind/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          conversationId: convId,
          history: messages
        })
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
        const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

        for (const line of lines) {
          const dataStr = line.replace(/^data:\s*/, '').trim();
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            const textChunk = parsed.text || '';
            if (textChunk) {
              aiResponseText += textChunk;
              setMessages(prev => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last && last.role === 'assistant') {
                  last.content = aiResponseText;
                }
                return copy;
              });
            }
          } catch {}
        }
      }

      // Refresh list to update title from auto-generation
      const { data: updatedConv } = await supabase
        .from('clipmind_conversations')
        .select('*')
        .eq('id', convId)
        .single();

      if (updatedConv) {
        setConversations(prev =>
          prev
            .map(c => (c.id === convId ? updatedConv : c))
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        );
      }

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to stream response.';
      console.error('Error fetching stream response:', err);
      addToast(errorMessage, 'warning');
      
      // Remove loading indicator if AI returned empty response
      setMessages(prev => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last && last.role === 'assistant' && last.content === '') {
          copy.pop();
        }
        return copy;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  // Keyboard shortcut listener inside input area
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Safe inline markdown renderer for AI messages
  const renderInlineMarkdown = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={index} className="font-bold text-neutral-100">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={index} className="bg-black/40 px-1.5 py-0.5 rounded text-[10px] text-pink-400 font-mono border border-white/5 break-all">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  // Safe line markdown renderer for AI messages
  const parseMarkdown = (text: string): React.ReactNode[] => {
    const lines = text.split('\n');
    return lines.map((line, index) => {
      const cleanLine = line.trim();

      if (cleanLine.startsWith('```')) {
        return null; // Skip raw code blocks markers
      }

      if (cleanLine.startsWith('### ')) {
        return (
          <h4 key={index} className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-3 mb-1 font-mono">
            {cleanLine.substring(4)}
          </h4>
        );
      }
      if (cleanLine.startsWith('## ')) {
        return (
          <h3 key={index} className="text-xs font-black text-neutral-200 mt-4 mb-1.5 uppercase font-mono tracking-wider">
            {cleanLine.substring(3)}
          </h3>
        );
      }
      if (cleanLine.startsWith('# ')) {
        return (
          <h2 key={index} className="text-sm font-black text-white mt-5 mb-2 uppercase">
            {cleanLine.substring(2)}
          </h2>
        );
      }

      if (cleanLine.startsWith('- ') || cleanLine.startsWith('* ')) {
        const content = cleanLine.substring(2);
        return (
          <li key={index} className="ml-4 list-disc text-neutral-300 text-xs leading-relaxed my-0.5 select-text">
            {renderInlineMarkdown(content)}
          </li>
        );
      }

      if (cleanLine === '') {
        return <div key={index} className="h-2" />;
      }

      return (
        <p key={index} className="text-xs text-neutral-300 leading-relaxed my-1 select-text">
          {renderInlineMarkdown(cleanLine)}
        </p>
      );
    });
  };

  // Global loading states
  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
        <span className="text-xs text-neutral-500 font-medium">Loading ClipMind...</span>
      </div>
    );
  }

  const isPro = isProUser(userPlan, userTrialEndsAt);

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-indigo-950/20 text-neutral-100 flex overflow-hidden relative">
      
      <ProGate isPro={isPro} feature="ClipMind" message="Unlock ClipMind" className="flex w-full h-screen overflow-hidden">
        {/* --- SIDEBAR PANEL (260px) --- */}
        <aside className={`fixed inset-y-0 left-0 z-40 w-[260px] border-r border-white/5 bg-black/60 backdrop-blur-md flex flex-col shrink-0 transition-transform duration-300 md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
        
        {/* Sidebar Header */}
        <div className="p-4 border-b border-white/5 flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/10">
                <Sparkles className="w-4.5 h-4.5 text-white" />
              </div>
              <span className="text-sm font-black tracking-wider uppercase font-mono bg-clip-text text-transparent bg-gradient-to-r from-neutral-100 to-indigo-300">
                ClipMind
              </span>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="p-1.5 rounded-lg border border-white/5 hover:border-white/10 hover:bg-white/5 text-neutral-400 hover:text-neutral-200 transition-colors"
              title="Return to Dashboard"
            >
              <Home className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleNewChat}
            className="w-full bg-indigo-500/10 hover:bg-indigo-500/15 border border-indigo-500/20 hover:border-indigo-500/30 text-indigo-300 text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        {/* Sidebar Scrollable Chats list */}
        <div className="flex-grow overflow-y-auto p-3 flex flex-col gap-1">
          <div className="text-[9px] font-black text-neutral-500 uppercase tracking-widest px-2.5 py-1 mb-1 font-mono">
            Recent Chats
          </div>
          {conversations.length > 0 ? (
            conversations.map(conv => {
              const isActive = activeConversationId === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer border transition-all ${
                    isActive
                      ? 'border-indigo-500/30 bg-indigo-500/5 text-white font-semibold'
                      : 'border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-6">
                    <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-400' : 'text-neutral-500'}`} />
                    <span className="text-xs truncate">{conv.title || 'New Chat'}</span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteConversation(conv.id, e)}
                    className="absolute right-2 opacity-0 group-hover:opacity-100 hover:bg-neutral-800 p-1 rounded-md text-neutral-500 hover:text-rose-400 transition-all duration-200"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-neutral-600 text-xs font-mono">
              No chat logs found
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-white/5 bg-black/20 flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <UserIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-grow">
            <div className="text-xs font-semibold text-neutral-300 truncate">
              {user?.email || 'Active User'}
            </div>
            <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider font-mono flex items-center gap-1">
              <Crown className="w-2.5 h-2.5 fill-current" />
              Pro Plan
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden" />
      )}

      {/* --- MAIN CHAT CONTAINER --- */}
      <main className="flex-grow flex flex-col h-screen overflow-hidden">
        
        {/* Chat Header topbar */}
        <header className="h-[60px] border-b border-white/5 bg-black/20 px-4 md:px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 pr-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-lg border border-white/10 text-neutral-400 hover:text-white shrink-0"
              title="Open sidebar"
            >
              <Menu className="w-4 h-4" />
            </button>
            <h2 className="text-sm font-bold text-neutral-200 truncate">
              {conversations.find(c => c.id === activeConversationId)?.title || 'New Chat Session'}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full uppercase tracking-wider font-mono flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              Powered by DeepSeek
            </span>
          </div>
        </header>

        {/* Chat Messages scroll area */}
        <div className="flex-grow overflow-y-auto p-6 flex flex-col gap-6">
          {messages.length > 0 ? (
            messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={index}
                  className={`flex gap-3 max-w-[90%] md:max-w-[75%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                >
                  {/* Chat Avatar */}
                  <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center border ${
                    isUser 
                      ? 'bg-indigo-500 border-indigo-400/20 text-white' 
                      : 'bg-neutral-900 border-white/10 text-indigo-400'
                  }`}>
                    {isUser ? (
                      <UserIcon className="w-4.5 h-4.5" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                  </div>

                  {/* Chat Text Message Container */}
                  <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
                    <div className={`p-3.5 rounded-2xl border text-xs shadow-md leading-relaxed ${
                      isUser
                        ? 'bg-indigo-600 border-indigo-500 text-white rounded-tr-none'
                        : 'bg-neutral-900/40 border-white/5 text-neutral-200 rounded-tl-none backdrop-blur-sm'
                    }`}>
                      {msg.content === '' && isStreaming && index === messages.length - 1 ? (
                        <div className="flex items-center gap-2 py-1 text-neutral-400 font-mono text-[11px] animate-pulse">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                          <span>ClipMind is searching history...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {isUser ? (
                            <p className="select-text whitespace-pre-wrap">{msg.content}</p>
                          ) : (
                            parseMarkdown(msg.content)
                          )}
                        </div>
                      )}
                    </div>
                    {msg.created_at && (
                      <span className="text-[9px] text-neutral-600 font-mono uppercase tracking-widest mt-1">
                        {new Date(msg.created_at).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            /* Ambient Empty State design with starter questions */
            <div className="flex-grow flex flex-col items-center justify-center text-center max-w-xl mx-auto py-12 gap-8">
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-2xl shadow-indigo-500/20 border border-indigo-400/20 text-white animate-pulse">
                  <Sparkles className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight mt-2">
                  Unlock Your Clipboard Knowledge
                </h2>
                <p className="text-xs text-neutral-500 max-w-sm leading-relaxed">
                  ClipMind analyzes your saved dashboard history. Ask questions, extract code snippets, summarize notes, or find specific links.
                </p>
              </div>

              {/* Starter questions cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                {[
                  {
                    title: 'Analyze Recent Research',
                    desc: 'What topics have I been researching lately?',
                    color: 'from-indigo-500/20 to-indigo-600/5 hover:border-indigo-400/30 text-indigo-300'
                  },
                  {
                    title: 'Extract Saved Code',
                    desc: 'Find all code snippets I saved this week',
                    color: 'from-emerald-500/20 to-emerald-600/5 hover:border-emerald-400/30 text-emerald-300'
                  },
                  {
                    title: 'Identify Entities & Leads',
                    desc: 'What companies have I been copying content about?',
                    color: 'from-amber-500/20 to-amber-600/5 hover:border-amber-400/30 text-amber-300'
                  },
                  {
                    title: 'Audit Saved Links',
                    desc: 'Show me my most important saved links',
                    color: 'from-violet-500/20 to-violet-600/5 hover:border-violet-400/30 text-violet-300'
                  }
                ].map((q, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSendMessage(q.desc)}
                    className={`bg-neutral-900/35 border border-white/5 p-4 rounded-xl text-left cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:bg-neutral-900/60 ${q.color}`}
                  >
                    <h4 className="text-xs font-extrabold uppercase font-mono tracking-wider mb-1">
                      {q.title}
                    </h4>
                    <p className="text-[11px] text-neutral-400 leading-normal">
                      &ldquo;{q.desc}&rdquo;
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Chat input box area */}
        <footer className="p-6 bg-gradient-to-t from-neutral-950/90 to-transparent border-t border-white/5 shrink-0">
          <div className="max-w-3xl mx-auto flex gap-3 items-end bg-neutral-900/40 border border-white/5 p-3 rounded-2xl shadow-xl backdrop-blur-md">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              rows={1}
              className="flex-grow bg-transparent text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-0 resize-none max-h-32 min-h-[36px] py-2 font-sans overflow-y-auto leading-relaxed select-text"
              placeholder="Ask about your clipboard history..."
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={isStreaming || !inputText.trim()}
              className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-30 text-white w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 shadow-lg shadow-indigo-500/10 border-0"
              title="Send Message"
            >
              {isStreaming ? (
                <Loader2 className="w-4.5 h-4.5 animate-spin text-white" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          <div className="text-center text-[10px] text-neutral-600 mt-3 font-mono">
            Ctrl+Enter for newline | ClipMind processes dashboard history safely using local contexts
          </div>
        </footer>
      </main>
      </ProGate>

      {/* --- CUSTOM STACKED TOAST NOTIFICATIONS --- */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none">
        {toasts.map(toast => {
          const isSuccess = toast.type === 'success';
          const isWarning = toast.type === 'warning';
          return (
            <div
              key={toast.id}
              className={`flex items-start gap-3 p-3.5 rounded-xl shadow-2xl border backdrop-blur-md transform transition-all duration-300 animate-in slide-in-from-bottom-5 ${
                isSuccess
                  ? 'bg-emerald-950/80 border-emerald-500/20 text-emerald-200'
                  : isWarning
                  ? 'bg-amber-950/80 border-amber-500/20 text-amber-200'
                  : 'bg-indigo-950/80 border-indigo-500/20 text-indigo-200'
              }`}
            >
              {isSuccess ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : isWarning ? (
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              ) : (
                <Info className="w-4 h-4 shrink-0 text-indigo-400" />
              )}
              <span className="text-xs leading-normal select-none">{toast.message}</span>
            </div>
          );
        })}
      </div>

    </div>
  );
}
