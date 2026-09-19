-- ==============================================================================
-- ClubOps AI: Core Database Schema (Supabase)
-- Step 4.9: Clubs Table with Row Level Security (RLS)
-- Step 4.11: Club Members Table with Row Level Security (RLS)
-- ==============================================================================

-- 1. Clubs Table
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  description text,
  owner_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz not null default now()
);

alter table public.clubs enable row level security;

-- Policies for clubs
create policy "Authenticated users can view clubs"
  on public.clubs
  for select
  to authenticated
  using (true);

create policy "Users can create clubs"
  on public.clubs
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "Owners can update their clubs"
  on public.clubs
  for update
  to authenticated
  using (auth.uid() = owner_id);

create policy "Owners can delete their clubs"
  on public.clubs
  for delete
  to authenticated
  using (auth.uid() = owner_id);

create index if not exists idx_clubs_owner_id on public.clubs(owner_id);
create index if not exists idx_clubs_code on public.clubs(code);

-- 2. Club Members Table
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

alter table public.club_members enable row level security;

-- Policies for club_members
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

create policy "Users can join clubs"
  on public.club_members
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can leave clubs"
  on public.club_members
  for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "Club heads can update club members"
  on public.club_members
  for update
  to authenticated
  using (
    exists (
      select 1 from public.clubs
      where clubs.id = club_members.club_id
      and clubs.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.clubs
      where clubs.id = club_members.club_id
      and clubs.owner_id = auth.uid()
    )
  );

create index if not exists idx_club_members_club_id on public.club_members(club_id);
create index if not exists idx_club_members_user_id on public.club_members(user_id);

-- 3. Events Table
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

-- Policies for events
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

create index if not exists idx_events_club_id on public.events(club_id);
create index if not exists idx_events_created_at on public.events(created_at);

-- 4. Event Team Members Table
create table if not exists public.event_team_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade not null,
  club_member_id uuid references public.club_members(id) on delete cascade not null,
  role text,
  joined_at timestamptz not null default now(),
  constraint event_team_members_unique unique (event_id, club_member_id)
);

alter table public.event_team_members enable row level security;

-- Policies for event_team_members
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

create index if not exists idx_event_team_members_event_id on public.event_team_members(event_id);
create index if not exists idx_event_team_members_club_member_id on public.event_team_members(club_member_id);

-- 5. Tasks Table
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

-- Policies for tasks
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

create index if not exists idx_tasks_event_id on public.tasks(event_id);
create index if not exists idx_tasks_club_id on public.tasks(club_id);
create index if not exists idx_tasks_created_at on public.tasks(created_at);

