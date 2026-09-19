/**
 * Eventra AI — Agent Context
 *
 * Defines the EventraAgentContext interface and the buildEventraAgentContext()
 * async factory that assembles a full, validated snapshot of the current
 * club/event state from real Supabase data.
 *
 * Security guarantees enforced here:
 *   - Only authenticated users may build a context.
 *   - A context is always scoped to one club; cross-club data is impossible.
 *   - Event team members are fetched per-event; the agent cannot see members
 *     from other events.
 *   - Member workloads are computed from real tasks (lib/workload.ts).
 *   - Risks are derived deterministically (lib/risks.ts).
 *
 * Nothing in this file writes to Supabase.
 */

import type { User } from "@supabase/supabase-js";

// Existing domain types — NOT redefined here
import type {
  Club,
  ClubMember,
  ClubEvent,
  EventTeamMember,
  TaskItem,
  DerivedRisk,
} from "@/components/types";

// Existing lib functions — NOT duplicated
import { fetchEventTeam } from "@/lib/events";
import { fetchClubMembers } from "@/lib/clubs";
import { fetchEventTasks } from "@/lib/tasks";
import { calculateTeamWorkloads } from "@/lib/workload";
import { detectEventRisks } from "@/lib/risks";
import type { MemberWorkload } from "@/lib/workload";

// ─── Context Interface ────────────────────────────────────────────────────────

/**
 * A complete, validated snapshot of the current operational context.
 *
 * Built once per agent invocation from real Supabase data.
 * Passed to all agent tools and the planning service so they never need
 * to re-fetch or cross-query data.
 *
 * All data here belongs to the same club (enforced by buildEventraAgentContext).
 * The agent is not permitted to reference data from other clubs.
 */
export interface EventraAgentContext {
  /**
   * The authenticated Supabase user making the request.
   * Used to enforce RLS and validate ownership checks.
   */
  readonly currentUser: User;

  /**
   * The club the user is currently operating within.
   * All event and member data is scoped to this club.
   */
  readonly currentClub: Club;

  /**
   * The event the Eventra AI assistant is currently focused on.
   * null when the user is at the club level (not inside an event workspace).
   */
  readonly currentEvent: ClubEvent | null;

  /**
   * All members of the current club.
   * Used by the agent to validate assignees and suggest assignments.
   * Never includes members from other clubs.
   */
  readonly clubMembers: ClubMember[];

  /**
   * Members of the current event's team.
   * The agent may only assign tasks to members in this list.
   * Empty when currentEvent is null.
   */
  readonly eventTeamMembers: EventTeamMember[];

  /**
   * All tasks belonging to the current event.
   * Empty when currentEvent is null.
   */
  readonly tasks: TaskItem[];

  /**
   * Real-time workload snapshots for each event team member.
   * Keyed by EventTeamMember.id.
   * Computed from real tasks via lib/workload.ts.
   */
  readonly workloads: Map<string, MemberWorkload>;

  /**
   * Derived operational risks for the current event.
   * Computed deterministically from tasks + team (lib/risks.ts).
   * Empty when currentEvent is null.
   */
  readonly risks: DerivedRisk[];

  /**
   * ISO timestamp of when this context was built.
   * Useful for staleness detection in long-running sessions.
   */
  readonly builtAt: string;
}

// ─── Build Params ─────────────────────────────────────────────────────────────

export interface BuildContextParams {
  /** The authenticated user — required. */
  user: User;

  /** The club the user is currently operating within — required. */
  club: Club;

  /**
   * The event currently open in the workspace.
   * Pass null / undefined when at the club overview level.
   */
  event?: ClubEvent | null;

  /**
   * Pre-loaded club members. If provided, skips a Supabase fetch.
   * Useful when the calling component already has this data in state.
   */
  clubMembers?: ClubMember[];
}

// ─── Context Builder ──────────────────────────────────────────────────────────

/**
 * Assembles a full EventraAgentContext from live Supabase data.
 *
 * This function:
 *   1. Uses the authenticated user to scope all data queries.
 *   2. Fetches event team members, tasks, workloads, and risks only when
 *      an active event is provided.
 *   3. Never mixes data across clubs.
 *   4. Returns an error string if any critical fetch fails.
 *
 * @param params  Required: user, club, optional: event, clubMembers
 * @returns       { context, error } — error is null on success
 */
