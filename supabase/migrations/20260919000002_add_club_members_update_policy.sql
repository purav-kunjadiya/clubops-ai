-- ==============================================================================
-- Migration: Add update policy for club_members
-- Step 4.12: Only club heads (club owners) can update member roles
-- ==============================================================================

-- Drop if exists
drop policy if exists "Club heads can update club members" on public.club_members;

-- Allow only the club owner/head to update member roles
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
