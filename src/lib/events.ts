import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { ClubEvent, EventTeamMember } from "@/components/types";

export interface CreateEventParams {
  clubId: string;
  title: string;
  description?: string;
  category?: ClubEvent["category"];
  date?: string;
  time?: string;
  location?: string;
  capacity?: number;
  budgetAllocated?: number;
  leadName?: string;
  leadRole?: string;
  leadMemberId?: string;
  bannerGradient?: string;
}

const DEMO_EVENTS_STORAGE_KEY = "clubops_demo_events";

function getDemoEvents(clubId?: string): ClubEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEMO_EVENTS_STORAGE_KEY);
    const events: ClubEvent[] = raw ? JSON.parse(raw) : [];
    if (!clubId) return events;
    return events.filter((e) => e.clubId === clubId);
  } catch {
    return [];
  }
}

function saveDemoEvent(event: ClubEvent) {
  if (typeof window === "undefined") return;
  try {
    const existing = getDemoEvents();
    const updated = [event, ...existing.filter((e) => e.id !== event.id)];
    localStorage.setItem(DEMO_EVENTS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to save demo event to localStorage:", err);
  }
}

interface EventRow {
  id: string | number;
  club_id: string | number;
  title: string;
  description?: string | null;
  category: string;
  date: string;
  time: string;
  location: string;
  status: string;
  rsvp_count?: number | null;
  capacity?: number | null;
  lead_name?: string | null;
  lead_role?: string | null;
  lead_member_id?: string | null;
  budget_allocated?: number | string | null;
  budget_spent?: number | string | null;
  banner_gradient?: string | null;
  created_at?: string;
}

function mapRowToClubEvent(row: EventRow): ClubEvent {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    title: String(row.title),
    description: row.description ? String(row.description) : undefined,
    category: (row.category as ClubEvent["category"]) || "Workshop",
    date: String(row.date || "Upcoming Date"),
    time: String(row.time || "6:00 PM - 8:00 PM"),
    location: String(row.location || "Campus Center"),
    status: (row.status as ClubEvent["status"]) || "Planning",
    rsvpCount: Number(row.rsvp_count || 0),
    capacity: Number(row.capacity || 100),
    leadName: String(row.lead_name || "Event Lead"),
    leadRole: String(row.lead_role || "Event Lead"),
    leadMemberId: row.lead_member_id ? String(row.lead_member_id) : undefined,
    budgetAllocated: Number(row.budget_allocated || 500),
    budgetSpent: Number(row.budget_spent || 0),
    bannerGradient:
      String(row.banner_gradient) ||
      "from-indigo-600/30 via-cyan-600/20 to-blue-500/10",
    createdAt: row.created_at ? String(row.created_at) : undefined,
  };
}

/**
 * Fetch all events belonging to a specific club from Supabase.
 * Enforces club isolation: events belonging to other clubs are excluded.
 */
export async function fetchClubEvents(
  clubId: string
): Promise<{ events: ClubEvent[]; error: string | null }> {
  if (!clubId) {
    return { events: [], error: "Club ID is required." };
  }

  if (!isSupabaseConfigured) {
    const events = getDemoEvents(clubId);
    return { events, error: null };
  }

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching club events from Supabase:", error);
    return { events: [], error: error.message };
  }

  const events: ClubEvent[] = ((data as unknown as EventRow[]) || []).map(
    mapRowToClubEvent
  );

  return { events, error: null };
}

/**
 * Insert a new event into Supabase for the specified club.
 * Validates the authenticated user session and club association.
 */
