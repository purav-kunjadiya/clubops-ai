/**
 * Eventra AI — Tool Interface Layer
 *
 * This module defines all agent tools in two categories:
 *
 *   READ TOOLS  — implemented now; safe to call any time; never write to DB.
 *   WRITE TOOLS — interface stubs only; execution is GATED behind an
 *                 explicit human approval check (action.status === "approved").
 *
 * ─── Security contract ──────────────────────────────────────────────────────
 *   1. Write tools MUST NOT execute if action.status !== "approved".
 *   2. Write tools validate assignees against the live event team before
 *      calling any Supabase mutation.
 *   3. Write tools validate that all referenced IDs belong to the correct
 *      club/event — cross-club mutations are impossible by design.
 *   4. Write tools rely on the existing functions in lib/tasks.ts,
 *      lib/events.ts, etc., which already enforce RLS and auth session checks.
 *   5. No fake/mock data is created or returned.
 * ────────────────────────────────────────────────────────────────────────────
 */

// Existing domain types — NOT redefined
import type {
  ClubEvent,
  EventTeamMember,
  TaskItem,
  DerivedRisk,
} from "@/components/types";

// Existing lib functions — NOT duplicated
import { fetchClubEvents, fetchEventTeam } from "@/lib/events";
import { fetchEventTasks } from "@/lib/tasks";
import {
  calculateTeamWorkloads,
  type MemberWorkload,
} from "@/lib/workload";
import { detectEventRisks } from "@/lib/risks";
import {
  createEventInSupabase,
  updateEventInSupabase,
  type CreateEventParams,
} from "@/lib/events";
import {
  createEventTaskInSupabase,
  updateEventTaskStatusInSupabase,
  updateEventTaskAssigneeInSupabase,
  updateEventTaskDependenciesInSupabase,
  type CreateTaskParams,
} from "@/lib/tasks";

// Agent types
import type { AgentAction, AgentToolResult } from "./types";

// ─── Approval Guard ───────────────────────────────────────────────────────────

/**
 * Hard enforcement point: any write tool MUST call this before touching Supabase.
 * Returns a standard error result if the action is not approved.
 */
function requireApproval<T = unknown>(action: AgentAction): AgentToolResult<T> | null {
  if (action.status !== "approved") {
    return {
      success: false,
      error: `Action "${action.id}" (${action.type}) cannot be executed: status is "${action.status}", expected "approved". The user must approve this action before it can run.`,
    } as AgentToolResult<T>;
  }
  return null; // Null means approval check passed — proceed with execution
}

// ═══════════════════════════════════════════════════════════════════════════
// READ TOOLS — implemented; never write to Supabase
// ═══════════════════════════════════════════════════════════════════════════

/**
 * READ: Fetch all events for a club.
 * Wraps lib/events.fetchClubEvents — enforces club isolation.
 */
export async function tool_get_event_context(
  clubId: string
): Promise<AgentToolResult<ClubEvent[]>> {
  if (!clubId) {
    return { success: false, error: "clubId is required." };
  }
  const { events, error } = await fetchClubEvents(clubId);
  if (error) {
    return { success: false, error };
  }
  return { success: true, data: events };
}

/**
 * READ: Fetch the event team for a specific event.
 * Wraps lib/events.fetchEventTeam — scoped to a single event.
 */
export async function tool_get_event_team(
  eventId: string
): Promise<AgentToolResult<EventTeamMember[]>> {
  if (!eventId) {
    return { success: false, error: "eventId is required." };
  }
  const { team, error } = await fetchEventTeam(eventId);
  if (error) {
    return { success: false, error };
  }
  return { success: true, data: team };
}

/**
 * READ: Fetch all tasks for a specific event.
 * Wraps lib/tasks.fetchEventTasks — scoped to a single event.
 */
export async function tool_get_tasks(
  eventId: string
): Promise<AgentToolResult<TaskItem[]>> {
  if (!eventId) {
    return { success: false, error: "eventId is required." };
  }
  const { tasks, error } = await fetchEventTasks(eventId);
  if (error) {
    return { success: false, error };
  }
  return { success: true, data: tasks };
}

