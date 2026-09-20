import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Club, ClubMember, ClubRole } from "@/components/types";
import { CLUB_ROLES } from "@/components/types";

export interface CreateClubParams {
  name: string;
  description?: string;
  code: string;
}

export interface JoinClubResult {
  success: boolean;
  club?: Club;
  member?: ClubMember;
  alreadyMember?: boolean;
  error?: string;
  message?: string;
}

const DEMO_CLUBS_STORAGE_KEY = "clubops_demo_clubs";
const DEMO_MEMBERS_STORAGE_KEY = "clubops_demo_members";

function getDemoClubs(ownerId?: string): Club[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEMO_CLUBS_STORAGE_KEY);
    const clubs: Club[] = raw ? JSON.parse(raw) : [];
    if (!ownerId) return clubs;

    // In demo mode, fetch clubs user owns OR has joined
    const membersRaw = localStorage.getItem(DEMO_MEMBERS_STORAGE_KEY);
    const members: ClubMember[] = membersRaw ? JSON.parse(membersRaw) : [];
    const joinedClubIds = new Set(members.filter((m) => m.id.includes(ownerId) || m.email.includes(ownerId)).map((m) => m.clubId));

    return clubs.filter((c) => !c.ownerId || c.ownerId === ownerId || joinedClubIds.has(c.id));
  } catch {
    return [];
  }
}

function getAllDemoClubs(): Club[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEMO_CLUBS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDemoClub(club: Club) {
  if (typeof window === "undefined") return;
  try {
    const existing = getAllDemoClubs();
    const updated = [club, ...existing.filter((c) => c.id !== club.id)];
    localStorage.setItem(DEMO_CLUBS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to save demo club to localStorage:", err);
  }
}

function getDemoMembers(clubId?: string): ClubMember[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEMO_MEMBERS_STORAGE_KEY);
    const members: ClubMember[] = raw ? JSON.parse(raw) : [];
    if (!clubId) return members;
    return members.filter((m) => m.clubId === clubId);
  } catch {
    return [];
  }
}

function saveDemoMember(member: ClubMember) {
  if (typeof window === "undefined") return;
  try {
    const existing = getDemoMembers();
    const updated = [member, ...existing.filter((m) => m.id !== member.id && !(m.clubId === member.clubId && m.email.toLowerCase() === member.email.toLowerCase()))];
    localStorage.setItem(DEMO_MEMBERS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to save demo member to localStorage:", err);
  }
}

/**
 * Generate a clean 3-letter prefix + 3 random digits unique club code
 */
export function generateClubCode(clubName: string, existingCodes: string[] = []): string {
  const cleaned = clubName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const prefix = cleaned.length >= 3 ? cleaned.slice(0, 3) : (cleaned + "CLB").slice(0, 3);
  let code = "";
  let attempts = 0;
  do {
    const randomNum = Math.floor(100 + Math.random() * 900);
    code = `${prefix}-${randomNum}`;
    attempts++;
  } while (existingCodes.includes(code) && attempts < 20);

  return code;
}

/**
 * Fetch clubs belonging specifically to the currently authenticated user from Supabase.
 * Retrieves both clubs the user owns and clubs the user has joined as a member.
 * Ensures clubs belonging to unrelated users are never fetched or exposed.
 */
export async function fetchUserClubs(userId?: string): Promise<{ clubs: Club[]; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { clubs: getDemoClubs(userId), error: null };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const activeUserId = userId || session?.user?.id;

  if (!session || !activeUserId) {
    return { clubs: [], error: null };
  }

  // 1. Fetch clubs owned by user
  const { data: ownedClubs, error: ownedError } = await supabase
    .from("clubs")
    .select("*")
    .eq("owner_id", activeUserId)
    .order("created_at", { ascending: false });

  if (ownedError) {
    const isPermissionError =
      ownedError.code === "42501" ||
      ownedError.message.toLowerCase().includes("permission denied");

    if (isPermissionError) {
      console.warn("Permission issue querying owned clubs, returning empty list:", ownedError.message);
      return { clubs: [], error: null };
    }

    console.error("Error fetching owned clubs from Supabase:", ownedError);
    return { clubs: [], error: ownedError.message };
  }

  // 2. Fetch clubs joined by user via club_members
  const { data: memberships, error: memberError } = await supabase
    .from("club_members")
    .select("club_id")
    .eq("user_id", activeUserId);

  if (memberError) {
    console.error("Error fetching club memberships from Supabase:", memberError);
  }

  const ownedIds = new Set((ownedClubs || []).map((c) => c.id));
  const memberClubIds = (memberships || [])
    .map((m) => m.club_id)
    .filter((id) => !ownedIds.has(id));

  type ClubRow = {
    id: string | number;
    name: string;
    code: string;
    description?: string | null;
    created_at: string;
    owner_id?: string | null;
  };

  let joinedClubs: ClubRow[] = [];
  if (memberClubIds.length > 0) {
    const { data: joinedData, error: joinedError } = await supabase
      .from("clubs")
      .select("*")
      .in("id", memberClubIds);

    if (!joinedError && joinedData) {
      joinedClubs = joinedData as unknown as ClubRow[];
    }
  }

  const allRows: ClubRow[] = [
    ...((ownedClubs as unknown as ClubRow[]) || []),
    ...joinedClubs,
  ];

  const clubs: Club[] = allRows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    code: String(row.code),
    description: row.description ? String(row.description) : undefined,
    createdAt: String(row.created_at),
    ownerId: row.owner_id ? String(row.owner_id) : undefined,
  }));

  return { clubs, error: null };
}

