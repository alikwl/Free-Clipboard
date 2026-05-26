'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  Clipboard, 
  CheckCircle2,
  Clock,
  Crown,
  Download,
  Edit2,
  Eye,
  Folders as FoldersIcon, 
  Grid, 
  Home, 
  Info, 
  AlertCircle,
  Link2,
  Lock,
  LogOut,
  Menu,
  Plus, 
  Puzzle,
  Search, 
  Share2,
  Sparkles,
  Star, 
  SunMedium,
  Moon,
  MessageSquare,
  Loader2,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Trash2, 
  Upload,
  X,
  Wifi,
  WifiOff,
  Languages,
  RefreshCw,
  Brain,
  BarChart3,
  Bot,
  Code2,
  FileText,
  ListChecks,
  ScanText,
  Send,
  Tags,
  User as UserIcon,
  Wand2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import ProGate from '@/components/pro-gate';
import UpgradeModal from '@/components/upgrade-modal';
import { FREE_CLIP_LIMIT, isProUser } from '@/lib/clip-limits';
import { OfflineBanner } from '@/components/offline-banner';
import { MobileBottomNav } from '@/components/mobile-bottom-nav';
import { OnboardingModal } from '@/components/onboarding-modal';
import { ClipListSkeleton } from '@/components/skeletons';

interface Clip {
  id: string;
  content: string;
  title?: string;
  tags: string[];
  pinned: boolean;
  folder_id?: string;
  created_at: string;
  metadata?: ClipEntities;
}

interface ClipVersionSnapshot {
  content: string;
  title?: string | null;
  tags: string[];
  pinned: boolean;
  folder_id?: string | null;
  saved_at: string;
}

interface ClipEntities {
  is_deleted?: boolean;
  deleted_at?: string | null;
  source_url?: string;
  source_title?: string;
  source_app?: string;
  favicon?: string;
  code_language?: string;
  capture_method?: string;
  last_used_at?: string;
  version_history?: ClipVersionSnapshot[];
}

interface Folder {
  id: string;
  name: string;
  color: string; // e.g. '#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'
  created_at: string;
}

const PRESET_COLORS = [
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Fuchsia', value: '#d946ef' }
];

const isUUID = (str: string) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

const generateUUID = () => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const getStoredUserPlan = (): 'free' | 'pro' | null => {
  if (typeof window === 'undefined') return null;
  const storedPlan = localStorage.getItem('fc_user_plan');
  return storedPlan === 'free' || storedPlan === 'pro' ? storedPlan : null;
};

interface SyncQueueItem {
  id: string;
  table: 'clips' | 'folders' | 'clip_metadata';
  action: 'insert' | 'update' | 'delete';
  payload: {
    id: string;
    content?: string;
    title?: string | null;
    tags?: string[];
    pinned?: boolean;
    folder_id?: string | null;
    name?: string;
    color?: string | null;
    created_at?: string;
    clip_id?: string;
    entities?: ClipEntities;
    clip_type?: string | null;
  };
}

type PreviewRenderMode = 'raw' | 'formatted' | 'markdown';
type DetectedClipContentType = 'markdown' | 'json' | 'html' | 'code' | 'list' | 'plain';
type NewClipContentMode = 'auto' | DetectedClipContentType;
type TaskStatus = 'pending' | 'in-progress' | 'done';
type TaskFilter = 'all' | TaskStatus;
type ClipMindAction =
  | 'summarize'
  | 'rewrite'
  | 'translate'
  | 'fix-grammar'
  | 'make-professional'
  | 'make-short'
  | 'make-friendly'
  | 'extract-tasks'
  | 'extract-keywords'
  | 'generate-title'
  | 'generate-tags'
  | 'detect-language'
  | 'explain-text'
  | 'convert-email'
  | 'convert-thread'
  | 'convert-blog-outline'
  | 'convert-checklist'
  | 'convert-json'
  | 'convert-table'
  | 'detect-sensitive-data';

interface ClipMindResult {
  action: ClipMindAction;
  label: string;
  result: string;
  applyTarget: 'content' | 'title' | 'tags' | null;
  isFallback?: boolean;
  warning?: string | null;
  parsedTags?: string[] | null;
}

interface ClipMindChatMessage {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface ClipMindConversation {
  id: string;
  title: string;
  messages: ClipMindChatMessage[];
  created_at: string;
  updated_at: string;
}

type ClipMindSidebarCategory = 'notes' | 'tasks' | 'bugs' | 'features' | 'ai-actions';
type ClipMindQuickFilter = 'pinned' | 'shared' | 'ai-generated';
type ClipMindChatTab = 'recent' | 'pinned';
type ClipMindComposerAction = 'summarize' | 'convert-task' | 'translate' | 'ai-edit';

const CLIP_MIND_DRAWER_STARTERS = [
  'Show me the links I copied last week.',
  'Summarize the clips related to this project.',
  'Create a task list from my development notes.',
  'Search my saved snippets for Stripe-related code.',
  'Generate an email draft from my clips.',
  'Combine all notes pertaining to this client.',
];

const CLIP_MIND_SIDEBAR_SECTIONS: {
  id: ClipMindSidebarCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  prompt: string;
}[] = [
  { id: 'notes', label: 'Notes', icon: FileText, prompt: 'Summarize my notes clips and highlight key takeaways.' },
  { id: 'tasks', label: 'Tasks', icon: ListChecks, prompt: 'Create a task list from my recent task-related clips.' },
  { id: 'bugs', label: 'Bugs', icon: AlertCircle, prompt: 'Show bug-related clips and summarize recurring issues.' },
  { id: 'features', label: 'Features', icon: Sparkles, prompt: 'Collect feature ideas from my clips and organize them clearly.' },
  { id: 'ai-actions', label: 'AI Actions', icon: Bot, prompt: 'Suggest the best AI actions to run on my recent clips.' },
];

const CLIP_MIND_QUICK_FILTERS: {
  id: ClipMindQuickFilter;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'pinned', label: 'Pinned', icon: Star },
  { id: 'shared', label: 'Shared', icon: Share2 },
  { id: 'ai-generated', label: 'AI-Generated', icon: Bot },
];

const CLIP_MIND_COMPOSER_ACTIONS: {
  id: ClipMindComposerAction;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  prompt: string;
}[] = [
  { id: 'summarize', label: 'Summarize', icon: Brain, prompt: 'Summarize the most relevant clips for this topic.' },
  { id: 'convert-task', label: 'Convert to Task', icon: ListChecks, prompt: 'Turn my relevant clips into a concise task list.' },
  { id: 'translate', label: 'Translate', icon: Languages, prompt: 'Translate the relevant clips and preserve their meaning clearly.' },
  { id: 'ai-edit', label: 'AI Edit', icon: Wand2, prompt: 'Rewrite and polish the relevant clips in a cleaner professional style.' },
];

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderInlineMarkdownToHtml = (value: string) => {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return html;
};

