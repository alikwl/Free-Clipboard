create table if not exists public.sticky_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clip_id uuid references public.clips(id) on delete set null,
  title text,
  content text not null default '',
  color text not null default '#FDE68A',
  pinned boolean not null default false,
  position jsonb not null default '{"x":24,"y":24}'::jsonb,
  size jsonb not null default '{"w":280,"h":220}'::jsonb,
  folder_id uuid references public.folders(id) on delete set null,
  tags text[] not null default '{}',
  archived boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_sticky_notes_user_created_at
  on public.sticky_notes (user_id, created_at desc);

create index if not exists idx_sticky_notes_user_pinned
  on public.sticky_notes (user_id, pinned, archived);

create index if not exists idx_sticky_notes_folder
  on public.sticky_notes (folder_id);

create or replace function public.set_sticky_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists sticky_notes_set_updated_at on public.sticky_notes;
create trigger sticky_notes_set_updated_at
before update on public.sticky_notes
for each row
execute function public.set_sticky_notes_updated_at();

grant select, insert, update, delete on table public.sticky_notes to authenticated;
grant select, insert, update, delete on table public.sticky_notes to service_role;

alter table public.sticky_notes enable row level security;

drop policy if exists "Users can view their sticky notes" on public.sticky_notes;
create policy "Users can view their sticky notes"
on public.sticky_notes
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their sticky notes" on public.sticky_notes;
create policy "Users can insert their sticky notes"
on public.sticky_notes
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their sticky notes" on public.sticky_notes;
create policy "Users can update their sticky notes"
on public.sticky_notes
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their sticky notes" on public.sticky_notes;
create policy "Users can delete their sticky notes"
on public.sticky_notes
for delete
to authenticated
using ((select auth.uid()) = user_id);
