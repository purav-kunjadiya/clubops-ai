-- ==============================================================================
-- Migration: Create clubs table with Row Level Security (RLS)
-- Description: Stores clubs with owner reference to auth.users
-- ==============================================================================

-- 1. Create table
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  description text,
  owner_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz not null default now()
);

-- 2. Enable Row Level Security
alter table public.clubs enable row level security;

-- 3. Drop existing policies if any to ensure clean re-runs
drop policy if exists "Users can view clubs they own" on public.clubs;
drop policy if exists "Users can create clubs" on public.clubs;
drop policy if exists "Owners can update their clubs" on public.clubs;
drop policy if exists "Owners can delete their clubs" on public.clubs;

-- 4. Create RLS Policies
-- Authenticated users can view their own clubs
create policy "Users can view clubs they own"
  on public.clubs
  for select
  to authenticated
  using (auth.uid() = owner_id);

-- Authenticated users can create their own clubs
create policy "Users can create clubs"
  on public.clubs
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

-- Owners can update their clubs
create policy "Owners can update their clubs"
  on public.clubs
  for update
  to authenticated
  using (auth.uid() = owner_id);

-- Owners can delete their clubs
create policy "Owners can delete their clubs"
  on public.clubs
  for delete
  to authenticated
  using (auth.uid() = owner_id);

-- 5. Create performance indexes
create index if not exists idx_clubs_owner_id on public.clubs(owner_id);
create index if not exists idx_clubs_code on public.clubs(code);
