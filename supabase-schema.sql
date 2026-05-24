-- Supabase Schema for FreeClipboard
-- Copy and paste this script into your Supabase SQL Editor (https://supabase.com)

-- 1. Create the Rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(6) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (timezone('utc'::text, now()) + INTERVAL '24 hours') NOT NULL
);

-- Index for searching rooms by code quickly
CREATE INDEX IF NOT EXISTS idx_rooms_code ON public.rooms(code);

-- 2. Create the Clips table
CREATE TABLE IF NOT EXISTS public.clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    type VARCHAR(10) NOT NULL DEFAULT 'text', -- 'text', 'code', 'url'
    title VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fetching clips belonging to a room ordered by creation date
CREATE INDEX IF NOT EXISTS idx_clips_room_id_created_at ON public.clips(room_id, created_at DESC);

-- 3. Set up Row Level Security (RLS)
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;

-- Create Security Policies
-- Anyone can create or query a room by its code
CREATE POLICY "Allow public read access to rooms" ON public.rooms
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert to rooms" ON public.rooms
    FOR INSERT WITH CHECK (true);

-- Anyone can read and insert clips belonging to a room they know the room_id for
CREATE POLICY "Allow public read access to clips" ON public.clips
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert to clips" ON public.clips
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public delete to clips" ON public.clips
    FOR DELETE USING (true);

-- 4. Enable Supabase Realtime for clips
-- This allows clients to listen to inserts/deletes on clips table in real-time
alter publication supabase_realtime add table public.clips;

-- 5. Optional: Cleanup script for expired rooms (To be run periodically)
-- You can run this in a Cron job or manually.
-- DELETE FROM public.rooms WHERE expires_at < timezone('utc'::text, now());
