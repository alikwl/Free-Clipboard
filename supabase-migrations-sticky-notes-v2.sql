create extension if not exists pgcrypto;

create table if not exists public.sticky_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled note',
  content text not null default '',
  color text not null default 'yellow',
  is_pinned boolean not null default false,
  is_archived boolean not null default false,
  folder_id uuid null,
  source_clip_id uuid null,
  position_x integer not null default 0,
  position_y integer not null default 0,
  width integer not null default 280,
  height integer not null default 220,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sticky_notes
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists title text not null default 'Untitled note',
  add column if not exists content text not null default '',
  add column if not exists color text not null default 'yellow',
  add column if not exists is_pinned boolean not null default false,
  add column if not exists is_archived boolean not null default false,
  add column if not exists folder_id uuid null,
  add column if not exists source_clip_id uuid null,
  add column if not exists position_x integer not null default 0,
  add column if not exists position_y integer not null default 0,
  add column if not exists width integer not null default 280,
  add column if not exists height integer not null default 220,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sticky_notes'
      and column_name = 'clip_id'
  ) then
    execute 'update public.sticky_notes set source_clip_id = coalesce(source_clip_id, clip_id) where clip_id is not null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sticky_notes'
      and column_name = 'pinned'
  ) then
    execute 'update public.sticky_notes set is_pinned = coalesce(is_pinned, pinned) where pinned is not null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sticky_notes'
      and column_name = 'archived'
  ) then
    execute 'update public.sticky_notes set is_archived = coalesce(is_archived, archived) where archived is not null';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sticky_notes'
      and column_name = 'position'
  ) then
    execute $sql$
      update public.sticky_notes
      set
        position_x = coalesce(position_x, ((position ->> 'x')::integer), 0),
        position_y = coalesce(position_y, ((position ->> 'y')::integer), 0)
      where position is not null
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sticky_notes'
      and column_name = 'size'
  ) then
    execute $sql$
      update public.sticky_notes
      set
        width = coalesce(width, ((size ->> 'w')::integer), 280),
        height = coalesce(height, ((size ->> 'h')::integer), 220)
      where size is not null
    $sql$;
  end if;
end $$;

create or replace function public.set_sticky_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_sticky_notes_updated_at on public.sticky_notes;

create trigger set_sticky_notes_updated_at
before update on public.sticky_notes
for each row
execute function public.set_sticky_notes_updated_at();

alter table public.sticky_notes enable row level security;

drop policy if exists "Users can view their own sticky notes" on public.sticky_notes;
create policy "Users can view their own sticky notes"
on public.sticky_notes
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own sticky notes" on public.sticky_notes;
create policy "Users can insert their own sticky notes"
on public.sticky_notes
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own sticky notes" on public.sticky_notes;
create policy "Users can update their own sticky notes"
on public.sticky_notes
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own sticky notes" on public.sticky_notes;
create policy "Users can delete their own sticky notes"
on public.sticky_notes
for delete
using (auth.uid() = user_id);
