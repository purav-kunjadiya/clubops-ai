-- ==============================================================================
-- Migration: Fix INSERT RLS policy & grant privileges on public.clubs
-- Description: Ensures authenticated users have table privileges and valid RLS policy to create clubs
-- ==============================================================================

-- 1. Ensure schema & table privileges are granted to authenticated role
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on table public.clubs to authenticated;
grant select, insert, update, delete on table public.club_members to authenticated;

-- 2. Ensure RLS remains enabled
alter table public.clubs enable row level security;

-- 3. Re-create INSERT policy for clubs
drop policy if exists "Users can create clubs" on public.clubs;
drop policy if exists "Authenticated users can create clubs" on public.clubs;

create policy "Authenticated users can create clubs"
  on public.clubs
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

-- 4. Re-create SELECT policy for clubs
drop policy if exists "Users can view clubs they own" on public.clubs;
drop policy if exists "Authenticated users can view clubs" on public.clubs;

create policy "Authenticated users can view clubs"
  on public.clubs
  for select
  to authenticated
  using (true);

-- 5. Re-create UPDATE policy for clubs
drop policy if exists "Owners can update their clubs" on public.clubs;

create policy "Owners can update their clubs"
  on public.clubs
  for update
  to authenticated
  using (auth.uid() = owner_id);

-- 6. Re-create DELETE policy for clubs
drop policy if exists "Owners can delete their clubs" on public.clubs;

create policy "Owners can delete their clubs"
  on public.clubs
  for delete
  to authenticated
  using (auth.uid() = owner_id);
