-- ==============================================================================
-- Migration: Create club_members table and update clubs select policy
-- Step 4.11: Persist Join Club in Supabase
-- ==============================================================================

-- 1. Create club_members table
create table if not exists public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  email text not null,
  role text not null default 'Registration',
  joined_at timestamptz not null default now(),
  constraint club_members_club_user_unique unique (club_id, user_id)
);

-- 2. Enable Row Level Security
alter table public.club_members enable row level security;

-- 3. Drop existing policies if any to ensure clean re-runs
drop policy if exists "Users can view members of their clubs" on public.club_members;
drop policy if exists "Users can join clubs" on public.club_members;
drop policy if exists "Users can leave clubs" on public.club_members;

-- 4. RLS Policies for club_members
-- Authenticated users can view members of clubs they belong to (or their own memberships)
create policy "Users can view members of their clubs"
  on public.club_members
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.clubs
      where clubs.id = club_members.club_id
      and clubs.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.club_members cm
      where cm.club_id = club_members.club_id
      and cm.user_id = auth.uid()
    )
  );

-- Authenticated users can insert their own membership (join club)
create policy "Users can join clubs"
  on public.club_members
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can leave clubs (delete their own membership)
create policy "Users can leave clubs"
  on public.club_members
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- 5. Indexes
create index if not exists idx_club_members_club_id on public.club_members(club_id);
create index if not exists idx_club_members_user_id on public.club_members(user_id);

-- 6. Update clubs SELECT policy to allow authenticated lookup by Club Code
drop policy if exists "Users can view clubs they own" on public.clubs;
drop policy if exists "Authenticated users can view clubs" on public.clubs;

create policy "Authenticated users can view clubs"
  on public.clubs
  for select
  to authenticated
  using (true);
