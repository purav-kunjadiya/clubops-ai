-- ==============================================================================
-- Migration: 20260919000005_create_tasks_table.sql
-- Description: Step 4.15: Create tasks table with Row Level Security (RLS)
-- ==============================================================================

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs(id) on delete cascade not null,
  event_id uuid references public.events(id) on delete cascade not null,
  title text not null,
  event_tag text not null,
  priority text not null default 'Medium' check (priority in ('Low', 'Medium', 'High', 'Urgent')),
  due_text text not null,
  deadline text,
  assignee_name text not null,
  assignee_role text not null,
  assignee_member_id uuid references public.club_members(id) on delete set null,
  status text not null default 'Todo' check (status in ('Todo', 'In Progress', 'Done', 'Blocked')),
  completed boolean not null default false,
  dependencies text[] default '{}',
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

-- 1. View policy: Authenticated users can view tasks for their clubs
create policy "Users can view tasks for their clubs"
  on public.tasks
  for select
  to authenticated
  using (
    exists (
      select 1 from public.clubs
      where clubs.id = tasks.club_id
      and (
        clubs.owner_id = auth.uid()
        or exists (
          select 1 from public.club_members
          where club_members.club_id = tasks.club_id
          and club_members.user_id = auth.uid()
        )
      )
    )
  );

-- 2. Insert policy: Authenticated users can create tasks for their clubs
create policy "Users can create tasks for their clubs"
  on public.tasks
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.clubs
      where clubs.id = tasks.club_id
      and (
        clubs.owner_id = auth.uid()
        or exists (
          select 1 from public.club_members
          where club_members.club_id = tasks.club_id
          and club_members.user_id = auth.uid()
        )
      )
    )
  );

-- 3. Update policy: Authenticated users can update tasks for their clubs
create policy "Users can update tasks for their clubs"
  on public.tasks
  for update
  to authenticated
  using (
    exists (
      select 1 from public.clubs
      where clubs.id = tasks.club_id
      and (
        clubs.owner_id = auth.uid()
        or exists (
          select 1 from public.club_members
          where club_members.club_id = tasks.club_id
          and club_members.user_id = auth.uid()
        )
      )
    )
  )
  with check (
    exists (
      select 1 from public.clubs
      where clubs.id = tasks.club_id
      and (
        clubs.owner_id = auth.uid()
        or exists (
          select 1 from public.club_members
          where club_members.club_id = tasks.club_id
          and club_members.user_id = auth.uid()
        )
      )
    )
  );

-- 4. Delete policy: Club owners can delete tasks
create policy "Users can delete tasks for their clubs"
  on public.tasks
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.clubs
      where clubs.id = tasks.club_id
      and clubs.owner_id = auth.uid()
    )
  );

-- Performance indexes
create index if not exists idx_tasks_event_id on public.tasks(event_id);
create index if not exists idx_tasks_club_id on public.tasks(club_id);
create index if not exists idx_tasks_created_at on public.tasks(created_at);
