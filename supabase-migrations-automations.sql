-- SQL Migration Script for FreeClipboard Automations
-- Copy and paste this script into your Supabase SQL Editor (https://supabase.com)

-- 1. Create Automations Table
CREATE TABLE IF NOT EXISTS public.automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    enabled BOOLEAN DEFAULT true NOT NULL,
    trigger_type VARCHAR(50) NOT NULL, -- 'clip_created', 'clip_updated', 'clip_copied', 'clip_pinned', 'daily_schedule', 'weekly_schedule', 'extension_text', 'extension_page'
    conditions JSONB DEFAULT '[]'::jsonb NOT NULL, -- [{ type, operator, value }]
    actions JSONB DEFAULT '[]'::jsonb NOT NULL, -- [{ type, value }]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for searching enabled rules for triggers
CREATE INDEX IF NOT EXISTS idx_automations_user_trigger 
ON public.automations(user_id, trigger_type, enabled);

-- 2. Create Automation Runs Logs Table
CREATE TABLE IF NOT EXISTS public.automation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    automation_id UUID REFERENCES public.automations(id) ON DELETE CASCADE NOT NULL,
    clip_id UUID REFERENCES public.clips(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL, -- 'success', 'failed', 'skipped'
    logs JSONB DEFAULT '[]'::jsonb NOT NULL, -- Array of string logs
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Optimal indexes for history querying and infinite loop breaker checks
CREATE INDEX IF NOT EXISTS idx_automation_runs_user_created 
ON public.automation_runs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_runs_loop_check 
ON public.automation_runs(clip_id, automation_id, created_at DESC);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Security Policies
-- Automations Table Policies
DROP POLICY IF EXISTS "Allow users to read their own automations" ON public.automations;
CREATE POLICY "Allow users to read their own automations" ON public.automations
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to insert their own automations" ON public.automations;
CREATE POLICY "Allow users to insert their own automations" ON public.automations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to update their own automations" ON public.automations;
CREATE POLICY "Allow users to update their own automations" ON public.automations
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to delete their own automations" ON public.automations;
CREATE POLICY "Allow users to delete their own automations" ON public.automations
    FOR DELETE USING (auth.uid() = user_id);

-- Automation Runs Table Policies
DROP POLICY IF EXISTS "Allow users to read their own automation runs" ON public.automation_runs;
CREATE POLICY "Allow users to read their own automation runs" ON public.automation_runs
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to insert their own automation runs" ON public.automation_runs;
CREATE POLICY "Allow users to insert their own automation runs" ON public.automation_runs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to delete their own automation runs" ON public.automation_runs;
CREATE POLICY "Allow users to delete their own automation runs" ON public.automation_runs
    FOR DELETE USING (auth.uid() = user_id);