/**
 * READ: Compute real-time workloads for all members of an event team.
 * Wraps lib/workload.calculateTeamWorkloads — pure computation, no DB call.
 */
export function tool_get_member_workload(
  eventTeamMembers: EventTeamMember[],
  tasks: TaskItem[]
): AgentToolResult<Map<string, MemberWorkload>> {
  const workloads = calculateTeamWorkloads(eventTeamMembers, tasks);
  return { success: true, data: workloads };
}

/**
 * READ: Derive operational risks for the current event.
 * Wraps lib/risks.detectEventRisks — pure computation, no DB call.
 */
export function tool_get_risks(
  eventId: string,
  tasks: TaskItem[],
  teamMembers: EventTeamMember[]
): AgentToolResult<DerivedRisk[]> {
  if (!eventId) {
    return { success: false, error: "eventId is required." };
  }
  const risks = detectEventRisks(eventId, tasks, teamMembers);
  return { success: true, data: risks };
}

// ═══════════════════════════════════════════════════════════════════════════
// WRITE TOOLS — approval-gated; stubs ready for Step 5.2 Gemini integration
// ═══════════════════════════════════════════════════════════════════════════

/**
 * WRITE (gated): Create a new event in Supabase.
 *
 * action.payload must match CreateEventParams shape:
 *   { clubId, title, category, date, time, location, capacity,
 *     budgetAllocated, leadName, leadRole, leadMemberId }
 *
 * Will NOT execute unless action.status === "approved".
 */
export async function tool_create_event(
  action: AgentAction,
  userId?: string
): Promise<AgentToolResult<ClubEvent>> {
  const blocked = requireApproval(action);
  if (blocked) return blocked as AgentToolResult<ClubEvent>;

  const p = action.payload as Partial<CreateEventParams>;

  if (!p.clubId || !p.title) {
    return {
      success: false,
      error: "create_event requires clubId and title in action.payload.",
    };
  }

  const { event, error } = await createEventInSupabase(
    p as CreateEventParams,
    userId
  );

  if (error || !event) {
    return { success: false, error: error ?? "Unknown error creating event." };
  }

  return { success: true, data: event };
}

/**
 * WRITE (gated): Update a field on an existing event.
 *
 * action.payload: { eventId, field, value }
 *
 * Stub — update function will be wired to lib/events.updateEventInSupabase
 * in Step 5.2. Returns a "not implemented" error to surface the gap clearly.
 *
 * Will NOT execute unless action.status === "approved".
 */
export async function tool_update_event(
  action: AgentAction,
  userId?: string
): Promise<AgentToolResult<ClubEvent>> {
  const blocked = requireApproval(action);
  if (blocked) return blocked as AgentToolResult<ClubEvent>;

  const p = action.payload as {
    eventId?: string;
    field?: string;
    value?: unknown;
    updates?: Record<string, unknown>;
  };

  if (!p.eventId) {
    return {
      success: false,
      error: "update_event requires eventId in action.payload.",
    };
  }

  const updateObject: Record<string, unknown> = p.updates ? { ...p.updates } : {};
  if (p.field && p.value !== undefined) {
    updateObject[p.field] = p.value;
  }

  const { event, error } = await updateEventInSupabase(
    p.eventId,
    updateObject as Partial<CreateEventParams>,
    userId
  );

  if (error || !event) {
    return { success: false, error: error ?? "Unknown error updating event." };
  }

  return { success: true, data: event };
}

/**
 * WRITE (gated): Create a task for the current event.
 *
 * action.payload must match CreateTaskParams:
 *   { clubId, eventId, title, eventTag, priority, dueText, deadline,
 *     assigneeName, assigneeRole, assigneeMemberId, status, dependencies }
 *
 * Security: validates assigneeMemberId is an event team member (enforced
 * by createEventTaskInSupabase which queries event_team_members).
 *
 * Will NOT execute unless action.status === "approved".
 */
