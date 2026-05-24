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
  Search, 
  Share2,
  Sparkles,
  Star, 
  Loader2,
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
} from 'lucide-react';
import confetti from 'canvas-confetti';
import ProGate from '@/components/pro-gate';
import UpgradeModal from '@/components/upgrade-modal';
import { FREE_CLIP_LIMIT, isProUser } from '@/lib/clip-limits';

interface Clip {
  id: string;
  content: string;
  title?: string;
  tags: string[];
  pinned: boolean;
  folder_id?: string;
  created_at: string;
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

interface SyncQueueItem {
  id: string;
  table: 'clips' | 'folders';
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
  };
}

export default function Dashboard() {
  const router = useRouter();
  const supabase = createClient();

  // --- STATE ---
  const [user, setUser] = useState<User | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  
  // Navigation & Filtering
  const [activeFilter, setActiveFilter] = useState<'all' | 'pinned' | 'folder'>('all');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
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
  const [editClipContent, setEditClipContent] = useState('');
  const [editClipTitle, setEditClipTitle] = useState('');
  const [editClipTagsString, setEditClipTagsString] = useState('');
  const editClipContentRef = useRef<HTMLTextAreaElement>(null);
  const [editClipFolderId, setEditClipFolderId] = useState('');
  const [editClipPinned, setEditClipPinned] = useState(false);

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
  const [copiedTranslationId, setCopiedTranslationId] = useState<string | null>(null);
  const [rewritingClipId, setRewritingClipId] = useState<string | null>(null);
  const [pendingRewrites, setPendingRewrites] = useState<Record<string, string>>({});
  const [showRewriteMenu, setShowRewriteMenu] = useState<string | null>(null);
  const [translatingClipId, setTranslatingClipId] = useState<string | null>(null);
  const [activeTranslations, setActiveTranslations] = useState<Record<string, { text: string; lang: string }>>({});
  const [showTranslateMenu, setShowTranslateMenu] = useState<string | null>(null);
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
    }
  }, [supabase, addToast]);

  // Enqueue action to local storage sync queue
  const enqueueAction = useCallback((table: 'clips' | 'folders', action: 'insert' | 'update' | 'delete', payload: SyncQueueItem['payload']) => {
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
  }, [supabase, addToast, fetchData]);

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

        if (profile?.trial_ends_at) {
          setUserTrialEndsAt(profile.trial_ends_at);
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
          const storedClips = localStorage.getItem('freeclipboard_dashboard_clips');
          const storedFolders = localStorage.getItem('freeclipboard_dashboard_folders');
          
          const parsedClips: Clip[] = storedClips ? JSON.parse(storedClips) : [];
          const parsedFolders: Folder[] = storedFolders ? JSON.parse(storedFolders) : [];

          if (!migratedFlag && parsedClips.length > 0) {
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

  const handleDrop = async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    setDraggedOverFolderId(null);
    const clipId = e.dataTransfer.getData('text/plain');
    if (!clipId) return;

    // Find the clip
    const clip = clips.find(c => c.id === clipId);
    if (!clip) return;

    // If the destination is "uncategorized", set folder_id to undefined
    const destFolderId = targetFolderId === 'uncategorized' ? undefined : (targetFolderId || undefined);
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

    const folderName = targetFolderId === 'uncategorized'
      ? 'Uncategorized'
      : (folders.find(f => f.id === targetFolderId)?.name || 'Uncategorized');
    addToast(`Moved clip to "${folderName}"`, 'success');
  };

  // --- SHARE HANDLERS ---
  const handleOpenShareModal = async (clip: Clip, e: React.MouseEvent) => {
    e.stopPropagation();
    setSharingClip(clip);
    setIsShareModalOpen(true);
    setCopiedShareLink(false);

    if (!user) return;

    // If the clip already has a share_token in DB, fetch it; otherwise generate one
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

      // For free users, auto-generate/refresh token with 7-day expiry
      // For pro users, generate token with no expiry
      const needsToken = !token;
      const needsRefresh = expiresAt && new Date(expiresAt) < new Date(); // expired

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

        // Update local state
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

  const handleSummarize = async (clipId: string, content: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
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
        // By default make it expanded
        setCollapsedSummaries(prev => ({
          ...prev,
          [clipId]: false,
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
        addToast(`Content rewritten in ${tone} tone!`, 'success');
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
    if (!isPro && clips.length >= FREE_CLIP_LIMIT) {
      setIsUpgradeModalOpen(true);
      return;
    }

    const parsedTags = newClipTagsString
      .split(',')
      .map(tag => tag.trim().toUpperCase())
      .filter(tag => tag.length > 0);

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
    setIsNewClipOpen(false);
    addToast('Clip created successfully!', 'success');

    confetti({
      particleCount: 30,
      spread: 50,
      origin: { y: 0.8 },
      colors: ['#6366f1', '#a78bfa', '#10b981']
    });

    // Trigger background auto-tagging and RAG analysis silently if user is Pro
    if (userPlan === 'pro') {
      triggerSilentAutoTag(newClip.id, newClip.content);
      triggerRAGAnalyze(newClip.id, newClip.content);
    }
  };

  // Edit Clip Action Trigger
  const handleOpenEditClip = (clip: Clip, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingClip(clip);
    setEditClipTitle(clip.title || '');
    setEditClipContent(clip.content);
    setEditClipTagsString(clip.tags.join(', '));
    setEditClipFolderId(clip.folder_id || '');
    setEditClipPinned(clip.pinned);
    setIsEditClipOpen(true);
  };

  // Save Edit Clip Form Submission
  const handleSaveEditClip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClip || !editClipContent.trim()) return;

    const parsedTags = editClipTagsString
      .split(',')
      .map(tag => tag.trim().toUpperCase())
      .filter(tag => tag.length > 0);

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

    const updated = clips.map(c => 
      c.id === clipData.id 
        ? { ...c, ...clipData } 
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
  const handleTogglePin = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  // Copy Clip Content
  const handleCopyContent = (id: string, text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedClipId(id);
    addToast('Copied to clipboard!', 'success');
    
    // Tiny subtle confetti on copy
    confetti({
      particleCount: 15,
      spread: 30,
      origin: { y: 0.85 },
      colors: ['#8b5cf6']
    });

    setTimeout(() => {
      setCopiedClipId(null);
    }, 2000);
  };

  // Delete Clip
  const handleDeleteClip = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;

    const updated = clips.filter((c) => c.id !== id);
    setClips(updated);
    localStorage.setItem('freeclipboard_dashboard_clips', JSON.stringify(updated));

    if (navigator.onLine) {
      try {
        const { error } = await supabase
          .from('clips')
          .delete()
          .eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.error('Failed to delete clip from cloud:', err);
        enqueueAction('clips', 'delete', { id });
        addToast('Deletion pending sync.', 'info');
      }
    } else {
      enqueueAction('clips', 'delete', { id });
      addToast('Deletion pending sync.', 'info');
    }

    addToast('Clip deleted.', 'info');
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
    if (userPlan === 'free' && clips.length >= 500) {
      setIsUpgradeModalOpen(true);
      addToast('Clip limit reached! Please upgrade to Pro.', 'warning');
    } else {
      setIsNewClipOpen(true);
      if (isShortcut) {
        addToast('Quick-Add Modal opened!', 'info');
      }
    }
  }, [clips.length, userPlan, addToast]);

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
  const filteredClips = clips.filter((clip) => {
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
    if (searchQuery.trim().length > 0) {
      const query = searchQuery.toLowerCase();
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

  return (
    <div className="min-h-screen bg-[#07070a] text-neutral-100 flex font-sans selection:bg-indigo-500/30 selection:text-indigo-200 relative overflow-hidden">
      
      {/* Dynamic Background Ambient Blurs */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-violet-600/5 rounded-full blur-[120px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[140px] -z-10 pointer-events-none" />

      {/* --- MOBILE SIDEBAR BACKDROP OVERLAY --- */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden animate-in fade-in duration-200"
        />
      )}

      {/* --- SIDEBAR --- */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-white/5 bg-neutral-950/95 md:bg-neutral-950/80 backdrop-blur-md shrink-0 flex flex-col transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        
        {/* Logo area */}
        <div className="p-6 flex items-center justify-between gap-2.5 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Clipboard className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-wider uppercase text-neutral-200">FreeClipboard</h1>
              <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">Dashboard</p>
            </div>
          </div>

          {/* Close Sidebar button on Mobile */}
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition-all"
            title="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sidebar menu categories */}
        <div className="p-4 flex flex-col gap-5 overflow-y-auto flex-grow scrollbar-thin">
          
          <div className="flex flex-col gap-1">
            <h3 className="px-3 text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5">Overview</h3>
            
            <button
              onClick={() => {
                setActiveFilter('all');
                setSelectedFolderId(null);
                setIsSidebarOpen(false); // Auto-close on mobile selection
              }}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === 'all'
                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                  : 'text-neutral-400 hover:text-neutral-200 border border-transparent hover:bg-white/5'
              }`}
            >
              <span className="flex items-center gap-2">
                <Home className="w-3.5 h-3.5" />
                All Clips
              </span>
              <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded font-bold border border-white/5">
                {clips.length}
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
                  : 'text-neutral-400 hover:text-neutral-200 border border-transparent hover:bg-white/5'
              }`}
            >
              <span className="flex items-center gap-2">
                <Star className="w-3.5 h-3.5 fill-current" />
                Pinned
              </span>
              <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded font-bold border border-white/5">
                {clips.filter(c => c.pinned).length}
              </span>
            </button>

            <button
              onClick={() => router.push('/clipmind')}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-neutral-400 hover:text-indigo-300 border border-transparent hover:bg-indigo-500/5 hover:border-indigo-500/10 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              ClipMind AI
              {userPlan === 'pro' ? (
                <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-bold border border-emerald-500/20 ml-auto">Pro</span>
              ) : (
                <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-bold border border-amber-500/20 ml-auto">Free</span>
              )}
            </button>

            <button
              onClick={() => router.push('/graph')}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-neutral-400 hover:text-violet-300 border border-transparent hover:bg-violet-500/5 hover:border-violet-500/10 transition-all"
            >
              <Brain className="w-3.5 h-3.5 text-violet-400" />
              Knowledge Graph
              {!isPro && (
                <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-bold border border-amber-500/20 ml-auto">Pro</span>
              )}
            </button>

            <button
              onClick={() => router.push('/analytics')}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-neutral-400 hover:text-emerald-300 border border-transparent hover:bg-emerald-500/5 hover:border-emerald-500/10 transition-all"
            >
              <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
              Analytics
              {!isPro && (
                <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-bold border border-amber-500/20 ml-auto">Pro</span>
              )}
            </button>
          </div>

          {/* Folders block */}
          <div className="flex flex-col gap-1.5">
            <div className="px-3 flex items-center justify-between mb-1">
              <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1">
                <FoldersIcon className="w-3 h-3 text-indigo-400" />
                Folders
              </h3>
              
              <button
                onClick={() => setIsNewFolderOpen(true)}
                className="text-neutral-500 hover:text-indigo-400 transition-colors p-0.5 rounded"
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
                    : 'text-neutral-400 hover:text-neutral-200 border-transparent hover:bg-white/5'
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
                
                <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded font-bold border border-white/5">
                  {clips.filter(c => !c.folder_id).length}
                </span>
              </button>

              {folders.map((folder) => {
                const isActive = activeFilter === 'folder' && selectedFolderId === folder.id;
                const folderClipsCount = clips.filter(c => c.folder_id === folder.id).length;

                return (
                  <button
                    key={folder.id}
                    onClick={() => {
                      setActiveFilter('folder');
                      setSelectedFolderId(folder.id);
                      setIsSidebarOpen(false); // Auto-close on mobile selection
                    }}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, folder.id)}
                    onDragEnter={() => setDraggedOverFolderId(folder.id)}
                    onDragLeave={() => setDraggedOverFolderId(null)}
                    className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all border ${
                      isActive
                        ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                        : 'text-neutral-400 hover:text-neutral-200 border-transparent hover:bg-white/5'
                    } ${
                      draggedOverFolderId === folder.id
                        ? 'bg-indigo-500/20 border-indigo-500 scale-[1.02] text-indigo-300 shadow-md shadow-indigo-500/10'
                        : ''
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span 
                        className="w-2 h-2 rounded-full shrink-0" 
                        style={{ backgroundColor: folder.color }}
                      />
                      <span className="truncate">{folder.name}</span>
                    </span>
                    
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded font-bold border border-white/5 group-hover:hidden">
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
                  </button>
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
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-neutral-950 border border-white/10 px-2 py-1 text-[10px] font-bold text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100 shadow-xl flex items-center gap-1">
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
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-neutral-950 border border-white/10 px-2 py-1 text-[10px] font-bold text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100 shadow-xl flex items-center gap-1">
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
        <header className="h-auto min-h-[64px] border-b border-white/5 bg-neutral-950/40 backdrop-blur-md flex flex-wrap items-center justify-between px-3 md:px-8 py-2 gap-2 shrink-0">
          
          <div className="flex items-center flex-grow md:flex-initial gap-2">
            {/* Hamburger Button for mobile */}
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 rounded-lg border border-white/10 bg-black/25 text-neutral-400 hover:text-white transition-all shrink-0"
              title="Open sidebar menu"
            >
              <Menu className="w-4.5 h-4.5" />
            </button>

            {/* Live Search bar */}
            <div className="flex items-center gap-2 w-full max-w-[200px] sm:max-w-xs md:w-96">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-600" />
                <Input
                  type="text"
                  placeholder="Search by title, content, or tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-black/30 border-white/10 pl-9 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-indigo-500/40 focus:ring-0"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-2.5 p-0.5 text-neutral-600 hover:text-neutral-300 rounded"
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
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 ${
                  smartSearch
                    ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                    : 'bg-black/30 border-white/10 text-neutral-500 hover:text-neutral-300'
                }`}
                title={isPro ? 'Toggle AI-powered smart search' : 'Smart search is a Pro feature'}
              >
                <Sparkles className={`w-3 h-3 ${smartSearch ? 'text-indigo-400' : ''}`} />
                <span className="hidden sm:inline">Smart</span>
              </button>
            </div>
          </div>

          {/* New Clip Action Button & User Profile */}
          <div className="flex items-center gap-3">
            {/* Header Clip Count Badge */}
            <button 
              onClick={() => {
                if (userPlan !== 'pro') {
                  setIsUpgradeModalOpen(true);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-bold transition-all duration-300 cursor-pointer ${
                userPlan === 'pro'
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
                  : clips.length >= 500
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20'
                    : clips.length >= 480
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse hover:bg-amber-500/20'
                      : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10'
              }`} 
              title={userPlan === 'pro' ? "Unlimited Pro workspace active" : `Workspace limit: ${clips.length} / 500 clips. Click to upgrade.`}
            >
              <Crown className={`w-3.5 h-3.5 ${userPlan === 'pro' ? 'text-amber-400' : 'text-neutral-400'}`} />
              <span>{userPlan === 'pro' ? `${clips.length} Clips` : `${clips.length} / 500`}</span>
            </button>

            {/* Connection Status Badge */}
            <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-bold transition-all duration-300 ${
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
              onClick={() => router.push('/clipmind')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-bold transition-all duration-300 bg-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-500/30"
              title="Open ClipMind AI Chat"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ClipMind</span>
            </button>

            <Button
              onClick={() => handleOpenNewClipModal()}
              className="bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white border-0 shadow-lg shadow-indigo-500/20 font-bold text-xs px-4 py-4 gap-1.5 transition-all duration-300"
            >
              <Plus className="w-3.5 h-3.5" />
              New Clip
            </Button>

            {/* Profile Dropdown */}
            {userEmail && (
              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center gap-2 p-1.5 rounded-xl border border-white/5 bg-black/40 hover:bg-black/60 transition-all duration-300 shrink-0"
                  title="View workspace settings"
                >
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center font-bold text-white text-[11px] border border-white/10 shadow-lg shadow-indigo-500/10 shrink-0">
                    {userEmail.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="hidden md:flex flex-col text-left pr-1.5">
                    <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest leading-none mb-0.5">Active User</span>
                    <span className="text-[11px] text-neutral-300 font-semibold max-w-[120px] truncate leading-none">{userEmail}</span>
                  </div>
                </button>

                {isProfileOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsProfileOpen(false)} />
                    <div className="absolute right-0 mt-2 w-48 rounded-xl border border-white/5 bg-neutral-950 p-2 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="px-3 py-2 border-b border-white/5 text-left mb-1">
                        <p className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest mb-0.5">Workspace</p>
                        <p className="text-xs text-neutral-200 font-medium truncate">{userEmail}</p>
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
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-neutral-400 hover:text-indigo-400 hover:bg-indigo-500/5 transition-all duration-200 text-left font-bold"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Snippets
                      </button>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-neutral-400 hover:text-rose-400 hover:bg-rose-500/5 transition-all duration-200 text-left font-bold"
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
        </header>

        {/* --- DASHBOARD WRAPPER --- */}
        <main className="flex-grow p-4 md:p-8 overflow-y-auto scrollbar-thin">
          
          {/* --- LIMIT WARNING BANNER --- */}
          {userPlan === 'free' && clips.length >= 450 && (
            <div className={`mb-4 md:mb-6 p-3 md:p-4 rounded-xl border backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 animate-in slide-in-from-top duration-300 shadow-xl ${
              clips.length >= 500
                ? 'border-rose-500/20 bg-rose-500/5 text-rose-300'
                : clips.length >= 490
                ? 'border-orange-500/20 bg-orange-500/5 text-orange-300'
                : 'border-amber-500/20 bg-amber-500/5 text-amber-300'
            }`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${
                  clips.length >= 500
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    : clips.length >= 490
                    ? 'bg-orange-500/10 border-orange-500/20 text-orange-400'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                }`}>
                  {clips.length >= 500 ? <X className="w-4 h-4 animate-pulse" /> :
                   clips.length >= 490 ? <AlertCircle className="w-4 h-4 animate-pulse" /> :
                   <Info className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-neutral-200 truncate">
                    {clips.length >= 500
                      ? 'Free Clip Limit Reached (500/500)'
                      : clips.length >= 490
                      ? `Only ${FREE_CLIP_LIMIT - clips.length} clips left!`
                      : `${FREE_CLIP_LIMIT - clips.length} clips remaining — upgrade`}
                  </p>
                  <p className="text-[11px] opacity-80 font-medium">
                    {clips.length >= 500
                      ? "You've built an amazing collection of 500 clips! Upgrade to Pro to keep going — $5/mo"
                      : clips.length >= 490
                      ? "You're almost at the free limit. Upgrade to Pro for unlimited clips."
                      : `You have used ${clips.length} out of ${FREE_CLIP_LIMIT} free clips. Upgrade to Pro to unlock unlimited clips.`}
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
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 md:mb-6 gap-3 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <Grid className="w-4 h-4 text-indigo-400" />
                <h2 className="text-lg font-black tracking-wide text-neutral-200">
                  {activeFilter === 'all' && 'All Synced Clips'}
                  {activeFilter === 'pinned' && 'Pinned Clips'}
                  {activeFilter === 'folder' && `Folder: ${activeFolder?.name || 'Clips'}`}
                </h2>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                {activeFilter === 'folder' 
                  ? `Viewing workspace clips filed under ${activeFolder?.name}`
                  : 'Manage, copy, and pin your cross-device synced items.'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Select Mode Toggle */}
              <button
                onClick={() => {
                  setIsSelectionMode(!isSelectionMode);
                  setSelectedClipIds([]);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 ${
                  isSelectionMode
                    ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300 font-bold'
                    : 'bg-black/40 border-white/5 text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
                }`}
                title="Select multiple clips to share as a page"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                {isSelectionMode ? 'Cancel' : 'Select'}
              </button>

              {/* Import/Export buttons in toolbar */}
              <div className="flex items-center gap-1 bg-black/40 border border-white/5 px-2 py-1.5 rounded-xl">
                <button
                  onClick={() => triggerFileInput()}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-white/5 transition-all animate-in fade-in duration-300"
                  title="Import backup file"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
                <div className="w-px h-3.5 bg-white/10" />
                <button
                  onClick={() => handleExport('txt')}
                  className="px-2 py-1 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-white/5 transition-all text-[11px] font-bold flex items-center gap-1"
                  title="Export backup as TXT"
                >
                  <Download className="w-3.5 h-3.5 text-neutral-500" />
                  <span className="hidden sm:inline">TXT</span>
                </button>
                
                <button
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
                  <span className="hidden sm:inline">JSON</span>
                </button>

                <button
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
                  <span className="hidden sm:inline">MD</span>
                </button>
              </div>

              <span className="text-xs text-neutral-500 font-semibold bg-black/40 border border-white/5 px-2.5 py-2.5 rounded-xl font-mono">
                Showing {filteredClips.length} {filteredClips.length === 1 ? 'clip' : 'clips'}
              </span>
            </div>
          </div>

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
          {trialDaysLeft !== null && trialDaysLeft > 0 && userPlan === 'free' && (
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

          {/* --- CLIPS GRID --- */}
          {sortedClips.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
              {sortedClips.map((clip) => {
                const clipFolder = folders.find(f => f.id === clip.folder_id);
                const truncatedContent = clip.content.length > 100 
                  ? clip.content.substring(0, 100) + '...'
                  : clip.content;

                const isSelected = selectedClipIds.includes(clip.id);
                return (
                  <Card 
                    key={clip.id}
                    draggable={!isSelectionMode}
                    onDragStart={(e) => handleDragStart(e, clip.id)}
                    onClick={() => {
                      if (isSelectionMode) {
                        handleToggleSelect(clip.id);
                      }
                    }}
                    className={`border bg-neutral-900/30 backdrop-blur-md shadow-xl relative overflow-hidden group flex flex-col min-h-[220px] h-auto animate-in fade-in zoom-in-95 duration-200 transition-all ${
                      isSelectionMode 
                        ? isSelected
                          ? 'border-indigo-500/40 bg-indigo-950/10 cursor-pointer'
                          : 'border-white/5 hover:border-white/10 hover:bg-neutral-900/40 cursor-pointer'
                        : 'border-white/5 hover:bg-neutral-900/50 hover:-translate-y-1 duration-300 cursor-grab active:cursor-grabbing'
                    }`}
                  >
                    {/* Checkbox overlay for selection mode */}
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

                    {/* Hover spotlight blur */}
                    <div className="absolute -top-12 -right-12 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                    <CardContent className="p-4 flex flex-col flex-grow gap-2.5">
                      
                      {/* Card Header & folder indicator */}
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[10px] text-neutral-500 font-bold uppercase tracking-wider font-mono transition-all duration-200 ${isSelectionMode ? 'pl-7' : ''}`}>
                            {new Date(clip.created_at).toLocaleDateString(undefined, { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric' 
                            })}
                          </span>

                          {clipFolder && (
                            <span 
                              className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border flex items-center gap-1 bg-black/30"
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
                        </div>

                        <h4 className="text-sm font-semibold text-neutral-200 line-clamp-1">
                          {clip.title || 'Untitled Clip'}
                        </h4>
                      </div>

                      {/* Content snippet */}
                      <p className="text-xs text-neutral-400 leading-relaxed break-words font-mono line-clamp-3 bg-black/15 p-2 rounded border border-white/5 overflow-hidden select-text">
                        {truncatedContent}
                      </p>

                      {/* Badges and tags */}
                      <div className="flex flex-wrap gap-1 overflow-hidden max-h-6 shrink-0">
                        {clip.tags.map((tag, idx) => (
                          <span 
                            key={idx}
                            className="text-[9px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                    </CardContent>
                    
                    {/* Collapsible AI Summary Section */}
                    {clipSummaries[clip.id] && (
                      <div className="border-t border-white/5 bg-emerald-500/5 px-5 py-3 transition-all duration-300">
                        <div 
                          onClick={(e) => toggleSummaryCollapse(clip.id, e)}
                          className="flex items-center justify-between cursor-pointer group/summary"
                        >
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider font-mono">
                            <Sparkles className="w-3 h-3 text-emerald-400" />
                            <span>AI Summary</span>
                          </div>
                          <button className="text-neutral-500 group-hover/summary:text-neutral-300 transition-colors">
                            {collapsedSummaries[clip.id] ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronUp className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        
                        {!collapsedSummaries[clip.id] && (
                          <div className="flex flex-col gap-1.5 mt-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                            <p className="text-[11px] text-neutral-300 font-sans leading-relaxed bg-black/20 p-2.5 rounded border border-emerald-500/10 select-text">
                              {clipSummaries[clip.id]?.summary}
                            </p>
                            {clipSummaries[clip.id]?.isFallback && (
                              <div className="text-[9px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded leading-normal flex items-start gap-1 font-sans">
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
                      <div className="border-t border-white/5 bg-indigo-500/5 px-5 py-3 transition-all duration-300">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-400 uppercase tracking-wider font-mono">
                            <RefreshCw className="w-3 h-3 text-indigo-400" />
                            <span>AI Rewrite Suggestion</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 mt-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                          <p className="text-[11px] text-neutral-300 font-sans leading-relaxed bg-black/20 p-2.5 rounded border border-indigo-500/10 select-text">
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
                      <div className="border-t border-white/5 bg-violet-500/5 px-5 py-3 transition-all duration-300">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-violet-400 uppercase tracking-wider font-mono">
                            <Languages className="w-3 h-3 text-violet-400" />
                            <span>Translated to {activeTranslations[clip.id].lang}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 mt-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                          <p className="text-[11px] text-neutral-300 font-sans leading-relaxed bg-black/20 p-2.5 rounded border border-violet-500/10 select-text">
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
                    <div className="border-t border-white/5 bg-black/40 px-4 py-2 flex items-center justify-between shrink-0 relative gap-1">
                      {/* Rewrite Dropdown Menu */}
                      {showRewriteMenu === clip.id && (
                        <div 
                          onMouseLeave={() => setShowRewriteMenu(null)}
                          className="absolute bottom-12 left-16 z-30 bg-neutral-950/95 border border-white/10 rounded-xl p-1.5 shadow-2xl flex flex-col gap-1 w-28 animate-in fade-in slide-in-from-bottom-2 duration-150 backdrop-blur-md"
                        >
                          <div className="text-[9px] font-black text-neutral-500 uppercase tracking-widest px-2 py-0.5 border-b border-white/5 mb-0.5 font-mono">Select Tone</div>
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
                              className="w-full text-left text-[11px] font-semibold text-neutral-300 hover:text-white hover:bg-white/5 px-2 py-1 rounded transition-colors"
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
                          className="absolute bottom-12 left-24 z-30 bg-neutral-950/95 border border-white/10 rounded-xl p-1.5 shadow-2xl flex flex-col gap-1 w-32 animate-in fade-in slide-in-from-bottom-2 duration-150 backdrop-blur-md"
                        >
                          <div className="text-[9px] font-black text-neutral-500 uppercase tracking-widest px-2 py-0.5 border-b border-white/5 mb-0.5 font-mono">Select Lang</div>
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
                              className="w-full text-left text-[11px] font-semibold text-neutral-300 hover:text-white hover:bg-white/5 px-2 py-1 rounded transition-colors"
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-1 flex-wrap min-w-0 flex-1">
                        <button
                          onClick={(e) => handleTogglePin(clip.id, e)}
                          className={`p-1 rounded-md hover:bg-white/5 transition-colors border border-transparent ${
                            clip.pinned 
                              ? 'text-yellow-400 border-yellow-500/10 bg-yellow-500/5' 
                              : 'text-neutral-500 hover:text-neutral-300'
                          }`}
                          title={clip.pinned ? 'Unpin clip' : 'Pin clip'}
                        >
                          <Star className={`w-3 h-3 ${clip.pinned ? 'fill-current' : ''}`} />
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
                            <Clipboard className="w-3 h-3" />
                          )}
                        </button>

                        <button
                          onClick={(e) => handleOpenEditClip(clip, e)}
                          className="p-1 rounded-md hover:bg-white/5 text-neutral-500 hover:text-indigo-400 transition-colors border border-transparent flex items-center justify-center"
                          title="Edit clip details"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>

                        <button
                          onClick={(e) => handleOpenShareModal(clip, e)}
                          className="p-1 rounded-md hover:bg-white/5 text-neutral-500 hover:text-violet-400 transition-colors border border-transparent flex items-center justify-center"
                          title="Share clip"
                        >
                          <Share2 className="w-3 h-3" />
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
                            <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                          ) : (
                            <Sparkles className={`w-3 h-3 ${clipSummaries[clip.id] ? 'text-emerald-400 fill-emerald-400/20' : ''}`} />
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
                            <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                          ) : (
                            <RefreshCw className={`w-3 h-3 ${pendingRewrites[clip.id] ? 'text-indigo-400' : ''}`} />
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
                            <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                          ) : (
                            <Languages className={`w-3 h-3 ${activeTranslations[clip.id] ? 'text-violet-400' : ''}`} />
                          )}
                        </button>
                      </div>

                      <button
                        onClick={(e) => handleDeleteClip(clip.id, e)}
                        className="p-1 text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors shrink-0"
                        title="Delete clip"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                  </Card>
                );
              })}
            </div>
          ) : (
            /* Ambient Empty State design */
            <div className="border border-white/5 border-dashed bg-neutral-900/10 rounded-2xl p-16 flex flex-col items-center justify-center text-center gap-4 relative overflow-hidden mt-6">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-md">
                <Clipboard className="w-7 h-7 animate-pulse" />
              </div>
              <div className="flex flex-col gap-1.5 max-w-sm">
                <h4 className="text-sm font-semibold text-neutral-300">No dashboard clips found</h4>
                <p className="text-xs text-neutral-500 leading-normal">
                  {searchQuery 
                    ? `No clips matching "${searchQuery}" in this filter. Clear the query or try a different filter.`
                    : activeFilter === 'pinned'
                    ? "You haven't pinned any clips yet! Click the star icon on any clip to pin it."
                    : activeFilter === 'folder'
                    ? "This folder doesn't contain any clips. Create a new clip inside this folder to populate it."
                    : "Create a new clip to save files in this dashboard."}
                </p>
              </div>
              
              {!searchQuery && (
                <Button
                  onClick={() => handleOpenNewClipModal()}
                  className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs px-5 py-4 gap-1.5 mt-3 transition-colors border-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create First Clip
                </Button>
              )}
            </div>
          )}

        </main>
      </div>

      {/* --- DIALOG MODALS --- */}

      {/* 1. NEW CLIP MODAL */}
      <Dialog open={isNewClipOpen} onOpenChange={setIsNewClipOpen}>
        <DialogContent className="border border-white/5 bg-neutral-950/95 text-white max-w-md w-full rounded-xl p-6 shadow-2xl relative overflow-hidden">
          {/* Subtle decoration */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

          <DialogHeader className="mb-4">
            <DialogTitle className="text-base font-bold text-neutral-200">Create New Clip</DialogTitle>
            <DialogDescription className="text-xs text-neutral-500">
              Enter a title, paste your content, and add organizational tags.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateClip} className="flex flex-col gap-4">
            
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Clip Title (optional)</label>
              <Input
                type="text"
                placeholder="React layout component, meeting logs, etc..."
                value={newClipTitle}
                onChange={(e) => setNewClipTitle(e.target.value)}
                className="bg-black/30 border-white/10 text-xs focus:border-indigo-500/40 text-neutral-200 placeholder:text-neutral-600"
                maxLength={60}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Content (required)</label>
              <Textarea
                ref={newClipContentRef}
                placeholder="Paste code snippet, documentation, or links here..."
                value={newClipContent}
                onChange={(e) => setNewClipContent(e.target.value)}
                onKeyUp={() => {
                  if (newClipContentRef.current) {
                    expandSnippetInTextarea(newClipContentRef.current, setNewClipContent);
                  }
                }}
                className="min-h-[140px] bg-black/30 border-white/10 text-xs focus:border-indigo-500/40 text-neutral-200 placeholder:text-neutral-600 resize-y"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Tags (comma-separated)</label>
                <Input
                  type="text"
                  placeholder="CODE, NOTES, V1"
                  value={newClipTagsString}
                  onChange={(e) => setNewClipTagsString(e.target.value)}
                  className="bg-black/30 border-white/10 text-xs focus:border-indigo-500/40 text-neutral-200 placeholder:text-neutral-600"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Assign Folder</label>
                <select
                  value={newClipFolderId}
                  onChange={(e) => setNewClipFolderId(e.target.value)}
                  className="h-10 w-full rounded-md border border-white/10 bg-black/30 text-xs text-neutral-200 px-3 outline-none focus:border-indigo-500/40"
                >
                  <option value="">No Folder</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <input
                type="checkbox"
                id="pin-on-creation"
                checked={newClipPinned}
                onChange={(e) => setNewClipPinned(e.target.checked)}
                className="rounded border-white/10 bg-black/30 text-indigo-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 accent-indigo-500 cursor-pointer"
              />
              <label 
                htmlFor="pin-on-creation" 
                className="text-xs text-neutral-400 select-none cursor-pointer hover:text-neutral-200 transition-colors"
              >
                Pin this clip to top of dashboard
              </label>
            </div>

            <DialogFooter className="mt-4 gap-2">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setIsNewClipOpen(false)}
                className="text-neutral-400 hover:text-white hover:bg-white/5 text-xs font-semibold"
              >
                Cancel
              </Button>
              
              <Button
                type="submit"
                disabled={!newClipContent.trim()}
                className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs px-5 border-0 shadow-lg shadow-indigo-500/20"
              >
                Create Clip
              </Button>
            </DialogFooter>

          </form>
        </DialogContent>
      </Dialog>

      {/* 2. NEW FOLDER MODAL */}
      <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
        <DialogContent className="border border-white/5 bg-neutral-950/95 text-white max-w-sm w-[calc(100%-2rem)] md:w-full rounded-xl p-6 shadow-2xl relative overflow-hidden">
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
        <DialogContent className="border border-white/5 bg-neutral-950/95 text-white max-w-sm w-[calc(100%-2rem)] md:w-full rounded-xl p-6 shadow-2xl relative overflow-hidden">
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
        <DialogContent className="border border-white/5 bg-neutral-950/95 text-white max-w-sm w-[calc(100%-2rem)] rounded-2xl p-5 shadow-2xl relative overflow-hidden">
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
        <DialogContent className="border border-white/5 bg-neutral-950/95 text-white max-w-sm w-[calc(100%-2rem)] rounded-2xl p-5 shadow-2xl relative overflow-hidden">
          {/* Ambient decoration */}
          <div className="absolute top-0 right-0 w-36 h-36 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-28 h-28 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <DialogHeader className="mb-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-violet-500/10 border border-violet-500/20 text-violet-400 shrink-0">
                <Share2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-sm font-bold text-neutral-200">Share Clip</DialogTitle>
                <DialogDescription className="text-[11px] text-neutral-500 mt-0.5">
                  Generate a public read-only link for this clip.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {userPlan !== 'pro' && (
            <div className="mb-3 flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <p className="text-[10px] text-amber-300/80 font-medium">
                Free users get temporary 7-day links. <button onClick={() => { setIsShareModalOpen(false); setIsUpgradeModalOpen(true); }} className="underline text-amber-400 hover:text-amber-300 font-semibold">Upgrade to Pro</button> for permanent links.
              </p>
            </div>
          )}

          {/* Clip Preview */}
          {sharingClip && (
            <div className="mb-3 p-3 rounded-xl bg-white/[0.03] border border-white/5 overflow-hidden">
              <p className="text-xs font-bold text-neutral-300 mb-1 truncate">{sharingClip.title || 'Untitled Clip'}</p>
              <p className="text-[11px] text-neutral-500 font-mono line-clamp-2 leading-relaxed break-all">
                {sharingClip.content.substring(0, 100)}{sharingClip.content.length > 100 ? '…' : ''}
              </p>
            </div>
          )}

          {isGeneratingShare ? (
            <div className="flex items-center justify-center py-6 gap-3 text-neutral-400">
              <div className="w-4 h-4 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
              <span className="text-xs font-semibold">Generating share link...</span>
            </div>
          ) : shareToken ? (
            <div className="flex flex-col gap-3">
              {/* Share URL */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                  <Link2 className="w-3 h-3" />
                  Public Share URL
                </label>
                <div className="flex flex-col gap-2">
                  <div className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-[10px] text-violet-300 font-mono truncate select-all overflow-hidden">
                    {typeof window !== 'undefined' ? `${window.location.origin}/s/${shareToken}` : `/s/${shareToken}`}
                  </div>
                  <button
                    onClick={handleCopyShareLink}
                    className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                      copiedShareLink
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-violet-500/10 border-violet-500/20 text-violet-300 hover:bg-violet-500/20'
                    }`}
                  >
                    {copiedShareLink ? (
                      <><CheckCircle2 className="w-3.5 h-3.5" />Copied to Clipboard!</>
                    ) : (
                      <><Link2 className="w-3.5 h-3.5" />Copy Share Link</>
                    )}
                  </button>
                </div>
              </div>

              {/* Expiry countdown for free users */}
              {shareExpiry && userPlan === 'free' && (() => {
                const msLeft = new Date(shareExpiry).getTime() - Date.now();
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
                  <p className="text-[11px] text-amber-300/80 font-medium">Pro link — never expires.</p>
                </div>
              )}

              {/* Revoke link */}
              <button
                onClick={handleRevokeShare}
                className="text-[11px] text-neutral-600 hover:text-rose-400 transition-colors font-semibold text-left"
              >
                Revoke link & disable sharing
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-4">
              <p className="text-xs text-neutral-500 text-center">No share link generated yet.</p>
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
                className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white border-0 font-bold text-xs px-6 shadow-lg shadow-violet-500/20"
              >
                <Share2 className="w-3.5 h-3.5" />
                Generate Share Link
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 3. EDIT CLIP MODAL */}
      <Dialog open={isEditClipOpen} onOpenChange={setIsEditClipOpen}>
        <DialogContent className="border border-white/5 bg-neutral-950/95 text-white max-w-md w-[calc(100%-2rem)] md:w-full rounded-xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

          <DialogHeader className="mb-4">
            <DialogTitle className="text-base font-bold text-neutral-200">Edit Clip Details</DialogTitle>
            <DialogDescription className="text-xs text-neutral-500">
              Update your clipboard sync card details, tag labels, or folder.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEditClip} className="flex flex-col gap-4">
            
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Clip Title (optional)</label>
              <Input
                type="text"
                placeholder="React layout component, meeting logs, etc..."
                value={editClipTitle}
                onChange={(e) => setEditClipTitle(e.target.value)}
                className="bg-black/30 border-white/10 text-xs focus:border-indigo-500/40 text-neutral-200 placeholder:text-neutral-600"
                maxLength={60}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Content (required)</label>
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
                className="min-h-[140px] bg-black/30 border-white/10 text-xs focus:border-indigo-500/40 text-neutral-200 placeholder:text-neutral-600 resize-y font-mono"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Tags (comma-separated)</label>
                <Input
                  type="text"
                  placeholder="CODE, NOTES, V1"
                  value={editClipTagsString}
                  onChange={(e) => setEditClipTagsString(e.target.value)}
                  className="bg-black/30 border-white/10 text-xs focus:border-indigo-500/40 text-neutral-200 placeholder:text-neutral-600"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Assign Folder</label>
                <select
                  value={editClipFolderId}
                  onChange={(e) => setEditClipFolderId(e.target.value)}
                  className="h-10 w-full rounded-md border border-white/10 bg-black/30 text-xs text-neutral-200 px-3 outline-none focus:border-indigo-500/40"
                >
                  <option value="">No Folder</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <input
                type="checkbox"
                id="edit-pin-on-creation"
                checked={editClipPinned}
                onChange={(e) => setEditClipPinned(e.target.checked)}
                className="rounded border-white/10 bg-black/30 text-indigo-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 accent-indigo-500 cursor-pointer"
              />
              <label 
                htmlFor="edit-pin-on-creation" 
                className="text-xs text-neutral-400 select-none cursor-pointer hover:text-neutral-200 transition-colors"
              >
                Pin this clip to top of dashboard
              </label>
            </div>

            <DialogFooter className="mt-4 gap-2">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setIsEditClipOpen(false)}
                className="text-neutral-400 hover:text-white hover:bg-white/5 text-xs font-semibold"
              >
                Cancel
              </Button>
              
              <Button
                type="submit"
                disabled={!editClipContent.trim()}
                className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs px-5 border-0 shadow-lg shadow-indigo-500/20"
              >
                Save Changes
              </Button>
            </DialogFooter>

          </form>
        </DialogContent>
      </Dialog>

      {/* 4. DUPLICATE CLIP WARNING MODAL */}
      <Dialog open={isDuplicateWarningOpen} onOpenChange={setIsDuplicateWarningOpen}>
        <DialogContent className="border border-white/5 bg-neutral-950 text-white max-w-sm w-[calc(100%-2rem)] md:w-full rounded-xl p-6 shadow-2xl relative overflow-hidden">
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
        <DialogContent className="border border-white/5 bg-neutral-950 text-white max-w-md w-[calc(100%-2rem)] md:w-full rounded-2xl p-6 shadow-2xl relative overflow-hidden">
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
      <Dialog open={isMigrationModalOpen} onOpenChange={setIsMigrationModalOpen}>
        <DialogContent className="border border-white/5 bg-neutral-950 text-white max-w-md w-[calc(100%-2rem)] md:w-full rounded-2xl p-6 shadow-2xl relative overflow-hidden">
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
              We found legacy data stored on this device. Would you like to sync it to the cloud?
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
              onClick={() => {
                if (user) {
                  localStorage.setItem(`freeclipboard_migrated_${user.id}`, 'true');
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
        <ProGate isPro={isPro} feature="Snippet Triggers" className="max-w-2xl w-[calc(100%-2rem)] md:w-full">
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
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {snippetsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              </div>
            ) : snippets.length === 0 ? (
              <p className="text-center text-xs text-neutral-500 py-8">No snippets yet. Add one above!</p>
            ) : (
              <table className="w-full text-xs">
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

      {/* 5. STACKABLE TOAST NOTIFICATION WINDOW */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-[calc(100%-2.5rem)] sm:w-[350px] pointer-events-none">
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
    </div>
  );
}
