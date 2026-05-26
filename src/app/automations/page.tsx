'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { 
  Sparkles, 
  Layers, 
  ArrowLeft, 
  Loader2, 
  Plus, 
  Trash2, 
  Play, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  ArrowRight,
  Folder, 
  Tag, 
  Wand2, 
  Settings, 
  Activity, 
  Terminal, 
  ChevronRight,
  Calendar,
  Code,
  FileText,
  Lock,
  Bookmark,
  ToggleLeft,
  ToggleRight,
  Check,
  X,
  FileSpreadsheet
} from 'lucide-react';
import ProGate from '@/components/pro-gate';
import { isProUser } from '@/lib/clip-limits';

interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger_type: string;
  conditions: Array<{ type: string; operator: string; value: string }>;
  actions: Array<{ type: string; value: string }>;
  created_at: string;
}

interface AutomationRun {
  id: string;
  automation_id: string;
  clip_id: string;
  status: 'success' | 'failed' | 'skipped';
  logs: string[];
  error_message?: string;
  created_at: string;
}

interface ClipRecord {
  id: string;
  content: string;
  title?: string | null;
}

const TRIGGER_PRESETS = [
  { id: 'clip_created', name: 'New Clip Saved', icon: Plus, desc: 'Triggered instantly when a clip is saved to your history.' },
  { id: 'clip_updated', name: 'Clip Modified', icon: Code, desc: 'Triggered when you edit or update clip contents.' },
  { id: 'clip_copied', name: 'Clip Copied', icon: FileText, desc: 'Triggered when you click copy on a saved snippet.' },
  { id: 'clip_pinned', name: 'Clip Pinned', icon: Bookmark, desc: 'Triggered when you pin a clip to your top drawer.' },
  { id: 'daily_schedule', name: 'Daily Schedule', icon: Calendar, desc: 'Run rules once per day on recently gathered content.' }
];

const CONDITION_PRESETS = [
  { id: 'content_contains', name: 'Content contains text' },
  { id: 'content_type', name: 'Content type equals' },
  { id: 'title_contains', name: 'Title contains text' },
  { id: 'folder_equals', name: 'Folder equals name' },
  { id: 'tag_exists', name: 'Tag label exists' },
  { id: 'length_greater_than', name: 'Length (characters) is greater than' },
  { id: 'sensitive_data_detected', name: 'Sensitive data / keys detected' },
  { id: 'url_domain_matches', name: 'URL domain matches' }
];

const ACTION_PRESETS = [
  { id: 'move_to_folder', name: 'Move to folder' },
  { id: 'add_tag', name: 'Add tag label' },
  { id: 'generate_title', name: 'Generate AI Title' },
  { id: 'summarize', name: 'Generate AI Summary' },
  { id: 'extract_tasks', name: 'Extract AI Task checklist' },
  { id: 'mark_sensitive', name: 'Mark category as sensitive' },
  { id: 'pin', name: 'Pin clip to top' },
  { id: 'archive_duplicate', name: 'Archive duplicates (deduplicate)' },
  { id: 'create_sticky_note', name: 'Tag as STICKY note' },
  { id: 'notify_user', name: 'Add user alert notification' }
];