const markdownToHtml = (markdown: string) => {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const htmlParts: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      htmlParts.push(`<p>${renderInlineMarkdownToHtml(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (listType && listItems.length > 0) {
      htmlParts.push(`<${listType}>${listItems.map(item => `<li>${renderInlineMarkdownToHtml(item)}</li>`).join('')}</${listType}>`);
      listItems = [];
      listType = null;
    }
  };

  const flushCodeBlock = () => {
    if (codeBlockLines.length > 0) {
      htmlParts.push(`<pre><code>${escapeHtml(codeBlockLines.join('\n'))}</code></pre>`);
      codeBlockLines = [];
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flushParagraph();
      flushList();
      if (inCodeBlock) {
        flushCodeBlock();
      }
      inCodeBlock = !inCodeBlock;
      return;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      return;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }

    if (/^#{1,4}\s/.test(trimmed)) {
      flushParagraph();
      flushList();
      const level = trimmed.match(/^#+/)?.[0].length || 1;
      htmlParts.push(`<h${level}>${renderInlineMarkdownToHtml(trimmed.replace(/^#{1,4}\s*/, ''))}</h${level}>`);
      return;
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      flushList();
      htmlParts.push(`<blockquote>${renderInlineMarkdownToHtml(trimmed.replace(/^>\s?/, ''))}</blockquote>`);
      return;
    }

    if (/^(-|\*)\s+/.test(trimmed)) {
      flushParagraph();
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listItems.push(trimmed.replace(/^(-|\*)\s+/, ''));
      return;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listItems.push(trimmed.replace(/^\d+\.\s+/, ''));
      return;
    }

    paragraph.push(trimmed);
  });

  flushParagraph();
  flushList();
  flushCodeBlock();

  return htmlParts.join('');
};

const isValidJson = (value: string) => {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};

const detectClipContentType = (content: string): DetectedClipContentType => {
  const trimmed = content.trim();

  if (!trimmed) return 'plain';
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && isValidJson(trimmed)) return 'json';
  if (/^#{1,4}\s|\[.+\]\(.+\)|```|^- |\* |^\d+\.\s|^>/m.test(trimmed)) return 'markdown';
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return 'html';
  if (/(```|const |let |var |function |=>|import |export |<\/?[A-Za-z]|;|\{[\s\S]*\})/.test(trimmed)) return 'code';
  if (/^\d+\.\s|^- |\* /m.test(trimmed)) return 'list';
  return 'plain';
};

const smartFormatContent = (content: string, type: DetectedClipContentType) => {
  const normalized = content.replace(/\r\n/g, '\n').trim();

  if (type === 'json') {
    try {
      return JSON.stringify(JSON.parse(normalized), null, 2);
    } catch {
      return normalized;
    }
  }

  if (type === 'html') {
    return normalized
      .replace(/>\s+</g, '>\n<')
      .replace(/(<\/(div|section|article|main|header|footer|p|ul|ol|li|pre|code|table|tr|td|th)>)/g, '$1\n');
  }

  if (type === 'markdown' || type === 'code') {
    return normalized;
  }

  if (type === 'list') {
    return normalized.replace(/(?<!\n)(\d+\.\s)/g, '\n$1').replace(/(?<!\n)([-*]\s)/g, '\n$1').trim();
  }

  return normalized
    .replace(/[ \t]+\n/g, '\n')
    .replace(/(?<!\n)(\d+\.\s)/g, '\n\n$1')
    .replace(/([.!?])\s+(?=[A-Z0-9])/g, '$1\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const TASK_TYPE_TAG = 'TYPE:TASK';
const TASK_STATUS_PREFIX = 'STATUS:';

const isTaskClip = (clip: Clip) => clip.tags.some(tag => tag.toUpperCase() === TASK_TYPE_TAG);

const getTaskStatus = (clip: Clip): TaskStatus => {
  const statusTag = clip.tags.find(tag => tag.toUpperCase().startsWith(TASK_STATUS_PREFIX));
  const status = statusTag?.split(':')[1]?.toLowerCase();
  return status === 'in-progress' || status === 'done' ? status : 'pending';
};

const withTaskMetadata = (tags: string[], status: TaskStatus = 'pending') => {
  const visibleTags = tags.filter(tag => {
    const upper = tag.toUpperCase();
    return upper !== TASK_TYPE_TAG && !upper.startsWith(TASK_STATUS_PREFIX);
  });
  return [...new Set([...visibleTags, TASK_TYPE_TAG, `${TASK_STATUS_PREFIX}${status.toUpperCase()}`])];
};

const getVisibleClipTags = (clip: Clip) => clip.tags.filter(tag => {
  const upper = tag.toUpperCase();
  return upper !== TASK_TYPE_TAG && !upper.startsWith(TASK_STATUS_PREFIX);
});

const CLIP_MIND_ACTION_GROUPS: {
  title: string;
  description: string;
  accent: string;
  actions: { id: ClipMindAction; label: string; hint: string }[];
}[] = [
  {
    title: 'Write',
    description: 'Polish, shorten, or shift the tone instantly.',
    accent: 'from-fuchsia-500/20 via-violet-500/10 to-transparent',
    actions: [
      { id: 'summarize', label: 'Summarize', hint: 'Quick highlights' },
      { id: 'rewrite', label: 'Rewrite', hint: 'Cleaner phrasing' },
      { id: 'fix-grammar', label: 'Fix grammar', hint: 'Correct and smooth' },
      { id: 'make-professional', label: 'Make professional', hint: 'Sharper tone' },
      { id: 'make-short', label: 'Make short', hint: 'Condense fast' },
      { id: 'make-friendly', label: 'Make friendly', hint: 'Warmer style' },
      { id: 'translate', label: 'Translate', hint: 'Another language' },
    ],
  },
  {
    title: 'Extract',
    description: 'Pull structure, signals, and useful metadata.',
    accent: 'from-cyan-500/20 via-sky-500/10 to-transparent',
    actions: [
      { id: 'extract-tasks', label: 'Extract tasks', hint: 'Action items' },
      { id: 'extract-keywords', label: 'Extract keywords', hint: 'Key themes' },
      { id: 'generate-title', label: 'Generate title', hint: 'Better headline' },
      { id: 'generate-tags', label: 'Generate tags', hint: 'Smart labels' },
      { id: 'detect-language', label: 'Detect language', hint: 'Auto identify' },
      { id: 'detect-sensitive-data', label: 'Detect sensitive data', hint: 'Privacy scan' },
    ],
  },
  {
    title: 'Convert',
    description: 'Turn one clip into a more useful output format.',
    accent: 'from-amber-500/20 via-orange-500/10 to-transparent',
    actions: [
      { id: 'explain-text', label: 'Explain text', hint: 'Break it down' },
      { id: 'convert-email', label: 'Convert to email', hint: 'Ready to send' },
      { id: 'convert-thread', label: 'Convert to tweet/thread', hint: 'Social format' },
      { id: 'convert-blog-outline', label: 'Convert to blog outline', hint: 'Draft structure' },
      { id: 'convert-checklist', label: 'Convert to checklist', hint: 'Task format' },
      { id: 'convert-json', label: 'Convert to JSON', hint: 'Structured data' },
      { id: 'convert-table', label: 'Convert to table', hint: 'Tabular view' },
    ],
  },
];

const CLIP_MIND_ACTION_ICONS: Record<ClipMindAction, React.ComponentType<{ className?: string }>> = {
  summarize: Brain,
  rewrite: Wand2,
  translate: Languages,
  'fix-grammar': ScanText,
  'make-professional': Sparkles,
  'make-short': RefreshCw,
  'make-friendly': Bot,
  'extract-tasks': ListChecks,
  'extract-keywords': Tags,
  'generate-title': FileText,
  'generate-tags': Tags,
  'detect-language': Languages,
  'explain-text': Info,
  'convert-email': FileText,
  'convert-thread': Share2,
  'convert-blog-outline': FileText,
  'convert-checklist': ListChecks,
  'convert-json': Code2,
  'convert-table': BarChart3,
  'detect-sensitive-data': AlertCircle,
};

const MOBILE_CLIP_MIND_ACTION_GROUPS: {
  title: string;
  description: string;
  accent: string;
  actions: { id: ClipMindAction; label: string; hint: string }[];
}[] = [
  {
    title: 'Write',
    description: 'Improve wording, clarity, and tone.',
    accent: 'from-fuchsia-500/20 via-violet-500/10 to-transparent',
    actions: [
      { id: 'summarize', label: 'Summarize', hint: 'Quick highlights' },
      { id: 'rewrite', label: 'Rewrite', hint: 'Cleaner phrasing' },
      { id: 'fix-grammar', label: 'Fix grammar', hint: 'Correct and smooth' },
      { id: 'make-professional', label: 'Make professional', hint: 'Sharper tone' },
      { id: 'make-short', label: 'Make short', hint: 'Condense fast' },
    ],
  },
  {
    title: 'Organize',
    description: 'Turn raw text into useful structure.',
    accent: 'from-cyan-500/20 via-sky-500/10 to-transparent',
    actions: [
      { id: 'extract-tasks', label: 'Extract tasks', hint: 'Action items' },
      { id: 'generate-tags', label: 'Generate tags', hint: 'Smart labels' },
    ],
  },
  {
    title: 'Transform',
    description: 'Rework the clip into another format.',
    accent: 'from-amber-500/20 via-orange-500/10 to-transparent',
    actions: [
      { id: 'translate', label: 'Translate', hint: 'Another language' },
      { id: 'convert-checklist', label: 'Convert to checklist', hint: 'Task format' },
    ],
  },
  {
    title: 'Developer',
    description: 'Explain or unpack technical text.',
    accent: 'from-emerald-500/20 via-teal-500/10 to-transparent',
    actions: [
      { id: 'explain-text', label: 'Explain', hint: 'Break it down' },
    ],
  },
];

const normalizeClipEntities = (value: unknown): ClipEntities => {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  return {
    is_deleted: raw.is_deleted === true,
    deleted_at: typeof raw.deleted_at === 'string' ? raw.deleted_at : null,
    source_url: typeof raw.source_url === 'string' ? raw.source_url : undefined,
    source_title: typeof raw.source_title === 'string' ? raw.source_title : undefined,
    source_app: typeof raw.source_app === 'string' ? raw.source_app : undefined,
    favicon: typeof raw.favicon === 'string' ? raw.favicon : undefined,
    code_language: typeof raw.code_language === 'string' ? raw.code_language : undefined,
    capture_method: typeof raw.capture_method === 'string' ? raw.capture_method : undefined,
    last_used_at: typeof raw.last_used_at === 'string' ? raw.last_used_at : undefined,
    version_history: Array.isArray(raw.version_history)
      ? raw.version_history
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
          .map((item) => ({
            content: typeof item.content === 'string' ? item.content : '',
            title: typeof item.title === 'string' ? item.title : null,
            tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
            pinned: Boolean(item.pinned),
            folder_id: typeof item.folder_id === 'string' ? item.folder_id : null,
            saved_at: typeof item.saved_at === 'string' ? item.saved_at : new Date().toISOString(),
          }))
      : [],
  };
};

const isDeletedClip = (clip: Clip) => clip.metadata?.is_deleted === true;

const deriveClipTitleFromContent = (content: string) => {
  const trimmed = content.trim();
  if (!trimmed) return 'Saved Clip';
  const firstLine = trimmed.split('\n').map((line) => line.trim()).find(Boolean) || '';
  const urlMatch = trimmed.match(/https?:\/\/[^\s)]+/);
  const titleSource = urlMatch
    ? urlMatch[0].replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0]
    : firstLine.replace(/^#{1,6}\s*/, '').replace(/^[-*]\s*/, '');
  const normalized = titleSource || 'Saved Clip';
  return normalized.length > 60 ? `${normalized.slice(0, 57).trim()}...` : normalized;
};

const deriveClipTagsFromContent = (content: string) => {
  const lowered = content.toLowerCase();
  const detectedType = detectClipContentType(content);
  const tagCandidates = new Set<string>();
  if (detectedType !== 'plain') tagCandidates.add(detectedType.toUpperCase());
  if (/https?:\/\//.test(lowered)) tagCandidates.add('LINK');
  if (/(meeting|agenda|notes|action item|follow up)/.test(lowered)) tagCandidates.add('NOTES');
  if (/(todo|task|checklist|deadline)/.test(lowered)) tagCandidates.add('TASKS');
  if (/(react|next\.?js|typescript|javascript|css|tailwind|api|function|const )/.test(lowered)) tagCandidates.add('CODE');
  if (/(research|source|paper|citation|reference)/.test(lowered)) tagCandidates.add('RESEARCH');
  if (/(prompt|ai|model|openai|gemini|claude|clipmind)/.test(lowered)) tagCandidates.add('AI');
  if (tagCandidates.size === 0) tagCandidates.add('CLIP');
  return Array.from(tagCandidates).slice(0, 6);
};

const buildVersionSnapshot = (clip: Clip): ClipVersionSnapshot => ({
  content: clip.content,
  title: clip.title || null,
  tags: [...clip.tags],
  pinned: clip.pinned,
  folder_id: clip.folder_id || null,
  saved_at: new Date().toISOString(),
});

const withVersionSnapshot = (clip: Clip): ClipEntities => {
  const current = normalizeClipEntities(clip.metadata);
  const history = [buildVersionSnapshot(clip), ...(current.version_history || [])].slice(0, 12);
  return {
    ...current,
    version_history: history,
    is_deleted: false,
    deleted_at: null,
  };
};

export default function Dashboard() {
  const router = useRouter();
  const supabase = createClient();

  // --- STATE ---
  const [user, setUser] = useState<User | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  
  // Navigation & Filtering
  const [activeFilter, setActiveFilter] = useState<'all' | 'pinned' | 'folder' | 'trash'>('all');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [smartSearch, setSmartSearch] = useState(false);
  
  // Modals & Forms
  const [isNewClipOpen, setIsNewClipOpen] = useState(false);
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  
  // Form states - Clip
  const [newClipContent, setNewClipContent] = useState('');
  const [newClipTitle, setNewClipTitle] = useState('');
  const [newClipTagsString, setNewClipTagsString] = useState('');
  const [newClipFolderId, setNewClipFolderId] = useState('');
  const [newClipPinned, setNewClipPinned] = useState(false);
  const [newClipAsTask, setNewClipAsTask] = useState(false);
  const [newClipContentMode, setNewClipContentMode] = useState<NewClipContentMode>('auto');
  const [newClipAiOrganize, setNewClipAiOrganize] = useState(true);
  const newClipContentRef = useRef<HTMLTextAreaElement>(null);
  
  // Form states - Folder
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(PRESET_COLORS[0].value);
  
  // Clipboard copy state
  const [copiedClipId, setCopiedClipId] = useState<string | null>(null);

  // Rename Folder States
  const [isRenameFolderOpen, setIsRenameFolderOpen] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<Folder | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [renameFolderColor, setRenameFolderColor] = useState(PRESET_COLORS[0].value);

  // Drag and Drop States
  const [draggedOverFolderId, setDraggedOverFolderId] = useState<string | null>(null);

  // --- NEW STATES FOR INTERACTIVE FEATURES & RESPONSIVENESS ---
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'warning' | 'info' }[]>([]);
  
  // Edit Clip States
  const [isEditClipOpen, setIsEditClipOpen] = useState(false);
  const [editingClip, setEditingClip] = useState<Clip | null>(null);
  const [isClipPreviewOpen, setIsClipPreviewOpen] = useState(false);
  const [previewingClip, setPreviewingClip] = useState<Clip | null>(null);
  const [previewRenderMode, setPreviewRenderMode] = useState<PreviewRenderMode>('raw');
  const [editClipContent, setEditClipContent] = useState('');
  const [editClipTitle, setEditClipTitle] = useState('');
  const [editClipTagsString, setEditClipTagsString] = useState('');
  const editClipContentRef = useRef<HTMLTextAreaElement>(null);
  const [editClipFolderId, setEditClipFolderId] = useState('');
  const [editClipPinned, setEditClipPinned] = useState(false);
  const [editClipAsTask, setEditClipAsTask] = useState(false);
  const [editClipTaskStatus, setEditClipTaskStatus] = useState<TaskStatus>('pending');

  // Duplicate Check States
  const [isDuplicateWarningOpen, setIsDuplicateWarningOpen] = useState(false);
  const [pendingSaveAction, setPendingSaveAction] = useState<{
    type: 'create' | 'edit';
    clipData: {
      id?: string;
      title?: string;
      content: string;
      tags: string[];
      pinned: boolean;
      folder_id?: string;
    };
  } | null>(null);

  // Mobile sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [viewMode, setViewMode] = useState<'board' | 'grid' | 'list' | 'table' | 'checklist'>('grid');
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('fc_view_mode');
      if (saved === 'board' || saved === 'grid' || saved === 'list' || saved === 'table' || saved === 'checklist') {
        setViewMode(saved);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedTheme = localStorage.getItem('fc_dashboard_theme');
    const nextTheme = storedTheme === 'dark' ? 'dark' : 'light';
    setThemeMode(nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    document.documentElement.style.colorScheme = nextTheme;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncViewport = () => setIsMobileViewport(window.innerWidth < 768);
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedCompactMode = localStorage.getItem('fc_clipmind_compact_mode');
    setClipMindCompactMode(storedCompactMode === 'true');

    const storedPinnedIds = localStorage.getItem('fc_clipmind_pinned_chats');
    if (storedPinnedIds) {
      try {
        const parsed = JSON.parse(storedPinnedIds);
        if (Array.isArray(parsed)) {
          setClipMindPinnedConversationIds(parsed.filter((id): id is string => typeof id === 'string'));
        }
      } catch {
        localStorage.removeItem('fc_clipmind_pinned_chats');
      }
    }
  }, []);

  const handleSetViewMode = (mode: 'board' | 'grid' | 'list' | 'table' | 'checklist') => {
    setViewMode(mode);
    localStorage.setItem('fc_view_mode', mode);
  };

  const handleToggleTheme = () => {
    const nextTheme = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(nextTheme);
    localStorage.setItem('fc_dashboard_theme', nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    document.documentElement.style.colorScheme = nextTheme;
  };

  const handleToggleClipMindCompactMode = () => {
    setClipMindCompactMode((prev) => {
      const next = !prev;
      localStorage.setItem('fc_clipmind_compact_mode', String(next));
      return next;
    });
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const storedPlan = getStoredUserPlan();
    if (storedPlan) {
      setUserPlan(storedPlan);
      setIsPlanResolved(true);
    }
  }, []);

  // Share Modal States
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [sharingClip, setSharingClip] = useState<Clip | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareExpiry, setShareExpiry] = useState<string | null>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  // Selection & Collection sharing
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [isColShareModalOpen, setIsColShareModalOpen] = useState(false);
  const [colShareToken, setColShareToken] = useState<string | null>(null);
  const [colShareExpiry, setColShareExpiry] = useState<string | null>(null);
  const [isGeneratingColShare, setIsGeneratingColShare] = useState(false);
  const [copiedColShareLink, setCopiedColShareLink] = useState(false);
  const [colShareClipCount, setColShareClipCount] = useState(0);

  const [userPlan, setUserPlan] = useState<'free' | 'pro'>('free');
  const [isPlanResolved, setIsPlanResolved] = useState(false);
  const [userTrialEndsAt, setUserTrialEndsAt] = useState<string | null>(null);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isSnippetsModalOpen, setIsSnippetsModalOpen] = useState(false);
  const [snippets, setSnippets] = useState<{ id: string; trigger_key: string; content: string; use_count: number }[]>([]);
  const [snippetsLoading, setSnippetsLoading] = useState(false);
  const [newSnippetTrigger, setNewSnippetTrigger] = useState('');
  const [newSnippetContent, setNewSnippetContent] = useState('');
  const [snippetError, setSnippetError] = useState('');
  const [clipSummaries, setClipSummaries] = useState<Record<string, { summary: string; isFallback?: boolean; warning?: string }>>({});
  const [summarizingClipId, setSummarizingClipId] = useState<string | null>(null);
  const [collapsedSummaries, setCollapsedSummaries] = useState<Record<string, boolean>>({});
  const [clipMindResults, setClipMindResults] = useState<Record<string, ClipMindResult>>({});
  const [clipMindLoadingId, setClipMindLoadingId] = useState<string | null>(null);
  const [showClipMindMenu, setShowClipMindMenu] = useState<string | null>(null);
  const [isClipMindDrawerOpen, setIsClipMindDrawerOpen] = useState(false);
  const [clipMindConversations, setClipMindConversations] = useState<ClipMindConversation[]>([]);
  const [activeClipMindConversationId, setActiveClipMindConversationId] = useState<string | null>(null);
  const [clipMindMessages, setClipMindMessages] = useState<ClipMindChatMessage[]>([]);
  const [clipMindInput, setClipMindInput] = useState('');
  const [clipMindSidebarCategory, setClipMindSidebarCategory] = useState<ClipMindSidebarCategory>('notes');
  const [clipMindQuickFilter, setClipMindQuickFilter] = useState<ClipMindQuickFilter | null>(null);
  const [clipMindChatTab, setClipMindChatTab] = useState<ClipMindChatTab>('recent');
  const [clipMindCompactMode, setClipMindCompactMode] = useState(false);
  const [clipMindPinnedConversationIds, setClipMindPinnedConversationIds] = useState<string[]>([]);
  const [clipMindMobileQuickAction, setClipMindMobileQuickAction] = useState<ClipMindComposerAction>('summarize');
  const [isClipMindStreaming, setIsClipMindStreaming] = useState(false);
  const [isClipMindHistoryLoading, setIsClipMindHistoryLoading] = useState(false);
  const clipMindEndRef = useRef<HTMLDivElement>(null);
  const clipMindHistoryLoadedRef = useRef(false);
  const [savingClipMindMessageId, setSavingClipMindMessageId] = useState<string | null>(null);
  const [copiedTranslationId, setCopiedTranslationId] = useState<string | null>(null);
  const [rewritingClipId, setRewritingClipId] = useState<string | null>(null);
  const [pendingRewrites, setPendingRewrites] = useState<Record<string, string>>({});
  const [showRewriteMenu, setShowRewriteMenu] = useState<string | null>(null);
  const [translatingClipId, setTranslatingClipId] = useState<string | null>(null);
  const [activeTranslations, setActiveTranslations] = useState<Record<string, { text: string; lang: string }>>({});
  const [showTranslateMenu, setShowTranslateMenu] = useState<string | null>(null);
  const [mobileCardActionClip, setMobileCardActionClip] = useState<Clip | null>(null);
  const [mobileCardActionPanel, setMobileCardActionPanel] = useState<'root' | 'rewrite' | 'translate' | 'task'>('root');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Online & sync states
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [legacyClips, setLegacyClips] = useState<Clip[]>([]);
  const [legacyFolders, setLegacyFolders] = useState<Folder[]>([]);

  // Refs to avoid double trigger
  const migrationChecked = useRef(false);

  // Toast Helper
  const addToast = useCallback((message: string, type: 'success' | 'warning' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  const scrollClipMindToBottom = useCallback(() => {
    clipMindEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const closeMobileShellSurfaces = useCallback((keep?: 'sidebar' | 'clipmind' | 'new-clip' | 'new-folder' | 'upgrade' | 'snippets' | 'share' | 'collection-share') => {
    if (!isMobileViewport) return;
    if (keep !== 'sidebar') setIsSidebarOpen(false);
    if (keep !== 'clipmind') setIsClipMindDrawerOpen(false);
    setIsProfileOpen(false);
    if (keep !== 'new-clip') setIsNewClipOpen(false);
    if (keep !== 'new-folder') setIsNewFolderOpen(false);
    if (keep !== 'upgrade') {
      setIsUpgradeModalOpen(false);
      setShowUpgradeModal(false);
    }
    if (keep !== 'snippets') setIsSnippetsModalOpen(false);
    if (keep !== 'share') setIsShareModalOpen(false);
    if (keep !== 'collection-share') setIsColShareModalOpen(false);
  }, [isMobileViewport]);

  const closePrimaryClipModals = useCallback((keep?: 'new' | 'edit' | 'share' | 'preview') => {
    if (keep !== 'new') {
      setIsNewClipOpen(false);
    }
    if (keep !== 'edit') {
      setIsEditClipOpen(false);
      setEditingClip(null);
    }
    if (keep !== 'share') {
      setIsShareModalOpen(false);
      setSharingClip(null);
      setShareToken(null);
      setShareExpiry(null);
      setCopiedShareLink(false);
      setIsGeneratingShare(false);
    }
    if (keep !== 'preview') {
      setIsClipPreviewOpen(false);
      setPreviewingClip(null);
      setPreviewRenderMode('raw');
    }
  }, []);

  const openSidebarDrawer = useCallback(() => {
    closeMobileShellSurfaces('sidebar');
    setIsSidebarOpen(true);
  }, [closeMobileShellSurfaces]);

  useEffect(() => {
    if (isClipMindDrawerOpen) {
      scrollClipMindToBottom();
    }
  }, [clipMindMessages, isClipMindDrawerOpen, scrollClipMindToBottom]);

  const loadClipMindConversations = useCallback(async () => {
    if (!user) return;
    if (isClipMindHistoryLoading) return;
    setIsClipMindHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('clipmind_conversations')
        .select('id, title, messages, created_at, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(8);

      if (error) throw error;

      const conversations = (data || []).map((item) => ({
        id: item.id,
        title: typeof item.title === 'string' && item.title.trim() ? item.title : 'New chat',
        messages: Array.isArray(item.messages)
          ? item.messages.filter((msg): msg is ClipMindChatMessage => {
              if (!msg || typeof msg !== 'object') return false;
              const candidate = msg as Record<string, unknown>;
              return (candidate.role === 'user' || candidate.role === 'assistant') && typeof candidate.content === 'string';
            }).map((msg) => ({
              role: msg.role,
              content: msg.content,
              created_at: typeof msg.created_at === 'string' ? msg.created_at : new Date().toISOString(),
            }))
          : [],
        created_at: item.created_at,
        updated_at: item.updated_at,
      }));

      setClipMindConversations(conversations);
      clipMindHistoryLoadedRef.current = true;

      setActiveClipMindConversationId((currentId) => {
        const nextId = currentId && conversations.some((conversation) => conversation.id === currentId)
          ? currentId
          : conversations[0]?.id || null;

        const activeConversation = conversations.find((conversation) => conversation.id === nextId);
        setClipMindMessages(activeConversation?.messages || []);
        return nextId;
      });
    } catch (error) {
      console.error('Failed to load ClipMind conversations:', error);
      addToast('Could not load ClipMind history.', 'warning');
    } finally {
      setIsClipMindHistoryLoading(false);
    }
  }, [addToast, isClipMindHistoryLoading, supabase, user]);

  useEffect(() => {
    if (
      isClipMindDrawerOpen &&
      user &&
      isProUser(userPlan, userTrialEndsAt) &&
      !clipMindHistoryLoadedRef.current
    ) {
      loadClipMindConversations();
    }
  }, [isClipMindDrawerOpen, loadClipMindConversations, user, userPlan, userTrialEndsAt]);

  const copyClipText = useCallback((id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedClipId(id);
    addToast('Copied to clipboard!', 'success');

    confetti({
      particleCount: 15,
      spread: 30,
      origin: { y: 0.85 },
      colors: ['#8b5cf6']
    });

    setTimeout(() => {
      setCopiedClipId(null);
    }, 2000);
  }, [addToast]);

  const snippetCache = useRef<Map<string, { id: string; trigger_key: string; content: string; use_count: number }>>(new Map());

  const loadSnippets = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/snippets');
      const data = await res.json();
      if (data.success) {
        snippetCache.current.clear();
        data.snippets.forEach((s: { trigger_key: string; content: string; id: string; use_count: number }) => snippetCache.current.set(s.trigger_key, s));
      }
    } catch (err) {
      console.error('Load snippets error:', err);
    }
  }, [user]);

  const expandSnippetInTextarea = useCallback(async (
    textarea: HTMLTextAreaElement,
    setValue: (val: string) => void
  ) => {
    const cursorPos = textarea.selectionStart;
    const text = textarea.value;
    const beforeCursor = text.substring(0, cursorPos);
    const match = beforeCursor.match(/;;[a-zA-Z0-9_-]*$/);
    if (!match || match[0].length < 3) return;

    const trigger = match[0];

    // If cache is empty, load snippets first
    if (snippetCache.current.size === 0) {
      await loadSnippets();
    }

    const snippet = snippetCache.current.get(trigger);
    if (!snippet) return;

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || '';

    const resolved = snippet.content
      .replace(/\{name\}/g, firstName)
      .replace(/\{email\}/g, user?.email || '')
      .replace(/\{date\}/g, `${day}/${month}/${year}`)
      .replace(/\{time\}/g, `${hours}:${minutes}`);

    const startPos = cursorPos - trigger.length;
    const newText = text.substring(0, startPos) + resolved + text.substring(cursorPos);
    setValue(newText);

    setTimeout(() => {
      const newCursorPos = startPos + resolved.length;
      textarea.selectionStart = newCursorPos;
      textarea.selectionEnd = newCursorPos;
    }, 0);

    fetch('/api/snippets/expand?trigger=' + encodeURIComponent(trigger)).catch(() => {});
    addToast(`${trigger} expanded`, 'success');
  }, [user, addToast, loadSnippets]);

  const fetchSnippets = useCallback(async () => {
    if (!user) return;
    setSnippetsLoading(true);
    try {
      const res = await fetch('/api/snippets');
      const data = await res.json();
      if (data.success) setSnippets(data.snippets);
    } catch (err) {
      console.error('Fetch snippets error:', err);
    } finally {
      setSnippetsLoading(false);
    }
  }, [user]);

  const handleCreateSnippet = async () => {
    setSnippetError('');
    if (!newSnippetTrigger.startsWith(';;') || newSnippetTrigger.length < 3) {
      setSnippetError('Trigger must start with ;; and be at least 3 characters.');
      return;
    }
    if (!newSnippetContent.trim()) {
      setSnippetError('Content cannot be empty.');
      return;
    }
    try {
      const res = await fetch('/api/snippets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger_key: newSnippetTrigger, content: newSnippetContent }),
      });
      const data = await res.json();
      if (data.success) {
        setSnippets(prev => [data.snippet, ...prev]);
        setNewSnippetTrigger('');
        setNewSnippetContent('');
        addToast(`Snippet ${data.snippet.trigger_key} created`, 'success');
      } else {
        setSnippetError(data.error);
      }
    } catch {
      setSnippetError('Failed to create snippet.');
    }
  };

  const handleDeleteSnippet = async (id: string, trigger: string) => {
    if (!confirm(`Delete snippet ${trigger}?`)) return;
    try {
      const res = await fetch(`/api/snippets?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setSnippets(prev => prev.filter(s => s.id !== id));
        addToast(`Snippet ${trigger} deleted`, 'info');
      }
    } catch (err) {
      console.error('Delete snippet error:', err);
    }
  };

  const persistClipMetadata = useCallback(async (
    currentUser: User,
    clipId: string,
    entities: ClipEntities,
    clipType: string | null = null,
  ) => {
    const normalizedEntities = normalizeClipEntities(entities);
    const { data: existingRows, error: existingError } = await supabase
      .from('clip_metadata')
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('clip_id', clipId)
      .limit(1);

    if (existingError) throw existingError;

    const payload = {
      user_id: currentUser.id,
      clip_id: clipId,
      entities: normalizedEntities,
      clip_type: clipType || 'other',
    };

    const existingId = existingRows?.[0]?.id;
    if (existingId) {
      const { error } = await supabase
        .from('clip_metadata')
        .update(payload)
        .eq('id', existingId);
      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from('clip_metadata')
      .insert(payload);
    if (error) throw error;
  }, [supabase]);

  // Fetch Cloud Data
  const fetchData = useCallback(async (currentUser: User) => {
    try {
      const { data: dbFolders, error: foldersError } = await supabase
        .from('folders')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: true });

      if (foldersError) throw foldersError;

      const { data: dbClips, error: clipsError } = await supabase
        .from('clips')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (clipsError) throw clipsError;

      const { data: dbClipMetadata, error: clipMetadataError } = await supabase
        .from('clip_metadata')
        .select('clip_id, entities')
        .eq('user_id', currentUser.id);

      if (clipMetadataError) throw clipMetadataError;

      const metadataMap = new Map(
        (dbClipMetadata || []).map((row) => [row.clip_id, normalizeClipEntities(row.entities)])
      );

      const formattedFolders: Folder[] = (dbFolders || []).map(f => ({
        id: f.id,
        name: f.name,
        color: f.color || '#6366f1',
        created_at: f.created_at,
      }));

      const formattedClips: Clip[] = (dbClips || []).map(c => ({
        id: c.id,
        content: c.content,
        title: c.title || undefined,
        tags: c.tags || [],
        pinned: c.pinned,
        folder_id: c.folder_id || undefined,
        created_at: c.created_at,
        metadata: metadataMap.get(c.id) || {},
      }));

      setFolders(formattedFolders);
      setClips(formattedClips);

      localStorage.setItem('freeclipboard_dashboard_folders', JSON.stringify(formattedFolders));
      localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(formattedClips));
    } catch (err) {
      console.error('Error fetching cloud data:', err);
      addToast('Failed to connect to cloud. Using offline cache.', 'warning');
      
      const storedClips = localStorage.getItem('freeclipboard_dashboard_clips');
      const storedFolders = localStorage.getItem('freeclipboard_dashboard_folders');
      if (storedClips) setClips(JSON.parse(storedClips));
      if (storedFolders) setFolders(JSON.parse(storedFolders));
    } finally {
      setDataLoading(false);
    }
  }, [supabase, addToast]);

  // Enqueue action to local storage sync queue
  const enqueueAction = useCallback((table: 'clips' | 'folders' | 'clip_metadata', action: 'insert' | 'update' | 'delete', payload: SyncQueueItem['payload']) => {
    const queueItem: SyncQueueItem = {
      id: 'sync-' + Math.random().toString(36).substring(2, 9),
      table,
      action,
      payload,
    };
    const currentQueue = JSON.parse(localStorage.getItem('freeclipboard_sync_queue') || '[]');
    currentQueue.push(queueItem);
    localStorage.setItem('freeclipboard_sync_queue', JSON.stringify(currentQueue));
  }, []);

  // Trigger sync of pending queue actions
  const triggerQueueSync = useCallback(async (currentUser: User) => {
    if (typeof window === 'undefined' || !navigator.onLine) return;
    const queueStr = localStorage.getItem('freeclipboard_sync_queue');
    if (!queueStr) return;

    const queue: SyncQueueItem[] = JSON.parse(queueStr);
    if (queue.length === 0) return;

    addToast('Syncing offline changes...', 'info');
    const failedItems: SyncQueueItem[] = [];

    for (const item of queue) {
      try {
        if (item.table === 'clips') {
          if (item.action === 'insert') {
            const { error } = await supabase
              .from('clips')
              .insert({
                id: item.payload.id,
                user_id: currentUser.id,
                content: item.payload.content,
                title: item.payload.title || null,
                tags: item.payload.tags || [],
                pinned: item.payload.pinned,
                folder_id: item.payload.folder_id || null,
                created_at: item.payload.created_at,
              });
            if (error) throw error;
          } else if (item.action === 'update') {
            const { error } = await supabase
              .from('clips')
              .update({
                content: item.payload.content,
                title: item.payload.title || null,
                tags: item.payload.tags || [],
                pinned: item.payload.pinned,
                folder_id: item.payload.folder_id || null,
              })
              .eq('id', item.payload.id);
            if (error) throw error;
          } else if (item.action === 'delete') {
            const { error } = await supabase
              .from('clips')
              .delete()
              .eq('id', item.payload.id);
            if (error) throw error;
          }
        } else if (item.table === 'clip_metadata') {
          await persistClipMetadata(
            currentUser,
            item.payload.clip_id || item.payload.id,
            item.payload.entities || {},
            item.payload.clip_type || 'other',
          );
        } else if (item.table === 'folders') {
          if (item.action === 'insert') {
            const { error } = await supabase
              .from('folders')
              .insert({
                id: item.payload.id,
                user_id: currentUser.id,
                name: item.payload.name,
                color: item.payload.color || null,
                created_at: item.payload.created_at,
              });
            if (error) throw error;
          } else if (item.action === 'update') {
            const { error } = await supabase
              .from('folders')
              .update({
                name: item.payload.name,
                color: item.payload.color || null,
              })
              .eq('id', item.payload.id);
            if (error) throw error;
          } else if (item.action === 'delete') {
            const { error } = await supabase
              .from('folders')
              .delete()
              .eq('id', item.payload.id);
            if (error) throw error;
          }
        }
      } catch (err: unknown) {
        console.error('Error syncing queue item:', item, err);
        const errMsg = err instanceof Error ? err.message : '';
        const errStatus = (err as Record<string, unknown> | null)?.status;
        const isNetworkError = !navigator.onLine || errMsg.includes('fetch') || errStatus === 0;
        if (isNetworkError) {
          failedItems.push(item);
          const itemIndex = queue.indexOf(item);
          failedItems.push(...queue.slice(itemIndex + 1));
          break;
        }
      }
    }

    localStorage.setItem('freeclipboard_sync_queue', JSON.stringify(failedItems));

    if (failedItems.length === 0) {
      addToast('All offline changes synced successfully!', 'success');
      fetchData(currentUser);
    } else {
      addToast('Some offline changes failed to sync. Will retry when connection stabilizes.', 'warning');
    }
  }, [supabase, addToast, fetchData, persistClipMetadata]);

  // --- FETCH SUPABASE SESSION & PLAN ---
  useEffect(() => {
    const getUserSession = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        setUserEmail(user.email || '');
        
        // Fetch plan status from database users table
        const { data: profile } = await supabase
          .from('users')
          .select('plan, trial_ends_at')
          .eq('id', user.id)
          .single();

        if (profile?.plan) {
          setUserPlan(profile.plan);
          localStorage.setItem('fc_user_plan', profile.plan);
        }
        setIsPlanResolved(true);

        if (profile?.trial_ends_at) {
          setUserTrialEndsAt(profile.trial_ends_at);
        } else {
          setUserTrialEndsAt(null);
        }

        // Send token to extension on page mount (for refresh button)
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          window.postMessage({
            type: 'FC_AUTH_TOKEN',
            token: session.access_token,
            source: 'freeclipboard_website'
          }, window.location.origin);
        }

        // Calculate trial days left
        if (profile?.trial_ends_at && profile.plan === 'free') {
          const trialEnd = new Date(profile.trial_ends_at);
          const now = new Date();
          const diffMs = trialEnd.getTime() - now.getTime();
          const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          if (diffDays > 0) {
            setTrialDaysLeft(diffDays);
          }
        }

        // Check for migration
        if (!migrationChecked.current) {
          migrationChecked.current = true;
          const migratedFlag = localStorage.getItem(`freeclipboard_migrated_${user.id}`);
          const snoozedUntil = Number(localStorage.getItem(`freeclipboard_migration_snoozed_${user.id}`) || '0');
          const storedClips = localStorage.getItem('freeclipboard_dashboard_clips');
          const storedFolders = localStorage.getItem('freeclipboard_dashboard_folders');
          
          const parsedClips: Clip[] = storedClips ? JSON.parse(storedClips) : [];
          const parsedFolders: Folder[] = storedFolders ? JSON.parse(storedFolders) : [];

          if (!migratedFlag && parsedClips.length > 0 && snoozedUntil < Date.now()) {
            setLegacyClips(parsedClips);
            setLegacyFolders(parsedFolders);
            setIsMigrationModalOpen(true);
          } else {
            fetchData(user);
            loadSnippets();
          }
        }
      } else {
        router.push('/login');
      }
    };
    getUserSession();
  }, [supabase, router, fetchData, loadSnippets]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const dismissMigrationPrompt = useCallback((shouldSnooze = true) => {
    if (user && shouldSnooze) {
      const snoozeUntil = Date.now() + 12 * 60 * 60 * 1000;
      localStorage.setItem(`freeclipboard_migration_snoozed_${user.id}`, String(snoozeUntil));
      addToast('Migration reminder snoozed for this device.', 'info');
    }

    setIsMigrationModalOpen(false);

    if (user) {
      fetchData(user);
      loadSnippets();
    }
  }, [user, fetchData, loadSnippets, addToast]);

  // --- NETWORK STATUS TRACKING ---
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      addToast('You are back online! Syncing changes...', 'success');
      if (user) {
        triggerQueueSync(user);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      addToast('You are offline. Working in offline mode.', 'warning');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check & sync if we are online and have a user
    if (navigator.onLine && user) {
      triggerQueueSync(user);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user, addToast, triggerQueueSync]);

  // --- SUPABASE REALTIME SYNC ---
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`dashboard_realtime_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clips',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;
          
          if (eventType === 'INSERT') {
            const newClip = newRow as { id: string; content: string; title: string | null; tags: string[] | null; pinned: boolean; folder_id: string | null; created_at: string };
            setClips((prev) => {
              if (prev.some(c => c.id === newClip.id)) return prev;
              const clip: Clip = {
                id: newClip.id,
                content: newClip.content,
                title: newClip.title || undefined,
                tags: newClip.tags || [],
                pinned: newClip.pinned,
                folder_id: newClip.folder_id || undefined,
                created_at: newClip.created_at,
              };
              const updated = [clip, ...prev];
              localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updated));
              return updated;
            });
          } else if (eventType === 'UPDATE') {
            const updatedClip = newRow as { id: string; content: string; title: string | null; tags: string[] | null; pinned: boolean; folder_id: string | null; created_at: string };
            setClips((prev) => {
              const updated = prev.map(c => {
                if (c.id === updatedClip.id) {
                  return {
                    ...c,
                    content: updatedClip.content,
                    title: updatedClip.title || undefined,
                    tags: updatedClip.tags || [],
                    pinned: updatedClip.pinned,
                    folder_id: updatedClip.folder_id || undefined,
                    created_at: updatedClip.created_at,
                  };
                }
                return c;
              });
              localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updated));
              return updated;
            });
          } else if (eventType === 'DELETE') {
            const deletedClip = oldRow as { id: string };
            setClips((prev) => {
              const updated = prev.filter(c => c.id !== deletedClip.id);
              localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updated));
              return updated;
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'folders',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;
          
          if (eventType === 'INSERT') {
            const newFolder = newRow as { id: string; name: string; color: string | null; created_at: string };
            setFolders((prev) => {
              if (prev.some(f => f.id === newFolder.id)) return prev;
              const folder: Folder = {
                id: newFolder.id,
                name: newFolder.name,
                color: newFolder.color || '#6366f1',
                created_at: newFolder.created_at,
              };
              const updated = [...prev, folder];
              localStorage.setItem('freeclipboard_dashboard_folders', JSON.stringify(updated));
              return updated;
            });
          } else if (eventType === 'UPDATE') {
            const updatedFolder = newRow as { id: string; name: string; color: string | null; created_at: string };
            setFolders((prev) => {
              const updated = prev.map(f => {
                if (f.id === updatedFolder.id) {
                  return {
                    ...f,
                    name: updatedFolder.name,
                    color: updatedFolder.color || '#6366f1',
                    created_at: updatedFolder.created_at,
                  };
                }
                return f;
              });
              localStorage.setItem('freeclipboard_dashboard_folders', JSON.stringify(updated));
              return updated;
            });
          } else if (eventType === 'DELETE') {
            const deletedFolder = oldRow as { id: string };
            setFolders((prev) => {
              const updated = prev.filter(f => f.id !== deletedFolder.id);
              localStorage.setItem('freeclipboard_dashboard_folders', JSON.stringify(updated));
              return updated;
            });
            setClips((prev) => {
              const updated = prev.map(c => 
                c.folder_id === deletedFolder.id ? { ...c, folder_id: undefined } : c
              );
              localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updated));
              return updated;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase]);

  // Migration Handler
  const handleMigrate = async (currentUser: User) => {
    setIsMigrating(true);
    try {
      const folderIdMap: Record<string, string> = {};
      
      // Process Folders
      const migratedFolders = legacyFolders.map(f => {
        const newId = isUUID(f.id) ? f.id : generateUUID();
        folderIdMap[f.id] = newId;
        return {
          id: newId,
          user_id: currentUser.id,
          name: f.name,
          color: f.color,
          created_at: f.created_at || new Date().toISOString()
        };
      });

      // Process Clips
      const migratedClips = legacyClips.map(c => {
        const newId = isUUID(c.id) ? c.id : generateUUID();
        const mappedFolderId = c.folder_id ? (folderIdMap[c.folder_id] || (isUUID(c.folder_id) ? c.folder_id : undefined)) : undefined;
        return {
          id: newId,
          user_id: currentUser.id,
          content: c.content,
          title: c.title || null,
          tags: c.tags || [],
          pinned: c.pinned,
          folder_id: mappedFolderId || null,
          created_at: c.created_at || new Date().toISOString()
        };
      });

      if (migratedFolders.length > 0) {
        const { error: fError } = await supabase
          .from('folders')
          .upsert(migratedFolders);
        if (fError) throw fError;
      }

      if (migratedClips.length > 0) {
        const { error: cError } = await supabase
          .from('clips')
          .upsert(migratedClips);
        if (cError) throw cError;
      }

      addToast(`Successfully synced ${migratedClips.length} clips and ${migratedFolders.length} folders!`, 'success');
      localStorage.setItem(`freeclipboard_migrated_${currentUser.id}`, 'true');
      localStorage.removeItem(`freeclipboard_migration_snoozed_${currentUser.id}`);
      setIsMigrationModalOpen(false);
      
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });

      fetchData(currentUser);
    } catch (err) {
      console.error('Error during migration:', err);
      addToast('Migration failed. We will retry next time you connect.', 'warning');
    } finally {
      setIsMigrating(false);
    }
  };

  // --- ACTIONS ---
  
  // --- ACTIONS ---
  
  // Create Folder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !user) return;

    const newFolder: Folder = {
      id: generateUUID(),
      name: newFolderName.trim(),
      color: newFolderColor,
      created_at: new Date().toISOString(),
    };

    // Optimistic update
    const updated = [...folders, newFolder];
    setFolders(updated);
    localStorage.setItem('freeclipboard_dashboard_folders', JSON.stringify(updated));

    if (navigator.onLine) {
      try {
        const { error } = await supabase
          .from('folders')
          .insert({
            id: newFolder.id,
            user_id: user.id,
            name: newFolder.name,
            color: newFolder.color,
          });
        if (error) throw error;
      } catch (err) {
        console.error('Failed to create folder on cloud:', err);
        enqueueAction('folders', 'insert', newFolder);
        addToast('Saved locally. Will sync when online.', 'info');
      }
    } else {
      enqueueAction('folders', 'insert', newFolder);
      addToast('Saved locally. Will sync when online.', 'info');
    }

    setNewFolderName('');
    setIsNewFolderOpen(false);
    addToast(`Folder "${newFolder.name}" created!`, 'success');
    
    confetti({
      particleCount: 25,
      spread: 40,
      origin: { y: 0.8 },
      colors: [newFolderColor, '#ffffff']
    });
  };

  // Delete Folder
  const handleDeleteFolder = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;

    const folderToDelete = folders.find(f => f.id === id);
    const updatedFolders = folders.filter((f) => f.id !== id);
    const updatedClips = clips.map((c) => 
      c.folder_id === id ? { ...c, folder_id: undefined } : c
    );

    setFolders(updatedFolders);
    setClips(updatedClips);
    localStorage.setItem('freeclipboard_dashboard_folders', JSON.stringify(updatedFolders));
    localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updatedClips));

    if (navigator.onLine) {
      try {
        const { error } = await supabase
          .from('folders')
          .delete()
          .eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.error('Failed to delete folder from cloud:', err);
        enqueueAction('folders', 'delete', { id });
        addToast('Deletion pending sync.', 'info');
      }
    } else {
      enqueueAction('folders', 'delete', { id });
      addToast('Deletion pending sync.', 'info');
    }

    if (selectedFolderId === id) {
      setActiveFilter('all');
      setSelectedFolderId(null);
    }
    if (folderToDelete) {
      addToast(`Folder "${folderToDelete.name}" deleted.`, 'info');
    }
  };

  // Rename/Edit Folder Handlers
  const handleOpenRenameFolderModal = (folder: Folder, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingFolder(folder);
    setRenameFolderName(folder.name);
    setRenameFolderColor(folder.color || PRESET_COLORS[0].value);
    setIsRenameFolderOpen(true);
  };

  const handleRenameFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingFolder || !renameFolderName.trim() || !user) return;

    const folderId = renamingFolder.id;
    const updatedName = renameFolderName.trim();
    const updatedColor = renameFolderColor;

    // Optimistic update
    const updated = folders.map((f) =>
      f.id === folderId ? { ...f, name: updatedName, color: updatedColor } : f
    );
    setFolders(updated);
    localStorage.setItem('freeclipboard_dashboard_folders', JSON.stringify(updated));

    if (navigator.onLine) {
      try {
        const { error } = await supabase
          .from('folders')
          .update({
            name: updatedName,
            color: updatedColor,
          })
          .eq('id', folderId);
        if (error) throw error;
      } catch (err) {
        console.error('Failed to rename folder on cloud:', err);
        enqueueAction('folders', 'update', {
          id: folderId,
          name: updatedName,
          color: updatedColor,
        });
        addToast('Saved locally. Will sync when online.', 'info');
      }
    } else {
      enqueueAction('folders', 'update', {
        id: folderId,
        name: updatedName,
        color: updatedColor,
      });
      addToast('Saved locally. Will sync when online.', 'info');
    }

    setIsRenameFolderOpen(false);
    setRenamingFolder(null);
    addToast(`Folder "${updatedName}" updated!`, 'success');
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, clipId: string) => {
    e.dataTransfer.setData('text/plain', clipId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetColId: string | null) => {
    e.preventDefault();
    setDraggedOverFolderId(null);
    const clipId = e.dataTransfer.getData('text/plain');
    if (!clipId) return;

    // Find the clip
    const clip = clips.find(c => c.id === clipId);
    if (!clip) return;

    if (activeFilter === 'folder' && (targetColId === 'pinned' || targetColId === 'other')) {
      // Pin/unpin drop in folder-specific board view
      const shouldPin = targetColId === 'pinned';
      if (clip.pinned === shouldPin) return;

      // Optimistic update
      const updatedClips = clips.map((c) =>
        c.id === clipId ? { ...c, pinned: shouldPin } : c
      );
      setClips(updatedClips);
      localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updatedClips));

      // Supabase update
      if (navigator.onLine && user) {
        try {
          const { error } = await supabase
            .from('clips')
            .update({ pinned: shouldPin })
            .eq('id', clipId);
          if (error) throw error;
        } catch (err) {
          console.error('Failed to update pin status on cloud:', err);
          enqueueAction('clips', 'update', { id: clipId, pinned: shouldPin });
          addToast('Saved locally. Will sync when online.', 'info');
        }
      } else {
        enqueueAction('clips', 'update', { id: clipId, pinned: shouldPin });
        addToast('Saved locally. Will sync when online.', 'info');
      }

      addToast(shouldPin ? 'Pinned clip!' : 'Unpinned clip!', 'success');
    } else {
      // Folder move drop
      const destFolderId = targetColId === 'uncategorized' ? undefined : (targetColId || undefined);
      if (clip.folder_id === destFolderId) return;

      // Optimistic update
      const updatedClips = clips.map((c) =>
        c.id === clipId ? { ...c, folder_id: destFolderId } : c
      );
      setClips(updatedClips);
      localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updatedClips));

      // Supabase update
      if (navigator.onLine && user) {
        try {
          const { error } = await supabase
            .from('clips')
            .update({ folder_id: destFolderId || null })
            .eq('id', clipId);
          if (error) throw error;
        } catch (err) {
          console.error('Failed to update clip folder on cloud:', err);
          enqueueAction('clips', 'update', { id: clipId, folder_id: destFolderId || null });
          addToast('Saved locally. Will sync when online.', 'info');
        }
      } else {
        enqueueAction('clips', 'update', { id: clipId, folder_id: destFolderId || null });
        addToast('Saved locally. Will sync when online.', 'info');
      }

      const folderName = targetColId === 'uncategorized'
        ? 'Uncategorized'
        : (folders.find(f => f.id === targetColId)?.name || 'Uncategorized');
      addToast(`Moved clip to "${folderName}"`, 'success');
    }
  };

  // --- SHARE HANDLERS ---
  const openShareModal = async (clip: Clip) => {
    closePrimaryClipModals('share');
    setSharingClip(clip);
    setIsShareModalOpen(true);
    setCopiedShareLink(false);

    if (!user) return;

    setIsGeneratingShare(true);
    try {
      const { data, error } = await supabase
        .from('clips')
        .select('share_token, share_expires_at')
        .eq('id', clip.id)
        .single();

      if (error) throw error;

      let token = data?.share_token as string | null;
      let expiresAt = data?.share_expires_at as string | null;

      const needsToken = !token;
      const needsRefresh = expiresAt && new Date(expiresAt) < new Date();

      if (needsToken || needsRefresh) {
        token = generateUUID();
        expiresAt = userPlan === 'free'
          ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          : null;

        const { error: updateError } = await supabase
          .from('clips')
          .update({ share_token: token, share_expires_at: expiresAt })
          .eq('id', clip.id);
        if (updateError) throw updateError;

        setClips(prev => prev.map(c =>
          c.id === clip.id ? { ...c } : c
        ));
      }

      setShareToken(token);
      setShareExpiry(expiresAt);
    } catch (err) {
      console.error('Error fetching/generating share token:', err);
      addToast('Failed to generate share link. Try again.', 'warning');
    } finally {
      setIsGeneratingShare(false);
    }
  };

  const handleOpenShareModal = async (clip: Clip, e?: React.MouseEvent) => {
    e?.stopPropagation();
    await openShareModal(clip);
  };

  const handleCopyShareLink = () => {
    if (!shareToken) return;
    const url = `${window.location.origin}/s/${shareToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 2500);
      addToast('Share link copied to clipboard!', 'success');
    });
  };

  const handleRevokeShare = async () => {
    if (!sharingClip || !user) return;
    try {
      const { error } = await supabase
        .from('clips')
        .update({ share_token: null, share_expires_at: null })
        .eq('id', sharingClip.id);
      if (error) throw error;
      setShareToken(null);
      setShareExpiry(null);
      addToast('Share link revoked.', 'info');
    } catch (err) {
      console.error('Error revoking share:', err);
      addToast('Failed to revoke share link.', 'warning');
    }
  };

  const handleSummarize = async (clipId: string, content: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    
    // Gating check
    if (userPlan === 'free') {
      addToast('AI Summarization is a Pro feature. Upgrade now to summarize your clips!', 'warning');
      setIsUpgradeModalOpen(true);
      return;
    }

    if (!content || !content.trim()) {
      addToast('Cannot summarize empty content.', 'warning');
      return;
    }

    setSummarizingClipId(clipId);
    try {
      const response = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clipId, content }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.summary) {
        setClipSummaries(prev => ({
          ...prev,
          [clipId]: {
            summary: data.summary,
            isFallback: data.isFallback,
            warning: data.warning,
          },
        }));
        // Keep summaries collapsed by default until the user expands them.
        setCollapsedSummaries(prev => ({
          ...prev,
          [clipId]: isMobileViewport,
        }));
        
        if (data.isFallback) {
          addToast(data.warning || 'OpenRouter API is currently unavailable: Showing local smart summary.', 'warning');
        } else {
          addToast('Summary generated successfully with OpenRouter DeepSeek AI!', 'success');
        }
      } else {
        throw new Error('Invalid API response structure.');
      }
    } catch (err: unknown) {
      console.error('Error generating summary:', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addToast(`Failed to generate summary: ${msg}`, 'warning');
    } finally {
      setSummarizingClipId(null);
    }
  };

  const toggleSummaryCollapse = (clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedSummaries(prev => ({
      ...prev,
      [clipId]: !prev[clipId],
    }));
  };

  const closeMobileCardActionSheet = useCallback(() => {
    setMobileCardActionClip(null);
    setMobileCardActionPanel('root');
  }, []);

  const openMobileCardActionSheet = useCallback((clip: Clip, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowClipMindMenu(null);
    setShowRewriteMenu(null);
    setShowTranslateMenu(null);
    setMobileCardActionPanel('root');
    setMobileCardActionClip(clip);
  }, []);

  const handleToggleClipMindMenu = useCallback((clip: Clip, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowRewriteMenu(null);
    setShowTranslateMenu(null);
    setShowClipMindMenu((current) => (current === clip.id ? null : clip.id));
  }, []);

  const handleClipMindAction = async (clip: Clip, action: ClipMindAction, e?: React.MouseEvent) => {
    e?.stopPropagation();

    if (userPlan === 'free') {
      addToast('ClipMind actions are a Pro feature. Upgrade to unlock AI workflows.', 'warning');
      setIsUpgradeModalOpen(true);
      return;
    }

    if (!clip.content.trim()) {
      addToast('Cannot run ClipMind on empty content.', 'warning');
      return;
    }

    setClipMindLoadingId(clip.id);
    if (!isMobileViewport) {
      setShowClipMindMenu(null);
    }

    try {
      const response = await fetch('/api/ai/clipmind-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: clip.content, action }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      if (!data.success || !data.result) {
        throw new Error('Invalid ClipMind response.');
      }

      setClipMindResults((prev) => ({
        ...prev,
        [clip.id]: {
          action,
          label: data.label || 'ClipMind',
          result: data.result,
          applyTarget: data.applyTarget || null,
          isFallback: data.isFallback,
          warning: data.warning,
          parsedTags: Array.isArray(data.parsedTags) ? data.parsedTags : null,
        },
      }));

      if (data.isFallback) {
        addToast(data.warning || `${data.label || 'ClipMind'} used a local fallback.`, 'warning');
      } else {
        addToast(`${data.label || 'ClipMind'} complete.`, 'success');
      }
    } catch (err: unknown) {
      console.error('ClipMind action error:', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addToast(`ClipMind failed: ${msg}`, 'warning');
    } finally {
      setClipMindLoadingId(null);
    }
  };

  const handleApplyClipMindResult = async (clip: Clip, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const output = clipMindResults[clip.id];
    if (!output || !output.applyTarget || !user) return;

    if (output.applyTarget === 'title') {
      const nextTitle = output.result.trim();
      const updated = clips.map((item) => item.id === clip.id ? { ...item, title: nextTitle } : item);
      setClips(updated);
      if (previewingClip?.id === clip.id) {
        setPreviewingClip({ ...previewingClip, title: nextTitle });
      }
      localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updated));
      try {
        const { error } = await supabase.from('clips').update({ title: nextTitle }).eq('id', clip.id);
        if (error) throw error;
      } catch (err) {
        console.error('Failed to save ClipMind title:', err);
        enqueueAction('clips', 'update', { id: clip.id, title: nextTitle });
      }
    }

    if (output.applyTarget === 'tags') {
      const nextTags = (output.parsedTags || output.result.split(',').map((tag) => tag.trim().toUpperCase()).filter(Boolean)).slice(0, 12);
      if (previewingClip?.id === clip.id) {
        setPreviewingClip({ ...previewingClip, tags: nextTags });
      }
      await persistClipTags(clip.id, nextTags, 'ClipMind tags applied.');
    }

    if (output.applyTarget === 'content') {
      const updated = clips.map((item) => item.id === clip.id ? { ...item, content: output.result } : item);
      setClips(updated);
      if (previewingClip?.id === clip.id) {
        setPreviewingClip({ ...previewingClip, content: output.result });
      }
      localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updated));
      try {
        const { error } = await supabase.from('clips').update({ content: output.result }).eq('id', clip.id);
        if (error) throw error;
      } catch (err) {
        console.error('Failed to save ClipMind content:', err);
        enqueueAction('clips', 'update', { id: clip.id, content: output.result });
      }
    }

    addToast(`${output.label} applied to clip.`, 'success');
  };

  const dismissClipMindResult = (clipId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setClipMindResults((prev) => {
      const next = { ...prev };
      delete next[clipId];
      return next;
    });
  };

  const handleOpenClipMindDrawer = async () => {
    if (!isProUser(userPlan, userTrialEndsAt)) {
      closeMobileShellSurfaces('upgrade');
      setIsUpgradeModalOpen(true);
      return;
    }

    if (isMobileViewport) {
      router.push('/clipmind');
      return;
    }

    const nextOpen = !isClipMindDrawerOpen;
    if (nextOpen) {
      closeMobileShellSurfaces('clipmind');
    }
    setIsClipMindDrawerOpen(nextOpen);

    if (nextOpen && user && clipMindConversations.length === 0) {
      await loadClipMindConversations();
    }
  };

  const handleCopyClipMindResult = async (clipId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const output = clipMindResults[clipId];
    if (!output?.result) return;

    try {
      await navigator.clipboard.writeText(output.result);
      addToast('ClipMind result copied.', 'success');
    } catch (error) {
      console.error('Failed to copy ClipMind result:', error);
      addToast('Could not copy this ClipMind result.', 'warning');
    }
  };

  const handleSaveClipMindResultAsClip = async (clipId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const output = clipMindResults[clipId];
    if (!output?.result) return;
    await handleSaveClipMindMessage(`${clipId}-${output.action}-result`, output.result);
  };

  const handleSelectClipMindConversation = (conversationId: string) => {
    setActiveClipMindConversationId(conversationId);
    const selected = clipMindConversations.find((conversation) => conversation.id === conversationId);
    setClipMindMessages(selected?.messages || []);
  };

  const handleTogglePinnedClipMindConversation = (conversationId: string) => {
    setClipMindPinnedConversationIds((prev) => {
      const next = prev.includes(conversationId)
        ? prev.filter((id) => id !== conversationId)
        : [conversationId, ...prev].slice(0, 8);
      localStorage.setItem('fc_clipmind_pinned_chats', JSON.stringify(next));
      return next;
    });
  };

  const handleClipMindSidebarPrompt = (prompt: string) => {
    setClipMindInput(prompt);
  };

  const handleClipMindQuickComposerAction = (actionId: ClipMindComposerAction) => {
    const action = CLIP_MIND_COMPOSER_ACTIONS.find((item) => item.id === actionId);
    if (!action) return;
    setClipMindInput(action.prompt);
  };

  const handleNewClipMindConversation = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('clipmind_conversations')
        .insert({
          user_id: user.id,
          title: 'New Chat',
          messages: [],
        })
        .select('id, title, messages, created_at, updated_at')
        .single();

      if (error || !data) throw error || new Error('Failed to create conversation.');

      const nextConversation: ClipMindConversation = {
        id: data.id,
        title: data.title || 'New chat',
        messages: [],
        created_at: data.created_at,
        updated_at: data.updated_at,
      };

      setClipMindConversations((prev) => [nextConversation, ...prev]);
      setActiveClipMindConversationId(nextConversation.id);
      setClipMindMessages([]);
      setClipMindInput('');
    } catch (error) {
      console.error('Failed to create ClipMind conversation:', error);
      addToast('Could not start a new ClipMind chat.', 'warning');
    }
  };

  const handleSendClipMindMessage = async (textToSend?: string) => {
    const text = (textToSend || clipMindInput).trim();
    if (!text || isClipMindStreaming || !user) return;

    let conversationId = activeClipMindConversationId;

    if (!conversationId) {
      try {
        const { data, error } = await supabase
          .from('clipmind_conversations')
          .insert({
            user_id: user.id,
            title: text.length > 36 ? `${text.slice(0, 36)}...` : text,
            messages: [],
          })
          .select('id, title, messages, created_at, updated_at')
          .single();

        if (error || !data) throw error || new Error('Conversation bootstrap failed.');

        conversationId = data.id;
        setActiveClipMindConversationId(data.id);
        setClipMindConversations((prev) => [
          {
            id: data.id,
            title: data.title || 'New chat',
            messages: [],
            created_at: data.created_at,
            updated_at: data.updated_at,
          },
          ...prev,
        ]);
      } catch (error) {
        console.error('Failed to initialize ClipMind conversation:', error);
        addToast('Could not start ClipMind right now.', 'warning');
        return;
      }
    }

    setClipMindInput('');
    const userMessage: ClipMindChatMessage = {
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    const assistantPlaceholder: ClipMindChatMessage = {
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };

    setClipMindMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    setIsClipMindStreaming(true);

    try {
      const response = await fetch('/api/clipmind/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          conversationId,
          history: clipMindMessages,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP Error ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response stream returned.');
      }

      const decoder = new TextDecoder();
      let assistantText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter((line) => line.trim().startsWith('data:'));

        for (const line of lines) {
          const payload = line.replace(/^data:\s*/, '').trim();
          if (!payload || payload === '[DONE]') continue;

          try {
            const parsed = JSON.parse(payload);
            const nextText = typeof parsed.text === 'string' ? parsed.text : '';
            if (!nextText) continue;

            assistantText += nextText;
            setClipMindMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === 'assistant') {
                last.content = assistantText;
              }
              return copy;
            });
          } catch {
            continue;
          }
        }
      }

      const { data: updatedConversation } = await supabase
        .from('clipmind_conversations')
        .select('id, title, messages, created_at, updated_at')
        .eq('id', conversationId)
        .single();

      if (updatedConversation) {
        const normalizedConversation: ClipMindConversation = {
          id: updatedConversation.id,
          title: updatedConversation.title || 'New chat',
          messages: Array.isArray(updatedConversation.messages)
            ? updatedConversation.messages as ClipMindChatMessage[]
            : [],
          created_at: updatedConversation.created_at,
          updated_at: updatedConversation.updated_at,
        };

        setClipMindConversations((prev) =>
          [normalizedConversation, ...prev.filter((conversation) => conversation.id !== normalizedConversation.id)]
        );
        setClipMindMessages(normalizedConversation.messages);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to contact ClipMind.';
      console.error('ClipMind drawer message failed:', error);
      addToast(message, 'warning');
      setClipMindMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant' && !last.content) {
          next.pop();
        }
        return next;
      });
    } finally {
      setIsClipMindStreaming(false);
    }
  };

  const handleSaveClipMindMessage = async (messageId: string, content: string) => {
    const trimmed = content.trim();
    if (!trimmed || !user) return;

    setSavingClipMindMessageId(messageId);

    try {
      await navigator.clipboard.writeText(trimmed);

      const formattedContent = smartFormatContent(trimmed, detectClipContentType(trimmed));
      const generatedTitle = deriveClipTitleFromContent(trimmed);
      const generatedTags = deriveClipTagsFromContent(trimmed);

      const newClip: Clip = {
        id: generateUUID(),
        content: formattedContent,
        title: generatedTitle,
        tags: generatedTags,
        pinned: false,
        created_at: new Date().toISOString(),
        metadata: {
          source_app: 'clipmind',
          capture_method: 'ai_generated',
        },
      };

      const updated = [newClip, ...clips];
      setClips(updated);
      localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updated));

      if (navigator.onLine) {
        try {
          const { error } = await supabase
            .from('clips')
            .insert({
              id: newClip.id,
              user_id: user.id,
              content: newClip.content,
              title: newClip.title || null,
              tags: newClip.tags,
              pinned: newClip.pinned,
              folder_id: null,
            });
          if (error) throw error;

          await persistClipMetadata(user, newClip.id, normalizeClipEntities(newClip.metadata), detectClipContentType(newClip.content));
        } catch (error) {
          console.error('Failed to save ClipMind output to cloud:', error);
          enqueueAction('clips', 'insert', newClip);
          enqueueAction('clip_metadata', 'insert', {
            id: newClip.id,
            clip_id: newClip.id,
            entities: normalizeClipEntities(newClip.metadata),
            clip_type: detectClipContentType(newClip.content),
          });
          addToast('Saved locally. Will sync when online.', 'info');
        }
      } else {
        enqueueAction('clips', 'insert', newClip);
        enqueueAction('clip_metadata', 'insert', {
          id: newClip.id,
          clip_id: newClip.id,
          entities: normalizeClipEntities(newClip.metadata),
          clip_type: detectClipContentType(newClip.content),
        });
        addToast('Saved locally. Will sync when online.', 'info');
      }

      if (isProUser(userPlan, userTrialEndsAt)) {
        triggerSilentAutoTag(newClip.id, newClip.content);
        triggerRAGAnalyze(newClip.id, newClip.content);
      }

      addToast('ClipMind answer copied and saved as a clip.', 'success');
    } catch (error) {
      console.error('Failed to save ClipMind answer:', error);
      addToast('Could not save this ClipMind answer.', 'warning');
    } finally {
      setSavingClipMindMessageId(null);
    }
  };

  const handleRewrite = async (clipId: string, content: string, tone: string) => {
    if (userPlan === 'free') {
      addToast('AI Rewrite is a Pro feature. Upgrade now to polish your clips!', 'warning');
      setIsUpgradeModalOpen(true);
      return;
    }

    if (!content || !content.trim()) {
      addToast('Cannot rewrite empty content.', 'warning');
      return;
    }

    setRewritingClipId(clipId);
    try {
      const response = await fetch('/api/ai/rewrite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content, tone }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.rewritten) {
        setPendingRewrites(prev => ({
          ...prev,
          [clipId]: data.rewritten,
        }));
        if (data.isFallback) {
          addToast(data.warning || 'AI service is unavailable, so a local smart rewrite was generated.', 'warning');
        } else {
          addToast(`Content rewritten in ${tone} tone!`, 'success');
        }
      } else {
        throw new Error('Invalid API response structure.');
      }
    } catch (err: unknown) {
      console.error('Error rewriting content:', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addToast(`Failed to rewrite: ${msg}`, 'warning');
    } finally {
      setRewritingClipId(null);
    }
  };

  const handleApplyRewrite = async (clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const rewrittenText = pendingRewrites[clipId];
    if (!rewrittenText) return;

    // Update local state first
    const updated = clips.map(c => c.id === clipId ? { ...c, content: rewrittenText } : c);
    setClips(updated);
    localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updated));

    // Update in database if online
    if (navigator.onLine && user) {
      try {
        const { error } = await supabase
          .from('clips')
          .update({ content: rewrittenText })
          .eq('id', clipId);
        if (error) throw error;
        addToast('Rewrite applied and saved to cloud!', 'success');
      } catch (err) {
        console.error('Failed to sync rewrite to cloud:', err);
        enqueueAction('clips', 'update', { id: clipId, content: rewrittenText });
        addToast('Applied locally. Will sync when online.', 'info');
      }
    } else {
      enqueueAction('clips', 'update', { id: clipId, content: rewrittenText });
      addToast('Applied locally. Will sync when online.', 'info');
    }

    // Clear rewrite state
    setPendingRewrites(prev => {
      const copy = { ...prev };
      delete copy[clipId];
      return copy;
    });
  };

  const handleDismissRewrite = (clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingRewrites(prev => {
      const copy = { ...prev };
      delete copy[clipId];
      return copy;
    });
  };

  const handleTranslate = async (clipId: string, content: string, targetLanguage: string) => {
    if (userPlan === 'free') {
      addToast('AI Translation is a Pro feature. Upgrade now to translate your clips!', 'warning');
      setIsUpgradeModalOpen(true);
      return;
    }

    if (!content || !content.trim()) {
      addToast('Cannot translate empty content.', 'warning');
      return;
    }

    setTranslatingClipId(clipId);
    try {
      const response = await fetch('/api/ai/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content, targetLanguage }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.translated) {
        setActiveTranslations(prev => ({
          ...prev,
          [clipId]: { text: data.translated, lang: targetLanguage },
        }));
        addToast(`Translated to ${targetLanguage}!`, 'success');
      } else {
        throw new Error('Invalid API response structure.');
      }
    } catch (err: unknown) {
      console.error('Error translating content:', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addToast(`Failed to translate: ${msg}`, 'warning');
    } finally {
      setTranslatingClipId(null);
    }
  };

  const handleDismissTranslate = (clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveTranslations(prev => {
      const copy = { ...prev };
      delete copy[clipId];
      return copy;
    });
  };

  const handleCopyTranslation = (clipId: string, text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopiedTranslationId(clipId);
      setTimeout(() => setCopiedTranslationId(null), 2500);
      addToast('Translation copied to clipboard!', 'success');
    });
  };

  const triggerSilentAutoTag = async (clipId: string, content: string) => {
    try {
      const response = await fetch('/api/ai/autotag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data.success && Array.isArray(data.tags) && data.tags.length > 0) {
        const uppercaseTags = data.tags.map((t: string) => t.trim().toUpperCase()).filter(Boolean);
        
        // Update local state
        setClips(prev => {
          const updated = prev.map(c => c.id === clipId ? { ...c, tags: uppercaseTags } : c);
          localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updated));
          return updated;
        });

        // Update database if online
        if (navigator.onLine && user) {
          await supabase
            .from('clips')
            .update({ tags: uppercaseTags })
            .eq('id', clipId);
        } else {
          enqueueAction('clips', 'update', { id: clipId, tags: uppercaseTags });
        }
      }
    } catch (err) {
      console.error('Silent auto-tag error:', err);
    }
  };

  const triggerRAGAnalyze = async (clipId: string, content: string) => {
    try {
      await fetch('/api/rag/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clip_id: clipId, content }),
      });
    } catch (err) {
      console.error('RAG analyze error:', err);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedClipIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleCopyColShareLink = () => {
    if (!colShareToken) return;
    const url = `${window.location.origin}/p/${colShareToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedColShareLink(true);
      setTimeout(() => setCopiedColShareLink(false), 2500);
      addToast('Shared page link copied to clipboard!', 'success');
    });
  };

  const handleShareAsPage = async () => {
    if (selectedClipIds.length === 0) return;

    if (userPlan === 'free' && selectedClipIds.length > 5) {
      addToast('Free users can share up to 5 clips per page. Upgrade to Pro for unlimited clips.', 'warning');
      setIsUpgradeModalOpen(true);
      return;
    }

    if (!user) {
      addToast('Please login to share clips.', 'warning');
      return;
    }

    setIsGeneratingColShare(true);
    setIsColShareModalOpen(true);
    setCopiedColShareLink(false);
    setColShareClipCount(selectedClipIds.length);

    try {
      const token = generateUUID();
      const expiresAt = userPlan === 'free'
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const { error } = await supabase
        .from('collection_shares')
        .insert({
          user_id: user.id,
          clip_ids: selectedClipIds,
          token: token,
          expires_at: expiresAt
        });

      if (error) throw error;

      setColShareToken(token);
      setColShareExpiry(expiresAt);
      addToast('Shared page link generated!', 'success');
      setIsSelectionMode(false);
      setSelectedClipIds([]);
    } catch (err) {
      console.error('Error generating shared page:', err);
      addToast('Failed to generate shared page.', 'warning');
      setIsColShareModalOpen(false);
    } finally {
      setIsGeneratingColShare(false);
    }
  };

  // Create Clip Form Submit
  const handleCreateClip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClipContent.trim()) return;

    // Check clip limit for free users
    if (!isPro && liveClips.length >= FREE_CLIP_LIMIT) {
      setIsUpgradeModalOpen(true);
      return;
    }

    const parsedTagsBase = newClipTagsString
      .split(',')
      .map(tag => tag.trim().toUpperCase())
      .filter(tag => tag.length > 0);
    const parsedTags = newClipAsTask ? withTaskMetadata(parsedTagsBase, 'pending') : parsedTagsBase;

    const clipData = {
      title: newClipTitle.trim() || undefined,
      content: newClipContent,
      tags: parsedTags,
      pinned: newClipPinned,
      folder_id: newClipFolderId || undefined,
    };

    const isDuplicate = clips.some(c => c.content.trim() === newClipContent.trim());
    if (isDuplicate) {
      setPendingSaveAction({ type: 'create', clipData });
      setIsDuplicateWarningOpen(true);
      return;
    }

    executeCreateClip(clipData);
  };

  const getNewClipDetectedType = () => (
    newClipContentMode === 'auto'
      ? detectClipContentType(newClipContent)
      : newClipContentMode
  );

  const inferClipTitle = () => {
    const content = newClipContent.trim();
    if (!content) {
      addToast('Paste content first so AI Assist can infer a title.', 'info');
      return;
    }

    const firstLine = content.split('\n').map(line => line.trim()).find(Boolean) || '';
    const urlMatch = content.match(/https?:\/\/[^\s)]+/);
    const titleSource = urlMatch
      ? urlMatch[0].replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0]
      : firstLine.replace(/^#{1,6}\s*/, '').replace(/^[-*]\s*/, '');

    const title = titleSource.length > 60 ? `${titleSource.slice(0, 57).trim()}...` : titleSource;
    setNewClipTitle(title || 'Saved clipboard note');
    addToast('Smart title generated.', 'success');
  };

  const suggestClipTags = () => {
    const content = newClipContent.toLowerCase();
    const detectedType = getNewClipDetectedType();
    if (!content.trim()) {
      addToast('Paste content first so AI Assist can suggest tags.', 'info');
      return;
    }

    const tagCandidates = new Set<string>();
    if (detectedType !== 'plain') tagCandidates.add(detectedType.toUpperCase());
    if (/https?:\/\//.test(content)) tagCandidates.add('LINK');
    if (/(meeting|agenda|notes|action item|follow up)/.test(content)) tagCandidates.add('NOTES');
    if (/(todo|task|checklist|deadline)/.test(content)) tagCandidates.add('TASKS');
    if (/(react|next\.?js|typescript|javascript|css|tailwind|api|function|const )/.test(content)) tagCandidates.add('CODE');
    if (/(research|source|paper|citation|reference)/.test(content)) tagCandidates.add('RESEARCH');
    if (/(prompt|ai|model|openai|gemini|claude)/.test(content)) tagCandidates.add('AI');
    if (tagCandidates.size === 0) tagCandidates.add('CLIP');

    setNewClipTagsString(Array.from(tagCandidates).slice(0, 5).join(', '));
    addToast('Smart tags suggested.', 'success');
  };

  const formatNewClipContent = () => {
    const content = newClipContent.trim();
    if (!content) {
      addToast('Paste content first so AI Assist can clean it up.', 'info');
      return;
    }

    const formatted = smartFormatContent(content, getNewClipDetectedType());
    setNewClipContent(formatted);
    addToast('Content cleaned and formatted.', 'success');
  };

  const executeCreateClip = async (clipData: {
    title?: string;
    content: string;
    tags: string[];
    pinned: boolean;
    folder_id?: string;
  }) => {
    if (!user) return;

    const newClip: Clip = {
      id: generateUUID(),
      ...clipData,
      created_at: new Date().toISOString(),
      metadata: {},
    };

    const updated = [newClip, ...clips];
    setClips(updated);
    localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updated));

    if (navigator.onLine) {
      try {
        const { error } = await supabase
          .from('clips')
          .insert({
            id: newClip.id,
            user_id: user.id,
            content: newClip.content,
            title: newClip.title || null,
            tags: newClip.tags,
            pinned: newClip.pinned,
            folder_id: newClip.folder_id || null,
          });
        if (error) throw error;
      } catch (err) {
        console.error('Failed to create clip on cloud:', err);
        enqueueAction('clips', 'insert', newClip);
        addToast('Saved locally. Will sync when online.', 'info');
      }
    } else {
      enqueueAction('clips', 'insert', newClip);
      addToast('Saved locally. Will sync when online.', 'info');
    }

    setNewClipTitle('');
    setNewClipContent('');
    setNewClipTagsString('');
    setNewClipFolderId('');
    setNewClipPinned(false);
    setNewClipAsTask(false);
    setNewClipContentMode('auto');
    setNewClipAiOrganize(true);
    setIsNewClipOpen(false);
    addToast('Clip created successfully!', 'success');

    confetti({
      particleCount: 30,
      spread: 50,
      origin: { y: 0.8 },
      colors: ['#6366f1', '#a78bfa', '#10b981']
    });

    // Trigger background auto-tagging and RAG analysis silently if user is Pro
    if (userPlan === 'pro' && newClipAiOrganize) {
      triggerSilentAutoTag(newClip.id, newClip.content);
      triggerRAGAnalyze(newClip.id, newClip.content);
    }
  };

  const openEditClipModal = (clip: Clip) => {
    closePrimaryClipModals('edit');
    setEditingClip(clip);
    setEditClipTitle(clip.title || '');
    setEditClipContent(clip.content);
    setEditClipTagsString(getVisibleClipTags(clip).join(', '));
    setEditClipFolderId(clip.folder_id || '');
    setEditClipPinned(clip.pinned);
    setEditClipAsTask(isTaskClip(clip));
    setEditClipTaskStatus(getTaskStatus(clip));
    setIsEditClipOpen(true);
  };

  const openClipPreview = (clip: Clip) => {
    closePrimaryClipModals('preview');
    setPreviewingClip(clip);
    setPreviewRenderMode('raw');
    setIsClipPreviewOpen(true);
  };

  // Edit Clip Action Trigger
  const handleOpenEditClip = (clip: Clip, e?: React.MouseEvent) => {
    e?.stopPropagation();
    openEditClipModal(clip);
  };

  // Save Edit Clip Form Submission
  const handleSaveEditClip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClip || !editClipContent.trim()) return;

    const parsedTagsBase = editClipTagsString
      .split(',')
      .map(tag => tag.trim().toUpperCase())
      .filter(tag => tag.length > 0);
    const parsedTags = editClipAsTask ? withTaskMetadata(parsedTagsBase, editClipTaskStatus) : parsedTagsBase;

    const clipData = {
      id: editingClip.id,
      title: editClipTitle.trim() || undefined,
      content: editClipContent,
      tags: parsedTags,
      pinned: editClipPinned,
      folder_id: editClipFolderId || undefined,
    };

    const isDuplicate = clips.some(
      c => c.content.trim() === editClipContent.trim() && c.id !== editingClip.id
    );
    if (isDuplicate) {
      setPendingSaveAction({ type: 'edit', clipData });
      setIsDuplicateWarningOpen(true);
      return;
    }

    executeEditClip(clipData);
  };

  const executeEditClip = async (clipData: {
    id?: string;
    title?: string;
    content: string;
    tags: string[];
    pinned: boolean;
    folder_id?: string;
  }) => {
    if (!user || !clipData.id) return;

    const existingClip = clips.find((clip) => clip.id === clipData.id);
    const nextMetadata = existingClip ? withVersionSnapshot(existingClip) : {};

    const updated = clips.map(c =>
      c.id === clipData.id
        ? { ...c, ...clipData, metadata: { ...normalizeClipEntities(c.metadata), ...nextMetadata } }
        : c
    );
    setClips(updated);
    localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updated));

    if (navigator.onLine) {
      try {
        const { error } = await supabase
          .from('clips')
          .update({
            content: clipData.content,
            title: clipData.title || null,
            tags: clipData.tags,
            pinned: clipData.pinned,
            folder_id: clipData.folder_id || null,
          })
          .eq('id', clipData.id);
        if (error) throw error;
      } catch (err) {
        console.error('Failed to update clip on cloud:', err);
        const updatePayload = {
          id: clipData.id,
          content: clipData.content,
          title: clipData.title || null,
          tags: clipData.tags,
          pinned: clipData.pinned,
          folder_id: clipData.folder_id || null,
        };
        enqueueAction('clips', 'update', updatePayload);
        addToast('Saved locally. Will sync when online.', 'info');
      }
    } else {
      const updatePayload = {
        id: clipData.id,
        content: clipData.content,
        title: clipData.title || null,
        tags: clipData.tags,
        pinned: clipData.pinned,
        folder_id: clipData.folder_id || null,
      };
      enqueueAction('clips', 'update', updatePayload);
      addToast('Saved locally. Will sync when online.', 'info');
    }

    if (existingClip) {
      await persistClipEntities(clipData.id, nextMetadata, existingClip.metadata?.code_language ? 'code' : 'other');
    }

    setIsEditClipOpen(false);
    setEditingClip(null);
    addToast('Clip updated successfully!', 'success');
  };

  // Confirm Duplicate Warning Dialog Saving
  const handleConfirmDuplicateSave = () => {
    if (!pendingSaveAction) return;

    if (pendingSaveAction.type === 'create') {
      executeCreateClip(pendingSaveAction.clipData);
    } else if (pendingSaveAction.type === 'edit') {
      executeEditClip(pendingSaveAction.clipData);
    }

    setIsDuplicateWarningOpen(false);
    setPendingSaveAction(null);
  };

  // Toggle Pin
  const handleTogglePin = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!user) return;

    let isPinnedNow = false;
    const updated = clips.map((c) => {
      if (c.id === id) {
        isPinnedNow = !c.pinned;
        return { ...c, pinned: isPinnedNow };
      }
      return c;
    });
    setClips(updated);
    localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updated));

    if (navigator.onLine) {
      try {
        const { error } = await supabase
          .from('clips')
          .update({ pinned: isPinnedNow })
          .eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.error('Failed to toggle pin on cloud:', err);
        enqueueAction('clips', 'update', { id, pinned: isPinnedNow });
        addToast('Pin status saved locally.', 'info');
      }
    } else {
      enqueueAction('clips', 'update', { id, pinned: isPinnedNow });
      addToast('Pin status saved locally.', 'info');
    }

    addToast(isPinnedNow ? 'Clip pinned to top!' : 'Clip unpinned.', 'success');
  };

  const persistClipTags = async (id: string, tags: string[], successMessage: string) => {
    const updated = clips.map((clip) => clip.id === id ? { ...clip, tags } : clip);
    setClips(updated);
    localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updated));

    if (navigator.onLine && user) {
      try {
        const { error } = await supabase
          .from('clips')
          .update({ tags })
          .eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.error('Failed to sync task metadata:', err);
        enqueueAction('clips', 'update', { id, tags });
        addToast('Task metadata saved locally. Will sync when online.', 'info');
      }
    } else {
      enqueueAction('clips', 'update', { id, tags });
      addToast('Task metadata saved locally. Will sync when online.', 'info');
    }

    addToast(successMessage, 'success');
  };

  const persistClipEntities = async (clipId: string, entities: ClipEntities, clipType = 'other') => {
    if (!user) return;

    const normalizedEntities = normalizeClipEntities(entities);
    let updatedClips: Clip[] = [];
    setClips((prev) => {
      updatedClips = prev.map((clip) =>
        clip.id === clipId
          ? { ...clip, metadata: { ...normalizeClipEntities(clip.metadata), ...normalizedEntities } }
          : clip
      );
      localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updatedClips));
      return updatedClips;
    });

    if (navigator.onLine) {
      try {
        await persistClipMetadata(user, clipId, normalizedEntities, clipType);
      } catch (err) {
        console.error('Failed to sync clip metadata:', err);
        enqueueAction('clip_metadata', 'update', { id: clipId, clip_id: clipId, entities: normalizedEntities, clip_type: clipType });
        addToast('Clip metadata saved locally. Will sync when online.', 'info');
      }
    } else {
      enqueueAction('clip_metadata', 'update', { id: clipId, clip_id: clipId, entities: normalizedEntities, clip_type: clipType });
      addToast('Clip metadata saved locally. Will sync when online.', 'info');
    }
  };

  const handleCreateTaskFromClip = async (clip: Clip, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const nextTags = withTaskMetadata(clip.tags, 'pending');
    await persistClipTags(clip.id, nextTags, 'Clip converted into a pending task.');
  };

  const handleTaskStatusChange = async (clip: Clip, status: TaskStatus, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const nextTags = withTaskMetadata(clip.tags, status);
    await persistClipTags(clip.id, nextTags, `Task marked ${status.replace('-', ' ')}.`);
  };

  // Copy Clip Content
  const handleCopyContent = (id: string, text: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    copyClipText(id, text);
  };

  // Delete Clip
  const handleDeleteClip = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!user) return;

    const deletedAt = new Date().toISOString();
    const updated = clips.map((c) =>
      c.id === id
        ? {
            ...c,
            metadata: {
              ...normalizeClipEntities(c.metadata),
              is_deleted: true,
              deleted_at: deletedAt,
            },
          }
        : c
    );
    setClips(updated);
    localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updated));

    await persistClipEntities(id, { is_deleted: true, deleted_at: deletedAt }, 'other');

    addToast('Clip moved to trash.', 'info');
  };

  const handleRestoreClip = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!user) return;
    await persistClipEntities(id, { is_deleted: false, deleted_at: null }, 'other');
    addToast('Clip restored.', 'success');
  };

  const executeImportClips = async (importedList: Clip[]) => {
    if (!user) return;

    const clipsWithUser = importedList.map(c => ({
      ...c,
      id: isUUID(c.id) ? c.id : generateUUID(),
    }));

    const updated = [...clipsWithUser, ...clips];
    setClips(updated);
    localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updated));

    if (navigator.onLine) {
      try {
        const dbPayload = clipsWithUser.map(c => ({
          id: c.id,
          user_id: user.id,
          content: c.content,
          title: c.title || null,
          tags: c.tags,
          pinned: c.pinned,
          folder_id: c.folder_id || null,
          created_at: c.created_at,
        }));

        const { error } = await supabase
          .from('clips')
          .upsert(dbPayload);
        if (error) throw error;
      } catch (err) {
        console.error('Failed to import clips to cloud:', err);
        clipsWithUser.forEach(c => {
          enqueueAction('clips', 'insert', c);
        });
        addToast('Imported locally. Will sync when online.', 'info');
      }
    } else {
      clipsWithUser.forEach(c => {
        enqueueAction('clips', 'insert', c);
      });
      addToast('Imported locally. Will sync when online.', 'info');
    }

    addToast(`Successfully imported ${importedList.length} clips!`, 'success');

    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 },
    });
  };

  // --- DATA BACKUP (IMPORT / EXPORT) ---
  const downloadFile = (filename: string, content: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = (format: 'txt' | 'json' | 'md') => {
    if (format !== 'txt' && userPlan !== 'pro') {
      setIsUpgradeModalOpen(true);
      addToast('JSON and MD exports are premium features!', 'warning');
      return;
    }

    if (clips.length === 0) {
      addToast('No clips to export.', 'info');
      return;
    }

    const dateStr = new Date().toISOString().split('T')[0];

    if (format === 'txt') {
      let contentStr = `=== FREECLIPBOARD BACKUP ===\nGenerated: ${new Date().toLocaleString()}\nTotal Clips: ${clips.length}\n============================\n\n`;
      
      clips.forEach(clip => {
        contentStr += `=== CLIP ===\n`;
        contentStr += `Title: ${clip.title || ''}\n`;
        contentStr += `Tags: ${clip.tags.join(', ')}\n`;
        contentStr += `Pinned: ${clip.pinned}\n`;
        contentStr += `Date: ${clip.created_at}\n`;
        contentStr += `Content:\n${clip.content}\n`;
        contentStr += `=== END CLIP ===\n\n`;
      });

      downloadFile(`freeclipboard_backup_${dateStr}.txt`, contentStr, 'text/plain;charset=utf-8');
      addToast('Clips exported as .txt successfully!', 'success');
    } else if (format === 'json') {
      const contentStr = JSON.stringify(clips, null, 2);
      downloadFile(`freeclipboard_backup_${dateStr}.json`, contentStr, 'application/json;charset=utf-8');
      addToast('Clips exported as .json successfully!', 'success');
    } else if (format === 'md') {
      let contentStr = `# FreeClipboard Backup - ${new Date().toLocaleDateString()}\n\n`;
      contentStr += `Total Clips: ${clips.length}\n\n`;
      contentStr += `---\n\n`;

      clips.forEach(clip => {
        contentStr += `## ${clip.title || 'Untitled Clip'}\n`;
        contentStr += `- **Created At:** ${new Date(clip.created_at).toLocaleString()}\n`;
        contentStr += `- **Tags:** ${clip.tags.join(', ') || '*None*'}\n`;
        contentStr += `- **Pinned:** ${clip.pinned ? 'Yes' : 'No'}\n\n`;
        contentStr += `\`\`\`text\n${clip.content}\n\`\`\`\n\n`;
        contentStr += `---\n\n`;
      });

      downloadFile(`freeclipboard_backup_${dateStr}.md`, contentStr, 'text/markdown;charset=utf-8');
      addToast('Clips exported as .md successfully!', 'success');
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        let importedClips: Clip[] = [];

        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text);
          if (!Array.isArray(parsed)) {
            throw new Error("JSON backup must be an array of clips");
          }
          importedClips = parsed.map((item: unknown) => {
            const raw = item as Record<string, unknown>;
            return {
              id: typeof raw.id === 'string' ? raw.id : 'clip-' + Math.random().toString(36).substr(2, 9),
              content: typeof raw.content === 'string' ? raw.content : '',
              title: typeof raw.title === 'string' ? raw.title : undefined,
              tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
              pinned: Boolean(raw.pinned),
              folder_id: typeof raw.folder_id === 'string' ? raw.folder_id : undefined,
              created_at: typeof raw.created_at === 'string' ? raw.created_at : new Date().toISOString()
            };
          }).filter(c => c.content.trim().length > 0);
        } else if (file.name.endsWith('.txt')) {
          if (text.includes('=== CLIP ===')) {
            const clipBlocks = text.split('=== CLIP ===').slice(1);
            for (const block of clipBlocks) {
              const parts = block.split('=== END CLIP ===')[0];
              const contentStartIndex = parts.indexOf('Content:\n');
              if (contentStartIndex === -1) continue;

              const metaPart = parts.substring(0, contentStartIndex);
              const contentPart = parts.substring(contentStartIndex + 9);

              let title: string | undefined = undefined;
              let tags: string[] = [];
              let pinned = false;
              let dateStr = new Date().toISOString();

              const metaLines = metaPart.split('\n');
              for (const line of metaLines) {
                if (line.startsWith('Title:')) {
                  title = line.substring(6).trim() || undefined;
                } else if (line.startsWith('Tags:')) {
                  tags = line.substring(5).split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
                } else if (line.startsWith('Pinned:')) {
                  pinned = line.substring(7).trim() === 'true';
                } else if (line.startsWith('Date:')) {
                  dateStr = line.substring(5).trim() || dateStr;
                }
              }

              const contentCleaned = contentPart.endsWith('\n') ? contentPart.slice(0, -1) : contentPart;

              importedClips.push({
                id: 'clip-' + Math.random().toString(36).substr(2, 9),
                title,
                content: contentCleaned,
                tags,
                pinned,
                created_at: dateStr
              });
            }
          } else {
            const title = file.name.replace(/\.[^/.]+$/, "");
            importedClips.push({
              id: 'clip-' + Math.random().toString(36).substr(2, 9),
              title: title || 'Imported Text',
              content: text,
              tags: ['IMPORTED'],
              pinned: false,
              created_at: new Date().toISOString()
            });
          }
        } else {
          throw new Error("Unsupported file format");
        }

        if (importedClips.length === 0) {
          addToast('No valid clips found in backup file.', 'warning');
          return;
        }

        const totalPotentialClips = clips.length + importedClips.length;
        if (userPlan === 'free' && totalPotentialClips > 500) {
          const allowedSpace = Math.max(0, 500 - clips.length);
          if (allowedSpace === 0) {
            addToast('Import blocked! Limit of 500 clips reached. Upgrade to Pro.', 'warning');
            setIsUpgradeModalOpen(true);
            return;
          }

          const allowedClips = importedClips.slice(0, allowedSpace);
          executeImportClips(allowedClips);
          addToast(`Imported ${allowedClips.length} clips. Upgrade to Pro to import the remaining ${importedClips.length - allowedSpace}!`, 'warning');
          setIsUpgradeModalOpen(true);
          return;
        }

        executeImportClips(importedClips);
        
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#10b981', '#6366f1', '#8b5cf6']
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        addToast('Failed to parse file: ' + msg, 'warning');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleOpenNewClipModal = useCallback((isShortcut = false) => {
    const activeClipCount = clips.filter((clip) => !isDeletedClip(clip)).length;
    if (userPlan === 'free' && activeClipCount >= 500) {
      closeMobileShellSurfaces('upgrade');
      setIsUpgradeModalOpen(true);
      addToast('Clip limit reached! Please upgrade to Pro.', 'warning');
    } else {
      closeMobileShellSurfaces('new-clip');
      closePrimaryClipModals('new');
      setIsNewClipOpen(true);
      if (isShortcut) {
        addToast('Quick-Add Modal opened!', 'info');
      }
    }
  }, [clips, userPlan, addToast, closeMobileShellSurfaces, closePrimaryClipModals]);

  // Global Keyboard Shortcuts Effect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+Shift+V or Cmd+Shift+V
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        handleOpenNewClipModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleOpenNewClipModal]);

  // --- FILTERING LOGIC ---
  const liveClips = clips.filter((clip) => !isDeletedClip(clip));
  const trashedClips = clips.filter((clip) => isDeletedClip(clip));

  const filteredClips = clips.filter((clip) => {
    if (activeFilter === 'trash') {
      if (!isDeletedClip(clip)) return false;
    } else if (isDeletedClip(clip)) {
      return false;
    }

    if (viewMode === 'checklist') {
      if (!isTaskClip(clip)) return false;
      if (taskFilter !== 'all' && getTaskStatus(clip) !== taskFilter) return false;
    }

    // 1. Sidebar Category/Folder filtering
    if (activeFilter === 'pinned' && !clip.pinned) return false;
    if (activeFilter === 'folder') {
      if (selectedFolderId === 'uncategorized') {
        if (clip.folder_id) return false;
      } else {
        if (clip.folder_id !== selectedFolderId) return false;
      }
    }

    // 2. Top bar search filtering
    if (debouncedSearch.trim().length > 0) {
      const query = debouncedSearch.toLowerCase();
      const contentMatch = clip.content.toLowerCase().includes(query);
      const titleMatch = clip.title?.toLowerCase().includes(query) || false;
      const tagMatch = clip.tags.some(tag => tag.toLowerCase().includes(query));
      return contentMatch || titleMatch || tagMatch;
    }

    return true;
  });

  const sortedClips = [...filteredClips].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const activeFolder = selectedFolderId === 'uncategorized'
    ? { id: 'uncategorized', name: 'Uncategorized', color: '#737373', created_at: '' }
    : folders.find(f => f.id === selectedFolderId);

  const isPro = isProUser(userPlan, userTrialEndsAt);
  const isDarkTheme = themeMode === 'dark';
  const workspaceTitle =
    activeFilter === 'all'
      ? 'All Synced Clips'
      : activeFilter === 'pinned'
      ? 'Pinned Clips'
      : activeFilter === 'trash'
      ? 'Trash'
      : `Folder: ${activeFolder?.name || 'Clips'}`;
  const workspaceSubtitle =
    activeFilter === 'trash'
      ? 'Deleted clips stay here until you restore them.'
      :
    activeFilter === 'folder'
      ? `Viewing workspace clips filed under ${activeFolder?.name}`
      : 'Manage, organize, preview, and share your synced clipboard workspace.';
  const surfaceClass = isDarkTheme
    ? 'border-white/8 bg-neutral-950/70 text-neutral-100 shadow-[0_24px_90px_rgba(15,23,42,0.45)]'
    : 'border-slate-200/80 bg-white/88 text-slate-900 shadow-[0_24px_70px_rgba(148,163,184,0.22)]';
  const mutedSurfaceClass = isDarkTheme
    ? 'border-white/6 bg-white/[0.03]'
    : 'border-slate-200/90 bg-slate-50/90';
  const subtleTextClass = isDarkTheme ? 'text-neutral-400' : 'text-slate-500';
  const titleTextClass = isDarkTheme ? 'text-white' : 'text-slate-900';
  const navTextClass = isDarkTheme ? 'text-neutral-400 hover:text-neutral-200' : 'text-slate-600 hover:text-slate-900';
  const navBadgeClass = isDarkTheme
    ? 'bg-black/40 border-white/5 text-neutral-400'
    : 'bg-slate-200/90 border-slate-200 text-slate-700';
  const softPanelClass = isDarkTheme
    ? 'border-white/6 bg-neutral-900/38'
    : 'border-slate-200/80 bg-white/92';
  const summaryPanelClass = isDarkTheme
    ? 'border-t border-emerald-500/15 bg-gradient-to-r from-emerald-500/8 via-emerald-500/4 to-transparent'
    : 'border-t border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50/70 to-transparent';
  const rewritePanelClass = isDarkTheme
    ? 'border-t border-indigo-500/15 bg-gradient-to-r from-indigo-500/8 via-violet-500/5 to-transparent'
    : 'border-t border-indigo-200 bg-gradient-to-r from-indigo-50 via-violet-50/70 to-transparent';
  const translatePanelClass = isDarkTheme
    ? 'border-t border-violet-500/15 bg-gradient-to-r from-violet-500/8 via-fuchsia-500/5 to-transparent'
    : 'border-t border-violet-200 bg-gradient-to-r from-violet-50 via-fuchsia-50/70 to-transparent';
  const actionRailClass = isDarkTheme
    ? 'bg-black/30 border-white/5'
    : 'bg-slate-100/80 border-slate-200';
  const dropdownSurfaceClass = isDarkTheme
    ? 'border-white/10 bg-neutral-950 text-neutral-100'
    : 'border-slate-200 bg-white text-slate-900';
  const listSnippetClass = isDarkTheme
    ? 'border-white/5 bg-black/20 hover:bg-black/30'
    : 'border-slate-200 bg-white hover:bg-slate-50/80';
  const listActionButtonClass = isDarkTheme
    ? 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
    : 'text-slate-500 hover:text-slate-800 hover:bg-white';
  const listDismissButtonClass = isDarkTheme
    ? 'text-neutral-400 hover:text-neutral-200 bg-black/20 border border-white/5'
    : 'text-slate-600 hover:text-slate-900 bg-white/80 border border-slate-200';
  const appBgClass = isDarkTheme
    ? 'bg-[#07070a] text-neutral-100 selection:bg-indigo-500/30 selection:text-indigo-200'
    : 'bg-[radial-gradient(circle_at_top_left,_#ffffff,_#eef2ff_28%,_#f8fafc_60%,_#eef2ff_100%)] text-slate-900 selection:bg-indigo-200 selection:text-indigo-950';
  const isMobileShellOverlayOpen = isMobileViewport && (isSidebarOpen || isClipMindDrawerOpen);
  const mobileClipMindActionClip = showClipMindMenu
    ? (
        previewingClip?.id === showClipMindMenu
          ? previewingClip
          : mobileCardActionClip?.id === showClipMindMenu
            ? mobileCardActionClip
            : clips.find((clip) => clip.id === showClipMindMenu) || null
      )
    : null;
  const renderClipMindMenu = (clip: Clip, align: 'left' | 'right' = 'right') => (
    isMobileViewport ? null : (
    <div
      onMouseLeave={() => setShowClipMindMenu(null)}
      className={`absolute top-full z-40 mt-2 max-h-[min(72vh,34rem)] w-[min(22rem,calc(100%_-_0.5rem),calc(100vw_-_1.5rem))] max-w-[calc(100vw_-_1.5rem)] overflow-y-auto rounded-[1.6rem] border p-3 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl ${
        align === 'right' ? 'left-0 sm:left-auto sm:right-0' : 'left-0 sm:right-auto'
      } ${dropdownSurfaceClass}`}
    >
      <div
        className={`mb-3 overflow-hidden rounded-[1.35rem] border px-3 py-3 ${
          isDarkTheme
            ? 'border-white/10 bg-[linear-gradient(135deg,rgba(34,211,238,0.12),rgba(168,85,247,0.12),rgba(255,255,255,0.02))]'
            : 'border-slate-200 bg-[linear-gradient(135deg,rgba(103,80,240,0.08),rgba(56,189,248,0.08),rgba(255,255,255,0.95))]'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              isDarkTheme ? 'bg-white/8 text-cyan-200' : 'bg-white text-indigo-600 shadow-sm'
            }`}
          >
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${isDarkTheme ? 'text-cyan-200' : 'text-indigo-700'}`}>
              ClipMind
            </p>
            <h4 className="mt-1 text-sm font-black leading-tight">
              One-click AI actions for this clip
            </h4>
            <p className={`mt-1 text-[11px] leading-relaxed ${subtleTextClass}`}>
              Pick a section, run an action, and apply the result when it fits.
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {CLIP_MIND_ACTION_GROUPS.map((group) => (
          <div
            key={group.title}
            className={`overflow-hidden rounded-[1.35rem] border ${
              isDarkTheme ? 'border-white/8 bg-white/[0.03]' : 'border-slate-200/90 bg-white/80'
            }`}
          >
            <div className={`bg-gradient-to-r px-3 py-2.5 ${group.accent}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className={`text-[10px] font-black uppercase tracking-[0.22em] ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                    {group.title}
                  </div>
                  <p className={`mt-1 text-[11px] leading-relaxed ${subtleTextClass}`}>
                    {group.description}
                  </p>
                </div>
                <div
                  className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                    isDarkTheme ? 'bg-black/20 text-neutral-200' : 'bg-white/90 text-slate-600'
                  }`}
                >
                  {group.actions.length}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2">
            {group.actions.map((item) => (
                (() => {
                  const Icon = CLIP_MIND_ACTION_ICONS[item.id];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={(e) => handleClipMindAction(clip, item.id, e)}
                      className={`group rounded-2xl border px-3 py-3 text-left transition-all duration-200 ${
                        isDarkTheme
                          ? 'border-white/8 bg-black/10 text-neutral-200 hover:border-cyan-400/30 hover:bg-cyan-400/8 hover:text-white'
                          : 'border-slate-200 bg-white text-slate-800 hover:border-indigo-200 hover:bg-indigo-50/70 hover:text-slate-950'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${
                            isDarkTheme
                              ? 'bg-white/6 text-cyan-200 group-hover:bg-cyan-400/12'
                              : 'bg-slate-100 text-indigo-600 group-hover:bg-white'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold leading-tight">
                            {item.label}
                          </div>
                          <div className={`mt-1 text-[10px] leading-relaxed ${subtleTextClass}`}>
                            {item.hint}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })()
            ))}
            </div>
          </div>
        ))}
      </div>
    </div>
    )
  );

  const renderMobileClipCard = (clip: Clip, options?: { draggable?: boolean; onDragStart?: (e: React.DragEvent) => void; className?: string }) => {
    const clipFolder = folders.find((folder) => folder.id === clip.folder_id);
    const visibleTags = getVisibleClipTags(clip);
    const isCodeClip = Boolean(clip.metadata?.code_language) || detectClipContentType(clip.content) === 'code';
    const isTask = isTaskClip(clip);
    const taskStatus = isTask ? getTaskStatus(clip) : null;
    const isSelected = selectedClipIds.includes(clip.id);

    return (
      <Card
        key={clip.id}
        draggable={options?.draggable && !isSelectionMode}
        onDragStart={options?.onDragStart}
        onClick={() => {
          if (isSelectionMode) {
            handleToggleSelect(clip.id);
          } else {
            openClipPreview(clip);
          }
        }}
        className={`relative overflow-hidden rounded-[22px] border p-4 transition-all ${
          isSelectionMode
            ? isSelected
              ? 'border-indigo-500/40 bg-indigo-500/10 cursor-pointer'
              : isDarkTheme
                ? 'border-white/6 bg-neutral-900/40 cursor-pointer'
                : 'border-slate-200/80 bg-white/92 cursor-pointer'
            : isDarkTheme
              ? 'border-white/6 bg-neutral-900/40 shadow-xl'
              : 'border-slate-200/80 bg-white/92 shadow-[0_12px_30px_rgba(148,163,184,0.14)]'
        } ${options?.className || ''}`}
      >
        {isSelectionMode && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              handleToggleSelect(clip.id);
            }}
            className={`absolute left-4 top-4 z-20 flex h-5 w-5 items-center justify-center rounded-full border transition-all ${
              isSelected
                ? 'border-indigo-400 bg-indigo-500 text-white'
                : isDarkTheme
                  ? 'border-white/20 bg-neutral-950/80'
                  : 'border-slate-300 bg-white'
            }`}
          >
            {isSelected && (
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        )}

        <div className={`flex flex-col gap-3 ${isSelectionMode ? 'pl-7' : ''}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h4 className={`line-clamp-2 text-sm font-black leading-5 [overflow-wrap:anywhere] ${titleTextClass}`}>
                {clip.title || 'Untitled Clip'}
              </h4>
              <p className={`mt-1 text-[11px] font-bold uppercase tracking-[0.16em] ${subtleTextClass}`}>
                {new Date(clip.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => openClipPreview(clip)}
                className={`inline-flex h-9 items-center justify-center rounded-xl border px-2.5 text-[11px] font-bold ${
                  isDarkTheme
                    ? 'border-indigo-500/15 bg-indigo-500/10 text-indigo-300'
                    : 'border-indigo-100 bg-indigo-50 text-indigo-700'
                }`}
                title="View clip"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleCopyContent(clip.id, clip.content)}
                className={`inline-flex h-9 items-center justify-center rounded-xl border px-2.5 text-[11px] font-bold ${
                  copiedClipId === clip.id
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                    : isDarkTheme
                      ? 'border-white/10 bg-black/25 text-neutral-300'
                      : 'border-slate-200 bg-white text-slate-700'
                }`}
                title="Copy clip"
              >
                {copiedClipId === clip.id ? 'Copied' : <Clipboard className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={(e) => openMobileCardActionSheet(clip, e)}
                className={`inline-flex h-9 items-center justify-center rounded-xl border px-2.5 text-[11px] font-bold ${
                  isDarkTheme
                    ? 'border-white/10 bg-black/25 text-neutral-300'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
                title="More actions"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {clipFolder && (
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${isDarkTheme ? 'bg-black/30' : 'bg-white/85'}`}
                style={{ borderColor: `${clipFolder.color}33`, color: clipFolder.color }}
              >
                {clipFolder.name}
              </span>
            )}
            {taskStatus && (
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
                taskStatus === 'done'
                  ? 'border-emerald-300/40 bg-emerald-50 text-emerald-700'
                  : taskStatus === 'in-progress'
                    ? 'border-amber-300/40 bg-amber-50 text-amber-700'
                    : isDarkTheme
                      ? 'border-slate-500/20 bg-slate-500/10 text-slate-300'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}>
                {taskStatus.replace('-', ' ')}
              </span>
            )}
          </div>

          <div className={`overflow-hidden rounded-2xl border px-3 py-2.5 ${isDarkTheme ? 'border-white/6 bg-black/20' : 'border-slate-200 bg-slate-50/85'}`}>
            <p className={`whitespace-pre-wrap break-words ${isCodeClip ? 'line-clamp-4 font-mono text-[11px] leading-5' : 'line-clamp-3 text-[12px] leading-6'} ${isDarkTheme ? 'text-neutral-300' : 'text-slate-700'}`}>
              {clip.content}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {visibleTags.length > 0 ? visibleTags.slice(0, 3).map((tag, idx) => (
              <span
                key={idx}
                className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${
                  isDarkTheme
                    ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300'
                    : 'border-indigo-100 bg-indigo-50 text-indigo-600'
                }`}
              >
                {tag}
              </span>
            )) : (
              <span className={`text-[10px] ${subtleTextClass}`}>No tags</span>
            )}
            {visibleTags.length > 3 && (
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${isDarkTheme ? 'border-white/8 bg-white/5 text-neutral-400' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>
                +{visibleTags.length - 3}
              </span>
            )}
          </div>

          {clipSummaries[clip.id] && (
            <div
              onClick={(e) => toggleSummaryCollapse(clip.id, e)}
              className={`rounded-2xl border px-3 py-2 text-[11px] ${summaryPanelClass} cursor-pointer`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-bold uppercase tracking-[0.16em] text-emerald-400">
                  <Sparkles className="h-3 w-3" />
                  <span>AI Summary</span>
                </div>
                {collapsedSummaries[clip.id] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </div>
              {!collapsedSummaries[clip.id] && (
                <p className={`mt-2 whitespace-pre-wrap break-words rounded-2xl border p-2.5 text-[11px] leading-5 ${isDarkTheme ? 'border-emerald-500/10 bg-black/20 text-neutral-300' : 'border-emerald-200 bg-white/80 text-slate-700'}`}>
                  {clipSummaries[clip.id]?.summary}
                </p>
              )}
            </div>
          )}
        </div>
      </Card>
    );
  };
  const renderClipMindPanel = (clip: Clip, compact = false) => {
    const output = clipMindResults[clip.id];
    if (!output) return null;

    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className={`rounded-2xl border ${compact ? 'mt-2 p-3' : 'mt-3 p-4'} ${isDarkTheme ? 'border-cyan-500/20 bg-cyan-500/8' : 'border-cyan-200 bg-cyan-50/90'}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${isDarkTheme ? 'text-cyan-300' : 'text-cyan-700'}`}>
              ClipMind {output.label}
            </p>
            {output.isFallback && (
              <p className={`mt-1 text-[11px] ${isDarkTheme ? 'text-amber-300' : 'text-amber-700'}`}>
                {output.warning || 'Local fallback generated.'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {output.applyTarget && (
              <button
                type="button"
                onClick={(e) => handleApplyClipMindResult(clip, e)}
                className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] ${
                  isDarkTheme ? 'bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20' : 'bg-white text-cyan-700 hover:bg-cyan-100'
                }`}
              >
                Apply
              </button>
            )}
            <button
              type="button"
              onClick={(e) => handleSaveClipMindResultAsClip(clip.id, e)}
              className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] ${
                isDarkTheme ? 'bg-indigo-400/10 text-indigo-300 hover:bg-indigo-400/20' : 'bg-white text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              Save as new clip
            </button>
            <button
              type="button"
              onClick={(e) => handleCopyClipMindResult(clip.id, e)}
              className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] ${
                isDarkTheme ? 'bg-white/6 text-neutral-200 hover:bg-white/10' : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              Copy
            </button>
            <button
              type="button"
              onClick={(e) => dismissClipMindResult(clip.id, e)}
              className={`rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] ${subtleTextClass}`}
            >
              Dismiss
            </button>
          </div>
        </div>
        <pre className={`mt-2 whitespace-pre-wrap break-words font-sans text-xs leading-6 ${isDarkTheme ? 'text-neutral-200' : 'text-slate-700'}`}>
          {output.result}
        </pre>
      </div>
    );
  };
  const renderClipMindMessageBody = (content: string) => {
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    const nodes: React.ReactNode[] = [];
    let bulletBuffer: string[] = [];
    let numberedBuffer: string[] = [];
    let paragraphBuffer: string[] = [];

    const flushParagraph = () => {
      if (!paragraphBuffer.length) return;
      nodes.push(
        <p key={`p-${nodes.length}`} className={`text-[13px] leading-7 ${isDarkTheme ? 'text-neutral-200' : 'text-slate-700'}`}>
          {paragraphBuffer.join(' ')}
        </p>
      );
      paragraphBuffer = [];
    };

    const flushBullets = () => {
      if (!bulletBuffer.length) return;
      nodes.push(
        <ul key={`ul-${nodes.length}`} className={`space-y-2 pl-5 text-[13px] leading-7 list-disc ${isDarkTheme ? 'text-neutral-200 marker:text-cyan-300' : 'text-slate-700 marker:text-indigo-500'}`}>
          {bulletBuffer.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
      bulletBuffer = [];
    };

    const flushNumbered = () => {
      if (!numberedBuffer.length) return;
      nodes.push(
        <ol key={`ol-${nodes.length}`} className={`space-y-2 pl-5 text-[13px] leading-7 list-decimal ${isDarkTheme ? 'text-neutral-200 marker:text-cyan-300' : 'text-slate-700 marker:text-indigo-500'}`}>
          {numberedBuffer.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ol>
      );
      numberedBuffer = [];
    };

    lines.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) {
        flushParagraph();
        flushBullets();
        flushNumbered();
        return;
      }

      if (/^#{1,4}\s/.test(line)) {
        flushParagraph();
        flushBullets();
        flushNumbered();
        nodes.push(
          <h4 key={`h-${nodes.length}`} className={`text-[11px] font-black uppercase tracking-[0.18em] ${isDarkTheme ? 'text-cyan-200' : 'text-indigo-700'}`}>
            {line.replace(/^#{1,4}\s*/, '')}
          </h4>
        );
        return;
      }

      if (/^(-|\*)\s+/.test(line)) {
        flushParagraph();
        flushNumbered();
        bulletBuffer.push(line.replace(/^(-|\*)\s+/, ''));
        return;
      }

      if (/^\d+\.\s+/.test(line)) {
        flushParagraph();
        flushBullets();
        numberedBuffer.push(line.replace(/^\d+\.\s+/, ''));
        return;
      }

      paragraphBuffer.push(line);
    });

    flushParagraph();
    flushBullets();
    flushNumbered();

    return nodes.length > 0 ? nodes : (
      <p className={`text-[13px] leading-7 ${isDarkTheme ? 'text-neutral-200' : 'text-slate-700'}`}>
        {content}
      </p>
    );
  };
  const getClipMindConversationType = (conversation: ClipMindConversation) => {
    const haystack = `${conversation.title} ${conversation.messages.map((message) => message.content).join(' ')}`.toLowerCase();
    if (/(task|todo|checklist|deadline)/.test(haystack)) {
      return { icon: ListChecks, label: 'Task' };
    }
    if (/(summary|summarize|overview)/.test(haystack)) {
      return { icon: Brain, label: 'Summary' };
    }
    if (/(draft|email|proposal|reply)/.test(haystack)) {
      return { icon: FileText, label: 'Draft' };
    }
    return { icon: MessageSquare, label: 'Chat' };
  };

  const getClipMindConversationTimestamp = (value: string) =>
    new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const categoryKeywords: Record<ClipMindSidebarCategory, RegExp> = {
    notes: /(note|notes|meeting|research|summary|document)/i,
    tasks: /(task|todo|checklist|deadline|action item)/i,
    bugs: /(bug|issue|error|crash|fix)/i,
    features: /(feature|roadmap|enhancement|improve|launch)/i,
    'ai-actions': /(ai|rewrite|translate|summarize|prompt|clipmind)/i,
  };

  const filteredClipMindConversations = clipMindConversations.filter((conversation) => {
    const haystack = `${conversation.title} ${conversation.messages.map((message) => message.content).join(' ')}`;
    if (!categoryKeywords[clipMindSidebarCategory].test(haystack)) return false;

    if (clipMindQuickFilter === 'pinned') {
      return clipMindPinnedConversationIds.includes(conversation.id);
    }
    if (clipMindQuickFilter === 'shared') {
      return /(share|shared|link|send)/i.test(haystack);
    }
    if (clipMindQuickFilter === 'ai-generated') {
      return /(ai|rewrite|translate|summary|generated)/i.test(haystack);
    }

    return true;
  });

  const pinnedClipMindConversations = filteredClipMindConversations.filter((conversation) =>
    clipMindPinnedConversationIds.includes(conversation.id)
  );

  const visibleClipMindConversations =
    clipMindChatTab === 'pinned'
      ? pinnedClipMindConversations
      : filteredClipMindConversations;
  const renderClipMindDrawer = () => {
    const activeConversation = clipMindConversations.find(
      (conversation) => conversation.id === activeClipMindConversationId
    );

    return (
      <aside
        className={`fixed right-3 top-3 bottom-[5.25rem] z-50 flex w-[calc(100%_-_1.5rem)] max-w-[56rem] min-w-0 flex-col overflow-hidden rounded-[30px] border shadow-[0_28px_90px_rgba(15,23,42,0.24)] transition-transform duration-300 ease-out md:bottom-3 ${
          isDarkTheme
            ? 'border-white/8 bg-neutral-950 text-neutral-100'
            : 'border-slate-200/80 bg-white text-slate-900'
        } ${isClipMindDrawerOpen ? 'translate-x-0' : 'translate-x-[calc(100%+1.5rem)]'}`}
      >
        <div className={`shrink-0 border-b px-4 py-3 sm:px-5 ${isDarkTheme ? 'border-white/8 bg-neutral-950' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                isDarkTheme
                  ? 'bg-gradient-to-br from-indigo-500/30 via-violet-500/20 to-cyan-500/20 text-indigo-200'
                  : 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-[0_14px_30px_rgba(99,102,241,0.22)]'
              }`}>
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className={`text-[10px] font-black uppercase tracking-[0.28em] ${isDarkTheme ? 'text-indigo-300' : 'text-indigo-700'}`}>
                  ClipMind
                </p>
                <h3 className={`mt-1 text-base font-black leading-tight ${titleTextClass}`}>
                  AI Assistant
                </h3>
                <p className={`mt-1 max-w-xl text-xs leading-5 ${subtleTextClass}`}>
                  Search, summarize, organize, or create from your clips.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleTheme}
                className={`hidden rounded-xl border p-2 transition sm:inline-flex ${isDarkTheme ? 'border-white/8 text-neutral-400 hover:bg-white/5 hover:text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
                title={isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDarkTheme ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={handleToggleClipMindCompactMode}
                className={`hidden rounded-xl border px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] transition md:inline-flex ${isDarkTheme ? 'border-white/8 text-neutral-300 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                title="Toggle compact mode"
              >
                {clipMindCompactMode ? 'Comfort' : 'Compact'}
              </button>
              <button
                type="button"
                onClick={() => setIsClipMindDrawerOpen(false)}
                className={`rounded-xl border p-2 transition ${isDarkTheme ? 'border-white/8 text-neutral-400 hover:bg-white/5 hover:text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
                title="Close ClipMind"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { label: 'Saved Clips', value: liveClips.length },
              { label: 'Visible Clips', value: filteredClips.length },
              { label: 'Chats', value: clipMindConversations.length },
            ].map((stat) => (
              <div
                key={stat.label}
                className={`rounded-2xl border px-3 py-2 ${isDarkTheme ? 'border-white/8 bg-neutral-900' : 'border-slate-200 bg-slate-50'}`}
              >
                <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${subtleTextClass}`}>{stat.label}</p>
                <p className={`mt-1 text-lg font-black leading-none ${titleTextClass}`}>{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className={`hidden shrink-0 border-r px-2 py-3 md:flex md:w-[4.5rem] md:flex-col md:items-center md:gap-2 xl:w-[11rem] xl:items-stretch xl:px-3 ${isDarkTheme ? 'border-white/8 bg-neutral-950' : 'border-slate-200 bg-slate-50/70'}`}>
            <div className="w-full">
              <p className={`mb-2 hidden text-[10px] font-black uppercase tracking-[0.22em] xl:block ${subtleTextClass}`}>Categories</p>
              <div className="flex flex-col gap-2">
                {CLIP_MIND_SIDEBAR_SECTIONS.map((section) => {
                  const Icon = section.icon;
                  const isActive = clipMindSidebarCategory === section.id;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => {
                        setClipMindSidebarCategory(section.id);
                        handleClipMindSidebarPrompt(section.prompt);
                      }}
                      className={`flex items-center justify-center gap-2 rounded-2xl border px-2.5 py-2 text-[11px] font-bold transition xl:justify-start ${
                        isActive
                          ? isDarkTheme
                            ? 'border-indigo-400/30 bg-indigo-500/10 text-white'
                            : 'border-indigo-200 bg-indigo-50 text-slate-900'
                          : isDarkTheme
                            ? 'border-white/8 bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                      title={section.label}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="hidden xl:inline">{section.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="w-full pt-1">
              <p className={`mb-2 hidden text-[10px] font-black uppercase tracking-[0.22em] xl:block ${subtleTextClass}`}>Quick Filters</p>
              <div className="flex flex-col gap-2">
                {CLIP_MIND_QUICK_FILTERS.map((filter) => {
                  const Icon = filter.icon;
                  const isActive = clipMindQuickFilter === filter.id;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setClipMindQuickFilter(isActive ? null : filter.id)}
                      className={`flex items-center justify-center gap-2 rounded-2xl border px-2.5 py-2 text-[11px] font-bold transition xl:justify-start ${
                        isActive
                          ? isDarkTheme
                            ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
                            : 'border-cyan-200 bg-cyan-50 text-cyan-700'
                          : isDarkTheme
                            ? 'border-white/8 bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                      title={filter.label}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="hidden xl:inline">{filter.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className={`shrink-0 border-b px-4 py-3 sm:px-5 ${isDarkTheme ? 'border-white/8 bg-neutral-950' : 'border-slate-200 bg-white'}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setClipMindChatTab('recent')}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] transition ${
                      clipMindChatTab === 'recent'
                        ? isDarkTheme ? 'bg-white text-neutral-950' : 'bg-slate-900 text-white'
                        : isDarkTheme ? 'bg-neutral-900 text-neutral-400' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    Recent Chats
                  </button>
                  <button
                    type="button"
                    onClick={() => setClipMindChatTab('pinned')}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] transition ${
                      clipMindChatTab === 'pinned'
                        ? isDarkTheme ? 'bg-white text-neutral-950' : 'bg-slate-900 text-white'
                        : isDarkTheme ? 'bg-neutral-900 text-neutral-400' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    Pinned Chats
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleNewClipMindConversation}
                  className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-3.5 text-[11px] font-black uppercase tracking-[0.16em] text-white shadow-[0_14px_30px_rgba(99,102,241,0.24)] transition hover:translate-y-[-1px] lg:self-auto"
                >
                  <Plus className="h-4 w-4" />
                  New Chat
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-4 py-3 sm:px-5">
              <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[18rem_minmax(0,1fr)]">
                <div className="flex min-h-0 flex-col gap-3">
                  <div className={`rounded-[1.35rem] border p-2 ${isDarkTheme ? 'border-white/8 bg-neutral-900' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="max-h-56 space-y-2 overflow-y-auto">
                      {isClipMindHistoryLoading && visibleClipMindConversations.length === 0 ? (
                        <div className={`rounded-2xl border px-3 py-2 text-xs ${mutedSurfaceClass}`}>Loading history...</div>
                      ) : visibleClipMindConversations.length > 0 ? (
                        visibleClipMindConversations.map((conversation) => {
                          const meta = getClipMindConversationType(conversation);
                          const Icon = meta.icon;
                          const isPinned = clipMindPinnedConversationIds.includes(conversation.id);
                          const isActive = activeClipMindConversationId === conversation.id;
                          return (
                            <div
                              key={conversation.id}
                              className={`min-w-0 rounded-2xl border px-3 py-2 transition ${
                                isActive
                                  ? isDarkTheme
                                    ? 'border-indigo-400/30 bg-indigo-500/10'
                                    : 'border-indigo-200 bg-indigo-50'
                                  : isDarkTheme
                                    ? 'border-white/8 bg-neutral-950'
                                    : 'border-slate-200 bg-white'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSelectClipMindConversation(conversation.id)}
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${isDarkTheme ? 'bg-white/6 text-indigo-300' : 'bg-indigo-50 text-indigo-600'}`}>
                                      <Icon className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0">
                                      <p className={`truncate text-[13px] font-bold ${titleTextClass}`}>{conversation.title}</p>
                                      <div className={`mt-0.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] ${subtleTextClass}`}>
                                        <span>{meta.label}</span>
                                        <span>{getClipMindConversationTimestamp(conversation.updated_at)}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <p className={`mt-1 line-clamp-2 break-words text-[11px] leading-4 ${subtleTextClass}`}>
                                    {conversation.messages.at(-1)?.content || 'Start a new idea thread'}
                                  </p>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleTogglePinnedClipMindConversation(conversation.id)}
                                  className={`rounded-xl p-2 transition ${
                                    isPinned
                                      ? isDarkTheme
                                        ? 'bg-amber-500/10 text-amber-300'
                                        : 'bg-amber-50 text-amber-600'
                                      : isDarkTheme
                                        ? 'text-neutral-500 hover:bg-white/5 hover:text-neutral-200'
                                        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                                  }`}
                                  title={isPinned ? 'Unpin chat' : 'Pin chat'}
                                >
                                  <Star className={`h-4 w-4 ${isPinned ? 'fill-current' : ''}`} />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className={`rounded-2xl border px-3 py-3 text-xs ${mutedSurfaceClass}`}>
                          No chats found for this view yet.
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className={`mb-2 text-[10px] font-black uppercase tracking-[0.22em] ${subtleTextClass}`}>AI Suggestions</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {CLIP_MIND_DRAWER_STARTERS.slice(0, 4).map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => handleSendClipMindMessage(prompt)}
                          className={`min-w-[13rem] rounded-full border px-3 py-2 text-left text-[11px] font-semibold leading-4 transition ${
                            isDarkTheme ? 'border-white/8 bg-neutral-900 text-neutral-200 hover:bg-neutral-800' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={`flex min-h-0 flex-col overflow-hidden rounded-[1.45rem] border ${isDarkTheme ? 'border-white/8 bg-neutral-900' : 'border-slate-200 bg-slate-50/70'}`}>
                  <div className={`shrink-0 border-b px-4 py-3 ${isDarkTheme ? 'border-white/8 bg-neutral-900' : 'border-slate-200 bg-white/80'}`}>
                    <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${subtleTextClass}`}>Conversation</p>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className={`truncate text-sm font-black ${titleTextClass}`}>
                          {activeConversation?.title || 'Start a new ClipMind chat'}
                        </h4>
                        <p className={`mt-0.5 text-[11px] ${subtleTextClass}`}>
                          {clipMindMessages.length > 0 ? `${clipMindMessages.length} messages in this thread` : 'The main chat stays here.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className={`min-h-0 flex-1 overflow-y-auto px-4 py-3 ${isDarkTheme ? 'bg-neutral-900' : 'bg-white/60'}`}>
                    {clipMindMessages.length === 0 ? (
                      <div className={`rounded-[1.35rem] border p-4 ${softPanelClass}`}>
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${isDarkTheme ? 'bg-indigo-500/10 text-indigo-300' : 'bg-indigo-50 text-indigo-600'}`}>
                            <Sparkles className="h-4.5 w-4.5" />
                          </div>
                          <div>
                            <p className={`text-sm font-black ${titleTextClass}`}>Built for your saved clips</p>
                            <p className={`mt-1 text-xs leading-6 ${subtleTextClass}`}>
                              Ask for links, summaries, tasks, cleanup, organization, or drafts. ClipMind only works with your saved workspace context.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={`${clipMindCompactMode ? 'space-y-2' : 'space-y-3'} min-w-0`}>
                        {clipMindMessages.map((message, index) => (
                          <div
                            key={`${message.created_at}-${index}`}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className={`min-w-0 w-full ${message.role === 'user' ? 'sm:max-w-[72%]' : 'sm:max-w-[88%]'} rounded-[1.2rem] border ${
                              clipMindCompactMode ? 'px-3 py-2.5' : 'px-3.5 py-3'
                            } ${
                              message.role === 'user'
                                ? isDarkTheme
                                  ? 'border-indigo-400/20 bg-indigo-500/10 text-neutral-100'
                                  : 'border-indigo-200 bg-indigo-50 text-slate-900'
                                : isDarkTheme
                                  ? 'border-white/8 bg-neutral-950 text-neutral-200'
                                  : 'border-slate-200 bg-white text-slate-700'
                            }`}>
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em]">
                                  <span className={`flex h-6 w-6 items-center justify-center rounded-full ${message.role === 'user' ? (isDarkTheme ? 'bg-indigo-400/15 text-indigo-200' : 'bg-indigo-100 text-indigo-700') : (isDarkTheme ? 'bg-cyan-400/12 text-cyan-200' : 'bg-cyan-100 text-cyan-700')}`}>
                                    {message.role === 'user' ? <UserIcon className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                                  </span>
                                  <span>{message.role === 'user' ? 'You' : 'ClipMind'}</span>
                                </div>
                                {message.role === 'assistant' && message.content.trim() && (
                                  <button
                                    type="button"
                                    onClick={() => handleSaveClipMindMessage(`${message.created_at}-${index}`, message.content)}
                                    disabled={savingClipMindMessageId === `${message.created_at}-${index}`}
                                    className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-xl px-3 text-[10px] font-black uppercase tracking-[0.16em] transition ${
                                      isDarkTheme
                                        ? 'bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/15 disabled:bg-white/6 disabled:text-neutral-500'
                                        : 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100 disabled:bg-slate-100 disabled:text-slate-400'
                                    }`}
                                  >
                                    {savingClipMindMessageId === `${message.created_at}-${index}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clipboard className="h-3 w-3" />}
                                    Copy + Save
                                  </button>
                                )}
                              </div>
                              <div className={`rounded-2xl border ${clipMindCompactMode ? 'p-2.5' : 'p-3'} ${
                                isDarkTheme ? 'border-white/8 bg-black/20' : 'border-slate-200 bg-slate-50/80'
                              }`}>
                                <div className={`min-w-0 break-words ${clipMindCompactMode ? 'space-y-2' : 'space-y-3'}`}>
                                  {message.content
                                    ? renderClipMindMessageBody(message.content)
                                    : message.role === 'assistant'
                                      ? <p className={`text-[13px] leading-7 ${subtleTextClass}`}>Thinking...</p>
                                      : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        <div ref={clipMindEndRef} />
                      </div>
                    )}
                  </div>

                  <div className={`shrink-0 border-t p-3 ${isDarkTheme ? 'border-white/8 bg-neutral-900' : 'border-slate-200 bg-white'}`}>
                    <Textarea
                      value={clipMindInput}
                      onChange={(e) => setClipMindInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendClipMindMessage();
                        }
                      }}
                      placeholder="Ask ClipMind..."
                      className={`min-h-[56px] max-h-[96px] resize-none rounded-2xl border px-3 py-2 text-sm leading-6 shadow-none focus-visible:ring-0 ${
                        isDarkTheme
                          ? 'border-white/8 bg-neutral-950 text-neutral-100 placeholder:text-neutral-500'
                          : 'border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400'
                      }`}
                    />

                    <div className="mt-2 hidden flex-wrap gap-2 sm:flex">
                      {CLIP_MIND_COMPOSER_ACTIONS.map((action) => {
                        const Icon = action.icon;
                        return (
                          <button
                            key={action.id}
                            type="button"
                            onClick={() => handleClipMindQuickComposerAction(action.id)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] transition ${
                              isDarkTheme ? 'border-white/8 bg-neutral-950 text-neutral-300 hover:bg-neutral-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {action.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-2 flex items-center gap-2 sm:hidden">
                      <select
                        value={clipMindMobileQuickAction}
                        onChange={(e) => setClipMindMobileQuickAction(e.target.value as ClipMindComposerAction)}
                        className={`h-10 flex-1 rounded-2xl border px-3 text-xs font-bold ${
                          isDarkTheme ? 'border-white/8 bg-neutral-950 text-neutral-200' : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        {CLIP_MIND_COMPOSER_ACTIONS.map((action) => (
                          <option key={action.id} value={action.id}>{action.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleClipMindQuickComposerAction(clipMindMobileQuickAction)}
                        className={`h-10 rounded-2xl border px-3 text-[10px] font-black uppercase tracking-[0.16em] ${
                          isDarkTheme ? 'border-white/8 bg-neutral-950 text-neutral-300' : 'border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        Apply
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className={`text-[10px] leading-5 ${subtleTextClass}`}>
                        Uses your saved clips as context.
                      </p>
                      <button
                        type="button"
                        onClick={() => handleSendClipMindMessage()}
                        disabled={!clipMindInput.trim() || isClipMindStreaming}
                        className={`inline-flex h-9 items-center justify-center gap-2 rounded-2xl px-3.5 text-[11px] font-black transition ${
                          !clipMindInput.trim() || isClipMindStreaming
                            ? isDarkTheme
                              ? 'bg-white/6 text-neutral-500'
                              : 'bg-slate-100 text-slate-400'
                            : 'bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-[0_14px_28px_rgba(99,102,241,0.24)] hover:translate-y-[-1px]'
                        }`}
                      >
                        {isClipMindStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    );
  };
  const previewContentType = previewingClip ? detectClipContentType(previewingClip.content) : 'plain';
  const previewFormattedContent = previewingClip ? smartFormatContent(previewingClip.content, previewContentType) : '';
  const previewMarkdownHtml = previewingClip ? markdownToHtml(previewingClip.content) : '';
  const taskClips = clips.filter(isTaskClip);
  const taskCounts = taskClips.reduce(
    (acc, clip) => {
      acc[getTaskStatus(clip)] += 1;
      return acc;
    },
    { pending: 0, 'in-progress': 0, done: 0 } as Record<TaskStatus, number>
  );
  const completedTaskCount = taskCounts.done;
  const taskProgress = taskClips.length > 0 ? Math.round((completedTaskCount / taskClips.length) * 100) : 0;
  const newClipDetectedType = getNewClipDetectedType();
  const newClipWordCount = newClipContent.trim() ? newClipContent.trim().split(/\s+/).length : 0;
  const newClipCharCount = newClipContent.length;
  const newClipDuplicate = newClipContent.trim()
    ? clips.find(c => c.content.trim() === newClipContent.trim())
    : undefined;
  const safeModalPanelClass = 'safe-modal-panel w-[calc(100vw_-_24px)] max-h-[88dvh] rounded-[1.4rem] border border-slate-200 bg-white p-0 text-slate-900 shadow-[0_28px_90px_rgba(15,23,42,0.20)] sm:w-full sm:rounded-2xl';
  const safeModalFrameClass = 'safe-modal-frame flex max-h-[88dvh] min-h-0 flex-col overflow-hidden';
  const safeModalHeaderClass = 'safe-modal-header sticky top-0 z-10 border-b border-slate-200 bg-gradient-to-r from-white via-indigo-50/70 to-fuchsia-50/60 px-4 py-4 text-left sm:px-6 sm:py-5';
  const safeModalBodyClass = 'safe-modal-body min-h-0 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 sm:py-5';
  const safeModalFooterClass = 'safe-modal-footer sticky bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6';
  const newClipModeOptions: { value: NewClipContentMode; label: string; icon: React.ElementType }[] = [
    { value: 'auto', label: 'Auto', icon: ScanText },
    { value: 'plain', label: 'Note', icon: FileText },
    { value: 'code', label: 'Code', icon: Code2 },
    { value: 'markdown', label: 'Markdown', icon: ListChecks },
    { value: 'json', label: 'JSON', icon: Code2 },
  ];

  // Kanban columns partitioning
  const getKanbanColumns = () => {
    if (activeFilter === 'folder') {
      const folderId = selectedFolderId;
      const folderClips = clips.filter(c => folderId === 'uncategorized' ? !c.folder_id : c.folder_id === folderId);
      
      const searchedFolderClips = folderClips.filter(clip => {
        if (debouncedSearch.trim().length > 0) {
          const query = debouncedSearch.toLowerCase();
          return clip.content.toLowerCase().includes(query) || clip.title?.toLowerCase().includes(query) || clip.tags.some(t => t.toLowerCase().includes(query));
        }
        return true;
      });

      return [
        {
          id: 'pinned',
          name: 'Pinned',
          color: '#fbbf24',
          clips: searchedFolderClips.filter(c => c.pinned)
        },
        {
          id: 'other',
          name: 'All Clips',
          color: activeFolder?.color || '#6366f1',
          clips: searchedFolderClips.filter(c => !c.pinned)
        }
      ];
    } else if (activeFilter === 'pinned') {
      const pinnedClips = clips.filter(c => c.pinned);
      
      const searchedPinnedClips = pinnedClips.filter(clip => {
        if (debouncedSearch.trim().length > 0) {
          const query = debouncedSearch.toLowerCase();
          return clip.content.toLowerCase().includes(query) || clip.title?.toLowerCase().includes(query) || clip.tags.some(t => t.toLowerCase().includes(query));
        }
        return true;
      });

      const cols = [
        {
          id: 'uncategorized',
          name: 'Uncategorized',
          color: '#737373',
          clips: searchedPinnedClips.filter(c => !c.folder_id)
        },
        ...folders.map(f => ({
          id: f.id,
          name: f.name,
          color: f.color,
          clips: searchedPinnedClips.filter(c => c.folder_id === f.id)
        }))
      ];
      return cols.filter(col => col.clips.length > 0 || col.id === 'uncategorized');
    } else {
      const searchedClips = clips.filter(clip => {
        if (debouncedSearch.trim().length > 0) {
          const query = debouncedSearch.toLowerCase();
          return clip.content.toLowerCase().includes(query) || clip.title?.toLowerCase().includes(query) || clip.tags.some(t => t.toLowerCase().includes(query));
        }
        return true;
      });

      return [
        {
          id: 'uncategorized',
          name: 'Uncategorized',
          color: '#737373',
          clips: searchedClips.filter(c => !c.folder_id)
        },
        ...folders.map(f => ({
          id: f.id,
          name: f.name,
          color: f.color,
          clips: searchedClips.filter(c => c.folder_id === f.id)
        }))
      ];
    }
  };

  return (
    <div className={`safe-page relative flex min-h-screen font-sans transition-colors duration-300 ${appBgClass}`}>
      
      {/* Dynamic Background Ambient Blurs */}
      <div className={`absolute top-0 left-0 w-[500px] h-[500px] rounded-full blur-[120px] -z-10 pointer-events-none ${isDarkTheme ? 'bg-violet-600/5' : 'bg-indigo-300/35'}`} />
      <div className={`absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full blur-[140px] -z-10 pointer-events-none ${isDarkTheme ? 'bg-indigo-600/5' : 'bg-cyan-200/45'}`} />

      <OfflineBanner />

      {/* --- MOBILE SIDEBAR BACKDROP OVERLAY --- */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className={`fixed inset-0 z-40 md:hidden animate-in fade-in duration-200 ${
            isDarkTheme
              ? 'bg-black/60 backdrop-blur-sm'
              : 'bg-slate-950/30 backdrop-blur-[2px]'
          }`}
        />
      )}

      {isClipMindDrawerOpen && (
        <div
          onClick={() => setIsClipMindDrawerOpen(false)}
          className={`fixed inset-0 z-40 xl:hidden animate-in fade-in duration-200 ${
            isDarkTheme ? 'bg-black/45 backdrop-blur-[2px]' : 'bg-slate-950/15 backdrop-blur-[2px]'
          }`}
        />
      )}

      {/* --- SIDEBAR --- */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[min(88vw,360px)] max-w-[min(88vw,360px)] shrink-0 flex-col rounded-r-[28px] border-r shadow-[0_28px_70px_rgba(15,23,42,0.24)] transition-transform duration-300 ease-in-out md:static md:inset-auto md:z-auto md:w-72 md:max-w-none md:rounded-none md:border md:border-l-0 md:border-t-0 md:border-b-0 md:shadow-none md:translate-x-0 ${
        isDarkTheme
          ? 'border-white/10 bg-neutral-950 md:bg-neutral-950/78'
          : 'border-slate-200 bg-white md:bg-white/80'
      } ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        
        {/* Logo area */}
        <div className={`p-5 md:p-6 flex items-center justify-between gap-2.5 border-b ${isDarkTheme ? 'border-white/6' : 'border-slate-200/80'}`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Clipboard className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className={`text-sm font-bold tracking-wider uppercase ${isDarkTheme ? 'text-neutral-200' : 'text-slate-900'}`}>FreeClipboard</h1>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${isDarkTheme ? 'text-neutral-500' : 'text-slate-500'}`}>Dashboard</p>
            </div>
          </div>

          {/* Close Sidebar button on Mobile */}
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className={`md:hidden p-1.5 rounded-lg transition-all ${isDarkTheme ? 'text-neutral-400 hover:text-white hover:bg-white/5' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
            title="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sidebar menu categories */}
        <div className="p-4 pb-24 md:pb-6 flex flex-col gap-5 overflow-y-auto flex-grow scrollbar-thin">
          
          <div className="flex flex-col gap-1">
            <h3 className={`px-3 text-[10px] font-bold uppercase tracking-widest mb-1.5 ${subtleTextClass}`}>Overview</h3>
            
            <button
              onClick={() => {
                setActiveFilter('all');
                setSelectedFolderId(null);
                setIsSidebarOpen(false); // Auto-close on mobile selection
              }}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === 'all'
                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                  : `${navTextClass} border border-transparent ${isDarkTheme ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`
              }`}
            >
              <span className="flex items-center gap-2">
                <Home className="w-3.5 h-3.5" />
                All Clips
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${navBadgeClass}`}>
                {liveClips.length}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveFilter('pinned');
                setSelectedFolderId(null);
                setIsSidebarOpen(false); // Auto-close on mobile selection
              }}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === 'pinned'
                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                  : `${navTextClass} border border-transparent ${isDarkTheme ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`
              }`}
            >
              <span className="flex items-center gap-2">
                <Star className="w-3.5 h-3.5 fill-current" />
                Pinned
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${navBadgeClass}`}>
                {liveClips.filter(c => c.pinned).length}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveFilter('trash');
                setSelectedFolderId(null);
                setIsSidebarOpen(false);
              }}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === 'trash'
                  ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                  : `${navTextClass} border border-transparent ${isDarkTheme ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`
              }`}
            >
              <span className="flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5" />
                Trash
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${navBadgeClass}`}>
                {trashedClips.length}
              </span>
            </button>

            <button
              onClick={handleOpenClipMindDrawer}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-transparent transition-all ${
                isDarkTheme
                  ? 'text-neutral-400 hover:text-indigo-300 hover:bg-indigo-500/5 hover:border-indigo-500/10'
                  : 'text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-100'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              ClipMind AI
              {!isPlanResolved ? (
                <span className="text-[9px] bg-white/5 text-neutral-500 px-1.5 py-0.5 rounded font-bold border border-white/10 ml-auto">...</span>
              ) : userPlan === 'pro' ? (
                <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-bold border border-emerald-500/20 ml-auto">Pro</span>
              ) : (
                <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-bold border border-amber-500/20 ml-auto">Free</span>
              )}
            </button>

            <button
              onClick={() => router.push('/graph')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-transparent transition-all ${
                isDarkTheme
                  ? 'text-neutral-400 hover:text-violet-300 hover:bg-violet-500/5 hover:border-violet-500/10'
                  : 'text-slate-600 hover:text-violet-600 hover:bg-violet-50 hover:border-violet-100'
              }`}
            >
              <Brain className="w-3.5 h-3.5 text-violet-400" />
              Knowledge Graph
              {isPlanResolved && !isPro && (
                <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-bold border border-amber-500/20 ml-auto">Pro</span>
              )}
            </button>

            <button
              onClick={() => router.push('/analytics')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-transparent transition-all ${
                isDarkTheme
                  ? 'text-neutral-400 hover:text-emerald-300 hover:bg-emerald-500/5 hover:border-emerald-500/10'
                  : 'text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-100'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
              Analytics
              {isPlanResolved && !isPro && (
                <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-bold border border-amber-500/20 ml-auto">Pro</span>
              )}
            </button>
          </div>

          {/* Folders block */}
          <div className="flex flex-col gap-1.5">
            <div className="px-3 flex items-center justify-between mb-1">
              <h3 className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 ${subtleTextClass}`}>
                <FoldersIcon className="w-3 h-3 text-indigo-400" />
                Folders
              </h3>
              
              <button
                onClick={() => {
                  closeMobileShellSurfaces('new-folder');
                  setIsNewFolderOpen(true);
                }}
                className={`transition-colors p-0.5 rounded ${isDarkTheme ? 'text-neutral-500 hover:text-indigo-400' : 'text-slate-500 hover:text-indigo-600'}`}
                title="Create Folder"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-col gap-1 max-h-72 overflow-y-auto pr-1">
              {/* "Uncategorized" Default Folder */}
              <button
                onClick={() => {
                  setActiveFilter('folder');
                  setSelectedFolderId('uncategorized');
                  setIsSidebarOpen(false); // Auto-close on mobile selection
                }}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 'uncategorized')}
                onDragEnter={() => setDraggedOverFolderId('uncategorized')}
                onDragLeave={() => setDraggedOverFolderId(null)}
                className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all border ${
                  activeFilter === 'folder' && selectedFolderId === 'uncategorized'
                    ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                    : `${navTextClass} border-transparent ${isDarkTheme ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`
                } ${
                  draggedOverFolderId === 'uncategorized'
                    ? 'bg-indigo-500/20 border-indigo-500 scale-[1.02] text-indigo-300 shadow-md shadow-indigo-500/10'
                    : ''
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-neutral-500 shrink-0" />
                  <span className="truncate">Uncategorized</span>
                </span>
                
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${navBadgeClass}`}>
                  {clips.filter(c => !c.folder_id).length}
                </span>
              </button>

              {folders.map((folder) => {
                const isActive = activeFilter === 'folder' && selectedFolderId === folder.id;
                const folderClipsCount = clips.filter(c => c.folder_id === folder.id).length;

                return (
                  <div
                    key={folder.id}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, folder.id)}
                    onDragEnter={() => setDraggedOverFolderId(folder.id)}
                    onDragLeave={() => setDraggedOverFolderId(null)}
                    className={`group flex items-center gap-1 rounded-lg border text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                        : `${navTextClass} border-transparent ${isDarkTheme ? 'hover:bg-white/5' : 'hover:bg-slate-100'}`
                    } ${
                      draggedOverFolderId === folder.id
                        ? 'bg-indigo-500/20 border-indigo-500 scale-[1.02] text-indigo-300 shadow-md shadow-indigo-500/10'
                        : ''
                    }`}
                  >
                    <button
                      onClick={() => {
                        setActiveFilter('folder');
                        setSelectedFolderId(folder.id);
                        setIsSidebarOpen(false); // Auto-close on mobile selection
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: folder.color }}
                      />
                      <span className="truncate">{folder.name}</span>
                    </button>

                    <div className="flex items-center gap-1 pr-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border group-hover:hidden ${navBadgeClass}`}>
                        {folderClipsCount}
                      </span>

                      <button
                        onClick={(e) => handleOpenRenameFolderModal(folder, e)}
                        className="hidden group-hover:flex items-center justify-center p-0.5 text-neutral-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors"
                        title="Rename folder"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>

                      <button
                        onClick={(e) => handleDeleteFolder(folder.id, e)}
                        className="hidden group-hover:flex items-center justify-center p-0.5 text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                        title="Delete folder"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Usage Limit Section */}
          <div className="flex flex-col gap-2 pt-4 border-t border-white/5">
            <h3 className="px-3 text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1">
              <Crown className="w-3.5 h-3.5 text-yellow-500" />
              Tier & Limits
            </h3>
            
            <div className="mx-3 p-3 rounded-lg bg-white/[0.02] border border-white/5 flex flex-col gap-2">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-neutral-400 font-bold uppercase">Usage limit</span>
                <span className={`font-mono font-bold ${
                  userPlan === 'pro' 
                    ? 'text-indigo-400' 
                    : clips.length >= 500 
                      ? 'text-rose-400' 
                      : clips.length >= 480 
                        ? 'text-amber-400 animate-pulse' 
                        : 'text-neutral-300'
                }`}>
                  {userPlan === 'pro' ? 'PRO UNLIMITED' : `${clips.length} / 500 clips`}
                </span>
              </div>
              
              {userPlan !== 'pro' && (
                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 rounded-full ${
                      clips.length >= 500 
                        ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' 
                  : clips.length >= 490
                          ? 'bg-amber-500 shadow-[0_0_8px_#f59e0b]' 
                          : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                    }`}
                    style={{ width: `${Math.min((clips.length / 500) * 100, 100)}%` }}
                  />
                </div>
              )}
              
              {userPlan !== 'pro' && clips.length >= 450 && (
                <button
                  onClick={() => setIsUpgradeModalOpen(true)}
                  className={`w-full py-1 text-[9px] font-black uppercase tracking-widest text-center rounded transition-all flex items-center justify-center gap-1 border ${
                    clips.length >= 500 
                      ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border-rose-500/20'
                      : clips.length >= 490
                      ? 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border-orange-500/20'
                      : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border-amber-500/20'
                  }`}
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  Upgrade to Pro
                </button>
              )}
            </div>
          </div>

          {/* Backup & Tools Section */}
          <div className="flex flex-col gap-2 pt-2 pb-2">
            <h3 className="px-3 text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1">
              <Download className="w-3 h-3 text-neutral-400" />
              Backup Tools
            </h3>

            <div className="px-3 flex flex-col gap-1.5">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImportFile} 
                accept=".txt,.json" 
                className="hidden" 
              />
              
              <button
                onClick={triggerFileInput}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-neutral-400 hover:text-neutral-200 hover:bg-white/5 border border-transparent transition-all"
                title="Import backup file"
              >
                <Upload className="w-3.5 h-3.5 text-neutral-500" />
                Import Backup
              </button>

              <button
                onClick={() => handleExport('txt')}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-neutral-400 hover:text-neutral-200 hover:bg-white/5 border border-transparent transition-all"
                title="Export free TXT backup"
              >
                <Download className="w-3.5 h-3.5 text-neutral-500" />
                Export as .TXT
              </button>

              {/* Pro Locked Export JSON */}
              <div className="group relative w-full">
                <button
                  onClick={() => handleExport('json')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all border border-transparent cursor-pointer ${
                    userPlan === 'pro'
                      ? 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
                      : 'text-neutral-600 hover:text-neutral-400 hover:bg-white/5 bg-black/10'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Download className="w-3.5 h-3.5 text-neutral-600" />
                    Export as .JSON
                  </span>
                  {userPlan !== 'pro' && (
                    <Lock className="w-3 h-3 text-amber-500/70 shrink-0" />
                  )}
                </button>
                {userPlan !== 'pro' && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 max-w-[min(12rem,calc(100vw_-_2rem))] -translate-x-1/2 rounded border border-white/10 bg-neutral-950 px-2 py-1 text-[10px] font-bold text-neutral-300 opacity-0 shadow-xl transition-opacity group-hover:opacity-100 flex items-center gap-1 text-center [overflow-wrap:anywhere]">
                    <Lock className="w-2.5 h-2.5 text-amber-500" />
                    Upgrade to Pro to export JSON
                  </div>
                )}
              </div>

              {/* Pro Locked Export MD */}
              <div className="group relative w-full">
                <button
                  onClick={() => handleExport('md')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all border border-transparent cursor-pointer ${
                    userPlan === 'pro'
                      ? 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
                      : 'text-neutral-600 hover:text-neutral-400 hover:bg-white/5 bg-black/10'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Download className="w-3.5 h-3.5 text-neutral-600" />
                    Export as .MD
                  </span>
                  {userPlan !== 'pro' && (
                    <Lock className="w-3 h-3 text-amber-500/70 shrink-0" />
                  )}
                </button>
                {userPlan !== 'pro' && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 max-w-[min(12rem,calc(100vw_-_2rem))] -translate-x-1/2 rounded border border-white/10 bg-neutral-950 px-2 py-1 text-[10px] font-bold text-neutral-300 opacity-0 shadow-xl transition-opacity group-hover:opacity-100 flex items-center gap-1 text-center [overflow-wrap:anywhere]">
                    <Lock className="w-2.5 h-2.5 text-amber-500" />
                    Upgrade to Pro to export Markdown
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Sidebar static user / help box */}
        <div className="p-4 border-t border-white/5 bg-black/40 flex items-center justify-between text-xs text-neutral-500 font-semibold">
          <span className="flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-indigo-400" />
            LocalStorage Active
          </span>
          <button
            onClick={() => {
              if (userPlan === 'free') {
                setIsUpgradeModalOpen(true);
              } else {
                setUserPlan('free');
                localStorage.setItem('fc_user_plan', 'free');
                if (user) {
                  supabase
                    .from('users')
                    .update({ plan: 'free' })
                    .eq('id', user.id)
                    .then(({ error }) => {
                      if (error) console.error('Error updating plan:', error);
                    });
                }
                addToast('Mock Plan reset to Free.', 'info');
              }
            }}
            className={`text-[10px] font-black uppercase border px-2 py-0.5 rounded transition-all cursor-pointer ${
              userPlan === 'pro'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black border-yellow-500/20 hover:from-amber-600 hover:to-yellow-600 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20'
            }`}
            title={userPlan === 'pro' ? 'Click to toggle back to Free plan' : 'Click to view Pro upgrade modal'}
          >
            {userPlan === 'pro' ? 'Pro' : 'Free'}
          </button>
        </div>
      </aside>

      {/* --- MAIN PAGE CONTENT --- */}
      <div className="flex-grow flex flex-col min-w-0 z-10">
        
        {/* --- TOP BAR --- */}
        <header className={`relative z-30 h-auto min-h-[72px] border-b backdrop-blur-xl px-3 py-3 md:px-8 shrink-0 transition-colors duration-300 ${
          isDarkTheme
            ? 'border-white/6 bg-neutral-950/45'
            : 'border-slate-200/80 bg-white/70'
        }`}>
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={openSidebarDrawer}
              className={`shrink-0 rounded-xl border p-2 transition-all ${
                isDarkTheme
                  ? 'border-white/10 bg-neutral-900 text-neutral-300 hover:text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
              }`}
              title="Open sidebar menu"
            >
              <Menu className="w-4.5 h-4.5" />
            </button>

            <div className="relative min-w-0 flex-1">
              <Search className={`absolute left-3 top-2.5 w-4 h-4 ${isDarkTheme ? 'text-neutral-600' : 'text-slate-400'}`} />
              <Input
                type="text"
                placeholder="Search clips"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`h-10 rounded-2xl pl-9 pr-8 text-xs transition-all ${
                  isDarkTheme
                    ? 'bg-neutral-900 border-white/10 text-neutral-200 placeholder:text-neutral-600 focus:border-indigo-500/40'
                    : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-indigo-400'
                } focus:ring-0`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className={`absolute right-2.5 top-2.5 rounded p-0.5 ${isDarkTheme ? 'text-neutral-600 hover:text-neutral-300' : 'text-slate-400 hover:text-slate-700'}`}
                  title="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <button
              onClick={handleOpenClipMindDrawer}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 px-3 text-[11px] font-bold text-indigo-400 transition-all duration-300 hover:bg-indigo-500/20"
              title="Open ClipMind AI drawer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI
            </button>

            <Button
              onClick={() => handleOpenNewClipModal()}
              className="h-10 shrink-0 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-600 px-3 text-[11px] font-bold text-white shadow-lg shadow-indigo-500/20 transition-all duration-300 hover:from-indigo-600 hover:to-violet-700"
            >
              <Plus className="w-3.5 h-3.5" />
              New Clip
            </Button>
          </div>

          <div className="hidden md:flex md:flex-wrap md:items-center md:justify-between md:gap-3">
          <div className="flex items-center flex-grow md:flex-initial gap-2">
            {/* Hamburger Button for mobile */}
            <button 
              onClick={openSidebarDrawer}
              className={`md:hidden p-2 rounded-xl border transition-all shrink-0 ${
                isDarkTheme
                  ? 'border-white/10 bg-black/25 text-neutral-400 hover:text-white'
                  : 'border-slate-200 bg-white text-slate-500 hover:text-slate-900'
              }`}
              title="Open sidebar menu"
            >
              <Menu className="w-4.5 h-4.5" />
            </button>

            {/* Live Search bar */}
            <div className="flex items-center gap-2 w-full max-w-[240px] sm:max-w-sm md:w-[30rem]">
              <div className="relative flex-1">
                <Search className={`absolute left-3 top-2.5 w-4 h-4 ${isDarkTheme ? 'text-neutral-600' : 'text-slate-400'}`} />
                <Input
                  type="text"
                  placeholder="Search by title, content, or tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`h-10 rounded-2xl pl-9 text-xs transition-all ${
                    isDarkTheme
                      ? 'bg-black/30 border-white/10 text-neutral-200 placeholder:text-neutral-600 focus:border-indigo-500/40'
                      : 'bg-white/80 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-indigo-400'
                  } focus:ring-0`}
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className={`absolute right-3 top-2.5 p-0.5 rounded ${isDarkTheme ? 'text-neutral-600 hover:text-neutral-300' : 'text-slate-400 hover:text-slate-700'}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  if (!isPro) {
                    setShowUpgradeModal(true);
                    return;
                  }
                  setSmartSearch(!smartSearch);
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 ${
                  smartSearch
                    ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                    : isDarkTheme
                      ? 'bg-black/30 border-white/10 text-neutral-500 hover:text-neutral-300'
                      : 'bg-white/75 border-slate-200 text-slate-500 hover:text-slate-900'
                }`}
                title={isPro ? 'Toggle AI-powered smart search' : 'Smart search is a Pro feature'}
              >
                <Sparkles className={`w-3 h-3 ${smartSearch ? 'text-indigo-400' : ''}`} />
                <span className="hidden sm:inline">Smart</span>
              </button>
            </div>
          </div>

          {/* New Clip Action Button & User Profile */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Header Clip Count Badge */}
            <button 
              onClick={() => {
                if (!isPlanResolved) {
                  return;
                }
                if (userPlan !== 'pro') {
                  setIsUpgradeModalOpen(true);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-[11px] font-bold transition-all duration-300 ${
                !isPlanResolved
                  ? isDarkTheme
                    ? 'cursor-default bg-white/5 border-white/10 text-neutral-500'
                    : 'cursor-default bg-white/70 border-slate-200 text-slate-400'
                  : userPlan === 'pro'
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
                  : clips.length >= 500
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20'
                    : clips.length >= 480
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse hover:bg-amber-500/20'
                      : isDarkTheme
                        ? 'cursor-pointer bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
                        : 'cursor-pointer bg-white/80 border-slate-200 text-slate-700 hover:bg-white'
              }`} 
              title={
                !isPlanResolved
                  ? 'Loading workspace plan...'
                  : userPlan === 'pro'
                    ? "Unlimited Pro workspace active"
                    : `Workspace limit: ${clips.length} / 500 clips. Click to upgrade.`
              }
            >
              <Crown className={`w-3.5 h-3.5 ${isPlanResolved && userPlan === 'pro' ? 'text-amber-400' : 'text-neutral-400'}`} />
              <span>
                {!isPlanResolved
                  ? 'Loading...'
                  : userPlan === 'pro'
                    ? `${clips.length} Clips`
                    : `${clips.length} / 500`}
              </span>
            </button>

            {/* Connection Status Badge */}
            <div className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-[11px] font-bold transition-all duration-300 ${
              isOnline
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse'
            }`} title={isOnline ? "Connected to Cloud Sync" : "Working Offline - changes will sync when online"}>
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Synced</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                  <span>Offline</span>
                </>
              )}
            </div>

            <button
              onClick={handleOpenClipMindDrawer}
              className="flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-[11px] font-bold transition-all duration-300 bg-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-500/30"
              title="Open ClipMind AI drawer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ClipMind</span>
            </button>

            <button
              onClick={handleToggleTheme}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-[11px] font-bold transition-all duration-300 ${
                isDarkTheme
                  ? 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10'
                  : 'border-slate-200 bg-white/80 text-slate-700 hover:bg-white'
              }`}
              title={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {isDarkTheme ? <SunMedium className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isDarkTheme ? 'Light' : 'Dark'}</span>
            </button>

            <Button
              onClick={() => handleOpenNewClipModal()}
              className="h-10 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white border-0 shadow-lg shadow-indigo-500/20 font-bold text-xs px-4 gap-1.5 transition-all duration-300"
            >
              <Plus className="w-3.5 h-3.5" />
              New Clip
            </Button>

            {/* Profile Dropdown */}
            {userEmail && (
              <div className={`relative hidden md:block ${isProfileOpen ? 'z-[70]' : ''}`}>
                <button
                  onClick={() => {
                    if (!isProfileOpen && isMobileViewport) {
                      closeMobileShellSurfaces();
                    }
                    setIsProfileOpen(!isProfileOpen);
                  }}
                  className={`flex items-center gap-2 p-1.5 rounded-2xl border transition-all duration-300 shrink-0 ${
                    isDarkTheme
                      ? 'border-white/5 bg-black/40 hover:bg-black/60'
                      : 'border-slate-200 bg-white/80 hover:bg-white'
                  }`}
                  title="View workspace settings"
                >
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center font-bold text-white text-[11px] border border-white/10 shadow-lg shadow-indigo-500/10 shrink-0">
                    {userEmail.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="hidden md:flex flex-col text-left pr-1.5">
                    <span className={`text-[9px] font-bold uppercase tracking-widest leading-none mb-0.5 ${subtleTextClass}`}>Active User</span>
                    <span className={`text-[11px] font-semibold max-w-[120px] truncate leading-none ${titleTextClass}`}>{userEmail}</span>
                  </div>
                </button>

                {isProfileOpen && (
                  <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setIsProfileOpen(false)} />
                    <div className={`absolute right-0 z-[70] mt-2 w-[min(18rem,calc(100vw_-_2rem))] max-w-[calc(100vw_-_2rem)] rounded-2xl border p-2 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150 ${dropdownSurfaceClass}`}>
                      <div className={`px-3 py-2 border-b text-left mb-1 ${isDarkTheme ? 'border-white/5' : 'border-slate-200/80'}`}>
                        <p className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${subtleTextClass}`}>Workspace</p>
                        <p className={`text-xs font-medium truncate ${titleTextClass}`}>{userEmail}</p>
                        <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${
                          userPlan === 'pro'
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.1)]'
                            : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                        }`}>
                          {userPlan === 'pro' ? 'PRO UNLIMITED' : 'FREE WORKSPACE'}
                        </span>
                      </div>
                      <button
                        onClick={() => { setIsProfileOpen(false); setIsSnippetsModalOpen(true); fetchSnippets(); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all duration-200 text-left font-bold ${
                          isDarkTheme
                            ? 'text-neutral-400 hover:text-indigo-400 hover:bg-indigo-500/5'
                            : 'text-slate-500 hover:text-indigo-500 hover:bg-indigo-50'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Snippets
                      </button>
                      <button
                        onClick={handleLogout}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all duration-200 text-left font-bold ${
                          isDarkTheme
                            ? 'text-neutral-400 hover:text-rose-400 hover:bg-rose-500/5'
                            : 'text-slate-500 hover:text-rose-500 hover:bg-rose-50'
                        }`}
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Log Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          </div>
        </header>

        {/* --- DASHBOARD WRAPPER --- */}
        <main className={`flex-grow p-4 md:p-6 xl:p-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8 ${isMobileShellOverlayOpen ? 'overflow-y-hidden' : 'overflow-y-auto'} scrollbar-thin`}>
          
          {/* --- LIMIT WARNING BANNER --- */}
          {isPlanResolved && userPlan === 'free' && liveClips.length >= 450 && (
            <div className={`mb-4 md:mb-6 p-3 md:p-4 rounded-xl border backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 animate-in slide-in-from-top duration-300 shadow-xl ${
              liveClips.length >= 500
                ? 'border-rose-500/20 bg-rose-500/5 text-rose-300'
                : liveClips.length >= 490
                ? 'border-orange-500/20 bg-orange-500/5 text-orange-300'
                : 'border-amber-500/20 bg-amber-500/5 text-amber-300'
            }`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${
                  liveClips.length >= 500
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    : liveClips.length >= 490
                    ? 'bg-orange-500/10 border-orange-500/20 text-orange-400'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                }`}>
                  {liveClips.length >= 500 ? <X className="w-4 h-4 animate-pulse" /> :
                   liveClips.length >= 490 ? <AlertCircle className="w-4 h-4 animate-pulse" /> :
                   <Info className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-200 truncate">
                    {liveClips.length >= 500
                      ? 'Free Clip Limit Reached (500/500)'
                      : liveClips.length >= 490
                      ? `Only ${FREE_CLIP_LIMIT - liveClips.length} clips left!`
                      : `${FREE_CLIP_LIMIT - liveClips.length} clips remaining — upgrade`}
                  </p>
                  <p className="text-[11px] opacity-80 font-medium">
                    {liveClips.length >= 500
                      ? "You've built an amazing collection of 500 clips! Upgrade to Pro to keep going — $5/mo"
                      : liveClips.length >= 490
                      ? "You're almost at the free limit. Upgrade to Pro for unlimited clips."
                      : `You have used ${liveClips.length} out of ${FREE_CLIP_LIMIT} free clips. Upgrade to Pro to unlock unlimited clips.`}
                  </p>
                </div>
              </div>
              <Button 
                onClick={() => setIsUpgradeModalOpen(true)}
                className={`text-[10px] font-black uppercase tracking-wider px-3.5 h-8 shrink-0 rounded-lg shadow-lg border-0 ${
                  clips.length >= 500
                    ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/10'
                    : clips.length >= 490
                    ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/10'
                    : 'bg-amber-500 hover:bg-amber-600 text-black shadow-amber-500/10'
                }`}
              >
                {clips.length >= 500 ? 'Upgrade Now' : 'Upgrade'}
              </Button>
            </div>
          )}
           
          {/* Page Section Heading */}
          <section className={`mb-4 md:mb-6 rounded-[28px] border p-4 md:p-5 xl:p-6 backdrop-blur-xl transition-colors duration-300 ${surfaceClass}`}>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${
                      isDarkTheme
                        ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                        : 'bg-indigo-50 border-indigo-100 text-indigo-500'
                    }`}>
                      <Grid className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-[10px] font-black uppercase tracking-[0.28em] ${subtleTextClass}`}>Workspace Canvas</p>
                      <h2 className={`text-lg md:text-2xl font-black tracking-tight leading-tight ${titleTextClass}`}>
                        {workspaceTitle}
                      </h2>
                    </div>
                  </div>
                  <p className={`mt-3 max-w-2xl text-sm leading-relaxed ${subtleTextClass}`}>
                    {workspaceSubtitle}
                  </p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 xl:min-w-[24rem]">
                  <div className={`rounded-2xl border px-4 py-3 ${mutedSurfaceClass}`}>
                    <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${subtleTextClass}`}>Visible</p>
                    <p className={`mt-2 text-2xl font-black leading-none ${titleTextClass}`}>{filteredClips.length}</p>
                    <p className={`mt-1 text-[11px] ${subtleTextClass}`}>Clips in view</p>
                  </div>
                  <div className={`rounded-2xl border px-4 py-3 ${mutedSurfaceClass}`}>
                    <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${subtleTextClass}`}>Pinned</p>
                    <p className={`mt-2 text-2xl font-black leading-none ${titleTextClass}`}>{clips.filter(c => c.pinned).length}</p>
                    <p className={`mt-1 text-[11px] ${subtleTextClass}`}>Fast access</p>
                  </div>
                  <div className={`rounded-2xl border px-4 py-3 ${mutedSurfaceClass}`}>
                    <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${subtleTextClass}`}>Folders</p>
                    <p className={`mt-2 text-2xl font-black leading-none ${titleTextClass}`}>{folders.length}</p>
                    <p className={`mt-1 text-[11px] ${subtleTextClass}`}>Organized sets</p>
                  </div>
                  <div className={`rounded-2xl border px-4 py-3 ${mutedSurfaceClass}`}>
                    <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${subtleTextClass}`}>AI</p>
                    <p className={`mt-2 text-2xl font-black leading-none ${titleTextClass}`}>
                      {Object.keys(clipSummaries).length + Object.keys(pendingRewrites).length + Object.keys(activeTranslations).length}
                    </p>
                    <p className={`mt-1 text-[11px] ${subtleTextClass}`}>Enhanced items</p>
                  </div>
                </div>
              </div>

              <div className={`flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 pt-1`}>
              <div className="flex items-center gap-2 flex-wrap w-full xl:w-auto">
              {/* View Mode Switcher */}
              <div className={`grid grid-cols-5 w-full sm:w-auto sm:flex items-center p-1 rounded-2xl shrink-0 shadow-lg ${mutedSurfaceClass}`}>
                <button
                  type="button"
                  onClick={() => handleSetViewMode('board')}
                  className={`px-3 py-2 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    viewMode === 'board'
                      ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-sm'
                      : isDarkTheme
                        ? 'text-neutral-400 hover:text-neutral-200 border border-transparent'
                        : 'text-slate-500 hover:text-slate-900 border border-transparent'
                  }`}
                  title="Kanban Board View (Drag-and-Drop)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M11 3v18"/><path d="M15 3v18"/><path d="M7 3v18"/></svg>
                  <span>Board</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSetViewMode('grid')}
                  className={`px-3 py-2 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    viewMode === 'grid'
                      ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-sm'
                      : isDarkTheme
                        ? 'text-neutral-400 hover:text-neutral-200 border border-transparent'
                        : 'text-slate-500 hover:text-slate-900 border border-transparent'
                  }`}
                  title="Grid Card View"
                >
                  <Grid className="w-3.5 h-3.5" />
                  <span>Grid</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSetViewMode('checklist')}
                  className={`px-3 py-2 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    viewMode === 'checklist'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm'
                      : isDarkTheme
                        ? 'text-neutral-400 hover:text-neutral-200 border border-transparent'
                        : 'text-slate-500 hover:text-slate-900 border border-transparent'
                  }`}
                  title="Checklist task view"
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  <span>Tasks</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSetViewMode('list')}
                  className={`px-3 py-2 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    viewMode === 'list'
                      ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-sm'
                      : isDarkTheme
                        ? 'text-neutral-400 hover:text-neutral-200 border border-transparent'
                        : 'text-slate-500 hover:text-slate-900 border border-transparent'
                  }`}
                  title="List Row View"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                  <span>List</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSetViewMode('table')}
                  className={`px-3 py-2 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    viewMode === 'table'
                      ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-sm'
                      : isDarkTheme
                        ? 'text-neutral-400 hover:text-neutral-200 border border-transparent'
                        : 'text-slate-500 hover:text-slate-900 border border-transparent'
                  }`}
                  title="Table List View"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 9v12"/></svg>
                  <span>Table</span>
                </button>
              </div>

              {/* Select Mode Toggle */}
              <button
                type="button"
                onClick={() => {
                  setIsSelectionMode(!isSelectionMode);
                  setSelectedClipIds([]);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 h-[34px] ${
                  isSelectionMode
                    ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300 font-bold'
                    : isDarkTheme
                      ? 'bg-black/40 border-white/5 text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
                      : 'bg-white/80 border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-white'
                }`}
                title="Select multiple clips to share as a page"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                {isSelectionMode ? 'Cancel' : 'Select'}
              </button>

              {/* Import/Export buttons in toolbar */}
              <div className={`flex items-center gap-1 px-2 py-1 rounded-2xl h-[34px] ${mutedSurfaceClass}`}>
                <button
                  type="button"
                  onClick={() => triggerFileInput()}
                  className={`p-1.5 rounded-lg transition-all ${
                    isDarkTheme
                      ? 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-white'
                  }`}
                  title="Import backup file"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
                <div className={`w-px h-3.5 ${isDarkTheme ? 'bg-white/10' : 'bg-slate-200'}`} />
                <button
                  type="button"
                  onClick={() => handleExport('txt')}
                  className={`px-2 py-1 rounded-lg transition-all text-[11px] font-bold flex items-center gap-1 ${
                    isDarkTheme
                      ? 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-white'
                  }`}
                  title="Export backup as TXT"
                >
                  <Download className={`w-3.5 h-3.5 ${isDarkTheme ? 'text-neutral-500' : 'text-slate-400'}`} />
                  <span>TXT</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => handleExport('json')}
                  className={`px-2 py-1 rounded-lg transition-all text-[11px] font-bold flex items-center gap-1 ${
                    userPlan === 'pro'
                      ? 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
                      : 'text-neutral-600 hover:text-amber-400/85 hover:bg-amber-500/5'
                  }`}
                  title={userPlan === 'pro' ? "Export backup as JSON" : "Export backup as JSON (Pro feature)"}
                >
                  {userPlan === 'pro' ? (
                    <Download className="w-3.5 h-3.5 text-neutral-500" />
                  ) : (
                    <Lock className="w-3 h-3 text-amber-500/70" />
                  )}
                  <span>JSON</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExport('md')}
                  className={`px-2 py-1 rounded-lg transition-all text-[11px] font-bold flex items-center gap-1 ${
                    userPlan === 'pro'
                      ? 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
                      : 'text-neutral-600 hover:text-amber-400/85 hover:bg-amber-500/5'
                  }`}
                  title={userPlan === 'pro' ? "Export backup as Markdown" : "Export backup as Markdown (Pro feature)"}
                >
                  {userPlan === 'pro' ? (
                    <Download className="w-3.5 h-3.5 text-neutral-500" />
                  ) : (
                    <Lock className="w-3 h-3 text-amber-500/70" />
                  )}
                  <span>MD</span>
                </button>
              </div>
                </div>

                <span className={`text-xs font-semibold px-3 py-2 rounded-2xl font-mono inline-flex items-center ${mutedSurfaceClass} ${subtleTextClass}`}>
                  Showing {filteredClips.length} {filteredClips.length === 1 ? 'clip' : 'clips'}
                </span>
              </div>
            </div>
          </section>

          {/* --- SELECTION ACTIONS TOOLBAR --- */}
          {isSelectionMode && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-indigo-500/[0.03] border border-indigo-500/10 backdrop-blur-md mt-4 animate-in slide-in-from-top-3 duration-200">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-indigo-300 font-mono">
                  {selectedClipIds.length} {selectedClipIds.length === 1 ? 'clip' : 'clips'} selected
                </span>
                <div className="w-px h-3.5 bg-white/10 hidden sm:block" />
                <div className="flex gap-2.5">
                  <button
                    onClick={() => {
                      const allIds = sortedClips.map(c => c.id);
                      setSelectedClipIds(allIds);
                    }}
                    className="text-[11px] font-bold text-neutral-400 hover:text-neutral-200 transition-colors"
                  >
                    Select All
                  </button>
                  <span className="text-neutral-600 text-[11px]">•</span>
                  <button
                    onClick={() => setSelectedClipIds([])}
                     className="text-[11px] font-bold text-neutral-400 hover:text-neutral-200 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={handleShareAsPage}
                  disabled={selectedClipIds.length === 0}
                  className="w-full sm:w-auto bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 text-white border-0 font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-violet-500/20 transition-all flex items-center justify-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share as Page
                </button>
              </div>
            </div>
          )}

          {/* Trial Banner */}
          {isPlanResolved && trialDaysLeft !== null && trialDaysLeft > 0 && userPlan === 'free' && (
            <div className="mb-4 md:mb-6 p-3 md:p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 text-indigo-300 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 animate-in slide-in-from-top duration-300 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 text-indigo-400 shrink-0">
                  <Sparkles className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <p className="text-xs font-bold text-neutral-200">Pro Trial: {trialDaysLeft} day{trialDaysLeft > 1 ? 's' : ''} left</p>
                  <p className="text-[11px] text-indigo-400/80 font-medium">Enjoy all Pro features free during your trial. Upgrade to keep access.</p>
                </div>
              </div>
              <Button 
                onClick={() => router.push('/upgrade')}
                className="bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider px-3.5 h-8 shrink-0 rounded-lg shadow-lg shadow-indigo-500/10 border-0"
              >
                Upgrade Now
              </Button>
            </div>
          )}

          {viewMode === 'checklist' && (
            <section className={`mb-4 md:mb-6 rounded-[28px] border p-4 md:p-5 backdrop-blur-xl ${surfaceClass}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${isDarkTheme ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border-emerald-200 bg-emerald-50 text-emerald-600'}`}>
                      <ListChecks className="h-5 w-5" />
                    </div>
                    <div>
                      <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${subtleTextClass}`}>Checklist</p>
                      <h3 className={`text-lg font-black tracking-tight ${titleTextClass}`}>{completedTaskCount} of {taskClips.length} tasks done</h3>
                    </div>
                  </div>
                  <div className={`mt-4 h-2 overflow-hidden rounded-full ${isDarkTheme ? 'bg-white/10' : 'bg-slate-200'}`}>
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all" style={{ width: `${taskProgress}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  {[
                    { value: 'all' as TaskFilter, label: 'All', count: taskClips.length },
                    { value: 'pending' as TaskFilter, label: 'Pending', count: taskCounts.pending },
                    { value: 'in-progress' as TaskFilter, label: 'In Progress', count: taskCounts['in-progress'] },
                    { value: 'done' as TaskFilter, label: 'Done', count: taskCounts.done },
                  ].map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setTaskFilter(filter.value)}
                      className={`rounded-2xl border px-3 py-2 text-xs font-black transition ${
                        taskFilter === filter.value
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                          : isDarkTheme
                            ? 'border-white/10 bg-black/25 text-neutral-400 hover:text-neutral-200'
                            : 'border-slate-200 bg-white/80 text-slate-600 hover:text-slate-950'
                      }`}
                    >
                      {filter.label} <span className="ml-1 opacity-70">{filter.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* --- CLIPS DYNAMIC VIEWS --- */}
          {dataLoading ? (
            <ClipListSkeleton count={6} />
          ) : sortedClips.length > 0 ? (
            <>
              {/* CHECKLIST VIEW RENDERING */}
              {viewMode === 'checklist' && (
                <div className="grid gap-3">
                  {sortedClips.map((clip) => {
                    const clipFolder = folders.find(f => f.id === clip.folder_id);
                    const status = getTaskStatus(clip);
                    const visibleTags = getVisibleClipTags(clip);
                    const statusStyles: Record<TaskStatus, string> = {
                      pending: isDarkTheme ? 'border-slate-500/20 bg-slate-500/10 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700',
                      'in-progress': 'border-amber-300/40 bg-amber-50 text-amber-700',
                      done: 'border-emerald-300/40 bg-emerald-50 text-emerald-700',
                    };

                    return (
                      <Card
                        key={clip.id}
                        onClick={() => openClipPreview(clip)}
                        className={`rounded-[24px] border p-4 transition-all hover:-translate-y-0.5 ${
                          isDarkTheme
                            ? 'border-white/6 bg-neutral-900/35 hover:bg-neutral-900/55'
                            : 'border-slate-200/80 bg-white/92 shadow-[0_14px_36px_rgba(148,163,184,0.14)] hover:bg-white'
                        }`}
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${statusStyles[status]}`}>
                                {status.replace('-', ' ')}
                              </span>
                              {clipFolder && (
                                <span
                                  className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${isDarkTheme ? 'bg-black/30' : 'bg-white/85'}`}
                                  style={{ borderColor: `${clipFolder.color}33`, color: clipFolder.color }}
                                >
                                  {clipFolder.name}
                                </span>
                              )}
                              <span className={`text-[10px] font-bold uppercase tracking-[0.18em] ${subtleTextClass}`}>
                                {new Date(clip.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                            <h4 className={`text-base font-black leading-snug ${titleTextClass}`}>{clip.title || 'Untitled Task'}</h4>
                            <p className={`mt-2 line-clamp-2 font-mono text-xs leading-6 ${isDarkTheme ? 'text-neutral-300' : 'text-slate-700'}`}>
                              {clip.content}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {visibleTags.length > 0 ? visibleTags.slice(0, 4).map((tag, idx) => (
                                <span key={idx} className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${isDarkTheme ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300' : 'border-indigo-100 bg-indigo-50 text-indigo-600'}`}>
                                  {tag}
                                </span>
                              )) : (
                                <span className={`text-[10px] ${subtleTextClass}`}>No tags</span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {(['pending', 'in-progress', 'done'] as TaskStatus[]).map((nextStatus) => (
                              <button
                                key={nextStatus}
                                type="button"
                                onClick={(e) => handleTaskStatusChange(clip, nextStatus, e)}
                                className={`rounded-xl border px-3 py-2 text-xs font-black capitalize transition ${
                                  status === nextStatus
                                    ? statusStyles[nextStatus]
                                    : isDarkTheme
                                      ? 'border-white/10 bg-black/25 text-neutral-400 hover:text-neutral-200'
                                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                {nextStatus.replace('-', ' ')}
                              </button>
                            ))}
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isPro) {
                                    setShowUpgradeModal(true);
                                    return;
                                  }
                                  handleToggleClipMindMenu(clip);
                                }}
                                className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-black text-cyan-700 transition hover:bg-cyan-100"
                              >
                                {clipMindLoadingId === clip.id ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : <Bot className="mr-1 inline h-3.5 w-3.5" />}
                                ClipMind
                              </button>
                              {showClipMindMenu === clip.id && renderClipMindMenu(clip, 'right')}
                            </div>
                          </div>
                          {renderClipMindPanel(clip, true)}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* GRID VIEW RENDERING */}
              {viewMode === 'grid' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 md:gap-4">
                  {sortedClips.map((clip) => {
                    const clipFolder = folders.find(f => f.id === clip.folder_id);
                    const truncatedContent = clip.content.length > 100 
                      ? clip.content.substring(0, 100) + '...'
                      : clip.content;

                    const isSelected = selectedClipIds.includes(clip.id);
                    const hasAiOutput = Boolean(
                      clipSummaries[clip.id] ||
                      pendingRewrites[clip.id] ||
                      activeTranslations[clip.id] ||
                      clipMindResults[clip.id]
                    );
                    const visibleTags = getVisibleClipTags(clip);
                    if (isMobileViewport) {
                      return renderMobileClipCard(clip, {
                        draggable: !isSelectionMode,
                        onDragStart: (e) => handleDragStart(e, clip.id),
                      });
                    }
                    return (
                      <Card 
                        key={clip.id}
                        draggable={!isSelectionMode}
                        onDragStart={(e) => handleDragStart(e, clip.id)}
                        onClick={() => {
                          if (isSelectionMode) {
                            handleToggleSelect(clip.id);
                          } else {
                            openClipPreview(clip);
                          }
                        }}
                        className={`border backdrop-blur-md relative group flex flex-col min-h-[184px] h-auto animate-in fade-in zoom-in-95 duration-200 transition-all ${
                          showClipMindMenu === clip.id ? 'overflow-visible z-20' : 'overflow-hidden'
                        } ${
                          isSelectionMode 
                            ? isSelected
                              ? 'border-indigo-500/40 bg-indigo-500/10 cursor-pointer'
                              : isDarkTheme
                                ? 'border-white/6 bg-neutral-900/38 hover:border-white/10 hover:bg-neutral-900/48 cursor-pointer'
                                : 'border-slate-200/80 bg-white/92 hover:border-slate-300 hover:bg-white cursor-pointer'
                            : isDarkTheme
                              ? 'border-white/6 bg-neutral-900/35 hover:border-white/10 hover:bg-neutral-900/55 hover:-translate-y-1 cursor-pointer shadow-xl'
                              : 'border-slate-200/80 bg-white/92 hover:border-slate-300 hover:bg-white hover:-translate-y-1 cursor-pointer shadow-[0_18px_44px_rgba(148,163,184,0.18)]'
                        }`}
                      >
                        {/* Checkbox overlay for selection mode */}
                        {isSelectionMode && (
                          <div 
                            onClick={(e) => { e.stopPropagation(); handleToggleSelect(clip.id); }}
                            className={`absolute top-4 left-4 z-20 flex items-center justify-center w-5 h-5 rounded-full border transition-all cursor-pointer ${
                              isSelected 
                                ? 'border-indigo-400 bg-indigo-500 text-white' 
                                : isDarkTheme
                                  ? 'border-white/20 bg-neutral-950/80 hover:border-indigo-400'
                                  : 'border-slate-300 bg-white hover:border-indigo-400'
                            }`}
                          >
                            {isSelected && (
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            )}
                          </div>
                        )}

                        {/* Hover spotlight blur */}
                        <div className="absolute -top-12 -right-12 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                        <CardContent className="p-4 flex flex-col flex-grow gap-3">
                          <div className="relative self-end" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isPro) {
                                  setShowUpgradeModal(true);
                                  return;
                                }
                                handleToggleClipMindMenu(clip);
                              }}
                              className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-black transition ${
                                isDarkTheme
                                  ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/15'
                                  : 'border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
                              }`}
                              title="Open ClipMind actions"
                            >
                              {clipMindLoadingId === clip.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
                              ClipMind
                            </button>
                            {showClipMindMenu === clip.id && renderClipMindMenu(clip, 'right')}
                          </div>
                          
                          {/* Card Header & folder indicator */}
                          <div className="flex flex-col gap-2 shrink-0">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <span className={`text-[10px] font-bold uppercase tracking-[0.22em] font-mono transition-all duration-200 ${isSelectionMode ? 'pl-7' : ''} ${subtleTextClass}`}>
                                {new Date(clip.created_at).toLocaleDateString(undefined, { 
                                  month: 'short', 
                                  day: 'numeric', 
                                  year: 'numeric' 
                                })}
                              </span>

                              <div className="flex flex-wrap items-center gap-1.5 shrink-0 sm:justify-end">
                                {clipFolder && (
                                  <span 
                                    className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border flex items-center gap-1 ${isDarkTheme ? 'bg-black/30' : 'bg-white/70'}`}
                                    style={{ 
                                      borderColor: clipFolder.color + '20', 
                                      color: clipFolder.color 
                                    }}
                                  >
                                    <span 
                                      className="w-1.5 h-1.5 rounded-full shrink-0" 
                                      style={{ backgroundColor: clipFolder.color }}
                                    />
                                    {clipFolder.name}
                                  </span>
                                )}
                                {clip.pinned && (
                                  <span className={`rounded-full border border-yellow-500/15 bg-yellow-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${isDarkTheme ? 'text-yellow-300' : 'text-amber-600'}`}>
                                    Pinned
                                  </span>
                                )}
                                {isTaskClip(clip) && (
                                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                                    getTaskStatus(clip) === 'done'
                                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
                                      : getTaskStatus(clip) === 'in-progress'
                                        ? 'border-amber-500/20 bg-amber-500/10 text-amber-500'
                                        : 'border-slate-500/20 bg-slate-500/10 text-slate-500'
                                  }`}>
                                    {getTaskStatus(clip).replace('-', ' ')}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="space-y-1">
                              <h4 className={`text-sm font-semibold line-clamp-2 leading-snug ${titleTextClass}`}>
                                {clip.title || 'Untitled Clip'}
                              </h4>
                              <p className={`text-[11px] ${subtleTextClass}`}>
                                {clip.content.length} characters
                                {visibleTags.length > 0 ? ` | ${visibleTags.length} tag${visibleTags.length === 1 ? '' : 's'}` : ''}
                                {hasAiOutput ? ' | AI enhanced' : ''}
                              </p>
                            </div>
                          </div>

                          {/* Content snippet */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openClipPreview(clip);
                            }}
                            className={`rounded-2xl border p-3 text-left transition-all hover:border-indigo-500/20 ${
                              isDarkTheme
                                ? 'border-white/5 bg-black/20 hover:bg-black/30'
                                : 'border-slate-200 bg-slate-50/80 hover:bg-white'
                            }`}
                            title="Open full clip preview"
                          >
                            <p className={`text-xs leading-relaxed break-words font-mono line-clamp-4 min-h-[72px] ${isDarkTheme ? 'text-neutral-300' : 'text-slate-700'}`}>
                              {truncatedContent}
                            </p>
                          </button>

                          {/* Badges and tags */}
                          <div className="flex flex-wrap gap-1.5 overflow-hidden min-h-[24px] shrink-0">
                            {visibleTags.length > 0 ? visibleTags.slice(0, 3).map((tag, idx) => (
                              <span 
                                key={idx}
                                className="text-[9px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                              >
                                {tag}
                              </span>
                            )) : (
                              <span className={`text-[10px] font-medium ${isDarkTheme ? 'text-neutral-600' : 'text-slate-400'}`}>No tags yet</span>
                            )}
                            {visibleTags.length > 3 && (
                              <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${isDarkTheme ? 'bg-white/5 text-neutral-400 border border-white/5' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                                +{visibleTags.length - 3}
                              </span>
                            )}
                          </div>

                        {renderClipMindPanel(clip, true)}
                        </CardContent>
                        
                        {/* Collapsible AI Summary Section */}
                        {clipSummaries[clip.id] && (
                          <div className={`px-5 py-3 transition-all duration-300 ${summaryPanelClass}`}>
                            <div 
                              onClick={(e) => toggleSummaryCollapse(clip.id, e)}
                              className="flex items-center justify-between cursor-pointer group/summary"
                            >
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider font-mono">
                                <Sparkles className="w-3 h-3 text-emerald-400" />
                                <span>AI Summary</span>
                              </div>
                              <button className={`${isDarkTheme ? 'text-neutral-500 group-hover/summary:text-neutral-300' : 'text-slate-400 group-hover/summary:text-slate-700'} transition-colors`}>
                                {collapsedSummaries[clip.id] ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                            
                            {!collapsedSummaries[clip.id] && (
                              <div className="flex flex-col gap-1.5 mt-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                                <p className={`text-[11px] font-sans leading-relaxed p-2.5 rounded-2xl border select-text ${isDarkTheme ? 'text-neutral-300 bg-black/20 border-emerald-500/10' : 'text-slate-700 bg-white/75 border-emerald-200'}`}>
                                  {clipSummaries[clip.id]?.summary}
                                </p>
                                {clipSummaries[clip.id]?.isFallback && (
                                  <div className={`text-[9px] px-2.5 py-1.5 rounded-2xl leading-normal flex items-start gap-1 font-sans border ${isDarkTheme ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                                    <span className="font-bold shrink-0">⚠️ Local Fallback:</span>
                                    <span>{clipSummaries[clip.id]?.warning || 'Unable to reach the OpenRouter API. Displaying a high-quality local smart summary.'}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Collapsible Rewrite Panel */}
                        {pendingRewrites[clip.id] && (
                          <div className={`px-5 py-3 transition-all duration-300 ${rewritePanelClass}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-400 uppercase tracking-wider font-mono">
                                <RefreshCw className="w-3 h-3 text-indigo-400" />
                                <span>AI Rewrite Suggestion</span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1.5 mt-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                              <p className={`text-[11px] font-sans leading-relaxed p-2.5 rounded-2xl border select-text ${isDarkTheme ? 'text-neutral-300 bg-black/20 border-indigo-500/10' : 'text-slate-700 bg-white/75 border-indigo-200'}`}>
                                {pendingRewrites[clip.id]}
                              </p>
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={(e) => handleDismissRewrite(clip.id, e)}
                                  className="text-[10px] font-bold text-neutral-400 hover:text-neutral-200 hover:bg-white/5 transition-colors uppercase font-mono border border-white/5 bg-black/20 px-2 py-1 rounded"
                                >
                                  Dismiss
                                </button>
                                <button
                                  onClick={(e) => handleApplyRewrite(clip.id, e)}
                                  className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors uppercase font-mono border border-indigo-500/20 bg-indigo-500/5 px-2 py-1 rounded"
                                >
                                  Apply
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Collapsible Translate Panel */}
                        {activeTranslations[clip.id] && (
                          <div className={`px-5 py-3 transition-all duration-300 ${translatePanelClass}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-violet-400 uppercase tracking-wider font-mono">
                                <Languages className="w-3 h-3 text-violet-400" />
                                <span>Translated to {activeTranslations[clip.id].lang}</span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1.5 mt-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                              <p className={`text-[11px] font-sans leading-relaxed p-2.5 rounded-2xl border select-text ${isDarkTheme ? 'text-neutral-300 bg-black/20 border-violet-500/10' : 'text-slate-700 bg-white/75 border-violet-200'}`}>
                                {activeTranslations[clip.id].text}
                              </p>
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={(e) => handleDismissTranslate(clip.id, e)}
                                  className="text-[10px] font-bold text-neutral-400 hover:text-neutral-200 hover:bg-white/5 transition-colors uppercase font-mono border border-white/5 bg-black/20 px-2 py-1 rounded"
                                >
                                  Dismiss
                                </button>
                                <button
                                  onClick={(e) => handleCopyTranslation(clip.id, activeTranslations[clip.id].text, e)}
                                  className="text-[10px] font-bold text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 transition-colors uppercase font-mono border border-violet-500/20 bg-violet-500/5 px-2 py-1 rounded"
                                >
                                  {copiedTranslationId === clip.id ? 'Copied!' : 'Copy'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Card Actions Panel */}
                        <div className={`border-t px-4 py-2.5 flex items-center justify-between shrink-0 relative gap-2 ${isDarkTheme ? 'border-white/5 bg-black/40' : 'border-slate-200/80 bg-slate-100/90'}`}>
                          {/* Rewrite Dropdown Menu */}
                          {showRewriteMenu === clip.id && (
                            <div 
                              onMouseLeave={() => setShowRewriteMenu(null)}
                              className={`absolute bottom-12 left-16 z-30 rounded-xl p-1.5 shadow-2xl flex flex-col gap-1 w-28 animate-in fade-in slide-in-from-bottom-2 duration-150 ${dropdownSurfaceClass}`}
                            >
                              <div className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border-b mb-0.5 font-mono ${subtleTextClass} ${isDarkTheme ? 'border-white/5' : 'border-slate-200'}`}>Select Tone</div>
                              {[
                                { tone: 'formal', label: 'Formal' },
                                { tone: 'casual', label: 'Casual' },
                                { tone: 'shorter', label: 'Shorter' },
                                { tone: 'expand', label: 'Expand' }
                              ].map(({ tone, label }) => (
                                <button
                                  key={tone}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowRewriteMenu(null);
                                    handleRewrite(clip.id, clip.content, tone);
                                  }}
                                  className={`w-full text-left text-[11px] font-semibold px-2 py-1.5 rounded-lg transition-colors ${
                                    isDarkTheme
                                      ? 'text-neutral-300 hover:text-white hover:bg-white/5'
                                      : 'text-slate-700 hover:text-slate-950 hover:bg-indigo-50'
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Translate Dropdown Menu */}
                          {showTranslateMenu === clip.id && (
                            <div 
                              onMouseLeave={() => setShowTranslateMenu(null)}
                              className={`absolute bottom-12 left-24 z-30 rounded-xl p-1.5 shadow-2xl flex flex-col gap-1 w-32 animate-in fade-in slide-in-from-bottom-2 duration-150 ${dropdownSurfaceClass}`}
                            >
                              <div className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border-b mb-0.5 font-mono ${subtleTextClass} ${isDarkTheme ? 'border-white/5' : 'border-slate-200'}`}>Select Lang</div>
                                  {[
                                    { code: 'Spanish', label: 'Spanish' },
                                    { code: 'French', label: 'French' },
                                    { code: 'German', label: 'German' },
                                    { code: 'Chinese', label: 'Chinese' },
                                    { code: 'Japanese', label: 'Japanese' }
                                  ].map(({ code, label }) => (
                                    <button
                                      key={code}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShowTranslateMenu(null);
                                        handleTranslate(clip.id, clip.content, code);
                                      }}
                                      className={`w-full text-left text-[11px] font-semibold px-2 py-1.5 rounded-lg transition-colors ${
                                        isDarkTheme
                                          ? 'text-neutral-300 hover:text-white hover:bg-white/5'
                                          : 'text-slate-700 hover:text-slate-950 hover:bg-violet-50'
                                      }`}
                                    >
                                      {label}
                                    </button>
                                  ))}
                            </div>
                          )}

                          <div className="flex gap-1 flex-wrap min-w-0 flex-1 items-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openClipPreview(clip);
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-indigo-500/15 bg-indigo-500/8 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-300 hover:bg-indigo-500/15 transition-colors"
                              title="View clip"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View
                            </button>

                            <button
                              onClick={(e) => handleTogglePin(clip.id, e)}
                              className={`p-1 rounded-md hover:bg-white/5 transition-colors border border-transparent ${
                                clip.pinned 
                                  ? 'text-yellow-400 border-yellow-500/10 bg-yellow-500/5' 
                                  : 'text-neutral-500 hover:text-neutral-300'
                              }`}
                              title={clip.pinned ? 'Unpin clip' : 'Pin clip'}
                            >
                              <Star className={`w-3.5 h-3.5 ${clip.pinned ? 'fill-current' : ''}`} />
                            </button>

                            <button
                              onClick={(e) => handleCopyContent(clip.id, clip.content, e)}
                              className={`p-1 rounded-md hover:bg-white/5 transition-colors border border-transparent flex items-center justify-center text-xs font-semibold ${
                                copiedClipId === clip.id 
                                  ? 'text-emerald-400 border-emerald-500/10 bg-emerald-500/5' 
                                  : 'text-neutral-500 hover:text-neutral-300'
                              }`}
                              title="Copy full content"
                            >
                              {copiedClipId === clip.id ? (
                                <span className="text-[10px] font-black uppercase">Copied!</span>
                              ) : (
                                <Clipboard className="w-3.5 h-3.5" />
                              )}
                            </button>

                            <button
                              onClick={(e) => handleOpenEditClip(clip, e)}
                              className="p-1 rounded-md hover:bg-white/5 text-neutral-500 hover:text-indigo-400 transition-colors border border-transparent flex items-center justify-center"
                              title="Edit clip details"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {!isTaskClip(clip) && (
                              <button
                                onClick={(e) => handleCreateTaskFromClip(clip, e)}
                                className="p-1 rounded-md hover:bg-white/5 text-neutral-500 hover:text-emerald-400 transition-colors border border-transparent flex items-center justify-center"
                                title="Create task from note"
                              >
                                <ListChecks className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              onClick={(e) => handleOpenShareModal(clip, e)}
                              className="p-1 rounded-md hover:bg-white/5 text-neutral-500 hover:text-violet-400 transition-colors border border-transparent flex items-center justify-center"
                              title="Share clip"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isPro) {
                                  setShowUpgradeModal(true);
                                  return;
                                }
                                handleSummarize(clip.id, clip.content, e);
                              }}
                              disabled={summarizingClipId === clip.id}
                              className={`p-1 rounded-md hover:bg-white/5 text-neutral-500 hover:text-emerald-400 transition-colors border border-transparent flex items-center justify-center ${
                                summarizingClipId === clip.id ? 'bg-emerald-500/10 text-emerald-400 animate-pulse' : ''
                              }`}
                              title="✨ Summarize with AI"
                            >
                              {summarizingClipId === clip.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                              ) : (
                                <Sparkles className={`w-3.5 h-3.5 ${clipSummaries[clip.id] ? 'text-emerald-400 fill-emerald-400/20' : ''}`} />
                              )}
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isPro) {
                                  setShowUpgradeModal(true);
                                  return;
                                }
                                setShowRewriteMenu(showRewriteMenu === clip.id ? null : clip.id);
                                setShowTranslateMenu(null);
                              }}
                              disabled={rewritingClipId === clip.id}
                              className={`p-1 rounded-md hover:bg-white/5 text-neutral-500 hover:text-indigo-400 transition-colors border border-transparent flex items-center justify-center ${
                                rewritingClipId === clip.id ? 'bg-indigo-500/10 text-indigo-400 animate-pulse' : ''
                              }`}
                              title="🪄 Rewrite with AI"
                            >
                              {rewritingClipId === clip.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                              ) : (
                                <RefreshCw className={`w-3.5 h-3.5 ${pendingRewrites[clip.id] ? 'text-indigo-400' : ''}`} />
                              )}
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isPro) {
                                  setShowUpgradeModal(true);
                                  return;
                                }
                                setShowTranslateMenu(showTranslateMenu === clip.id ? null : clip.id);
                                setShowRewriteMenu(null);
                              }}
                              disabled={translatingClipId === clip.id}
                              className={`p-1 rounded-md hover:bg-white/5 text-neutral-500 hover:text-violet-400 transition-colors border border-transparent flex items-center justify-center ${
                                translatingClipId === clip.id ? 'bg-violet-500/10 text-violet-400 animate-pulse' : ''
                              }`}
                              title="🌐 Translate with AI"
                            >
                              {translatingClipId === clip.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                              ) : (
                                <Languages className={`w-3.5 h-3.5 ${activeTranslations[clip.id] ? 'text-violet-400' : ''}`} />
                              )}
                            </button>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <div className="h-5 w-px bg-white/10" />
                            <button
                              onClick={(e) => handleDeleteClip(clip.id, e)}
                              className="p-1 text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors shrink-0"
                              title="Delete clip"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                      </Card>
                    );
                  })}
                </div>
              )}

              {/* LIST VIEW RENDERING */}
              {viewMode === 'list' && (
                        <div className="flex flex-col gap-3">
                  {sortedClips.map((clip) => {
                    const clipFolder = folders.find(f => f.id === clip.folder_id);
                    const truncatedContent = clip.content.length > 180 
                      ? clip.content.substring(0, 180) + '...'
                      : clip.content;

                    const isSelected = selectedClipIds.includes(clip.id);
                    const hasAiOutput = Boolean(
                      clipSummaries[clip.id] ||
                      pendingRewrites[clip.id] ||
                      activeTranslations[clip.id]
                    );
                    if (isMobileViewport) {
                      return renderMobileClipCard(clip, {
                        draggable: !isSelectionMode,
                        onDragStart: (e) => handleDragStart(e, clip.id),
                      });
                    }
                    return (
                      <Card 
                        key={clip.id}
                        draggable={!isSelectionMode}
                        onDragStart={(e) => handleDragStart(e, clip.id)}
                        onClick={() => {
                          if (isSelectionMode) {
                            handleToggleSelect(clip.id);
                          } else {
                            openClipPreview(clip);
                          }
                        }}
                        className={`border backdrop-blur-md relative overflow-hidden group flex flex-col p-4 md:p-4.5 gap-3 transition-all duration-300 rounded-[24px] ${
                          isSelectionMode 
                            ? isSelected
                              ? 'border-indigo-500/40 bg-indigo-500/10 cursor-pointer'
                              : isDarkTheme
                                ? 'border-white/5 bg-neutral-900/35 hover:border-white/10 hover:bg-neutral-900/40 cursor-pointer'
                                : 'border-slate-200/80 bg-white/92 hover:border-slate-300 hover:bg-white cursor-pointer'
                            : isDarkTheme
                              ? 'border-white/5 bg-neutral-900/35 hover:border-white/10 hover:bg-neutral-900/55 hover:-translate-y-0.5 cursor-pointer'
                              : 'border-slate-200/80 bg-white/92 hover:border-slate-300 hover:bg-white hover:-translate-y-0.5 cursor-pointer shadow-[0_12px_34px_rgba(148,163,184,0.16)]'
                        }`}
                      >
                        {/* Checkbox for selection */}
                        {isSelectionMode && (
                          <div 
                            onClick={(e) => { e.stopPropagation(); handleToggleSelect(clip.id); }}
                            className={`absolute top-4 left-4 z-20 flex items-center justify-center w-5 h-5 rounded-full border transition-all cursor-pointer ${
                              isSelected 
                                ? 'border-indigo-400 bg-indigo-500 text-white' 
                                : 'border-white/20 bg-neutral-950/80 hover:border-indigo-400'
                            }`}
                          >
                            {isSelected && (
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            )}
                          </div>
                        )}

                        <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 w-full ${isSelectionMode ? 'pl-7' : ''}`}>
                          {/* Title & Metadata */}
                          <div className="flex flex-col gap-1 min-w-0 md:min-w-[200px] md:max-w-[280px]">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[10px] font-bold uppercase tracking-wider font-mono ${subtleTextClass}`}>
                                {new Date(clip.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                              {clipFolder && (
                                <span 
                                  className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border flex items-center gap-1 ${isDarkTheme ? 'bg-black/30' : 'bg-white/85'}`}
                                  style={{ borderColor: clipFolder.color + '20', color: clipFolder.color }}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: clipFolder.color }} />
                                  {clipFolder.name}
                                </span>
                              )}
                              {clip.pinned && (
                                <span className={`rounded-full border border-yellow-500/15 bg-yellow-500/10 px-1.5 py-0.2 text-[8px] font-black uppercase ${isDarkTheme ? 'text-yellow-300' : 'text-amber-600'}`}>
                                  Pinned
                                </span>
                              )}
                            </div>
                            <h4 className={`text-base md:text-sm font-bold leading-snug break-words ${titleTextClass}`}>{clip.title || 'Untitled Clip'}</h4>
                            <span className={`text-[10px] font-mono ${subtleTextClass}`}>
                              {clip.content.length} chars {clip.tags.length > 0 ? `| ${clip.tags.length} tags` : ''}
                            </span>
                          </div>

                          {/* Content Snippet */}
                          <div 
                            onClick={(e) => { e.stopPropagation(); openClipPreview(clip); }}
                            className={`w-full md:flex-1 rounded-2xl border p-3 text-left transition-all hover:border-indigo-500/20 max-w-full md:max-w-2xl ${listSnippetClass}`}
                          >
                            <p className={`text-[13px] md:text-xs font-mono line-clamp-3 md:line-clamp-2 break-words leading-relaxed select-text ${isDarkTheme ? 'text-neutral-300' : 'text-slate-700'}`}>
                              {truncatedContent}
                            </p>
                          </div>

                          {/* Tags & Action Buttons */}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 justify-between md:justify-end shrink-0 w-full md:w-auto">
                            {/* Tags column */}
                            <div className="flex flex-wrap gap-1 max-w-full sm:max-w-[180px] md:max-w-[150px] justify-start sm:justify-end">
                              {clip.tags.slice(0, 2).map((tag, idx) => (
                                <span 
                                  key={idx}
                                  className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                                    isDarkTheme
                                      ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                                      : 'bg-indigo-50 text-indigo-600 border-indigo-100'
                                  }`}
                                >
                                  {tag}
                                </span>
                              ))}
                              {clip.tags.length > 2 && (
                                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${isDarkTheme ? 'bg-white/5 text-neutral-400 border border-white/5' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                                  +{clip.tags.length - 2}
                                </span>
                              )}
                            </div>

                            {/* Row Action Toolbar */}
                            <div className={`flex flex-wrap items-center justify-between sm:justify-start gap-1 p-1.5 border rounded-xl relative w-full sm:w-auto ${actionRailClass}`} onClick={(e) => e.stopPropagation()}>
                              {/* Rewrite Dropdown Menu */}
                              {showRewriteMenu === clip.id && (
                                <div 
                                  onMouseLeave={() => setShowRewriteMenu(null)}
                                  className={`absolute bottom-12 right-24 z-30 rounded-xl p-1.5 shadow-2xl flex flex-col gap-1 w-28 ${dropdownSurfaceClass}`}
                                >
                                  <div className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border-b mb-0.5 font-mono ${subtleTextClass} ${isDarkTheme ? 'border-white/5' : 'border-slate-200'}`}>Tone</div>
                                  {[
                                    { tone: 'formal', label: 'Formal' },
                                    { tone: 'casual', label: 'Casual' },
                                    { tone: 'shorter', label: 'Shorter' },
                                    { tone: 'expand', label: 'Expand' }
                                  ].map(({ tone, label }) => (
                                    <button
                                      key={tone}
                                      onClick={() => {
                                        setShowRewriteMenu(null);
                                        handleRewrite(clip.id, clip.content, tone);
                                      }}
                                    className={`w-full text-left text-[11px] font-semibold px-2 py-1 rounded transition-colors ${isDarkTheme ? 'text-neutral-300 hover:text-white hover:bg-white/5' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'}`}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* Translate Dropdown Menu */}
                              {showTranslateMenu === clip.id && (
                                <div 
                                  onMouseLeave={() => setShowTranslateMenu(null)}
                                  className={`absolute bottom-12 right-12 z-30 rounded-xl p-1.5 shadow-2xl flex flex-col gap-1 w-32 ${dropdownSurfaceClass}`}
                                >
                                  <div className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border-b mb-0.5 font-mono ${subtleTextClass} ${isDarkTheme ? 'border-white/5' : 'border-slate-200'}`}>Lang</div>
                                  {[
                                    { code: 'Spanish', label: 'Spanish' },
                                    { code: 'French', label: 'French' },
                                    { code: 'German', label: 'German' },
                                    { code: 'Chinese', label: 'Chinese' },
                                    { code: 'Japanese', label: 'Japanese' }
                                  ].map(({ code, label }) => (
                                    <button
                                      key={code}
                                      onClick={() => {
                                        setShowTranslateMenu(null);
                                        handleTranslate(clip.id, clip.content, code);
                                      }}
                                    className={`w-full text-left text-[11px] font-semibold px-2 py-1 rounded transition-colors ${isDarkTheme ? 'text-neutral-300 hover:text-white hover:bg-white/5' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'}`}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              )}

                              <button onClick={() => openClipPreview(clip)} className={`p-1 rounded text-indigo-400 ${isDarkTheme ? 'hover:bg-white/5' : 'hover:bg-white'}`} title="View details">
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={(e) => handleTogglePin(clip.id, e)} className={`p-1 rounded ${isDarkTheme ? 'hover:bg-white/5' : 'hover:bg-white'} ${clip.pinned ? (isDarkTheme ? 'text-yellow-400' : 'text-amber-600') : (isDarkTheme ? 'text-neutral-500' : 'text-slate-500')}`} title="Pin clip">
                                <Star className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={(e) => handleCopyContent(clip.id, clip.content, e)} className={`p-1 rounded ${listActionButtonClass}`} title="Copy content">
                                {copiedClipId === clip.id ? <span className="text-[8px] text-emerald-400 font-extrabold px-1">COPIED</span> : <Clipboard className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={(e) => handleOpenEditClip(clip, e)} className={`p-1 rounded ${isDarkTheme ? 'text-neutral-500 hover:text-indigo-400 hover:bg-white/5' : 'text-slate-500 hover:text-indigo-600 hover:bg-white'}`} title="Edit details">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={(e) => handleOpenShareModal(clip, e)} className={`p-1 rounded ${isDarkTheme ? 'text-neutral-500 hover:text-violet-400 hover:bg-white/5' : 'text-slate-500 hover:text-violet-600 hover:bg-white'}`} title="Share clip">
                                <Share2 className="w-3.5 h-3.5" />
                              </button>
                              <div className="relative">
                                <button
                                  onClick={() => {
                                    if (!isPro) { setShowUpgradeModal(true); return; }
                                    handleToggleClipMindMenu(clip);
                                    setShowRewriteMenu(null);
                                    setShowTranslateMenu(null);
                                  }}
                                  className={`p-1 rounded ${isDarkTheme ? 'text-neutral-500 hover:text-cyan-400 hover:bg-white/5' : 'text-slate-500 hover:text-cyan-600 hover:bg-white'}`}
                                  title="ClipMind actions"
                                >
                                  {clipMindLoadingId === clip.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                                </button>
                                {showClipMindMenu === clip.id && renderClipMindMenu(clip, 'right')}
                              </div>
                              <button 
                                onClick={(e) => {
                                  if (!isPro) { setShowUpgradeModal(true); return; }
                                  handleSummarize(clip.id, clip.content, e);
                                }}
                                disabled={summarizingClipId === clip.id}
                                className={`p-1 rounded ${isDarkTheme ? 'text-neutral-500 hover:text-emerald-400 hover:bg-white/5' : 'text-slate-500 hover:text-emerald-600 hover:bg-white'} ${summarizingClipId === clip.id ? 'bg-emerald-500/10' : ''}`}
                                title="Summarize"
                              >
                                {summarizingClipId === clip.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className={`w-3.5 h-3.5 ${clipSummaries[clip.id] ? 'text-emerald-400 fill-emerald-400/20' : ''}`} />}
                              </button>
                              <button 
                                onClick={() => {
                                  if (!isPro) { setShowUpgradeModal(true); return; }
                                  setShowRewriteMenu(showRewriteMenu === clip.id ? null : clip.id);
                                  setShowTranslateMenu(null);
                                }}
                                className={`p-1 rounded ${isDarkTheme ? 'text-neutral-500 hover:text-indigo-400 hover:bg-white/5' : 'text-slate-500 hover:text-indigo-600 hover:bg-white'}`}
                                title="Rewrite"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => {
                                  if (!isPro) { setShowUpgradeModal(true); return; }
                                  setShowTranslateMenu(showTranslateMenu === clip.id ? null : clip.id);
                                  setShowRewriteMenu(null);
                                }}
                                className={`p-1 rounded ${isDarkTheme ? 'text-neutral-500 hover:text-violet-400 hover:bg-white/5' : 'text-slate-500 hover:text-violet-600 hover:bg-white'}`}
                                title="Translate"
                              >
                                <Languages className="w-3.5 h-3.5" />
                              </button>
                              <div className="h-4 w-px bg-white/10 mx-1" />
                              <button onClick={(e) => handleDeleteClip(clip.id, e)} className="p-1 rounded hover:bg-white/5 text-rose-500 hover:text-rose-400" title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Collapsible AI Summary Section */}
                        {clipSummaries[clip.id] && (
                          <div className={`px-4 py-2.5 rounded-2xl mt-1 select-text ${summaryPanelClass}`} onClick={(e) => e.stopPropagation()}>
                            <div onClick={(e) => toggleSummaryCollapse(clip.id, e)} className="flex items-center justify-between cursor-pointer">
                              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1"><Sparkles className="w-3 h-3" />AI Summary</span>
                              <span className={subtleTextClass}>{collapsedSummaries[clip.id] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}</span>
                            </div>
                            {!collapsedSummaries[clip.id] && (
                              <p className={`text-[11px] leading-relaxed p-2 rounded-2xl mt-2 border font-sans ${isDarkTheme ? 'text-neutral-300 bg-black/20 border-emerald-500/10' : 'text-slate-700 bg-white/75 border-emerald-200'}`}>{clipSummaries[clip.id]?.summary}</p>
                            )}
                          </div>
                        )}

                        {/* Collapsible Rewrite Suggestions */}
                        {pendingRewrites[clip.id] && (
                          <div className={`px-4 py-2.5 rounded-2xl mt-1 select-text ${rewritePanelClass}`} onClick={(e) => e.stopPropagation()}>
                            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1"><RefreshCw className="w-3 h-3" />AI Rewrite Suggestion</span>
                            <p className={`text-[11px] leading-relaxed p-2 rounded-2xl mt-2 border font-sans ${isDarkTheme ? 'text-neutral-300 bg-black/20 border-indigo-500/10' : 'text-slate-700 bg-white/75 border-indigo-200'}`}>{pendingRewrites[clip.id]}</p>
                            <div className="flex gap-2 justify-end mt-2">
                              <button onClick={(e) => handleDismissRewrite(clip.id, e)} className={`text-[10px] font-bold px-2.5 py-1 rounded border ${listDismissButtonClass}`}>Dismiss</button>
                              <button onClick={(e) => handleApplyRewrite(clip.id, e)} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-500/5 px-2.5 py-1 rounded border border-indigo-500/20">Apply</button>
                            </div>
                          </div>
                        )}

                        {/* Collapsible Translation Suggestions */}
                        {activeTranslations[clip.id] && (
                          <div className={`px-4 py-2.5 rounded-2xl mt-1 select-text ${translatePanelClass}`} onClick={(e) => e.stopPropagation()}>
                            <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider flex items-center gap-1"><Languages className="w-3 h-3" />Translated to {activeTranslations[clip.id].lang}</span>
                            <p className={`text-[11px] leading-relaxed p-2 rounded-2xl mt-2 border font-sans ${isDarkTheme ? 'text-neutral-300 bg-black/20 border-violet-500/10' : 'text-slate-700 bg-white/75 border-violet-200'}`}>{activeTranslations[clip.id].text}</p>
                            <div className="flex gap-2 justify-end mt-2">
                              <button onClick={(e) => handleDismissTranslate(clip.id, e)} className={`text-[10px] font-bold px-2.5 py-1 rounded border ${listDismissButtonClass}`}>Dismiss</button>
                              <button onClick={(e) => handleCopyTranslation(clip.id, activeTranslations[clip.id].text, e)} className="text-[10px] font-bold text-violet-400 hover:text-violet-300 bg-violet-500/5 px-2.5 py-1 rounded border border-violet-500/20">{copiedTranslationId === clip.id ? 'Copied!' : 'Copy'}</button>
                            </div>
                          </div>
                        )}

                      </Card>
                    );
                  })}
                </div>
              )}

              {/* TABLE VIEW RENDERING */}
              {viewMode === 'table' && (
                <>
                  <div className="md:hidden flex flex-col gap-3">
                    {sortedClips.map((clip) => {
                      return renderMobileClipCard(clip);
                    })}
                  </div>

                  <div className={`safe-scroll-x hidden md:block rounded-[24px] border backdrop-blur-md shadow-2xl ${isDarkTheme ? 'border-white/5 bg-[#0b0c10]/45' : 'border-slate-200/80 bg-gradient-to-b from-white/95 to-slate-50/85'}`}>
                  <table className={`min-w-[52rem] w-full border-collapse text-left text-xs ${isDarkTheme ? 'text-neutral-300' : 'text-slate-700'}`}>
                    <thead>
                      <tr className={`border-b text-[10px] font-bold uppercase tracking-wider ${isDarkTheme ? 'border-white/5 bg-black/40 text-neutral-500' : 'border-slate-200/80 bg-slate-50/90 text-slate-500'}`}>
                        {isSelectionMode && <th className="py-3.5 px-4 w-10">Select</th>}
                        <th className="py-3.5 px-4 w-[200px]">Title</th>
                        <th className="py-3.5 px-4">Content Preview</th>
                        <th className="py-3.5 px-4 w-[130px]">Folder</th>
                        <th className="py-3.5 px-4 w-[160px]">Tags</th>
                        <th className="py-3.5 px-4 w-[100px]">Date</th>
                        <th className="py-3.5 px-4 w-[200px] text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {sortedClips.map((clip) => {
                        const clipFolder = folders.find(f => f.id === clip.folder_id);
                        const isSelected = selectedClipIds.includes(clip.id);
                        return (
                          <tr 
                            key={clip.id}
                            onClick={() => {
                              if (isSelectionMode) {
                                handleToggleSelect(clip.id);
                              } else {
                                openClipPreview(clip);
                              }
                            }}
                            className={`transition-colors cursor-pointer group ${
                              isSelected
                                ? isDarkTheme
                                  ? 'bg-indigo-950/10'
                                  : 'bg-indigo-50/80'
                                : isDarkTheme
                                  ? 'hover:bg-white/[0.02]'
                                  : 'hover:bg-slate-50/85'
                            }`}
                          >
                            {isSelectionMode && (
                              <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                                <div 
                                  onClick={() => handleToggleSelect(clip.id)}
                                  className={`flex items-center justify-center w-4 h-4 rounded border transition-all cursor-pointer ${
                                    isSelected 
                                      ? 'border-indigo-400 bg-indigo-500 text-white' 
                                      : 'border-white/20 bg-neutral-950/80 hover:border-indigo-400'
                                  }`}
                                >
                                  {isSelected && (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                  )}
                                </div>
                              </td>
                            )}
                            <td className={`py-3 px-4 font-bold ${titleTextClass}`}>
                              <div className="flex items-center gap-2 max-w-[180px] truncate">
                                {clip.pinned && (
                                  <Star className="w-3.5 h-3.5 text-yellow-500 fill-current shrink-0" />
                                )}
                                <span>{clip.title || 'Untitled Clip'}</span>
                              </div>
                            </td>
                            <td className={`py-3 px-4 font-mono text-[11px] max-w-[280px] truncate select-text ${subtleTextClass}`}>
                              {clip.content}
                            </td>
                            <td className="py-3 px-4">
                              {clipFolder ? (
                                <span 
                                  className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${isDarkTheme ? 'bg-black/30' : 'bg-white/75'}`}
                                  style={{ borderColor: clipFolder.color + '20', color: clipFolder.color }}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: clipFolder.color }} />
                                  {clipFolder.name}
                                </span>
                              ) : (
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${subtleTextClass}`}>Uncategorized</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex flex-wrap gap-1">
                                {clip.tags.slice(0, 2).map((t, i) => (
                                  <span key={i} className={`text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${isDarkTheme ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                                    {t}
                                  </span>
                                ))}
                                {clip.tags.length > 2 && (
                                  <span className={`text-[9px] font-extrabold px-1.5 rounded-full border ${isDarkTheme ? 'bg-white/5 text-neutral-500 border-white/5' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                    +{clip.tags.length - 2}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className={`py-3 px-4 text-[10px] font-mono ${subtleTextClass}`}>
                              {new Date(clip.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </td>
                            <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => openClipPreview(clip)} className="p-1 rounded hover:bg-white/5 text-indigo-400" title="View details">
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={(e) => handleTogglePin(clip.id, e)} className={`p-1 rounded hover:bg-white/5 ${clip.pinned ? 'text-yellow-400' : 'text-neutral-500'}`} title="Pin clip">
                                  <Star className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={(e) => handleCopyContent(clip.id, clip.content, e)} className="p-1 rounded hover:bg-white/5 text-neutral-400" title="Copy text">
                                  {copiedClipId === clip.id ? <span className="text-[9px] text-emerald-400 font-extrabold px-1">COPIED</span> : <Clipboard className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={(e) => handleOpenEditClip(clip, e)} className="p-1 rounded hover:bg-white/5 text-neutral-400" title="Edit clip">
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={(e) => handleDeleteClip(clip.id, e)} className="p-1 rounded hover:bg-white/5 text-rose-400" title="Delete clip">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </>
              )}

              {/* KANBAN BOARD VIEW RENDERING */}
              {viewMode === 'board' && (
                <div className="flex gap-3 md:gap-4 overflow-x-auto pb-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent snap-x snap-mandatory min-h-[550px] items-stretch">
                  {getKanbanColumns().map((column) => {
                    return (
                      <div
                        key={column.id}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, column.id)}
                        onDragEnter={() => setDraggedOverFolderId(column.id)}
                        onDragLeave={() => setDraggedOverFolderId(null)}
                        className={`flex-1 min-w-[84vw] max-w-[84vw] sm:min-w-[290px] sm:max-w-[340px] rounded-[28px] border p-4 flex flex-col gap-3 snap-align-start shrink-0 transition-all duration-300 ${
                          draggedOverFolderId === column.id
                            ? isDarkTheme
                              ? 'border-indigo-500/40 bg-indigo-500/8 scale-[1.01] shadow-lg shadow-indigo-500/5'
                              : 'border-indigo-200 bg-indigo-50/85 scale-[1.01] shadow-lg shadow-indigo-100/60'
                            : isDarkTheme
                              ? 'border-white/5 bg-[linear-gradient(180deg,rgba(17,24,39,0.82),rgba(10,10,15,0.52))]'
                              : 'border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,245,249,0.92))] shadow-[0_18px_45px_rgba(148,163,184,0.18)]'
                        }`}
                      >
                        {/* Column Header */}
                        <div className={`flex items-center justify-between pb-2 border-b shrink-0 ${isDarkTheme ? 'border-white/5' : 'border-slate-200/80'}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: column.color }} />
                            <h3 className={`text-xs font-black uppercase tracking-wider truncate ${titleTextClass}`}>{column.name}</h3>
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-black shrink-0 ${isDarkTheme ? 'bg-black/40 border border-white/5 text-neutral-400' : 'bg-white/85 border border-slate-200 text-slate-500'}`}>
                              {column.clips.length}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              if (column.id !== 'uncategorized' && column.id !== 'pinned' && column.id !== 'other') {
                                setNewClipFolderId(column.id);
                              } else {
                                setNewClipFolderId('');
                              }
                              setIsNewClipOpen(true);
                            }}
                            className="p-1 rounded-lg text-neutral-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                            title="Add Clip to Column"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Column Body - Clips List */}
                        <div className="flex flex-col gap-3 overflow-y-auto flex-grow max-h-[600px] pr-1.5 scrollbar-thin scrollbar-thumb-white/5 scrollbar-track-transparent">
                          {column.clips.length > 0 ? (
                            column.clips.map((clip) => {
                              const isSelected = selectedClipIds.includes(clip.id);
                              const truncatedContent = clip.content.length > 80 
                                ? clip.content.substring(0, 80) + '...'
                                : clip.content;
                              if (isMobileViewport) {
                                return renderMobileClipCard(clip, {
                                  draggable: !isSelectionMode,
                                  onDragStart: (e) => handleDragStart(e, clip.id),
                                  className: 'min-h-0',
                                });
                              }
                              return (
                                <Card
                                  key={clip.id}
                                  draggable={!isSelectionMode}
                                  onDragStart={(e) => handleDragStart(e, clip.id)}
                                  onClick={() => {
                                    if (isSelectionMode) {
                                      handleToggleSelect(clip.id);
                                    } else {
                                      openClipPreview(clip);
                                    }
                                  }}
                                  className={`border backdrop-blur-md relative overflow-hidden group flex flex-col p-3.5 gap-2.5 transition-all duration-300 ${
                                    isSelectionMode
                                      ? isSelected
                                        ? 'border-indigo-500/40 bg-indigo-500/10 cursor-pointer'
                                        : isDarkTheme
                                          ? 'border-white/5 bg-neutral-900/35 hover:border-white/10 hover:bg-neutral-900/40 cursor-pointer'
                                          : 'border-slate-200/80 bg-white/88 hover:border-slate-300 hover:bg-white cursor-pointer'
                                      : isDarkTheme
                                        ? 'border-white/5 bg-neutral-900/35 hover:border-white/10 hover:bg-neutral-900/55 hover:-translate-y-0.5 cursor-grab active:cursor-grabbing'
                                        : 'border-slate-200/80 bg-white/88 hover:border-slate-300 hover:bg-white hover:-translate-y-0.5 cursor-grab active:cursor-grabbing shadow-[0_10px_28px_rgba(148,163,184,0.16)]'
                                  }`}
                                >
                                  {/* Checkbox for selection */}
                                  {isSelectionMode && (
                                    <div 
                                      onClick={(e) => { e.stopPropagation(); handleToggleSelect(clip.id); }}
                                      className={`absolute top-3 left-3 z-20 flex items-center justify-center w-4 h-4 rounded-full border transition-all cursor-pointer ${
                                        isSelected 
                                          ? 'border-indigo-400 bg-indigo-500 text-white' 
                                          : isDarkTheme
                                            ? 'border-white/20 bg-neutral-950/80 hover:border-indigo-400'
                                            : 'border-slate-300 bg-white hover:border-indigo-400'
                                      }`}
                                    >
                                      {isSelected && (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                      )}
                                    </div>
                                  )}

                                  <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className={`text-[9px] font-bold uppercase tracking-wider font-mono ${isSelectionMode ? 'pl-5' : ''} ${subtleTextClass}`}>
                                        {new Date(clip.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                      </span>
                                      {clip.pinned && (
                                        <span className={`rounded-full border border-yellow-500/15 bg-yellow-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${isDarkTheme ? 'text-yellow-300' : 'text-amber-600'}`}>
                                          Pinned
                                        </span>
                                      )}
                                    </div>
                                    <h4 className={`text-xs font-bold line-clamp-1 leading-snug ${titleTextClass}`}>{clip.title || 'Untitled Clip'}</h4>
                                  </div>

                                  <p className={`text-[11px] font-mono break-words rounded-2xl p-2 line-clamp-3 select-text border ${isDarkTheme ? 'text-neutral-400 bg-black/10 border-white/5' : 'text-slate-600 bg-slate-50/85 border-slate-200'}`}>
                                    {truncatedContent}
                                  </p>

                                  <div className={`flex items-center justify-between border-t pt-2 mt-0.5 shrink-0 ${isDarkTheme ? 'border-white/5' : 'border-slate-200/80'}`}>
                                    <div className="flex flex-wrap gap-1 max-w-[110px] overflow-hidden">
                                      {clip.tags.slice(0, 1).map((t, i) => (
                                        <span key={i} className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase truncate border ${isDarkTheme ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                                          {t}
                                        </span>
                                      ))}
                                      {clip.tags.length > 1 && (
                                        <span className={`text-[8px] px-1 rounded-full font-bold border ${isDarkTheme ? 'bg-white/5 text-neutral-400 border-white/5' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                          +{clip.tags.length - 1}
                                        </span>
                                      )}
                                    </div>

                                    {/* Action toolbar */}
                                    <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                      <button onClick={() => openClipPreview(clip)} className="text-neutral-500 hover:text-indigo-400 p-0.5 rounded">
                                        <Eye className="w-3 h-3" />
                                      </button>
                                      <button onClick={(e) => handleCopyContent(clip.id, clip.content, e)} className="text-neutral-500 hover:text-emerald-400 p-0.5 rounded">
                                        {copiedClipId === clip.id ? <span className="text-[7px] text-emerald-400 font-black">COPIED</span> : <Clipboard className="w-3 h-3" />}
                                      </button>
                                      <button onClick={(e) => handleDeleteClip(clip.id, e)} className="text-neutral-500 hover:text-rose-400 p-0.5 rounded">
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                </Card>
                              );
                            })
                          ) : (
                            <div className={`border border-dashed rounded-2xl py-8 px-4 flex flex-col items-center justify-center text-center ${isDarkTheme ? 'border-white/5 bg-neutral-900/5 text-neutral-600' : 'border-slate-200 bg-white/60 text-slate-400'}`}>
                              <Clipboard className="w-5 h-5 mb-1.5 opacity-60" />
                              <p className="text-[10px] font-bold uppercase tracking-wider">Empty column</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* Ambient Empty State design */
            <div className="border border-white/5 border-dashed bg-neutral-900/10 rounded-2xl p-8 md:p-16 flex flex-col items-center justify-center text-center gap-4 relative overflow-hidden mt-6">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-md">
                <Clipboard className="w-7 h-7" />
              </div>
              <div className="flex flex-col gap-1.5 max-w-sm">
                <h4 className="text-sm font-semibold text-neutral-300">
                  {searchQuery
                    ? 'No matching clips'
                    : activeFilter === 'pinned'
                    ? 'No pinned clips yet'
                    : activeFilter === 'folder'
                    ? 'This folder is empty'
                    : 'Save your first clip!'}
                </h4>
                <p className="text-xs text-neutral-500 leading-normal">
                  {searchQuery 
                    ? `No clips matching "${debouncedSearch}". Clear the query or try a different filter.`
                    : activeFilter === 'pinned'
                    ? "Click the star icon on any clip to pin it here for quick access."
                    : activeFilter === 'folder'
                    ? "Create a new clip inside this folder to populate it."
                    : "Paste any text, code snippet, or link. It syncs across all your devices instantly."}
                </p>
              </div>
              
              {!searchQuery && (
                <div className="flex flex-col sm:flex-row gap-2.5 mt-3">
                  <Button
                    onClick={() => handleOpenNewClipModal()}
                    className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs px-5 py-4 gap-1.5 transition-colors border-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create First Clip
                  </Button>
                  <Button
                    onClick={() => window.open('https://chrome.google.com/webstore', '_blank')}
                    className="bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10 font-bold text-xs px-5 py-4 gap-1.5 transition-colors"
                  >
                    <Puzzle className="w-3.5 h-3.5" />
                    Get Chrome Extension
                  </Button>
                </div>
              )}
            </div>
          )}

        </main>
      </div>

      {renderClipMindDrawer()}

      {isMobileViewport && mobileClipMindActionClip && (
        <>
          <div
            className="fixed inset-0 z-[85] bg-slate-950/70 backdrop-blur-sm md:hidden"
            onClick={() => setShowClipMindMenu(null)}
          />
          <div className={`fixed inset-x-0 bottom-0 z-[90] max-h-[85dvh] overflow-hidden rounded-t-[30px] border md:hidden ${
            isDarkTheme
              ? 'border-white/10 bg-neutral-950 text-neutral-100'
              : 'border-slate-200 bg-white text-slate-900'
          }`}>
            <div className="flex max-h-[85dvh] min-h-0 flex-col overflow-hidden">
              <div className={`shrink-0 border-b px-4 pb-4 pt-3 ${isDarkTheme ? 'border-white/8 bg-neutral-950' : 'border-slate-200 bg-white'}`}>
                <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-black/10 dark:bg-white/10" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${isDarkTheme ? 'text-cyan-300' : 'text-cyan-700'}`}>AI Actions</p>
                    <h3 className={`mt-1 text-base font-black ${titleTextClass}`}>ClipMind for this clip</h3>
                    <p className={`mt-1 text-xs leading-5 ${subtleTextClass}`}>Run a focused action, then apply or save the result.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowClipMindMenu(null)}
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${isDarkTheme ? 'border-white/8 text-neutral-300' : 'border-slate-200 text-slate-600'}`}
                    aria-label="Close AI actions"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <div className={`mb-4 overflow-hidden rounded-[22px] border px-3 py-3 ${isDarkTheme ? 'border-white/8 bg-white/[0.03]' : 'border-slate-200 bg-slate-50/80'}`}>
                  <p className={`line-clamp-2 text-sm font-black [overflow-wrap:anywhere] ${titleTextClass}`}>
                    {mobileClipMindActionClip.title || 'Untitled Clip'}
                  </p>
                  <p className={`mt-2 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-5 ${subtleTextClass}`}>
                    {mobileClipMindActionClip.content}
                  </p>
                </div>

                {clipMindLoadingId === mobileClipMindActionClip.id && (
                  <div className={`mb-4 rounded-[22px] border p-4 ${isDarkTheme ? 'border-cyan-500/20 bg-cyan-500/8' : 'border-cyan-200 bg-cyan-50/90'}`}>
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Working on it...
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className={`h-3 rounded-full ${isDarkTheme ? 'bg-white/10' : 'bg-white'} animate-pulse`} />
                      <div className={`h-3 w-[82%] rounded-full ${isDarkTheme ? 'bg-white/10' : 'bg-white'} animate-pulse`} />
                      <div className={`h-3 w-[65%] rounded-full ${isDarkTheme ? 'bg-white/10' : 'bg-white'} animate-pulse`} />
                    </div>
                  </div>
                )}

                {clipMindResults[mobileClipMindActionClip.id] && (
                  <div className={`mb-4 rounded-[22px] border p-4 ${isDarkTheme ? 'border-cyan-500/20 bg-cyan-500/8' : 'border-cyan-200 bg-cyan-50/90'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${isDarkTheme ? 'text-cyan-300' : 'text-cyan-700'}`}>
                          Result • {clipMindResults[mobileClipMindActionClip.id].label}
                        </p>
                        {clipMindResults[mobileClipMindActionClip.id].isFallback && (
                          <p className={`mt-1 text-[11px] leading-5 ${isDarkTheme ? 'text-amber-300' : 'text-amber-700'}`}>
                            {clipMindResults[mobileClipMindActionClip.id].warning || 'Local fallback generated.'}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => dismissClipMindResult(mobileClipMindActionClip.id, e)}
                        className={`rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${subtleTextClass}`}
                      >
                        Clear
                      </button>
                    </div>
                    <pre className={`mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-2xl border p-3 text-xs leading-6 ${isDarkTheme ? 'border-white/8 bg-black/20 text-neutral-200' : 'border-slate-200 bg-white text-slate-700'}`}>
                      {clipMindResults[mobileClipMindActionClip.id].result}
                    </pre>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {clipMindResults[mobileClipMindActionClip.id].applyTarget && (
                        <button
                          type="button"
                          onClick={(e) => handleApplyClipMindResult(mobileClipMindActionClip, e)}
                          className={`rounded-xl px-3 py-2.5 text-xs font-black ${isDarkTheme ? 'bg-cyan-400/10 text-cyan-300' : 'bg-white text-cyan-700 border border-cyan-200'}`}
                        >
                          Apply
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleSaveClipMindResultAsClip(mobileClipMindActionClip.id, e)}
                        className={`rounded-xl px-3 py-2.5 text-xs font-black ${isDarkTheme ? 'bg-indigo-400/10 text-indigo-300' : 'bg-white text-indigo-700 border border-indigo-200'}`}
                      >
                        Save as new clip
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleCopyClipMindResult(mobileClipMindActionClip.id, e)}
                        className={`rounded-xl px-3 py-2.5 text-xs font-black ${isDarkTheme ? 'bg-white/6 text-neutral-200' : 'bg-white text-slate-700 border border-slate-200'}`}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-3 pb-4">
                  {MOBILE_CLIP_MIND_ACTION_GROUPS.map((group) => (
                    <div
                      key={group.title}
                      className={`overflow-hidden rounded-[22px] border ${isDarkTheme ? 'border-white/8 bg-white/[0.03]' : 'border-slate-200 bg-white'}`}
                    >
                      <div className={`bg-gradient-to-r px-4 py-3 ${group.accent}`}>
                        <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{group.title}</p>
                        <p className={`mt-1 text-[11px] leading-5 ${subtleTextClass}`}>{group.description}</p>
                      </div>
                      <div className="grid grid-cols-1 gap-2 p-3">
                        {group.actions.map((item) => {
                          const Icon = CLIP_MIND_ACTION_ICONS[item.id];
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={(e) => handleClipMindAction(mobileClipMindActionClip, item.id, e)}
                              className={`flex items-start gap-3 rounded-2xl border px-3 py-3 text-left ${isDarkTheme ? 'border-white/8 bg-black/10 text-neutral-200' : 'border-slate-200 bg-slate-50/80 text-slate-800'}`}
                            >
                              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${isDarkTheme ? 'bg-white/6 text-cyan-200' : 'bg-white text-indigo-600'}`}>
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-xs font-black">{item.label}</span>
                                <span className={`mt-1 block text-[11px] leading-5 ${subtleTextClass}`}>{item.hint}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {mobileCardActionClip && (
        <>
          <div
            className="fixed inset-0 z-[75] bg-black/55 backdrop-blur-[2px] md:hidden"
            onClick={closeMobileCardActionSheet}
          />
          <div className={`fixed inset-x-0 bottom-0 z-[80] rounded-t-[28px] border p-4 shadow-[0_-24px_60px_rgba(15,23,42,0.26)] md:hidden ${
            isDarkTheme
              ? 'border-white/10 bg-neutral-950 text-neutral-100'
              : 'border-slate-200 bg-white text-slate-900'
          }`}>
            <div className="mx-auto w-full max-w-md">
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/10" />
              <div className="mb-4 min-w-0">
                <p className={`line-clamp-2 text-sm font-black [overflow-wrap:anywhere] ${titleTextClass}`}>
                  {mobileCardActionClip.title || 'Untitled Clip'}
                </p>
                <p className={`mt-1 text-[11px] font-bold uppercase tracking-[0.16em] ${subtleTextClass}`}>
                  More Actions
                </p>
              </div>

              {mobileCardActionPanel === 'root' && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { closeMobileCardActionSheet(); openClipPreview(mobileCardActionClip); }} className={`rounded-2xl border px-3 py-3 text-left text-xs font-bold ${isDarkTheme ? 'border-white/10 bg-black/25 text-neutral-200' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>View</button>
                  <button onClick={() => { handleOpenEditClip(mobileCardActionClip); closeMobileCardActionSheet(); }} className={`rounded-2xl border px-3 py-3 text-left text-xs font-bold ${isDarkTheme ? 'border-white/10 bg-black/25 text-neutral-200' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>Edit</button>
                  <button onClick={() => { handleOpenShareModal(mobileCardActionClip).finally(closeMobileCardActionSheet); }} className={`rounded-2xl border px-3 py-3 text-left text-xs font-bold ${isDarkTheme ? 'border-white/10 bg-black/25 text-neutral-200' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>Share</button>
                  <button onClick={() => { handleTogglePin(mobileCardActionClip.id).finally(closeMobileCardActionSheet); }} className={`rounded-2xl border px-3 py-3 text-left text-xs font-bold ${isDarkTheme ? 'border-white/10 bg-black/25 text-neutral-200' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>{mobileCardActionClip.pinned ? 'Unpin' : 'Pin'}</button>
                  <button onClick={() => setMobileCardActionPanel('task')} className={`rounded-2xl border px-3 py-3 text-left text-xs font-bold ${isDarkTheme ? 'border-white/10 bg-black/25 text-neutral-200' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>{isTaskClip(mobileCardActionClip) ? 'Task Status' : 'Make Task'}</button>
                  <button onClick={() => { handleSummarize(mobileCardActionClip.id, mobileCardActionClip.content); closeMobileCardActionSheet(); }} className={`rounded-2xl border px-3 py-3 text-left text-xs font-bold ${isDarkTheme ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>AI Summary</button>
                  <button onClick={() => setMobileCardActionPanel('rewrite')} className={`rounded-2xl border px-3 py-3 text-left text-xs font-bold ${isDarkTheme ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300' : 'border-indigo-200 bg-indigo-50 text-indigo-700'}`}>Rewrite</button>
                  <button onClick={() => setMobileCardActionPanel('translate')} className={`rounded-2xl border px-3 py-3 text-left text-xs font-bold ${isDarkTheme ? 'border-violet-500/20 bg-violet-500/10 text-violet-300' : 'border-violet-200 bg-violet-50 text-violet-700'}`}>Translate</button>
                  <button onClick={() => { setShowClipMindMenu(mobileCardActionClip.id); closeMobileCardActionSheet(); }} className={`rounded-2xl border px-3 py-3 text-left text-xs font-bold ${isDarkTheme ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300' : 'border-cyan-200 bg-cyan-50 text-cyan-700'}`}>ClipMind</button>
                  <button onClick={() => { handleDeleteClip(mobileCardActionClip.id).finally(closeMobileCardActionSheet); }} className={`rounded-2xl border px-3 py-3 text-left text-xs font-bold ${isDarkTheme ? 'border-rose-500/20 bg-rose-500/10 text-rose-300' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>Delete</button>
                </div>
              )}

              {mobileCardActionPanel === 'rewrite' && (
                <div className="space-y-2">
                  <button onClick={() => setMobileCardActionPanel('root')} className={`text-[11px] font-bold ${subtleTextClass}`}>Back</button>
                  {[
                    { tone: 'formal', label: 'Formal' },
                    { tone: 'casual', label: 'Casual' },
                    { tone: 'shorter', label: 'Shorter' },
                    { tone: 'expand', label: 'Expand' },
                  ].map(({ tone, label }) => (
                    <button key={tone} onClick={() => { handleRewrite(mobileCardActionClip.id, mobileCardActionClip.content, tone); closeMobileCardActionSheet(); }} className={`block w-full rounded-2xl border px-3 py-3 text-left text-xs font-bold ${isDarkTheme ? 'border-white/10 bg-black/25 text-neutral-200' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>{label}</button>
                  ))}
                </div>
              )}

              {mobileCardActionPanel === 'translate' && (
                <div className="space-y-2">
                  <button onClick={() => setMobileCardActionPanel('root')} className={`text-[11px] font-bold ${subtleTextClass}`}>Back</button>
                  {['Spanish', 'French', 'German', 'Chinese', 'Japanese'].map((lang) => (
                    <button key={lang} onClick={() => { handleTranslate(mobileCardActionClip.id, mobileCardActionClip.content, lang); closeMobileCardActionSheet(); }} className={`block w-full rounded-2xl border px-3 py-3 text-left text-xs font-bold ${isDarkTheme ? 'border-white/10 bg-black/25 text-neutral-200' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>{lang}</button>
                  ))}
                </div>
              )}

              {mobileCardActionPanel === 'task' && (
                <div className="space-y-2">
                  <button onClick={() => setMobileCardActionPanel('root')} className={`text-[11px] font-bold ${subtleTextClass}`}>Back</button>
                  {isTaskClip(mobileCardActionClip) ? (
                    (['pending', 'in-progress', 'done'] as TaskStatus[]).map((status) => (
                      <button key={status} onClick={() => { handleTaskStatusChange(mobileCardActionClip, status); closeMobileCardActionSheet(); }} className={`block w-full rounded-2xl border px-3 py-3 text-left text-xs font-bold capitalize ${isDarkTheme ? 'border-white/10 bg-black/25 text-neutral-200' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>{status.replace('-', ' ')}</button>
                    ))
                  ) : (
                    <button onClick={() => { handleCreateTaskFromClip(mobileCardActionClip); closeMobileCardActionSheet(); }} className={`block w-full rounded-2xl border px-3 py-3 text-left text-xs font-bold ${isDarkTheme ? 'border-white/10 bg-black/25 text-neutral-200' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>Create Task</button>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* --- DIALOG MODALS --- */}

      {/* 1. NEW CLIP MODAL */}
      <Dialog open={isNewClipOpen} onOpenChange={setIsNewClipOpen}>
        <DialogContent showCloseButton={false} className={`${safeModalPanelClass} max-w-4xl`}>
          <div className={safeModalFrameClass}>
            <DialogHeader className={`${safeModalHeaderClass} pr-14`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-[0_14px_30px_rgba(99,102,241,0.24)]">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <DialogTitle className="text-xl font-black tracking-tight text-slate-950 [overflow-wrap:anywhere]">Create New Clip</DialogTitle>
                    <DialogDescription className="mt-1 text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">
                      Paste once, then let AI Assist title, tag, format, and organize it.
                    </DialogDescription>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pr-1 text-[11px] font-bold text-slate-500">
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-indigo-700">{newClipDetectedType.toUpperCase()}</span>
                  <span>{newClipWordCount} words</span>
                  <span>{newClipCharCount} chars</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewClipOpen(false)}
                className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close create clip modal"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogHeader>

            <form onSubmit={handleCreateClip} className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_17rem]">
              <div className={`${safeModalBodyClass} flex flex-col gap-5`}>
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Clip title</label>
                  <Input
                    type="text"
                    placeholder="React layout component, meeting logs, etc..."
                    value={newClipTitle}
                    onChange={(e) => setNewClipTitle(e.target.value)}
                    className="h-11 rounded-xl border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-300 focus:ring-indigo-200"
                    maxLength={60}
                  />
                </div>
                <button
                  type="button"
                  onClick={inferClipTitle}
                  className="mt-auto inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-xs font-black text-indigo-700 transition hover:bg-indigo-100 sm:w-auto"
                >
                  <Wand2 className="h-4 w-4" />
                  Smart Title
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Content</label>
                  <div className="flex flex-wrap gap-1.5">
                    {newClipModeOptions.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setNewClipContentMode(value)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black transition ${
                          newClipContentMode === value
                            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800'
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <Textarea
                  ref={newClipContentRef}
                  placeholder="Paste code, meeting notes, URLs, research snippets, or reusable text here..."
                  value={newClipContent}
                  onChange={(e) => setNewClipContent(e.target.value)}
                  onKeyUp={() => {
                    if (newClipContentRef.current) {
                      expandSnippetInTextarea(newClipContentRef.current, setNewClipContent);
                    }
                  }}
                  className="min-h-[220px] max-w-full resize-y rounded-2xl border-slate-200 bg-slate-50/80 p-4 font-mono text-sm leading-7 text-slate-800 placeholder:text-slate-400 [overflow-wrap:anywhere] focus:border-indigo-300 focus:ring-indigo-200"
                  required
                />
                {newClipDuplicate && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    Possible duplicate: {newClipDuplicate.title || 'Untitled clip'}
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Tags</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      type="text"
                      placeholder="CODE, NOTES, V1"
                      value={newClipTagsString}
                      onChange={(e) => setNewClipTagsString(e.target.value)}
                      className="h-11 rounded-xl border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-300 focus:ring-indigo-200"
                    />
                    <button
                      type="button"
                      onClick={suggestClipTags}
                      className="inline-flex h-11 w-full shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-emerald-700 transition hover:bg-emerald-100 sm:w-auto"
                      title="Suggest tags"
                    >
                      <Tags className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Folder</label>
                  <select
                    value={newClipFolderId}
                    onChange={(e) => setNewClipFolderId(e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">No Folder</option>
                    {folders.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              </div>

            <aside className="safe-card flex min-h-0 flex-col gap-4 border-t border-slate-200 bg-slate-50/80 px-4 py-4 sm:px-6 sm:py-5 lg:overflow-y-auto lg:border-l lg:border-t-0">
              <div className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <Bot className="h-4 w-4 text-indigo-600" />
                  <p className="text-sm font-black text-slate-950">AI Assist</p>
                </div>
                <div className="grid gap-2">
                  <button type="button" onClick={inferClipTitle} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
                    <Wand2 className="h-4 w-4" />
                    Generate title
                  </button>
                  <button type="button" onClick={suggestClipTags} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700">
                    <Tags className="h-4 w-4" />
                    Suggest tags
                  </button>
                  <button type="button" onClick={formatNewClipContent} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700">
                    <ScanText className="h-4 w-4" />
                    Clean format
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-amber-200 hover:bg-amber-50/50">
                <input
                  type="checkbox"
                  checked={newClipPinned}
                  onChange={(e) => setNewClipPinned(e.target.checked)}
                  className="mt-1 h-4 w-4 cursor-pointer rounded border-slate-300 accent-indigo-600"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-800">Pin to top</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Keep this clip visible in the dashboard.</span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-emerald-200 hover:bg-emerald-50/50">
                <input
                  type="checkbox"
                  checked={newClipAsTask}
                  onChange={(e) => setNewClipAsTask(e.target.checked)}
                  className="mt-1 h-4 w-4 cursor-pointer rounded border-slate-300 accent-emerald-600"
                />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                    <ListChecks className="h-4 w-4 text-emerald-600" />
                    Create as task
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Adds it to Checklist as Pending.</span>
                </span>
              </label>

              <label className={`flex items-start gap-3 rounded-2xl border p-4 transition ${
                userPlan === 'pro'
                  ? 'cursor-pointer border-indigo-200 bg-indigo-50/70'
                  : 'border-slate-200 bg-white'
              }`}>
                <input
                  type="checkbox"
                  checked={newClipAiOrganize}
                  onChange={(e) => setNewClipAiOrganize(e.target.checked)}
                  disabled={userPlan !== 'pro'}
                  className="mt-1 h-4 w-4 rounded border-slate-300 accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                    <Brain className="h-4 w-4 text-indigo-600" />
                    AI organize after save
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    {userPlan === 'pro' ? 'Auto-tag and index this clip for ClipMind.' : 'Available on Pro for auto-tagging and ClipMind indexing.'}
                  </span>
                </span>
              </label>

              <DialogFooter className={`${safeModalFooterClass} mt-auto flex-col-reverse gap-2 rounded-[1.1rem] border border-slate-200 sm:space-x-0 lg:sticky lg:bottom-0 lg:-mx-2 lg:border-x-0 lg:border-b-0 lg:px-2 lg:pb-0`}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsNewClipOpen(false)}
                  className="h-11 w-full text-sm font-bold text-slate-600 hover:bg-white hover:text-slate-950 sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!newClipContent.trim()}
                  className="h-11 w-full border-0 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-5 text-sm font-black text-white shadow-[0_14px_30px_rgba(99,102,241,0.24)] hover:translate-y-[-1px] disabled:translate-y-0 disabled:opacity-50 sm:w-auto"
                >
                  Create Clip
                </Button>
              </DialogFooter>
            </aside>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* 2. NEW FOLDER MODAL */}
      <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
        <DialogContent className="border border-white/5 bg-neutral-950/95 text-white max-w-sm w-[calc(100%_-_2rem)] md:w-full rounded-xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

          <DialogHeader className="mb-4">
            <DialogTitle className="text-base font-bold text-neutral-200">Create New Folder</DialogTitle>
            <DialogDescription className="text-xs text-neutral-500">
              Organize related synced clip cards. Choose a color label.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateFolder} className="flex flex-col gap-4">
            
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Folder Name</label>
              <Input
                type="text"
                placeholder="e.g. Snippets, Passwords, References..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="bg-black/30 border-white/10 text-xs focus:border-indigo-500/40 text-neutral-200 placeholder:text-neutral-600"
                required
                maxLength={30}
              />
            </div>

            {/* Folder Accent Color Picker */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Color Label</label>
              <div className="flex gap-2.5 flex-wrap">
                {PRESET_COLORS.map((color) => {
                  const isSelected = newFolderColor === color.value;
                  return (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setNewFolderColor(color.value)}
                      className={`w-6 h-6 rounded-full transition-all flex items-center justify-center shrink-0 border-2 ${
                        isSelected ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    >
                      {isSelected && (
                        <div className="w-1.5 h-1.5 bg-black rounded-full" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <DialogFooter className="mt-4 gap-2">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setIsNewFolderOpen(false)}
                className="text-neutral-400 hover:text-white hover:bg-white/5 text-xs font-semibold"
              >
                Cancel
              </Button>
              
              <Button
                type="submit"
                disabled={!newFolderName.trim()}
                className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs px-5 border-0 shadow-lg shadow-indigo-500/20"
              >
                Create Folder
              </Button>
            </DialogFooter>

          </form>
        </DialogContent>
      </Dialog>

      {/* 2.5 RENAME FOLDER MODAL */}
      <Dialog open={isRenameFolderOpen} onOpenChange={setIsRenameFolderOpen}>
        <DialogContent className="border border-white/5 bg-neutral-950/95 text-white max-w-sm w-[calc(100%_-_2rem)] md:w-full rounded-xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

          <DialogHeader className="mb-4">
            <DialogTitle className="text-base font-bold text-neutral-200">Edit Folder Settings</DialogTitle>
            <DialogDescription className="text-xs text-neutral-500">
              Rename folder label or update the color assignment.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRenameFolder} className="flex flex-col gap-4">
            
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Folder Name</label>
              <Input
                type="text"
                placeholder="e.g. Snippets, Passwords, References..."
                value={renameFolderName}
                onChange={(e) => setRenameFolderName(e.target.value)}
                className="bg-black/30 border-white/10 text-xs focus:border-indigo-500/40 text-neutral-200 placeholder:text-neutral-600"
                required
                maxLength={30}
              />
            </div>

            {/* Folder Accent Color Picker */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Color Label</label>
              <div className="flex gap-2.5 flex-wrap">
                {PRESET_COLORS.map((color) => {
                  const isSelected = renameFolderColor === color.value;
                  return (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setRenameFolderColor(color.value)}
                      className={`w-6 h-6 rounded-full transition-all flex items-center justify-center shrink-0 border-2 ${
                        isSelected ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    >
                      {isSelected && (
                        <div className="w-1.5 h-1.5 bg-black rounded-full" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <DialogFooter className="mt-4 gap-2">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setIsRenameFolderOpen(false)}
                className="text-neutral-400 hover:text-white hover:bg-white/5 text-xs font-semibold"
              >
                Cancel
              </Button>
              
              <Button
                type="submit"
                disabled={!renameFolderName.trim()}
                className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs px-5 border-0 shadow-lg shadow-indigo-500/20"
              >
                Save Changes
              </Button>
            </DialogFooter>

          </form>
        </DialogContent>
      </Dialog>

      {/* 2.8 COLLECTION SHARE SUCCESS MODAL */}
      <Dialog open={isColShareModalOpen} onOpenChange={(open) => { setIsColShareModalOpen(open); if (!open) { setColShareToken(null); setColShareExpiry(null); } }}>
        <DialogContent className="border border-white/5 bg-neutral-950/95 text-white max-w-sm w-[calc(100%_-_2rem)] rounded-2xl p-5 shadow-2xl relative overflow-hidden">
          {/* Ambient decoration */}
          <div className="absolute top-0 right-0 w-36 h-36 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-28 h-28 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <DialogHeader className="mb-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-violet-500/10 border border-violet-500/20 text-violet-400 shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-sm font-bold text-neutral-200">Collection Page Shared</DialogTitle>
                <DialogDescription className="text-[11px] text-neutral-500 mt-0.5">
                  Your collection of {colShareClipCount} clips is now shareable.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {isGeneratingColShare ? (
            <div className="flex items-center justify-center py-6 gap-3 text-neutral-400">
              <div className="w-4 h-4 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
              <span className="text-xs font-semibold">Generating collection page...</span>
            </div>
          ) : colShareToken ? (
            <div className="flex flex-col gap-3">
              {/* Share URL */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                  <Link2 className="w-3 h-3" />
                  Public Collection URL
                </label>
                <div className="flex flex-col gap-2">
                  <div className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-[10px] text-violet-300 font-mono truncate select-all overflow-hidden">
                    {typeof window !== 'undefined' ? `${window.location.origin}/p/${colShareToken}` : `/p/${colShareToken}`}
                  </div>
                  <button
                    onClick={handleCopyColShareLink}
                    className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                      copiedColShareLink
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-violet-500/10 border-violet-500/20 text-violet-300 hover:bg-violet-500/20'
                    }`}
                  >
                    {copiedColShareLink ? (
                      <><CheckCircle2 className="w-3.5 h-3.5" />Copied to Clipboard!</>
                    ) : (
                      <><Link2 className="w-3.5 h-3.5" />Copy Collection Link</>
                    )}
                  </button>
                </div>
              </div>

              {/* Expiry countdown for free users */}
              {colShareExpiry && userPlan === 'free' && (() => {
                const msLeft = new Date(colShareExpiry).getTime() - Date.now();
                const daysLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60 * 24)));
                const hoursLeft = Math.max(0, Math.floor((msLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
                const isExpiringSoon = daysLeft < 2;
                return (
                  <div className={`flex items-center gap-2.5 p-3 rounded-lg border ${
                    isExpiringSoon
                      ? 'bg-rose-500/5 border-rose-500/20 text-rose-300'
                      : 'bg-amber-500/5 border-amber-500/20 text-amber-300'
                  }`}>
                    <Clock className={`w-4 h-4 shrink-0 ${isExpiringSoon ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`} />
                    <div className="flex-grow min-w-0">
                      <p className="text-[11px] font-bold text-neutral-200">
                        {daysLeft > 0 ? `Expires in ${daysLeft}d ${hoursLeft}h` : `Expires in ${hoursLeft}h`}
                      </p>
                      <p className="text-[10px] text-neutral-500 mt-0.5">Pro users get permanent links.</p>
                    </div>
                    <button
                      onClick={() => setIsUpgradeModalOpen(true)}
                      className="shrink-0 px-2 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-500 text-neutral-950 hover:bg-amber-400 transition-all shadow-md"
                    >
                      Upgrade
                    </button>
                  </div>
                );
              })()}

              {/* Pro unlimited note */}
              {userPlan === 'pro' && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
                  <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <p className="text-[11px] text-amber-300/80 font-medium">Pro page — never expires.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4 text-xs text-neutral-500">
              Generating your shared page URL...
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 2.7 SHARE CLIP MODAL */}
      <Dialog open={isShareModalOpen} onOpenChange={(open) => { setIsShareModalOpen(open); if (!open) { setSharingClip(null); setShareToken(null); setShareExpiry(null); } }}>
        <DialogContent showCloseButton={false} className={`${safeModalPanelClass} max-w-lg`}>
          <div className={safeModalFrameClass}>
          <DialogHeader className={`${safeModalHeaderClass} pr-14`}>
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-[0_14px_30px_rgba(99,102,241,0.24)]">
                <Share2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-xl font-black tracking-tight text-slate-950">Share Clip</DialogTitle>
                <DialogDescription className="mt-1 text-sm leading-6 text-slate-600">
                  Generate a public read-only link that looks clean on every device.
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsShareModalOpen(false)}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Close share clip modal"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogHeader>

          <div className={`${safeModalBodyClass} space-y-4`}>
            {userPlan !== 'pro' && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs font-semibold leading-5 text-amber-800">
                  Free users get temporary 7-day links. <button type="button" onClick={() => { closePrimaryClipModals(); setIsUpgradeModalOpen(true); }} className="font-black underline decoration-amber-400 underline-offset-2 hover:text-amber-600">Upgrade to Pro</button> for permanent links.
                </p>
              </div>
            )}

            {/* Clip Preview */}
            {sharingClip && (
              <div className="safe-card overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <p className="line-clamp-2 min-w-0 text-sm font-black leading-6 text-slate-950 [overflow-wrap:anywhere]">{sharingClip.title || 'Untitled Clip'}</p>
                  <span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-black text-indigo-700">
                    {detectClipContentType(sharingClip.content).toUpperCase()}
                  </span>
                </div>
                <pre className="line-clamp-4 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-slate-600 [overflow-wrap:anywhere]">
                  {sharingClip.content.substring(0, 180)}{sharingClip.content.length > 180 ? '...' : ''}
                </pre>
              </div>
            )}

            {isGeneratingShare ? (
              <div className="flex min-h-[132px] flex-col items-center justify-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-8 text-center text-indigo-700">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="max-w-[18rem] text-sm font-bold leading-6 [overflow-wrap:anywhere]">Generating share link...</span>
              </div>
            ) : shareToken ? (
              <div className="flex flex-col gap-4">
                {/* Share URL */}
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                    <Link2 className="h-3.5 w-3.5" />
                    Public share URL
                  </label>
                  <div className="safe-card rounded-2xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-6 text-indigo-700">
                    <span className="block break-all select-all">
                      {typeof window !== 'undefined' ? `${window.location.origin}/s/${shareToken}` : `/s/${shareToken}`}
                    </span>
                  </div>
                  <button
                    onClick={handleCopyShareLink}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-black leading-5 transition-all ${
                      copiedShareLink
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-transparent bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-[0_14px_30px_rgba(99,102,241,0.24)] hover:translate-y-[-1px]'
                    }`}
                  >
                    {copiedShareLink ? (
                      <><CheckCircle2 className="h-4 w-4" />Copied to Clipboard</>
                    ) : (
                      <><Link2 className="h-4 w-4" />Copy Share Link</>
                    )}
                  </button>
                </div>

                {/* Expiry countdown for free users */}
                {shareExpiry && userPlan === 'free' && (() => {
                  const msLeft = new Date(shareExpiry).getTime() - Date.now();
                  const daysLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60 * 24)));
                  const hoursLeft = Math.max(0, Math.floor((msLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
                  const isExpiringSoon = daysLeft < 2;
                  return (
                    <div className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center ${
                      isExpiringSoon
                        ? 'border-rose-200 bg-rose-50 text-rose-800'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}>
                      <Clock className={`h-5 w-5 shrink-0 ${isExpiringSoon ? 'text-rose-600' : 'text-amber-600'}`} />
                      <div className="min-w-0 flex-grow">
                        <p className="text-sm font-black">
                          {daysLeft > 0 ? `Expires in ${daysLeft}d ${hoursLeft}h` : `Expires in ${hoursLeft}h`}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">Pro users get permanent links.</p>
                      </div>
                      <button
                        onClick={() => { closePrimaryClipModals(); setIsUpgradeModalOpen(true); }}
                        className="shrink-0 rounded-xl bg-amber-500 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-950 transition-all hover:bg-amber-400"
                      >
                        Upgrade
                      </button>
                    </div>
                  );
                })()}

                {/* Pro unlimited note */}
                {userPlan === 'pro' && (
                  <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                    <Crown className="h-4 w-4 shrink-0 text-amber-600" />
                    <p className="text-sm font-bold text-amber-800">Pro link — never expires.</p>
                  </div>
                )}

                {/* Revoke link */}
                  <button
                    onClick={handleRevokeShare}
                    className="w-full text-left text-xs font-bold text-slate-500 transition-colors hover:text-rose-600 sm:w-fit"
                  >
                    Revoke link & disable sharing
                  </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-200 bg-white text-indigo-600 shadow-sm">
                  <Link2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-950">No share link generated yet</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Create a secure public page for this clip, then copy the URL in one click.</p>
                </div>
                <Button
                  onClick={async () => {
                    if (!sharingClip) return;
                    setIsGeneratingShare(true);
                    const token = generateUUID();
                    const expiresAt = userPlan === 'free'
                      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                      : null;
                    try {
                      const { error } = await supabase
                        .from('clips')
                        .update({ share_token: token, share_expires_at: expiresAt })
                        .eq('id', sharingClip.id);
                      if (error) throw error;
                      setShareToken(token);
                      setShareExpiry(expiresAt);
                      addToast('Share link generated!', 'success');
                    } catch (err) {
                      console.error('Error generating share link:', err);
                      addToast('Failed to generate share link.', 'warning');
                    } finally {
                      setIsGeneratingShare(false);
                    }
                  }}
                  className="w-full border-0 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-5 text-sm font-black text-white shadow-[0_14px_30px_rgba(99,102,241,0.24)] hover:translate-y-[-1px]"
                >
                  <Share2 className="h-4 w-4" />
                  Generate Share Link
                </Button>
              </div>
            )}
          </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 3. CLIP PREVIEW MODAL */}
      <Dialog
        open={isClipPreviewOpen}
        onOpenChange={(open) => {
          setIsClipPreviewOpen(open);
          if (!open) {
            setPreviewingClip(null);
            setPreviewRenderMode('raw');
          }
        }}
      >
        <DialogContent showCloseButton={false} className={`${safeModalPanelClass} max-w-4xl`}>
          {previewingClip && (
            <div className={safeModalFrameClass}>
              <DialogHeader className={`${safeModalHeaderClass} pr-14`}>
                <div className="flex flex-col gap-4">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 pr-8">
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                        {new Date(previewingClip.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                      {previewingClip.folder_id && folders.find(f => f.id === previewingClip.folder_id) && (
                        <span
                          className="rounded-full border bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider"
                          style={{
                            borderColor: `${folders.find(f => f.id === previewingClip.folder_id)?.color}33`,
                            color: folders.find(f => f.id === previewingClip.folder_id)?.color
                          }}
                        >
                          {folders.find(f => f.id === previewingClip.folder_id)?.name}
                        </span>
                      )}
                      {previewingClip.pinned && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700">
                          Pinned
                        </span>
                      )}
                      {isDeletedClip(previewingClip) && (
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-700">
                          Trashed
                        </span>
                      )}
                      {isTaskClip(previewingClip) && (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                          Task: {getTaskStatus(previewingClip).replace('-', ' ')}
                        </span>
                      )}
                    </div>
                    <DialogTitle className="max-w-full text-xl font-black leading-tight tracking-tight text-slate-950 [overflow-wrap:anywhere] sm:text-2xl">
                      {previewingClip.title || 'Untitled Clip'}
                    </DialogTitle>
                    <DialogDescription className="text-sm leading-6 text-slate-600">
                      Unified clip preview with task controls, AI actions, formatting, copy, edit, and share.
                    </DialogDescription>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => copyClipText(previewingClip.id, previewingClip.content)}
                      className="h-11 w-full justify-center rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-950"
                    >
                      <Clipboard className="mr-1.5 h-3.5 w-3.5" />
                      {copiedClipId === previewingClip.id ? 'Copied' : 'Copy'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => openEditClipModal(previewingClip)}
                      className="h-11 w-full justify-center rounded-xl border border-indigo-200 bg-indigo-50 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                    >
                      <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={async () => {
                        await openShareModal(previewingClip);
                      }}
                      className="h-11 w-full justify-center rounded-xl border border-violet-200 bg-violet-50 text-xs font-bold text-violet-700 hover:bg-violet-100"
                    >
                      <Share2 className="mr-1.5 h-3.5 w-3.5" />
                      Share
                    </Button>
                    <div className="relative">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isPro) {
                            closePrimaryClipModals();
                            setIsUpgradeModalOpen(true);
                            return;
                          }
                          handleToggleClipMindMenu(previewingClip);
                        }}
                        className="h-11 w-full justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-xs font-bold text-cyan-700 hover:bg-cyan-100"
                      >
                        {clipMindLoadingId === previewingClip.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Bot className="mr-1.5 h-3.5 w-3.5" />}
                        ClipMind
                      </Button>
                      {showClipMindMenu === previewingClip.id && renderClipMindMenu(previewingClip, 'right')}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsClipPreviewOpen(false)}
                  className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  aria-label="Close clip view modal"
                >
                  <X className="h-4 w-4" />
                </button>
              </DialogHeader>

              <div className={`${safeModalBodyClass} space-y-4 pb-[calc(1rem+env(safe-area-inset-bottom))]`}>
                {isDeletedClip(previewingClip) && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs font-semibold leading-5 text-rose-700">
                        This clip is currently in Trash.
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={async () => {
                          await handleRestoreClip(previewingClip.id);
                          setPreviewingClip({
                            ...previewingClip,
                            metadata: {
                              ...normalizeClipEntities(previewingClip.metadata),
                              is_deleted: false,
                              deleted_at: null,
                            },
                          });
                        }}
                        className="h-10 w-full rounded-xl border border-emerald-200 bg-white text-xs font-bold text-emerald-700 hover:bg-emerald-50 sm:w-auto"
                      >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        Restore
                      </Button>
                    </div>
                  </div>
                )}

                {!isTaskClip(previewingClip) && !isDeletedClip(previewingClip) && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <button
                      type="button"
                      onClick={async (e) => {
                        await handleCreateTaskFromClip(previewingClip, e);
                        setPreviewingClip({ ...previewingClip, tags: withTaskMetadata(previewingClip.tags, 'pending') });
                      }}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 text-xs font-black text-emerald-700 transition hover:bg-emerald-50"
                    >
                      <ListChecks className="h-3.5 w-3.5" />
                      Create Task
                    </button>
                  </div>
                )}

                {isTaskClip(previewingClip) && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-black text-emerald-800">
                      <ListChecks className="h-4 w-4" />
                      Task status
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(['pending', 'in-progress', 'done'] as TaskStatus[]).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={async (e) => {
                            await handleTaskStatusChange(previewingClip, status, e);
                            setPreviewingClip({ ...previewingClip, tags: withTaskMetadata(previewingClip.tags, status) });
                          }}
                          className={`rounded-xl border px-2 py-2 text-[11px] font-black capitalize leading-4 transition ${
                            getTaskStatus(previewingClip) === status
                              ? 'border-emerald-300 bg-white text-emerald-700 shadow-sm'
                              : 'border-emerald-100 bg-emerald-50 text-emerald-700/70 hover:bg-white'
                          }`}
                        >
                          {status.replace('-', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleSummarize(previewingClip.id, previewingClip.content, e)}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
                  >
                    <Sparkles className="h-4 w-4" />
                    Summarize
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRewrite(previewingClip.id, previewingClip.content, 'shorter')}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-xs font-black text-indigo-700 transition hover:bg-indigo-100"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Reformat shorter
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTranslate(previewingClip.id, previewingClip.content, 'es')}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs font-black text-violet-700 transition hover:bg-violet-100"
                  >
                    <Languages className="h-4 w-4" />
                    Translate
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                    {previewContentType}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewRenderMode('raw')}
                    className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-all ${
                      previewRenderMode === 'raw'
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Raw
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewRenderMode('formatted')}
                    className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-all ${
                      previewRenderMode === 'formatted'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    Smart Format
                  </button>
                  {previewContentType === 'markdown' && (
                    <button
                      type="button"
                      onClick={() => setPreviewRenderMode('markdown')}
                      className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-all ${
                        previewRenderMode === 'markdown'
                          ? 'border-violet-200 bg-violet-50 text-violet-700'
                          : 'border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      Markdown Preview
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {getVisibleClipTags(previewingClip).length > 0 ? getVisibleClipTags(previewingClip).map((tag, idx) => (
                    <span
                      key={idx}
                      className="max-w-full rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-700 [overflow-wrap:anywhere]"
                    >
                      {tag}
                    </span>
                  )) : (
                    <span className="text-xs text-slate-500">No tags attached to this clip yet.</span>
                  )}
                </div>

                {renderClipMindPanel(previewingClip)}

                {(previewingClip.metadata?.version_history || []).length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900">
                      <Clock className="h-4 w-4 text-slate-500" />
                      Version history
                    </div>
                    <div className="space-y-2">
                      {(previewingClip.metadata?.version_history || []).slice(0, 5).map((version, index) => (
                        <div key={`${version.saved_at}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                                {new Date(version.saved_at).toLocaleString()}
                              </p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {version.title || 'Untitled snapshot'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            openEditClipModal({
                              ...previewingClip,
                              content: version.content,
                              title: version.title || undefined,
                              tags: version.tags,
                              pinned: version.pinned,
                              folder_id: version.folder_id || undefined,
                            });
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-slate-700 transition hover:bg-slate-100"
                        >
                              Load into editor
                            </button>
                          </div>
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">
                            {version.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  {previewRenderMode === 'markdown' && previewContentType === 'markdown' ? (
                    <div
                      className="max-h-[55vh] overflow-auto text-sm text-slate-800 scrollbar-thin [overflow-wrap:anywhere] [&_a]:break-all [&_a]:text-indigo-600 [&_blockquote]:border-l-[3px] [&_blockquote]:border-violet-300 [&_blockquote]:pl-4 [&_blockquote]:text-slate-700 [&_code]:rounded-md [&_code]:bg-white [&_code]:px-1.5 [&_code]:py-0.5 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-black [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-black [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-bold [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_p]:mb-3 [&_p]:leading-7 [&_pre]:mb-3 [&_pre]:max-w-full [&_pre]:overflow-auto [&_pre]:rounded-2xl [&_pre]:border [&_pre]:border-slate-200 [&_pre]:bg-white [&_pre]:p-4 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
                      dangerouslySetInnerHTML={{ __html: previewMarkdownHtml }}
                    />
                  ) : (
                    <pre className="max-h-[55vh] max-w-full overflow-auto whitespace-pre-wrap break-all font-mono text-sm leading-7 text-slate-800 scrollbar-thin [overflow-wrap:anywhere]">
                      {previewRenderMode === 'formatted' ? previewFormattedContent : previewingClip.content}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 3. EDIT CLIP MODAL */}
      <Dialog open={isEditClipOpen} onOpenChange={setIsEditClipOpen}>
        <DialogContent showCloseButton={false} className={`${safeModalPanelClass} max-w-3xl`}>
          <div className={safeModalFrameClass}>
          <DialogHeader className={`${safeModalHeaderClass} pr-14`}>
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-[0_14px_30px_rgba(99,102,241,0.24)]">
                <Edit2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black tracking-tight text-slate-950">Edit Clip</DialogTitle>
                <DialogDescription className="mt-1 text-sm leading-6 text-slate-600">
                  Tune the clip type, task status, folder, tags, and content in one place.
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsEditClipOpen(false)}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Close edit clip modal"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogHeader>

          <form onSubmit={handleSaveEditClip} className={`${safeModalFrameClass} flex-1`}>
            <div className={`${safeModalBodyClass} flex flex-col gap-5`}>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Clip title</label>
              <Input
                type="text"
                placeholder="React layout component, meeting logs, etc..."
                value={editClipTitle}
                onChange={(e) => setEditClipTitle(e.target.value)}
                className="h-11 rounded-xl border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-300 focus:ring-indigo-200"
                maxLength={60}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Content</label>
              <Textarea
                ref={editClipContentRef}
                placeholder="Paste code snippet, documentation, or links here..."
                value={editClipContent}
                onChange={(e) => setEditClipContent(e.target.value)}
                onKeyUp={() => {
                  if (editClipContentRef.current) {
                    expandSnippetInTextarea(editClipContentRef.current, setEditClipContent);
                  }
                }}
                className="min-h-[190px] max-w-full resize-y rounded-2xl border-slate-200 bg-slate-50/80 p-4 font-mono text-sm leading-7 text-slate-800 placeholder:text-slate-400 [overflow-wrap:anywhere] focus:border-indigo-300 focus:ring-indigo-200"
                required
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Tags</label>
                <Input
                  type="text"
                  placeholder="CODE, NOTES, V1"
                  value={editClipTagsString}
                  onChange={(e) => setEditClipTagsString(e.target.value)}
                  className="h-11 rounded-xl border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-300 focus:ring-indigo-200"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Folder</label>
                <select
                  value={editClipFolderId}
                  onChange={(e) => setEditClipFolderId(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">No Folder</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition hover:border-amber-200 hover:bg-amber-50/50">
                <input
                  type="checkbox"
                  checked={editClipPinned}
                  onChange={(e) => setEditClipPinned(e.target.checked)}
                  className="mt-1 h-4 w-4 cursor-pointer rounded border-slate-300 accent-indigo-600"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-800">Pin to top</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Keep this clip visible in the dashboard.</span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition hover:border-emerald-200 hover:bg-emerald-50/50">
                <input
                  type="checkbox"
                  checked={editClipAsTask}
                  onChange={(e) => setEditClipAsTask(e.target.checked)}
                  className="mt-1 h-4 w-4 cursor-pointer rounded border-slate-300 accent-emerald-600"
                />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                    <ListChecks className="h-4 w-4 text-emerald-600" />
                    Task clip
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Show in Checklist and track progress.</span>
                </span>
              </label>
            </div>

            {editClipAsTask && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3">
                <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">Task status</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(['pending', 'in-progress', 'done'] as TaskStatus[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setEditClipTaskStatus(status)}
                      className={`rounded-xl border px-3 py-2 text-xs font-black capitalize transition ${
                        editClipTaskStatus === status
                          ? 'border-emerald-300 bg-white text-emerald-700 shadow-sm'
                          : 'border-emerald-100 bg-emerald-50 text-emerald-700/70 hover:bg-white'
                      }`}
                    >
                      {status.replace('-', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            </div>

            <DialogFooter className={`${safeModalFooterClass} flex-col-reverse gap-2 sm:flex-row`}>
              <Button 
                type="button" 
                variant="ghost"
                onClick={() => setIsEditClipOpen(false)}
                className="h-11 w-full text-sm font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-950 sm:w-auto"
              >
                Cancel
              </Button>
              
              <Button
                type="submit"
                disabled={!editClipContent.trim()}
                className="h-11 w-full border-0 bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-5 text-sm font-black text-white shadow-[0_14px_30px_rgba(99,102,241,0.24)] hover:translate-y-[-1px] disabled:translate-y-0 disabled:opacity-50 sm:w-auto"
              >
                Save Changes
              </Button>
            </DialogFooter>

          </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* 4. DUPLICATE CLIP WARNING MODAL */}
      <Dialog open={isDuplicateWarningOpen} onOpenChange={setIsDuplicateWarningOpen}>
        <DialogContent className="border border-white/5 bg-neutral-950 text-white max-w-sm w-[calc(100%_-_2rem)] md:w-full rounded-xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          <DialogHeader className="mb-4">
            <DialogTitle className="text-base font-bold text-amber-400 flex items-center gap-1.5">
              <Info className="w-5 h-5 shrink-0" />
              Duplicate Clip Detected
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-400 mt-1">
              A clip with the exact same content already exists in your workspace. Are you sure you want to save this duplicate?
            </DialogDescription>
          </DialogHeader>

          <div className="bg-black/40 border border-white/5 p-3 rounded-lg text-neutral-400 text-xs font-mono max-h-24 overflow-y-auto mb-4 scrollbar-thin select-text">
            {pendingSaveAction?.clipData.content}
          </div>

          <DialogFooter className="gap-2">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => {
                setIsDuplicateWarningOpen(false);
                setPendingSaveAction(null);
              }}
              className="text-neutral-400 hover:text-white hover:bg-white/5 text-xs font-semibold"
            >
              Cancel
            </Button>
            
            <Button
              type="button"
              onClick={handleConfirmDuplicateSave}
              className="bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs px-5 border-0 shadow-lg shadow-amber-500/20"
            >
              Save Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 6. PRO UPGRADE MODAL */}
      <Dialog open={isUpgradeModalOpen} onOpenChange={setIsUpgradeModalOpen}>
        <DialogContent className="border border-white/5 bg-neutral-950 text-white max-w-md w-[calc(100%_-_2rem)] md:w-full rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

          <DialogHeader className="mb-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-r from-amber-500 to-yellow-500 text-black border border-yellow-400/20 shadow-lg shadow-yellow-500/10 mb-3 animate-bounce">
              <Crown className="w-6 h-6" />
            </div>
            <DialogTitle className="text-lg font-black tracking-wide bg-gradient-to-r from-neutral-100 to-neutral-400 bg-clip-text text-transparent">
              Upgrade to FreeClipboard Pro
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-400 mt-1">
              Unlock the ultimate clipboard synchronization power and bypass all limits.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3.5 mb-6">
            <div className="flex items-start gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
              <div className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center bg-indigo-500/10 text-indigo-400 shrink-0">
                <Sparkles className="w-3 h-3" />
              </div>
              <div>
                <p className="text-xs font-bold text-neutral-200">Unlimited Clips Syncing</p>
                <p className="text-[10px] text-neutral-500 mt-0.5">Bypass the 500 free clip limit and sync an infinite amount of clips across your devices.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
              <div className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center bg-indigo-500/10 text-indigo-400 shrink-0">
                <Download className="w-3 h-3" />
              </div>
              <div>
                <p className="text-xs font-bold text-neutral-200">Premium Backup Formats</p>
                <p className="text-[10px] text-neutral-500 mt-0.5">Unlock structural JSON exports and beautifully formatted Markdown exports alongside plain text.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
              <div className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center bg-indigo-500/10 text-indigo-400 shrink-0">
                <FoldersIcon className="w-3 h-3" />
              </div>
              <div>
                <p className="text-xs font-bold text-neutral-200">Advanced Folder Labeling</p>
                <p className="text-[10px] text-neutral-500 mt-0.5">Create and tag your clip snippets using custom color schemes to organize your personal workspace.</p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => setIsUpgradeModalOpen(false)}
              className="w-full sm:w-auto text-neutral-400 hover:text-white hover:bg-white/5 text-xs font-semibold"
            >
              Maybe Later
            </Button>
            
            <Button
              type="button"
              onClick={() => {
                setUserPlan('pro');
                localStorage.setItem('fc_user_plan', 'pro');
                if (user) {
                  supabase
                    .from('users')
                    .update({ plan: 'pro' })
                    .eq('id', user.id)
                    .then(({ error }) => {
                      if (error) console.error('Error updating plan:', error);
                    });
                }
                setIsUpgradeModalOpen(false);
                addToast('Successfully upgraded to Pro! Welcome aboard!', 'success');
                confetti({
                  particleCount: 100,
                  spread: 80,
                  origin: { y: 0.6 }
                });
              }}
              className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-neutral-950 hover:text-neutral-900 border-0 text-xs font-bold shadow-lg shadow-amber-500/10 px-6 py-2.5 rounded-lg"
            >
              Upgrade Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 7. CLOUD MIGRATION PROMPT MODAL */}
      <Dialog
        open={isMigrationModalOpen}
        onOpenChange={(open) => {
          if (!open && isMigrationModalOpen && !isMigrating) {
            dismissMigrationPrompt(true);
            return;
          }
          setIsMigrationModalOpen(open);
        }}
      >
        <DialogContent className="border border-white/5 bg-neutral-950 text-white max-w-md w-[calc(100%_-_2rem)] md:w-full rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

          <DialogHeader className="mb-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-lg shadow-indigo-500/5 mb-3">
              <Upload className="w-6 h-6 animate-pulse" />
            </div>
            <DialogTitle className="text-lg font-black tracking-wide bg-gradient-to-r from-neutral-100 to-neutral-400 bg-clip-text text-transparent">
              Sync Offline Clips to Cloud
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-400 mt-1">
              We found locally stored clips on this device. You can sync them now or review them later without losing anything.
            </DialogDescription>
          </DialogHeader>

          <div className="text-center mb-6 px-2">
            <p className="text-xs text-neutral-400 leading-relaxed">
              We detected <strong className="text-indigo-400">{legacyClips.length} clips</strong> and <strong className="text-violet-400">{legacyFolders.length} folders</strong> stored locally. Syncing will upload them to your account so you can access them from all your devices.
            </p>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button
              type="button"
              variant="ghost"
              disabled={isMigrating}
              onClick={() => dismissMigrationPrompt(true)}
              className="w-full sm:w-auto text-neutral-500 hover:text-neutral-200 hover:bg-white/5 text-xs font-semibold"
            >
              Remind Me Later
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              disabled={isMigrating}
              onClick={() => {
                if (user) {
                  localStorage.setItem(`freeclipboard_migrated_${user.id}`, 'true');
                  localStorage.removeItem(`freeclipboard_migration_snoozed_${user.id}`);
                  fetchData(user);
                }
                setIsMigrationModalOpen(false);
                addToast('Local data migration skipped.', 'info');
              }}
              className="w-full sm:w-auto text-neutral-400 hover:text-white hover:bg-white/5 text-xs font-semibold"
            >
              Skip & Start Fresh
            </Button>
            
            <Button
              type="button"
              disabled={isMigrating}
              onClick={() => {
                if (user) {
                  handleMigrate(user);
                }
              }}
              className="w-full sm:w-auto bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white border-0 text-xs font-bold shadow-lg shadow-indigo-500/20 px-6 py-2.5 rounded-lg flex items-center justify-center gap-1.5"
            >
              {isMigrating ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                  Syncing...
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  Sync to Cloud
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Snippets Modal */}
      <Dialog open={isSnippetsModalOpen} onOpenChange={setIsSnippetsModalOpen}>
        <ProGate isPro={isPro} feature="Snippet Triggers" className="max-w-2xl w-[calc(100%_-_2rem)] md:w-full">
          <DialogContent className="border border-white/5 bg-neutral-950 text-white max-w-2xl w-full rounded-2xl p-6 shadow-2xl relative overflow-hidden max-h-[90vh] flex flex-col">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <DialogHeader className="mb-4">
            <DialogTitle className="text-lg font-black tracking-wide bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              Snippets
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-400 mt-1">
              Type <code className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">;;trigger</code> in any text field to auto-expand. Variables: <code className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">{'{name}'}</code> <code className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">{'{email}'}</code> <code className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">{'{date}'}</code> <code className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">{'{time}'}</code>
            </DialogDescription>
          </DialogHeader>

          {/* Add snippet form */}
          <div className="flex gap-2 mb-4 shrink-0">
            <input
              value={newSnippetTrigger}
              onChange={(e) => { setNewSnippetTrigger(e.target.value); setSnippetError(''); }}
              placeholder=";;trigger"
              className="w-32 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-neutral-200 placeholder-neutral-600 focus:border-indigo-500/40 focus:outline-none"
            />
            <input
              value={newSnippetContent}
              onChange={(e) => { setNewSnippetContent(e.target.value); setSnippetError(''); }}
              placeholder="Content..."
              className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-xs text-neutral-200 placeholder-neutral-600 focus:border-indigo-500/40 focus:outline-none"
            />
            <Button
              onClick={handleCreateSnippet}
              className="bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-lg shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>

          {snippetError && (
            <p className="text-xs text-rose-400 mb-3">{snippetError}</p>
          )}

          {/* Snippets table */}
          <div className="safe-scroll-x flex-1 overflow-y-auto scrollbar-thin">
            {snippetsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              </div>
            ) : snippets.length === 0 ? (
              <p className="text-center text-xs text-neutral-500 py-8">No snippets yet. Add one above!</p>
            ) : (
              <table className="min-w-[32rem] w-full text-xs">
                <thead className="text-neutral-500 border-b border-white/5">
                  <tr>
                    <th className="text-left py-2 px-3 font-bold uppercase tracking-wider text-[10px]">Trigger</th>
                    <th className="text-left py-2 px-3 font-bold uppercase tracking-wider text-[10px]">Preview</th>
                    <th className="text-center py-2 px-3 font-bold uppercase tracking-wider text-[10px]">Uses</th>
                    <th className="text-right py-2 px-3 font-bold uppercase tracking-wider text-[10px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {snippets.map(s => (
                    <tr key={s.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-2.5 px-3">
                        <code className="bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded font-mono text-[11px]">{s.trigger_key}</code>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-400 truncate max-w-[200px]" title={s.content}>
                        {s.content.substring(0, 50)}{s.content.length > 50 ? '...' : ''}
                      </td>
                      <td className="py-2.5 px-3 text-center text-neutral-500 font-mono">{s.use_count}</td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleDeleteSnippet(s.id, s.trigger_key)}
                          className="text-neutral-500 hover:text-rose-400 transition-colors p-1 rounded"
                          title="Delete snippet"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
        </ProGate>
      </Dialog>

      {/* Upgrade Modal */}
      <UpgradeModal open={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />

      {/* Toast container with safe area for mobile nav */}
      <div className="fixed bottom-16 md:bottom-5 right-5 z-50 flex w-[calc(100%_-_2.5rem)] max-w-sm flex-col gap-2 sm:w-[350px] pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-4 rounded-xl border backdrop-blur-md shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300 ${
              toast.type === 'success' 
                ? 'bg-emerald-950/80 border-emerald-500/20 text-emerald-200' 
                : toast.type === 'warning'
                ? 'bg-amber-950/80 border-amber-500/20 text-amber-200'
                : 'bg-indigo-950/80 border-indigo-500/20 text-indigo-200'
            }`}
          >
            <span className="text-xs font-semibold">{toast.message}</span>
            <button 
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="text-neutral-400 hover:text-white transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <MobileBottomNav themeMode={themeMode} />
      <OnboardingModal />
    </div>
  );
}