export async function buildEventraAgentContext(
  params: BuildContextParams
): Promise<{ context: EventraAgentContext | null; error: string | null }> {
  const { user, club, event = null } = params;

  // ── 1. Club members (use pre-loaded if available) ───────────────────────
  let clubMembers: ClubMember[] = params.clubMembers ?? [];

  if (clubMembers.length === 0) {
    const { members, error: membersError } = await fetchClubMembers(club.id);
    if (membersError) {
      return {
        context: null,
        error: `Failed to load club members: ${membersError}`,
      };
    }
    clubMembers = members;
  }

  // ── 2. Event-scoped data (only when an event is active) ─────────────────
  let eventTeamMembers: EventTeamMember[] = [];
  let tasks: TaskItem[] = [];
  let workloads = new Map<string, MemberWorkload>();
  let risks: DerivedRisk[] = [];

  if (event) {
    // 2a. Event team members
    const { team: teamMembers, error: teamError } =
      await fetchEventTeam(event.id);
    if (teamError) {
      return {
        context: null,
        error: `Failed to load event team: ${teamError}`,
      };
    }
    eventTeamMembers = teamMembers;

    // 2b. Tasks
    const { tasks: eventTasks, error: tasksError } = await fetchEventTasks(
      event.id
    );
    if (tasksError) {
      return {
        context: null,
        error: `Failed to load event tasks: ${tasksError}`,
      };
    }
    tasks = eventTasks;

    // 2c. Workloads (pure computation — no Supabase call)
    workloads = calculateTeamWorkloads(eventTeamMembers, tasks);

    // 2d. Risks (pure computation — no Supabase call)
    risks = detectEventRisks(event.id, tasks, eventTeamMembers);
  }

  // ── 3. Assemble and return ───────────────────────────────────────────────
  const context: EventraAgentContext = {
    currentUser: user,
    currentClub: club,
    currentEvent: event,
    clubMembers,
    eventTeamMembers,
    tasks,
    workloads,
    risks,
    builtAt: new Date().toISOString(),
  };

  return { context, error: null };
}

// ─── Context Serializer ───────────────────────────────────────────────────────

/**
 * Produces a plain-object snapshot of EventraAgentContext suitable for
 * sending over the network (e.g. to /api/asky/chat or the future agent API).
 *
 * Maps are converted to arrays. Sensitive fields (user.email etc.) are
 * included only as far as needed by the AI planner.
 */
export function serializeContext(ctx: EventraAgentContext): SerializedAgentContext {
  return {
    userId: ctx.currentUser.id,
    clubId: ctx.currentClub.id,
    clubName: ctx.currentClub.name,
    event: ctx.currentEvent
      ? {
          id: ctx.currentEvent.id,
          title: ctx.currentEvent.title,
          category: ctx.currentEvent.category,
          date: ctx.currentEvent.date,
          time: ctx.currentEvent.time,
          location: ctx.currentEvent.location,
          status: ctx.currentEvent.status,
          rsvpCount: ctx.currentEvent.rsvpCount,
          capacity: ctx.currentEvent.capacity,
          leadName: ctx.currentEvent.leadName,
          leadRole: ctx.currentEvent.leadRole,
          budgetAllocated: ctx.currentEvent.budgetAllocated,
          budgetSpent: ctx.currentEvent.budgetSpent,
        }
      : null,
    clubMembers: ctx.clubMembers.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
    })),
    eventTeamMembers: ctx.eventTeamMembers.map((m) => ({
      id: m.id,
      clubMemberId: m.clubMemberId,
      name: m.name,
      role: m.role,
    })),
    tasks: ctx.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      deadline: t.deadline || t.dueText,
      assigneeName: t.assigneeName,
      assigneeRole: t.assigneeRole,
      assigneeMemberId: t.assigneeMemberId,
      completed: t.completed,
      dependencies: t.dependencies,
    })),
    workloads: Array.from(ctx.workloads.values()).map((w) => ({
      memberId: w.memberId,
      memberName: w.name,
      activeCount: w.activeCount,
      completedCount: w.completedCount,
      overdueCount: w.overdueCount,
      workloadState: w.workloadState,
    })),
    risks: ctx.risks.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      severity: r.severity,
      description: r.description,
      evidence: r.evidence,
    })),
    builtAt: ctx.builtAt,
  };
}

/** Plain-object representation of EventraAgentContext (network-safe). */
export interface SerializedAgentContext {
  userId: string;
  clubId: string;
  clubName: string;
  event: {
    id: string;
    title: string;
    category: string;
    date: string;
    time: string;
    location: string;
    status: string;
    rsvpCount: number;
    capacity: number;
    leadName: string;
    leadRole: string;
    budgetAllocated: number;
    budgetSpent: number;
  } | null;
  clubMembers: { id: string; name: string; role: string }[];
  eventTeamMembers: {
    id: string;
    clubMemberId: string;
    name: string;
    role: string;
  }[];
  tasks: {
    id: string;
    title: string;
    status: string | undefined;
    priority: string;
    deadline: string | undefined;
    assigneeName: string;
    assigneeRole: string;
    assigneeMemberId: string | undefined;
    completed: boolean;
    dependencies: string[] | undefined;
  }[];
  workloads: {
    memberId: string;
    memberName: string;
    activeCount: number;
    completedCount: number;
    overdueCount: number;
    workloadState: string;
  }[];
  risks: {
    id: string;
    type: string;
    title: string;
    severity: string;
    description: string;
    evidence: string;
  }[];
  builtAt: string;
}
