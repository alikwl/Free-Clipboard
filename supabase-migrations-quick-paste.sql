-- Quick Paste usage tracking
-- Apply in Supabase SQL editor after reviewing with your existing schema.

create table if not exists public.quick_paste_shortcuts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_kind text not null check (entry_kind in ('clip', 'snippet')),
  entry_ref text not null,
  source_app text not null check (source_app in ('web', 'extension')),
  action_kind text not null check (action_kind in ('copy', 'paste', 'reveal', 'pin', 'open', 'clipmind')),
  usage_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint quick_paste_shortcuts_user_entry_action_key unique (user_id, entry_kind, entry_ref, source_app, action_kind)
);

create index if not exists idx_quick_paste_shortcuts_user_last_used
  on public.quick_paste_shortcuts (user_id, last_used_at desc nulls last);

grant select, insert, update, delete on public.quick_paste_shortcuts to authenticated;
grant select, insert, update, delete on public.quick_paste_shortcuts to service_role;

alter table public.quick_paste_shortcuts enable row level security;

create policy "quick_paste_shortcuts_select_own"
on public.quick_paste_shortcuts
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "quick_paste_shortcuts_insert_own"
on public.quick_paste_shortcuts
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "quick_paste_shortcuts_update_own"
on public.quick_paste_shortcuts
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "quick_paste_shortcuts_delete_own"
on public.quick_paste_shortcuts
for delete
to authenticated
using ((select auth.uid()) = user_id);