/**
 * Create a new club in Supabase.
 * The authenticated user's ID is assigned as owner_id.
 */
export async function createClubInSupabase(
  params: CreateClubParams,
  userId?: string
): Promise<{ club: Club | null; error: string | null }> {
  if (!params.name.trim()) {
    return { club: null, error: "Club name is required." };
  }

  // Hidden test trigger for verifying UI error states in development
  if (params.name.includes("[simulate-error]")) {
    return {
      club: null,
      error: "Database error: relation 'public.clubs' does not exist. Please run migration 20260919000000_create_clubs_table.sql",
    };
  }

  if (!isSupabaseConfigured) {
    // Development fallback when .env.local credentials have not been configured yet
    const demoClub: Club = {
      id: `club-${Date.now().toString().slice(-5)}`,
      name: params.name.trim(),
      code: params.code.trim(),
      description: params.description?.trim() || undefined,
      createdAt: new Date().toISOString(),
      ownerId: userId || "demo-user",
    };
    saveDemoClub(demoClub);

    // Save creator as demo member
    const demoMember: ClubMember = {
      id: `mem-${Date.now().toString().slice(-4)}`,
      name: "Club Head",
      email: "owner@campus.edu",
      clubId: demoClub.id,
      role: "Technical",
      joinedAt: new Date().toISOString().split("T")[0],
      userId: userId || "demo-user",
    };
    saveDemoMember(demoMember);

    return { club: demoClub, error: null };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  const activeUserId = userId || user?.id;

  if (userError || !activeUserId) {
    return { club: null, error: "You must be signed in to create a club." };
  }

  const { data, error } = await supabase
    .from("clubs")
    .insert({
      name: params.name.trim(),
      code: params.code.trim(),
      description: params.description?.trim() || null,
      owner_id: activeUserId,
    })
    .select()
    .single();

  if (error) {
    console.error("Supabase insert club error:", error);
    return { club: null, error: error.message };
  }

  // Also insert the creator as the first member of the club
  const ownerEmail = user?.email || "owner@campus.edu";
  const ownerName =
    ownerEmail.split("@")[0].split(/[._-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ") ||
    "Club Head";

  await supabase
    .from("club_members")
    .insert({
      club_id: data.id,
      user_id: activeUserId,
      name: ownerName,
      email: ownerEmail,
      role: "Technical",
    });

  const club: Club = {
    id: String(data.id),
    name: String(data.name),
    code: String(data.code),
    description: data.description ? String(data.description) : undefined,
    createdAt: String(data.created_at),
    ownerId: data.owner_id ? String(data.owner_id) : undefined,
  };

  return { club, error: null };
}

/**
 * Join an existing club using its Club Code.
 * - Searches Supabase for a club with the exact code
 * - Validates whether the authenticated user is already a member
 * - Inserts a record into public.club_members with default role 'Registration'
 */
export async function joinClubByCode(
  clubCode: string,
  userId?: string,
  userEmail?: string,
  userName?: string,
  role?: string
): Promise<JoinClubResult> {
  const trimmedCode = clubCode.trim().toUpperCase();
  if (!trimmedCode) {
    return { success: false, error: "Please enter a club code." };
  }

  const memberRole = (role?.trim() || "Registration") as ClubRole;

  // Development fallback when .env.local is not configured
  if (!isSupabaseConfigured) {
    const allClubs = getAllDemoClubs();
    const matchedClub = allClubs.find(
      (c) => c.code.trim().toUpperCase() === trimmedCode
    );

    if (!matchedClub) {
      return {
        success: false,
        error: `No club found with code "${trimmedCode}". Please verify the code with your club lead.`,
      };
    }

    const activeUserId = userId || "demo-user";
    const activeUserEmail = userEmail || "member@example.com";

    // Check if user is owner of the club
    if (matchedClub.ownerId === activeUserId) {
      return {
        success: true,
        alreadyMember: true,
        club: matchedClub,
        message: `You are the owner of ${matchedClub.name}.`,
      };
    }

    // Check existing demo membership
    const demoMembers = getDemoMembers(matchedClub.id);
    const existing = demoMembers.find(
      (m) =>
        m.email.toLowerCase() === activeUserEmail.toLowerCase() ||
        m.id.includes(activeUserId)
    );

    if (existing) {
      return {
        success: true,
        alreadyMember: true,
        club: matchedClub,
        member: existing,
        message: `You are already a member of ${matchedClub.name}.`,
      };
    }

    // Create new demo member
    const newDemoMember: ClubMember = {
      id: `mem-${Date.now().toString().slice(-4)}`,
      name: userName || activeUserEmail.split("@")[0] || "Member",
      email: activeUserEmail,
      clubId: matchedClub.id,
      role: memberRole,
      joinedAt: new Date().toISOString().split("T")[0],
    };
    saveDemoMember(newDemoMember);

    return {
      success: true,
      club: matchedClub,
      member: newDemoMember,
    };
  }

  // Real Supabase implementation
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  const activeUser = user;
  if (userError || !activeUser) {
    return { success: false, error: "You must be signed in to join a club." };
  }

  // 1. Search for club with exact Club Code
  const { data: clubData, error: clubError } = await supabase
    .from("clubs")
    .select("*")
    .eq("code", trimmedCode)
    .maybeSingle();

  if (clubError) {
    console.error("Error searching for club by code:", clubError);
    return { success: false, error: clubError.message };
  }

  if (!clubData) {
    return {
      success: false,
      error: `No club found with code "${trimmedCode}". Please verify the code with your club lead.`,
    };
  }

  const matchedClub: Club = {
    id: String(clubData.id),
    name: String(clubData.name),
    code: String(clubData.code),
    description: clubData.description ? String(clubData.description) : undefined,
    createdAt: String(clubData.created_at),
    ownerId: clubData.owner_id ? String(clubData.owner_id) : undefined,
  };

  // 2. Check if user is the club owner
  if (matchedClub.ownerId === activeUser.id) {
    return {
      success: true,
      alreadyMember: true,
      club: matchedClub,
      message: `You are the owner of ${matchedClub.name}.`,
    };
  }

  // 3. Check if user is already a member in club_members
  const { data: existingMember, error: memberCheckError } = await supabase
    .from("club_members")
    .select("*")
    .eq("club_id", matchedClub.id)
    .eq("user_id", activeUser.id)
    .maybeSingle();

  if (memberCheckError) {
    console.error("Error checking existing membership:", memberCheckError);
    return { success: false, error: memberCheckError.message };
  }

  if (existingMember) {
    const member: ClubMember = {
      id: String(existingMember.id),
      name: String(existingMember.name),
      email: String(existingMember.email),
      clubId: String(existingMember.club_id),
      role: (existingMember.role as ClubRole) || "Registration",
      joinedAt: String(existingMember.joined_at).split("T")[0],
    };
    return {
      success: true,
      alreadyMember: true,
      club: matchedClub,
      member,
      message: `You are already a member of ${matchedClub.name}.`,
    };
  }

  // 4. Create the member record in Supabase with user selected role
  const email = activeUser.email || userEmail || "member@example.com";
  const name =
    userName ||
    email.split("@")[0].split(/[._-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ") ||
    "Member";

  const { data: newMemberData, error: insertError } = await supabase
    .from("club_members")
    .insert({
      club_id: matchedClub.id,
      user_id: activeUser.id,
      name,
      email,
      role: memberRole,
    })
    .select()
    .single();

  if (insertError) {
    // Check for duplicate constraint violation
    if (insertError.code === "23505") {
      return {
        success: true,
        alreadyMember: true,
        club: matchedClub,
        message: `You are already a member of ${matchedClub.name}.`,
      };
    }
    console.error("Error joining club in Supabase:", insertError);
    return { success: false, error: insertError.message };
  }

  const newMember: ClubMember = {
    id: String(newMemberData.id),
    name: String(newMemberData.name),
    email: String(newMemberData.email),
    clubId: String(newMemberData.club_id),
    role: (newMemberData.role as ClubRole) || "Registration",
    joinedAt: String(newMemberData.joined_at).split("T")[0],
  };

  return {
    success: true,
    club: matchedClub,
    member: newMember,
  };
}

/**
 * Fetch all members for a specific club.
 * Ensures the club creator/owner is included.
 */
export async function fetchClubMembers(
  clubId: string,
  clubOwnerId?: string
): Promise<{ members: ClubMember[]; error: string | null }> {
  if (!isSupabaseConfigured) {
    const demoMembers = getDemoMembers(clubId);
    return { members: demoMembers, error: null };
  }

  const { data, error } = await supabase
    .from("club_members")
    .select("*")
    .eq("club_id", clubId)
    .order("joined_at", { ascending: true });

  if (error) {
    console.error("Error fetching club members from Supabase:", error);
    return { members: [], error: error.message };
  }

  const memberRows: ClubMember[] = (data || []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    clubId: String(row.club_id),
    role: (row.role as ClubRole) || "Registration",
    joinedAt: String(row.joined_at).split("T")[0],
    userId: row.user_id ? String(row.user_id) : undefined,
  }));

  // If the club owner is not yet in club_members, ensure owner is added
  if (clubOwnerId && !memberRows.some((m) => m.userId === clubOwnerId)) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && user.id === clubOwnerId) {
      const ownerEmail = user.email || "owner@campus.edu";
      const ownerName =
        ownerEmail.split("@")[0].split(/[._-]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ") ||
        "Club Head";

      const { data: ownerRow } = await supabase
        .from("club_members")
        .insert({
          club_id: clubId,
          user_id: user.id,
          name: ownerName,
          email: ownerEmail,
          role: "Technical",
        })
        .select()
        .single();

      if (ownerRow) {
        memberRows.unshift({
          id: String(ownerRow.id),
          name: String(ownerRow.name),
          email: String(ownerRow.email),
          clubId: String(ownerRow.club_id),
          role: (ownerRow.role as ClubRole) || "Technical",
          joinedAt: String(ownerRow.joined_at).split("T")[0],
          userId: String(ownerRow.user_id),
        });
      }
    }
  }

  return { members: memberRows, error: null };
}

/**
 * Update a member's role in Supabase.
 * Strictly checks that the caller is the authenticated Club Head.
 */
export async function updateMemberRoleInSupabase(
  clubId: string,
  memberId: string,
  newRole: ClubRole
): Promise<{ success: boolean; error?: string }> {
  // 1. Verify role is one of the allowed 6 roles
  if (!CLUB_ROLES.includes(newRole)) {
    return { success: false, error: `Invalid role: ${newRole}` };
  }

  // Development fallback when .env.local is not configured
  if (!isSupabaseConfigured) {
    const members = getDemoMembers();
    const target = members.find((m) => m.id === memberId && m.clubId === clubId);
    if (!target) {
      return { success: false, error: "Member not found." };
    }
    target.role = newRole;
    saveDemoMember(target);
    return { success: true };
  }

  // 2. Authenticated user check
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, error: "You must be signed in to manage member roles." };
  }

  // 3. Security: Check that the authenticated user is the Club Head (owner) of the club
  const { data: clubData, error: clubCheckError } = await supabase
    .from("clubs")
    .select("owner_id")
    .eq("id", clubId)
    .maybeSingle();

  if (clubCheckError) {
    return { success: false, error: clubCheckError.message };
  }

  if (!clubData || clubData.owner_id !== user.id) {
    return {
      success: false,
      error: "Unauthorized: Only the Club Head can change member roles.",
    };
  }

  // 4. Update in Supabase
  const { error: updateError } = await supabase
    .from("club_members")
    .update({ role: newRole })
    .eq("id", memberId)
    .eq("club_id", clubId);

  if (updateError) {
    console.error("Error updating member role in Supabase:", updateError);
    return { success: false, error: updateError.message };
  }

  return { success: true };
}