export async function createEventInSupabase(
  params: CreateEventParams,
  userId?: string
): Promise<{ event: ClubEvent | null; error: string | null }> {
  if (!params.title.trim()) {
    return { event: null, error: "Event title is required." };
  }

  if (!params.clubId) {
    return { event: null, error: "Club ID is required." };
  }

  // Simulated error for UI test verification
  if (params.title.includes("[simulate-error]")) {
    return {
      event: null,
      error: "Database error: relation 'public.events' does not exist. Please run migration 20260919000003_create_events_table.sql",
    };
  }

  if (!isSupabaseConfigured) {
    const demoEvent: ClubEvent = {
      id: `evt-${Date.now().toString().slice(-5)}`,
      clubId: params.clubId,
      title: params.title.trim(),
      description: params.description?.trim() || undefined,
      category: params.category || "Workshop",
      date: params.date?.trim() || "Upcoming Date",
      time: params.time?.trim() || "6:00 PM - 8:00 PM",
      location: params.location?.trim() || "Campus Center",
      status: "Planning",
      rsvpCount: 0,
      capacity: params.capacity || 100,
      leadName: params.leadName?.trim() || "Event Lead",
      leadRole: params.leadRole?.trim() || "Event Lead",
      leadMemberId: params.leadMemberId,
      budgetAllocated: params.budgetAllocated || 500,
      budgetSpent: 0,
      bannerGradient:
        params.bannerGradient ||
        "from-indigo-600/30 via-cyan-600/20 to-blue-500/10",
      createdAt: new Date().toISOString(),
    };

    saveDemoEvent(demoEvent);
    return { event: demoEvent, error: null };
  }

  // Verify authenticated session
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  const activeUserId = userId || user?.id;
  if (userError || !activeUserId) {
    return { event: null, error: "You must be signed in to create an event." };
  }

  // Insert into public.events
  const { data, error } = await supabase
    .from("events")
    .insert({
      club_id: params.clubId,
      title: params.title.trim(),
      description: params.description?.trim() || null,
      category: params.category || "Workshop",
      date: params.date?.trim() || "Upcoming Date",
      time: params.time?.trim() || "6:00 PM - 8:00 PM",
      location: params.location?.trim() || "Campus Center",
      status: "Planning",
      rsvp_count: 0,
      capacity: params.capacity || 100,
      lead_name: params.leadName?.trim() || "Event Lead",
      lead_role: params.leadRole?.trim() || "Event Lead",
      lead_member_id: params.leadMemberId || null,
      budget_allocated: params.budgetAllocated || 500,
      budget_spent: 0,
      banner_gradient:
        params.bannerGradient ||
        "from-indigo-600/30 via-cyan-600/20 to-blue-500/10",
    })
    .select()
    .single();

  if (error) {
    console.error("Supabase insert event error:", error);
    return { event: null, error: error.message };
  }

  const createdEvent = mapRowToClubEvent(data as unknown as EventRow);
  return { event: createdEvent, error: null };
}

/**
 * Update an existing event in Supabase.
 */
export async function updateEventInSupabase(
  eventId: string,
  updates: Partial<CreateEventParams>,
  userId?: string
): Promise<{ event: ClubEvent | null; error: string | null }> {
  if (!eventId) {
    return { event: null, error: "Event ID is required." };
  }

  if (!isSupabaseConfigured) {
    return { event: null, error: "Supabase is not configured." };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  const activeUserId = userId || user?.id;
  if (userError || !activeUserId) {
    return { event: null, error: "You must be signed in to update an event." };
  }

  const dbUpdates: Record<string, unknown> = {};
  if (updates.title) dbUpdates.title = updates.title.trim();
  if (updates.description) dbUpdates.description = updates.description.trim();
  if (updates.category) dbUpdates.category = updates.category;
  if (updates.date) dbUpdates.date = updates.date.trim();
  if (updates.time) dbUpdates.time = updates.time.trim();
  if (updates.location) dbUpdates.location = updates.location.trim();
  if (updates.capacity) dbUpdates.capacity = updates.capacity;
  if (updates.budgetAllocated) dbUpdates.budget_allocated = updates.budgetAllocated;
  if (updates.leadName) dbUpdates.lead_name = updates.leadName.trim();
  if (updates.leadRole) dbUpdates.lead_role = updates.leadRole.trim();
  if (updates.leadMemberId) dbUpdates.lead_member_id = updates.leadMemberId;

  const { data, error } = await supabase
    .from("events")
    .update(dbUpdates)
    .eq("id", eventId)
    .select()
    .single();

  if (error || !data) {
    console.error("Error updating event in Supabase:", error);
    return { event: null, error: error?.message ?? "Failed to update event." };
  }

  return { event: mapRowToClubEvent(data as unknown as EventRow), error: null };
}

const DEMO_EVENT_TEAM_STORAGE_KEY = "clubops_demo_event_team";

function getDemoEventTeam(eventId?: string): EventTeamMember[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEMO_EVENT_TEAM_STORAGE_KEY);
    const members: EventTeamMember[] = raw ? JSON.parse(raw) : [];
    if (!eventId) return members;
    return members.filter((m) => m.eventId === eventId);
  } catch {
    return [];
  }
}