export async function tool_create_task(
  action: AgentAction,
  existingTasks: TaskItem[],
  userId?: string
): Promise<AgentToolResult<TaskItem>> {
  const blocked = requireApproval(action);
  if (blocked) return blocked as AgentToolResult<TaskItem>;

  const p = action.payload as Partial<CreateTaskParams>;

  if (!p.eventId || !p.title || !p.clubId) {
    return {
      success: false,
      error: "create_task requires clubId, eventId, and title in action.payload.",
    };
  }

  const { task, error } = await createEventTaskInSupabase(
    p as CreateTaskParams,
    userId,
    existingTasks
  );

  if (error || !task) {
    return { success: false, error: error ?? "Unknown error creating task." };
  }

  return { success: true, data: task };
}

/**
 * WRITE (gated): Update the status of an existing task.
 *
 * action.payload: { taskId, newStatus }
 *
 * Will NOT execute unless action.status === "approved".
 */
export async function tool_update_task(
  action: AgentAction
): Promise<AgentToolResult<{ taskId: string; newStatus: string }>> {
  const blocked = requireApproval<{ taskId: string; newStatus: string }>(action);
  if (blocked) return blocked;

  const p = action.payload as { taskId?: string; newStatus?: string };

  if (!p.taskId || !p.newStatus) {
    return {
      success: false,
      error: "update_task requires taskId and newStatus in action.payload.",
    };
  }

  const { success, error } = await updateEventTaskStatusInSupabase(
    p.taskId,
    p.newStatus as import("@/components/types").TaskStatus
  );

  if (!success) {
    return { success: false, error: error ?? "Unknown error updating task." };
  }

  return { success: true, data: { taskId: p.taskId, newStatus: p.newStatus } };
}

/**
 * WRITE (gated): Assign a task to an event team member.
 *
 * action.payload: { taskId, eventId, memberId, memberName, memberRole }
 *
 * Security: updateEventTaskAssigneeInSupabase validates that memberId
 * belongs to the event team before updating the row.
 *
 * Will NOT execute unless action.status === "approved".
 */
export async function tool_assign_task(
  action: AgentAction
): Promise<AgentToolResult<{ taskId: string; assignedTo: string }>> {
  const blocked = requireApproval<{ taskId: string; assignedTo: string }>(action);
  if (blocked) return blocked;

  const p = action.payload as {
    taskId?: string;
    eventId?: string;
    memberId?: string;
    memberName?: string;
    memberRole?: string;
  };

  if (!p.taskId || !p.eventId) {
    return {
      success: false,
      error: "assign_task requires taskId and eventId in action.payload.",
    };
  }

  const { success, error } = await updateEventTaskAssigneeInSupabase(
    p.taskId,
    p.eventId,
    {
      name: p.memberName,
      role: p.memberRole,
      memberId: p.memberId,
    }
  );

  if (!success) {
    return { success: false, error: error ?? "Unknown error assigning task." };
  }

  return {
    success: true,
    data: { taskId: p.taskId, assignedTo: p.memberName ?? "Unassigned" },
  };
}

/**
 * WRITE (gated): Add a prerequisite dependency between two tasks.
 *
 * action.payload: { taskId, eventId, dependencyIds, existingTasks }
 *
 * Security: updateEventTaskDependenciesInSupabase validates same-event
 * membership and runs cycle detection before writing.
 *
 * Will NOT execute unless action.status === "approved".
 */
export async function tool_create_dependency(
  action: AgentAction
): Promise<AgentToolResult<{ taskId: string; dependencies: string[] }>> {
  const blocked = requireApproval<{ taskId: string; dependencies: string[] }>(action);
  if (blocked) return blocked;

  const p = action.payload as {
    taskId?: string;
    eventId?: string;
    dependencyIds?: string[];
    existingTasks?: TaskItem[];
  };

  if (!p.taskId || !p.eventId || !p.dependencyIds) {
    return {
      success: false,
      error:
        "create_dependency requires taskId, eventId, and dependencyIds in action.payload.",
    };
  }

  const { success, cleanDependencies, error } =
    await updateEventTaskDependenciesInSupabase(
      p.taskId,
      p.dependencyIds,
      p.eventId,
      p.existingTasks ?? []
    );

  if (!success) {
    return {
      success: false,
      error: error ?? "Unknown error creating dependency.",
    };
  }

  return {
    success: true,
    data: { taskId: p.taskId, dependencies: cleanDependencies },
  };
}
