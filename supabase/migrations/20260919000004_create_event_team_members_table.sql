-- ==============================================================================
-- Migration: 20260919000004_create_event_team_members_table.sql
-- Description: Step 4.14: Create event_team_members table with Row Level Security
-- ==============================================================================

create table if not exists public.event_team_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade not null,
  club_member_id uuid references public.club_members(id) on delete cascade not null,
  role text,
  joined_at timestamptz not null default now(),
  constraint event_team_members_unique unique (event_id, club_member_id)
);

alter table public.event_team_members enable row level security;

-- 1. View policy: Users can view event team members if they own or belong to the club
create policy "Users can view event team members for their clubs"
  on public.event_team_members
  for select
  to authenticated
  using (
    exists (
      select 1 from public.events
      join public.clubs on clubs.id = events.club_id
      where events.id = event_team_members.event_id
      and (
        clubs.owner_id = auth.uid()
        or exists (
          select 1 from public.club_members
          where club_members.club_id = events.club_id
          and club_members.user_id = auth.uid()
        )
      )
    )
  );

-- 2. Insert policy: Club owners or event heads can add club members to the event team
create policy "Club heads can add event team members"
  on public.event_team_members
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.events
      join public.clubs on clubs.id = events.club_id
      join public.club_members on club_members.id = event_team_members.club_member_id
      where events.id = event_team_members.event_id
      and club_members.club_id = events.club_id
      and (
        clubs.owner_id = auth.uid()
        or exists (
          select 1 from public.club_members cm
          where cm.id::text = events.lead_member_id
          and cm.user_id = auth.uid()
        )
      )
    )
  );

-- 3. Delete policy: Club owners or event heads can remove event team members
create policy "Club heads can remove event team members"
  on public.event_team_members
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.events
      join public.clubs on clubs.id = events.club_id
      where events.id = event_team_members.event_id
      and (
        clubs.owner_id = auth.uid()
        or exists (
          select 1 from public.club_members cm
          where cm.id::text = events.lead_member_id
          and cm.user_id = auth.uid()
        )
      )
    )
  );

-- Indexes for fast lookups
create index if not exists idx_event_team_members_event_id on public.event_team_members(event_id);
create index if not exists idx_event_team_members_club_member_id on public.event_team_members(club_member_id);