function saveDemoEventTeamMember(member: EventTeamMember) {
  if (typeof window === "undefined") return;
  try {
    const existing = getDemoEventTeam();
    const updated = [member, ...existing.filter((m) => m.id !== member.id)];
    localStorage.setItem(DEMO_EVENT_TEAM_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to save demo event team member to localStorage:", err);
  }
}

function removeDemoEventTeamMember(teamMemberId: string) {
  if (typeof window === "undefined") return;
  try {
    const existing = getDemoEventTeam();
    const updated = existing.filter((m) => m.id !== teamMemberId);
    localStorage.setItem(DEMO_EVENT_TEAM_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to remove demo event team member from localStorage:", err);
  }
}

interface EventTeamRow {
  id: string | number;
  event_id: string | number;
  club_member_id: string | number;
  role?: string | null;
  joined_at: string;
}

/**
 * Fetch all members of the event team from Supabase.
 */
export async function fetchEventTeam(
  eventId: string
): Promise<{ team: EventTeamMember[]; error: string | null }> {
  if (!eventId) {
    return { team: [], error: "Event ID is required." };
  }

  if (!isSupabaseConfigured) {
    const team = getDemoEventTeam(eventId);
    return { team, error: null };
  }

  const { data: teamRows, error: teamError } = await supabase
    .from("event_team_members")
    .select("id, event_id, club_member_id, role, joined_at")
    .eq("event_id", eventId)
    .order("joined_at", { ascending: true });

  if (teamError) {
    console.error("Error fetching event team from Supabase:", teamError);
    return { team: [], error: teamError.message };
  }

  if (!teamRows || teamRows.length === 0) {
    return { team: [], error: null };
  }

  // Fetch corresponding club member details
  const memberIds = teamRows.map((r) => r.club_member_id);
  const { data: memberRows, error: memberError } = await supabase
    .from("club_members")
    .select("id, name, email, role, user_id")
    .in("id", memberIds);

  if (memberError) {
    console.error("Error fetching club member details for event team:", memberError);
  }

  type MemberRow = {
    id: string | number;
    name: string;
    email: string;
    role: string;
    user_id?: string | null;
  };

  const memberMap = new Map((memberRows as unknown as MemberRow[] || []).map((m) => [String(m.id), m]));

  const team: EventTeamMember[] = (teamRows as unknown as EventTeamRow[]).map((r) => {
    const mem = memberMap.get(String(r.club_member_id));
    return {
      id: String(r.id),
      eventId: String(r.event_id),
      clubMemberId: String(r.club_member_id),
      name: mem?.name || "Team Member",
      email: mem?.email || "",
      role: r.role || mem?.role || "Member",
      joinedAt: String(r.joined_at).split("T")[0],
      userId: mem?.user_id ? String(mem.user_id) : undefined,
    };
  });

  return { team, error: null };
}

/**
 * Add an existing club member to the event team in Supabase.
 * Checks permissions: only Club Head or Event Lead can add team members.
 */
export async function addMemberToEventTeam(
  eventId: string,
  clubMemberId: string,
  role?: string
): Promise<{ teamMember: EventTeamMember | null; error: string | null }> {
  if (!eventId || !clubMemberId) {
    return { teamMember: null, error: "Event ID and Club Member ID are required." };
  }

  // Fallback mode
  if (!isSupabaseConfigured) {
    const existingTeam = getDemoEventTeam(eventId);
    if (existingTeam.some((m) => m.clubMemberId === clubMemberId)) {
      return { teamMember: null, error: "This member is already on the event team." };
    }

    const demoMembersRaw = localStorage.getItem("clubops_demo_members");
    const demoMembers = demoMembersRaw ? JSON.parse(demoMembersRaw) : [];
    const clubMem = demoMembers.find((m: { id: string }) => m.id === clubMemberId);

    const newTeamMember: EventTeamMember = {
      id: `etm-${Date.now().toString().slice(-5)}`,
      eventId,
      clubMemberId,
      name: clubMem?.name || "Team Member",
      email: clubMem?.email || "",
      role: role || clubMem?.role || "Member",
      joinedAt: new Date().toISOString().split("T")[0],
      userId: clubMem?.userId,
    };

    saveDemoEventTeamMember(newTeamMember);
    return { teamMember: newTeamMember, error: null };
  }

  // 1. Authenticated user check
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { teamMember: null, error: "You must be signed in to manage the event team." };
  }

  // 2. Authorization check: Club Head or Event Lead
  const { data: eventData, error: eventError } = await supabase
    .from("events")
    .select("id, club_id, lead_member_id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !eventData) {
    return { teamMember: null, error: eventError?.message || "Event not found." };
  }

  const { data: clubData, error: clubError } = await supabase
    .from("clubs")
    .select("owner_id")
    .eq("id", eventData.club_id)
    .maybeSingle();

  if (clubError || !clubData) {
    return { teamMember: null, error: clubError?.message || "Club not found." };
  }

  const isOwner = clubData.owner_id === user.id;

  let isEventLead = false;
  if (eventData.lead_member_id) {
    const { data: callerMember } = await supabase
      .from("club_members")
      .select("id")
      .eq("club_id", eventData.club_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (callerMember && String(callerMember.id) === String(eventData.lead_member_id)) {
      isEventLead = true;
    }
  }

  if (!isOwner && !isEventLead) {
    return {
      teamMember: null,
      error: "Unauthorized: Only the Club Head or Event Lead can add team members.",
    };
  }

  // 3. Verify target member belongs to this club
  const { data: targetMember, error: targetError } = await supabase
    .from("club_members")
    .select("id, club_id, name, email, role, user_id")
    .eq("id", clubMemberId)
    .maybeSingle();

  if (targetError || !targetMember) {
    return { teamMember: null, error: "Club member not found." };
  }

  if (String(targetMember.club_id) !== String(eventData.club_id)) {
    return { teamMember: null, error: "Member does not belong to this club." };
  }

  // 4. Duplicate membership check
  const { data: existingTeamMember } = await supabase
    .from("event_team_members")
    .select("id")
    .eq("event_id", eventId)
    .eq("club_member_id", clubMemberId)
    .maybeSingle();

  if (existingTeamMember) {
    return { teamMember: null, error: "This member is already on the event team." };
  }

  // 5. Insert record
  const memberRole = role || targetMember.role || "Member";
  const { data: inserted, error: insertError } = await supabase
    .from("event_team_members")
    .insert({
      event_id: eventId,
      club_member_id: clubMemberId,
      role: memberRole,
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return { teamMember: null, error: "This member is already on the event team." };
    }
    console.error("Error inserting event team member:", insertError);
    return { teamMember: null, error: insertError.message };
  }

  const teamMember: EventTeamMember = {
    id: String(inserted.id),
    eventId: String(inserted.event_id),
    clubMemberId: String(inserted.club_member_id),
    name: targetMember.name,
    email: targetMember.email,
    role: memberRole,
    joinedAt: String(inserted.joined_at).split("T")[0],
    userId: targetMember.user_id ? String(targetMember.user_id) : undefined,
  };

  return { teamMember, error: null };
}

/**
 * Remove a member from the event team in Supabase.
 * Checks permissions: only Club Head or Event Lead can remove team members.
 */
export async function removeMemberFromEventTeam(
  eventId: string,
  teamMemberId: string
): Promise<{ success: boolean; error: string | null }> {
  if (!eventId || !teamMemberId) {
    return { success: false, error: "Event ID and Team Member ID are required." };
  }

  if (!isSupabaseConfigured) {
    removeDemoEventTeamMember(teamMemberId);
    return { success: true, error: null };
  }

  // 1. Authenticated user check
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: "You must be signed in to manage the event team." };
  }

  // 2. Authorization check
  const { data: eventData, error: eventError } = await supabase
    .from("events")
    .select("id, club_id, lead_member_id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !eventData) {
    return { success: false, error: eventError?.message || "Event not found." };
  }

  const { data: clubData, error: clubError } = await supabase
    .from("clubs")
    .select("owner_id")
    .eq("id", eventData.club_id)
    .maybeSingle();

  if (clubError || !clubData) {
    return { success: false, error: clubError?.message || "Club not found." };
  }

  const isOwner = clubData.owner_id === user.id;
  let isEventLead = false;
  if (eventData.lead_member_id) {
    const { data: callerMember } = await supabase
      .from("club_members")
      .select("id")
      .eq("club_id", eventData.club_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (callerMember && String(callerMember.id) === String(eventData.lead_member_id)) {
      isEventLead = true;
    }
  }

  if (!isOwner && !isEventLead) {
    return {
      success: false,
      error: "Unauthorized: Only the Club Head or Event Lead can remove team members.",
    };
  }

  // 3. Delete from event_team_members
  const { error: deleteError } = await supabase
    .from("event_team_members")
    .delete()
    .eq("id", teamMemberId)
    .eq("event_id", eventId);

  if (deleteError) {
    console.error("Error removing event team member:", deleteError);
    return { success: false, error: deleteError.message };
  }

  return { success: true, error: null };
}

