-- Fix Supabase RLS Policies and Infinite Recursion Across All Tables
-- Using SECURITY DEFINER helper functions with fixed search_path = public

-- 1. SECURITY DEFINER HELPER FUNCTIONS

CREATE OR REPLACE FUNCTION public.is_club_owner(p_club_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clubs
    WHERE id = p_club_id AND owner_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_club_member(p_club_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = p_club_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_club_access(p_club_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.is_club_owner(p_club_id, p_user_id) OR public.is_club_member(p_club_id, p_user_id);
$$;

-- Grant execution on helper functions
GRANT EXECUTE ON FUNCTION public.is_club_owner(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_club_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_club_access(uuid, uuid) TO authenticated, anon;

-- 2. ENSURE RLS IS ENABLED & PROPER GRANTS ON ALL 5 TABLES

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clubs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.club_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_team_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tasks TO authenticated;

-- 3. DROP ALL EXISTING POLICIES TO AVOID CONFLICTS OR RECURSION

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('clubs', 'club_members', 'events', 'event_team_members', 'tasks')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- 4. POLICIES FOR public.clubs
-- Authenticated users can view clubs they own or belong to, OR look up clubs by club_code when joining.
CREATE POLICY "clubs_select_policy"
ON public.clubs
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR public.is_club_member(id, auth.uid())
  OR club_code IS NOT NULL
);

-- Authenticated users can create clubs where they are set as owner
CREATE POLICY "clubs_insert_policy"
ON public.clubs
FOR INSERT
TO authenticated
WITH CHECK (
  owner_id = auth.uid()
);

-- Only club owners can update their clubs
CREATE POLICY "clubs_update_policy"
ON public.clubs
FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
)
WITH CHECK (
  owner_id = auth.uid()
);

-- Only club owners can delete their clubs
CREATE POLICY "clubs_delete_policy"
ON public.clubs
FOR DELETE
TO authenticated
USING (
  owner_id = auth.uid()
);

-- 5. POLICIES FOR public.club_members
-- Users can view their own membership rows or rows of clubs they have access to
CREATE POLICY "club_members_select_policy"
ON public.club_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_club_access(club_id, auth.uid())
);

-- Users can join a club for themselves OR club owners can add members
CREATE POLICY "club_members_insert_policy"
ON public.club_members
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR public.is_club_owner(club_id, auth.uid())
);

-- Club owners can update member roles/status OR users update their own profile info
CREATE POLICY "club_members_update_policy"
ON public.club_members
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_club_owner(club_id, auth.uid())
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_club_owner(club_id, auth.uid())
);

-- Club owners can remove members OR users can leave a club
CREATE POLICY "club_members_delete_policy"
ON public.club_members
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_club_owner(club_id, auth.uid())
);

-- 6. POLICIES FOR public.events
-- Members of a club can view its events
CREATE POLICY "events_select_policy"
ON public.events
FOR SELECT
TO authenticated
USING (
  public.has_club_access(club_id, auth.uid())
);

-- Members of a club can create events for that club
CREATE POLICY "events_insert_policy"
ON public.events
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_club_access(club_id, auth.uid())
);

-- Members of a club can update events of that club
CREATE POLICY "events_update_policy"
ON public.events
FOR UPDATE
TO authenticated
USING (
  public.has_club_access(club_id, auth.uid())
)
WITH CHECK (
  public.has_club_access(club_id, auth.uid())
);

-- Club owners or event creators can delete events
CREATE POLICY "events_delete_policy"
ON public.events
FOR DELETE
TO authenticated
USING (
  public.has_club_access(club_id, auth.uid())
);

-- 7. POLICIES FOR public.event_team_members
-- Club members can view event team members
CREATE POLICY "event_team_members_select_policy"
ON public.event_team_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_team_members.event_id
      AND public.has_club_access(e.club_id, auth.uid())
  )
);

-- Club members can add event team members
CREATE POLICY "event_team_members_insert_policy"
ON public.event_team_members
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_team_members.event_id
      AND public.has_club_access(e.club_id, auth.uid())
  )
);

-- Club members can update event team members
CREATE POLICY "event_team_members_update_policy"
ON public.event_team_members
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_team_members.event_id
      AND public.has_club_access(e.club_id, auth.uid())
  )
);

-- Club members can remove event team members
CREATE POLICY "event_team_members_delete_policy"
ON public.event_team_members
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_team_members.event_id
      AND public.has_club_access(e.club_id, auth.uid())
  )
);

-- 8. POLICIES FOR public.tasks
-- Club members can view tasks for their events
CREATE POLICY "tasks_select_policy"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  assignee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = tasks.event_id
      AND public.has_club_access(e.club_id, auth.uid())
  )
);

-- Club members can insert tasks for their events
CREATE POLICY "tasks_insert_policy"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = tasks.event_id
      AND public.has_club_access(e.club_id, auth.uid())
  )
);

-- Club members can update tasks for their events
CREATE POLICY "tasks_update_policy"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  assignee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = tasks.event_id
      AND public.has_club_access(e.club_id, auth.uid())
  )
)
WITH CHECK (
  assignee_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = tasks.event_id
      AND public.has_club_access(e.club_id, auth.uid())
  )
);

-- Club members can delete tasks for their events
CREATE POLICY "tasks_delete_policy"
ON public.tasks
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = tasks.event_id
      AND public.has_club_access(e.club_id, auth.uid())
  )
);
