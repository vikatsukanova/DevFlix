-- DevFlix accounts: one row per user holding their topics, channels, My List, Continue Watching and settings.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.

create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row-level security: people can only see and change their own row.
alter table public.profiles enable row level security;

create policy "Read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
