import type { TaskItem, EventTeamMember } from "@/components/types";

export type WorkloadState = "Low" | "Medium" | "High" | "Overloaded";

/**
 * Centralized workload thresholds configuration as required by Step 4.16:
 * - Low: 0–2 active tasks
 * - Medium: 3–4 active tasks
 * - High: 5–6 active tasks
 * - Overloaded: 7+ active tasks
 */
export const WORKLOAD_THRESHOLDS = {
  LOW: { min: 0, max: 2, state: "Low" as const },
  MEDIUM: { min: 3, max: 4, state: "Medium" as const },
  HIGH: { min: 5, max: 6, state: "High" as const },
  OVERLOADED: { min: 7, state: "Overloaded" as const },
} as const;

export interface MemberWorkload {
  memberId: string;
  name: string;
  email: string;
  role: string;
  totalAssigned: number;
  activeCount: number;
  completedCount: number;
  overdueCount: number;
  highUrgentActiveCount: number;
  workloadState: WorkloadState;
}

/**
 * Maps an active task count to its defined WorkloadState.
 */
export function getWorkloadState(activeCount: number): WorkloadState {
  if (activeCount >= WORKLOAD_THRESHOLDS.OVERLOADED.min) {
    return "Overloaded";
  }
  if (activeCount >= WORKLOAD_THRESHOLDS.HIGH.min) {
    return "High";
  }
  if (activeCount >= WORKLOAD_THRESHOLDS.MEDIUM.min) {
    return "Medium";
  }
  return "Low";
}

/**
 * Checks if an active task's deadline has passed.
 */
export function isTaskOverdue(task: TaskItem, now: Date = new Date()): boolean {
  if (task.completed || task.status === "Done") return false;

  const dateStr = task.deadline || task.dueText;
  if (!dateStr) return false;

  const parsed = Date.parse(dateStr);
  if (isNaN(parsed)) return false;

  // Compare date timestamp to now
  return parsed < now.getTime();
}

/**
 * Calculates real-time workload for a specific event-team member based on real tasks.
 */
export function calculateMemberWorkload(
  member: EventTeamMember,
  eventTasks: TaskItem[],
  now: Date = new Date()
): MemberWorkload {
  const memberName = (member.name || "").trim().toLowerCase();

  // Match tasks by assigneeMemberId or assigneeName
  const assignedTasks = eventTasks.filter((t) => {
    if (t.assigneeMemberId && member.clubMemberId) {
      return t.assigneeMemberId === member.clubMemberId;
    }
    return t.assigneeName && t.assigneeName.trim().toLowerCase() === memberName;
  });

  const totalAssigned = assignedTasks.length;
  const completedCount = assignedTasks.filter(
    (t) => t.completed || t.status === "Done"
  ).length;

  const activeTasks = assignedTasks.filter(
    (t) => !t.completed && t.status !== "Done"
  );
  const activeCount = activeTasks.length;

  const overdueCount = activeTasks.filter((t) => isTaskOverdue(t, now)).length;
  const highUrgentActiveCount = activeTasks.filter(
    (t) => t.priority === "High" || t.priority === "Urgent"
  ).length;

  const workloadState = getWorkloadState(activeCount);

  return {
    memberId: member.id,
    name: member.name,
    email: member.email,
    role: member.role,
    totalAssigned,
    activeCount,
    completedCount,
    overdueCount,
    highUrgentActiveCount,
    workloadState,
  };
}

/**
 * Calculates real-time workloads for all members of an event team.
 */
export function calculateTeamWorkloads(
  teamMembers: EventTeamMember[],
  eventTasks: TaskItem[],
  now: Date = new Date()
): Map<string, MemberWorkload> {
  const map = new Map<string, MemberWorkload>();
  for (const member of teamMembers) {
    const workload = calculateMemberWorkload(member, eventTasks, now);
    map.set(member.id, workload);
  }
  return map;
}