export default function AutomationsPage() {
  const router = useRouter();
  const [userPlan, setUserPlan] = useState<'free' | 'pro'>('free');
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  
  // Loaded state arrays
  const [automations, setAutomations] = useState<AutomationRule[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [clips, setClips] = useState<ClipRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modals & UI Toggles
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1); // 1: Trigger, 2: Conditions, 3: Actions & Details
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedRunLogs, setSelectedRunLogs] = useState<AutomationRun | null>(null);

  // Wizard draft state
  const [draftName, setDraftName] = useState('');
  const [draftTrigger, setDraftTrigger] = useState('clip_created');
  const [draftConditions, setDraftConditions] = useState<Array<{ type: string; operator: string; value: string }>>([]);
  const [draftActions, setDraftActions] = useState<Array<{ type: string; value: string }>>([]);

  // Test-Drive Station states
  const [testClipId, setTestClipId] = useState('');
  const [testRuleId, setTestRuleId] = useState('');
  const [testTerminalLogs, setTestTerminalLogs] = useState<string[]>([]);
  const [testRunning, setTestRunning] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      if (!currentUser) {
        router.push('/login');
        return;
      }

      supabase
        .from('users')
        .select('plan, trial_ends_at')
        .eq('id', currentUser.id)
        .single()
        .then(({ data: profile }) => {
          if (profile) {
            setUserPlan(profile.plan || 'free');
            setTrialEndsAt(profile.trial_ends_at);
          }
          
          const isPro = isProUser(profile?.plan || 'free', profile?.trial_ends_at || null);
          if (isPro) {
            loadInitialData(currentUser.id);
          } else {
            setLoading(false);
          }
        });
    });
  }, [router]);

  const isPro = isProUser(userPlan, trialEndsAt);

  const loadInitialData = async (userId: string) => {
    try {
      setLoading(true);
      const response = await fetch('/api/automations');
      if (!response.ok) throw new Error('Failed to load rules');
      const data = await response.json();
      
      setAutomations(data.automations || []);
      setRuns(data.runs || []);

      // Load recent clips for testing purposes
      const supabase = createClient();
      const { data: recentClips } = await supabase
        .from('clips')
        .select('id, content, title')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      
      setClips(recentClips || []);
      
      if (recentClips && recentClips.length > 0) {
        setTestClipId(recentClips[0].id);
      }
      if (data.automations && data.automations.length > 0) {
        setTestRuleId(data.automations[0].id);
      }

      setLoading(false);
    } catch (err) {
      console.error('Automations data load error:', err);
      setLoading(false);
    }
  };

  // Enable/Disable rule toggle
  const handleToggleRule = async (ruleId: string, currentEnabled: boolean) => {
    setActionLoading(ruleId);
    try {
      const response = await fetch('/api/automations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ruleId, enabled: !currentEnabled }),
      });

      if (response.ok) {
        const { rule } = await response.json();
        setAutomations(prev => prev.map(r => r.id === ruleId ? rule : r));
      }
    } catch (err) {
      console.error('Failed to toggle rule:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Delete rule
  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this automation rule?')) return;
    setActionLoading(ruleId);
    try {
      const response = await fetch(`/api/automations?id=${ruleId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setAutomations(prev => prev.filter(r => r.id !== ruleId));
        if (testRuleId === ruleId) setTestRuleId('');
      }
    } catch (err) {
      console.error('Delete rule error:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Run dry-run rule test
  const handleRunRuleTest = async () => {
    if (!testClipId || !testRuleId) return;
    setTestRunning(true);
    setTestTerminalLogs(['[INIT] Requesting dry-run execution...']);

    try {
      const rule = automations.find(r => r.id === testRuleId);
      if (!rule) throw new Error('Rule not found');

      const response = await fetch('/api/automations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automation: rule, clip_id: testClipId }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Test failed');
      }

      const data = await response.json();
      setTestTerminalLogs(data.logs || ['[ERROR] Empty log outputs']);
    } catch (err: any) {
      setTestTerminalLogs(prev => [...prev, `[CRITICAL ERROR] ${err.message || 'Server dry-run exception occurred'}`]);
    } finally {
      setTestRunning(false);
    }
  };

  // Dynamic conditions builders in wizard
  const handleAddDraftCondition = () => {
    setDraftConditions(prev => [...prev, { type: 'content_contains', operator: 'equals', value: '' }]);
  };
  const handleRemoveDraftCondition = (index: number) => {
    setDraftConditions(prev => prev.filter((_, idx) => idx !== index));
  };
  const handleUpdateDraftCondition = (index: number, key: string, val: string) => {
    setDraftConditions(prev => prev.map((item, idx) => idx === index ? { ...item, [key]: val } : item));
  };

  // Dynamic actions builders in wizard
  const handleAddDraftAction = () => {
    setDraftActions(prev => [...prev, { type: 'move_to_folder', value: '' }]);
  };
  const handleRemoveDraftAction = (index: number) => {
    setDraftActions(prev => prev.filter((_, idx) => idx !== index));
  };
  const handleUpdateDraftAction = (index: number, key: string, val: string) => {
    setDraftActions(prev => prev.map((item, idx) => idx === index ? { ...item, [key]: val } : item));
  };

  // Save rule inside wizard
  const handleSaveDraftRule = async () => {
    if (!draftName.trim()) {
      alert('Please provide a name for this automation rule.');
      return;
    }
    if (draftActions.length === 0) {
      alert('Please configure at least one action to run.');
      return;
    }

    try {
      const response = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draftName,
          trigger_type: draftTrigger,
          conditions: draftConditions,
          actions: draftActions,
        }),
      });

      if (response.ok) {
        const { rule } = await response.json();
        setAutomations(prev => [rule, ...prev]);
        setTestRuleId(rule.id);
        setIsWizardOpen(false);
        resetWizard();
      } else {
        const err = await response.json();
        alert(`Failed to save: ${err.error || 'Server error'}`);
      }
    } catch (err) {
      console.error('Save rule exception:', err);
    }
  };

  const resetWizard = () => {
    setWizardStep(1);
    setDraftName('');
    setDraftTrigger('clip_created');
    setDraftConditions([]);
    setDraftActions([]);
  };

  const getTriggerLabel = (type: string) => {
    return TRIGGER_PRESETS.find(t => t.id === type)?.name || type;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080d19] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="safe-page min-h-screen bg-[#080d19] text-neutral-100 flex flex-col relative overflow-x-hidden select-none">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.06),_transparent_40%),radial-gradient(circle_at_bottom,_rgba(6,182,212,0.04),_transparent_35%)] pointer-events-none" />

      {/* 1. Header Toolbar */}
      <header className="border-b border-white/5 bg-neutral-950/40 backdrop-blur-md relative z-10 shrink-0">
        <div className="safe-container mx-auto flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition bg-white/5 px-2.5 py-1.5 rounded-xl border border-white/5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Dashboard
            </button>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/20">
                <Settings className="w-4.5 h-4.5" />
              </div>
              <h1 className="text-sm font-bold text-white flex items-center gap-1.5">
                Automations
                <span className="text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded-full uppercase tracking-wider font-extrabold">Safely Configured</span>
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex items-center gap-2 text-xs font-semibold px-3.5 py-1.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 hover:text-white text-neutral-300 transition"
            >
              <Activity className="w-4 h-4" />
              Run History
            </button>
            <button
              onClick={() => { resetWizard(); setIsWizardOpen(true); }}
              className="flex items-center gap-2 text-xs font-semibold px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 border border-indigo-500/30 text-white shadow-lg shadow-indigo-500/10 transition"
            >
              <Plus className="w-4 h-4" />
              Create Rule
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        <ProGate isPro={isPro} feature="Workspace Automations" message="Unlock Workspace Automations" className="flex-1 flex relative">
          
          <div className="flex-1 safe-container mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6 overflow-y-auto max-h-[calc(100vh-53px)]">
            
            {/* A. Left Block: Rules Card list */}
            <div className="flex-1 space-y-4">
              <h2 className="text-sm font-extrabold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                Active Automation Rules ({automations.length})
              </h2>

              {automations.length === 0 ? (
                <div className="bg-neutral-900/30 border border-white/5 rounded-2xl p-10 text-center flex flex-col items-center justify-center">
                  <Wand2 className="w-10 h-10 text-neutral-600 mb-3" />
                  <h3 className="text-sm font-bold text-neutral-300 mb-1">No automation rules created yet</h3>
                  <p className="text-xs text-neutral-500 max-w-sm mb-5 leading-5">
                    Automations allow you to automatically categorize, AI-title, auto-tag, and pin clips based on dynamic conditions safely on the cloud.
                  </p>
                  <button
                    onClick={() => { resetWizard(); setIsWizardOpen(true); }}
                    className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 px-4 py-2 rounded-xl text-xs font-semibold transition"
                  >
                    Build first rule
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {automations.map(rule => (
                    <div 
                      key={rule.id}
                      className={`relative bg-neutral-900/40 border rounded-2xl p-5 hover:border-white/10 transition duration-200 ${rule.enabled ? 'border-white/5' : 'border-white/2 opacity-65'}`}
                    >
                      {/* Top bar details */}
                      <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-3 mb-4">
                        <div>
                          <h3 className="text-sm font-bold text-white leading-5">{rule.name}</h3>
                          <p className="text-[10px] text-neutral-500 font-mono mt-0.5">Created: {new Date(rule.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Toggle switches */}
                          <button
                            onClick={() => handleToggleRule(rule.id, rule.enabled)}
                            disabled={actionLoading === rule.id}
                            className="text-neutral-400 hover:text-white transition disabled:opacity-50"
                          >
                            {rule.enabled ? (
                              <ToggleRight className="w-9 h-9 text-indigo-400" />
                            ) : (
                              <ToggleLeft className="w-9 h-9 text-neutral-600" />
                            )}
                          </button>
                          
                          <button
                            onClick={() => handleDeleteRule(rule.id)}
                            disabled={actionLoading === rule.id}
                            className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-white/5 transition disabled:opacity-50"
                            title="Delete Rule"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Rule flowchart blocks */}
                      <div className="space-y-3 font-mono text-[11px] select-text">
                        {/* 1. WHEN trigger */}
                        <div className="flex items-start gap-3">
                          <span className="shrink-0 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2.5 py-0.5 rounded-md font-extrabold uppercase tracking-wide">
                            WHEN
                          </span>
                          <span className="text-neutral-300 leading-5">
                            {getTriggerLabel(rule.trigger_type)} happens
                          </span>
                        </div>

                        {/* 2. IF conditions */}
                        {rule.conditions && rule.conditions.length > 0 && (
                          <div className="flex items-start gap-3">
                            <span className="shrink-0 bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2.5 py-0.5 rounded-md font-extrabold uppercase tracking-wide">
                              IF
                            </span>
                            <div className="space-y-1.5 leading-5 text-neutral-400">
                              {rule.conditions.map((cond, idx) => (
                                <div key={idx} className="flex items-center gap-1.5">
                                  <span>{cond.type.replace(/_/g, ' ')}</span>
                                  <span className="text-amber-400/80 font-bold">{cond.operator}</span>
                                  <span className="bg-white/5 border border-white/5 px-1.5 py-0.5 rounded text-neutral-300 font-mono">
                                    "{cond.value}"
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 3. THEN actions */}
                        <div className="flex items-start gap-3">
                          <span className="shrink-0 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2.5 py-0.5 rounded-md font-extrabold uppercase tracking-wide">
                            THEN
                          </span>
                          <div className="space-y-1.5 leading-5 text-neutral-300">
                            {rule.actions.map((act, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="text-neutral-400">{act.type.replace(/_/g, ' ')}</span>
                                {act.value && (
                                  <span className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 px-1.5 py-0.5 rounded font-mono">
                                    "{act.value}"
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* B. Right Block: Rule Test-Drive Station */}
            {automations.length > 0 && (
              <div className="w-full lg:w-96 space-y-4 shrink-0">
                <h2 className="text-sm font-extrabold text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  Dry-Run Test Station
                </h2>

                <div className="bg-neutral-900/30 border border-white/5 rounded-2xl p-5 space-y-4 relative">
                  
                  {/* Select Clip */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400">1. Target Clipboard Item</label>
                    <select
                      value={testClipId}
                      onChange={(e) => setTestClipId(e.target.value)}
                      className="w-full bg-neutral-950 border border-white/5 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500/40 text-neutral-300 font-mono"
                    >
                      {clips.map(c => {
                        const snippet = c.content.length > 32 ? `${c.content.slice(0, 29).trim()}...` : c.content;
                        return <option key={c.id} value={c.id}>{c.title || snippet}</option>;
                      })}
                    </select>
                  </div>

                  {/* Select Rule */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-neutral-400">2. Automation Rule to Test</label>
                    <select
                      value={testRuleId}
                      onChange={(e) => setTestRuleId(e.target.value)}
                      className="w-full bg-neutral-950 border border-white/5 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500/40 text-neutral-300"
                    >
                      {automations.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Run button */}
                  <button
                    onClick={handleRunRuleTest}
                    disabled={testRunning || !testClipId || !testRuleId}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-lg border border-cyan-400/20 transition disabled:opacity-50 active:scale-[0.99]"
                  >
                    {testRunning ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Running dry-run...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        Test Drive Rule
                      </>
                    )}
                  </button>

                  {/* Terminal Logger Console */}
                  {testTerminalLogs.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-wider font-extrabold text-neutral-500 font-mono">Terminal Diagnostics Logs</label>
                      <div className="bg-[#03060c] border border-white/8 rounded-xl p-3.5 font-mono text-[10px] text-cyan-200/90 max-h-60 overflow-y-auto space-y-1.5 select-text leading-5">
                        {testTerminalLogs.map((log, index) => {
                          let color = 'text-cyan-300/80';
                          if (log.includes('[CRITICAL') || log.includes('[FAILED') || log.includes('[ERROR')) color = 'text-red-400';
                          else if (log.includes('[SUCCESS')) color = 'text-emerald-400';
                          else if (log.includes('[CONDITION] Condition') && log.includes('FAILED')) color = 'text-amber-400';
                          else if (log.includes('[DATABASE') || log.includes('[FOLDER') || log.includes('[ACTION] Generated')) color = 'text-indigo-300';
                          
                          return (
                            <div key={index} className={`${color} break-all`}>
                              {log}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}

          </div>

        </ProGate>
      </div>

      {/* 3. RULE CREATOR WIZARD STEPPER MODAL */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 select-none">
          <div className="bg-[#0c1426] border border-white/8 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-neutral-950/20">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-indigo-400" />
                Build Automation Rule (Step {wizardStep}/3)
              </h3>
              <button
                onClick={() => setIsWizardOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white bg-white/5 border border-white/5 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Stepper Wizard View slots */}
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-5">
              
              {/* STEP 1: WHEN Trigger */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">1. Select Trigger Event (When...)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {TRIGGER_PRESETS.map(trig => {
                      const Icon = trig.icon;
                      const selected = draftTrigger === trig.id;
                      return (
                        <button
                          key={trig.id}
                          onClick={() => setDraftTrigger(trig.id)}
                          className={`flex items-start gap-4 p-4 rounded-xl border text-left transition duration-200 ${selected ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/5 text-white' : 'border-white/5 bg-neutral-900/30 text-neutral-400 hover:border-white/10 hover:text-white'}`}
                        >
                          <div className={`p-2.5 rounded-lg border shrink-0 ${selected ? 'bg-indigo-500 border-indigo-400 text-white' : 'bg-white/5 border-white/5 text-neutral-400'}`}>
                            <Icon className="w-4.5 h-4.5" />
                          </div>
                          <div>
                            <h5 className="text-xs font-bold font-sans">{trig.name}</h5>
                            <p className="text-[10px] leading-4 text-neutral-500 mt-1">{trig.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 2: IF Conditions */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">2. Set Filters & Conditions (If...)</h4>
                    <button
                      onClick={handleAddDraftCondition}
                      className="flex items-center gap-1 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-xl text-[10px] font-bold tracking-wider uppercase transition"
                    >
                      <Plus className="w-3 h-3" />
                      Add Condition
                    </button>
                  </div>

                  {draftConditions.length === 0 ? (
                    <div className="bg-neutral-900/20 border border-white/5 border-dashed rounded-xl p-8 text-center italic text-xs text-neutral-500 select-text">
                      No filters configured. This rule will trigger on EVERY clip event (always matches).
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {draftConditions.map((cond, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-3 bg-neutral-900/20 border border-white/5 rounded-xl">
                          {/* Condition Selection */}
                          <select
                            value={cond.type}
                            onChange={(e) => handleUpdateDraftCondition(idx, 'type', e.target.value)}
                            className="bg-neutral-950 border border-white/5 rounded-xl px-2.5 py-1.5 text-xs text-neutral-300 w-1/3 focus:outline-none"
                          >
                            {CONDITION_PRESETS.map(preset => (
                              <option key={preset.id} value={preset.id}>{preset.name}</option>
                            ))}
                          </select>

                          {/* Operator Selection */}
                          <select
                            value={cond.operator}
                            onChange={(e) => handleUpdateDraftCondition(idx, 'operator', e.target.value)}
                            className="bg-neutral-950 border border-white/5 rounded-xl px-2.5 py-1.5 text-xs text-amber-300 w-24 focus:outline-none font-bold"
                          >
                            <option value="equals">equals</option>
                            <option value="not_equals">not equals</option>
                          </select>

                          {/* Target input value */}
                          <input
                            type="text"
                            placeholder="Target value/string..."
                            value={cond.value}
                            onChange={(e) => handleUpdateDraftCondition(idx, 'value', e.target.value)}
                            className="flex-1 bg-neutral-950 border border-white/5 rounded-xl px-3 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-indigo-500/40"
                          />

                          {/* Delete condition */}
                          <button
                            onClick={() => handleRemoveDraftCondition(idx)}
                            className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-white/5 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: THEN Actions & Save */}
              {wizardStep === 3 && (
                <div className="space-y-5">
                  {/* Name Input */}
                  <div className="space-y-2 border-b border-white/5 pb-4">
                    <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Automation Rule Name</label>
                    <input
                      type="text"
                      placeholder="e.g. AI Summarize Code Snippets"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      className="w-full bg-neutral-950 border border-white/5 rounded-xl px-3 py-2 text-xs text-neutral-300 focus:outline-none focus:border-indigo-500/40"
                    />
                  </div>

                  {/* Actions Header */}
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">3. Configure Actions (Then...)</h4>
                    <button
                      onClick={handleAddDraftAction}
                      className="flex items-center gap-1 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-xl text-[10px] font-bold tracking-wider uppercase transition"
                    >
                      <Plus className="w-3 h-3" />
                      Add Action
                    </button>
                  </div>

                  {draftActions.length === 0 ? (
                    <div className="bg-neutral-900/20 border border-white/5 border-dashed rounded-xl p-8 text-center italic text-xs text-neutral-500 select-text">
                      No actions configured. Configure at least one action to run.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {draftActions.map((act, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-3 bg-neutral-900/20 border border-white/5 rounded-xl">
                          {/* Action Selection */}
                          <select
                            value={act.type}
                            onChange={(e) => handleUpdateDraftAction(idx, 'type', e.target.value)}
                            className="bg-neutral-950 border border-white/5 rounded-xl px-2.5 py-1.5 text-xs text-neutral-300 w-1/2 focus:outline-none"
                          >
                            {ACTION_PRESETS.map(preset => (
                              <option key={preset.id} value={preset.id}>{preset.name}</option>
                            ))}
                          </select>

                          {/* Action target config value */}
                          {['move_to_folder', 'add_tag', 'notify_user'].includes(act.type) ? (
                            <input
                              type="text"
                              placeholder={act.type === 'move_to_folder' ? 'Folder name...' : act.type === 'add_tag' ? 'Tag name...' : 'Notify text...'}
                              value={act.value}
                              onChange={(e) => handleUpdateDraftAction(idx, 'value', e.target.value)}
                              className="flex-1 bg-neutral-950 border border-white/5 rounded-xl px-3 py-1.5 text-xs text-neutral-300 focus:outline-none focus:border-indigo-500/40"
                            />
                          ) : (
                            <div className="flex-1 text-[11px] italic text-neutral-500 font-mono">No parameters required</div>
                          )}

                          {/* Delete Action */}
                          <button
                            onClick={() => handleRemoveDraftAction(idx)}
                            className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-white/5 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Stepper Footer Controls */}
            <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between bg-neutral-950/20 shrink-0">
              <button
                disabled={wizardStep === 1}
                onClick={() => setWizardStep(prev => prev - 1)}
                className="bg-white/5 hover:bg-white/10 text-neutral-300 text-xs px-4 py-2 rounded-xl border border-white/5 transition disabled:opacity-30 disabled:pointer-events-none"
              >
                Back
              </button>

              <div className="flex items-center gap-2">
                {wizardStep < 3 ? (
                  <button
                    onClick={() => setWizardStep(prev => prev + 1)}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-2 rounded-xl transition"
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={handleSaveDraftRule}
                    className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 border border-indigo-400/20 text-white text-xs px-4 py-2 rounded-xl shadow-lg transition"
                  >
                    Save Automation
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 4. EXPANDABLE LOGS DETAILS HISTORY DRAWER POPUP */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 select-none">
          <div className="bg-[#0c1426] border border-white/8 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col h-[80vh]">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-neutral-950/20 shrink-0">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-400" />
                Automation Trace Logs History
              </h3>
              <button
                onClick={() => setHistoryOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white bg-white/5 border border-white/5 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List Table content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              
              {runs.length === 0 ? (
                <div className="text-center py-20 italic text-xs text-neutral-500 select-text">
                  No execution runs logged yet. Build a rule and save a matching clip to verify!
                </div>
              ) : (
                <div className="space-y-3">
                  {runs.map(run => {
                    const ruleName = automations.find(r => r.id === run.automation_id)?.name || 'Deleted Automation';
                    const runDate = new Date(run.created_at).toLocaleString();
                    const isSuccess = run.status === 'success';
                    const isSkipped = run.status === 'skipped';
                    
                    return (
                      <div 
                        key={run.id}
                        className="bg-neutral-900/20 border border-white/5 rounded-xl p-4 hover:border-white/10 transition cursor-pointer select-text"
                        onClick={() => setSelectedRunLogs(run)}
                      >
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div className="space-y-1">
                            <h4 className="text-xs font-bold text-white leading-4">{ruleName}</h4>
                            <p className="text-[10px] text-neutral-500 font-mono">{runDate} • Clip ID: {run.clip_id?.slice(0, 8)}...</p>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            {isSuccess ? (
                              <span className="flex items-center gap-1 text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold">
                                <CheckCircle2 className="w-3 h-3" />
                                Success
                              </span>
                            ) : isSkipped ? (
                              <span className="flex items-center gap-1 text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold">
                                <AlertCircle className="w-3 h-3" />
                                Skipped
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold">
                                <XCircle className="w-3 h-3" />
                                Failed
                              </span>
                            )}

                            <span className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold select-none flex items-center gap-0.5 bg-white/5 border border-white/5 px-2 py-1 rounded-lg">
                              Inspect Logs
                              <ArrowRight className="w-3 h-3" />
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* 5. LOG CONSOLE PREVIEW FOR SELECTED RUN IN HISTORY */}
      {selectedRunLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 select-none">
          <div className="bg-[#03060c] border border-white/8 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col h-[60vh]">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between bg-neutral-950/20 shrink-0">
              <h3 className="text-xs font-mono uppercase tracking-widest font-extrabold text-neutral-400 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                Rule Trace Inspector
              </h3>
              <button
                onClick={() => setSelectedRunLogs(null)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white bg-white/5 border border-white/5 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Terminal console */}
            <div className="flex-1 overflow-y-auto p-6 font-mono text-[10px] text-cyan-200/90 space-y-2 select-text leading-5">
              <div className="text-neutral-500 uppercase tracking-widest font-extrabold pb-2 border-b border-white/5 mb-3 flex items-center justify-between">
                <span>Rule Run ID: {selectedRunLogs.id.slice(0, 16)}...</span>
                <span>{new Date(selectedRunLogs.created_at).toLocaleTimeString()}</span>
              </div>
              
              {selectedRunLogs.logs.map((log, index) => {
                let color = 'text-cyan-300/80';
                if (log.includes('[CRITICAL') || log.includes('[FAILED') || log.includes('[ERROR')) color = 'text-red-400';
                else if (log.includes('[SUCCESS')) color = 'text-emerald-400';
                else if (log.includes('[CONDITION] Condition') && log.includes('FAILED')) color = 'text-amber-400';
                else if (log.includes('[DATABASE') || log.includes('[FOLDER') || log.includes('[ACTION] Generated')) color = 'text-indigo-300';
                
                return (
                  <div key={index} className={`${color} break-all`}>
                    {log}
                  </div>
                );
              })}

              {selectedRunLogs.error_message && (
                <div className="border-t border-red-500/20 pt-2.5 mt-3.5 text-red-400">
                  <span className="font-extrabold uppercase">[ERROR EXCEPTION]</span> {selectedRunLogs.error_message}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
