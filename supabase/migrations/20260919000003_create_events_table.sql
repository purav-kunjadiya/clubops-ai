-- ==============================================================================
-- Migration: 20260919000003_create_events_table.sql
-- Description: Step 4.13: Create events table with Row Level Security (RLS)
-- ==============================================================================

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs(id) on delete cascade not null,
  title text not null,
  description text,
  category text not null default 'Workshop',
  date text not null default 'Upcoming Date',
  time text not null default '6:00 PM - 8:00 PM',
  location text not null default 'Campus Center',
  status text not null default 'Planning',
  rsvp_count integer not null default 0,
  capacity integer not null default 100,
  lead_name text not null default 'Event Lead',
  lead_role text not null default 'Event Lead',
  lead_member_id text,
  budget_allocated numeric not null default 500,
  budget_spent numeric not null default 0,
  banner_gradient text not null default 'from-indigo-600/30 via-cyan-600/20 to-blue-500/10',
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

-- 1. View policy: Authenticated users who own or are members of the club can view events
create policy "Users can view events for their clubs"
  on public.events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.clubs
      where clubs.id = events.club_id
      and clubs.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.club_members
      where club_members.club_id = events.club_id
      and club_members.user_id = auth.uid()
    )
  );

-- 2. Insert policy: Authenticated users who own or are members of the club can create events
create policy "Users can create events for their clubs"
  on public.events
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.clubs
      where clubs.id = events.club_id
      and clubs.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.club_members
      where club_members.club_id = events.club_id
      and club_members.user_id = auth.uid()
    )
  );

-- 3. Update policy: Authenticated users who own or are members of the club can update events
create policy "Users can update events for their clubs"
  on public.events
  for update
  to authenticated
  using (
    exists (
      select 1 from public.clubs
      where clubs.id = events.club_id
      and clubs.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.club_members
      where club_members.club_id = events.club_id
      and club_members.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.clubs
      where clubs.id = events.club_id
      and clubs.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.club_members
      where club_members.club_id = events.club_id
      and club_members.user_id = auth.uid()
    )
  );

-- 4. Delete policy: Club owners can delete events for their clubs
create policy "Owners can delete events for their clubs"
  on public.events
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.clubs
      where clubs.id = events.club_id
      and clubs.owner_id = auth.uid()
    )
  );

-- Indexes for performance and isolation
create index if not exists idx_events_club_id on public.events(club_id);
create index if not exists idx_events_created_at on public.events(created_at);
