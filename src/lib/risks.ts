import type {
  TaskItem,
  EventTeamMember,
  DerivedRisk,
  RiskType,
  RiskSeverity,
} from "@/components/types";
import { getTaskDependencyState } from "@/lib/tasks";
import { calculateTeamWorkloads } from "@/lib/workload";
import { parseDateTimestamp } from "@/lib/date-utils";

/**
 * Parses deadline string into milliseconds timestamp, returns null if invalid.
 */
function parseDateMs(dateStr?: string | null): number | null {
  return parseDateTimestamp(dateStr);
}

/**
 * Formats a duration in milliseconds into human-readable hours or days.
 */
function formatDuration(ms: number): string {
  const hours = Math.round(ms / (1000 * 60 * 60));
  if (hours < 24) {
    return `${Math.max(1, hours)}h`;
  }
  const days = Math.round(hours / 24);
  return `${days}d`;
}

/**
 * Detect operational risks from the current event's real tasks, dependencies,
 * deadlines, priorities, and team member workloads.
 *
 * Risks are derived dynamically and deterministically.
 */
export function detectEventRisks(
  eventId: string,
  tasks: TaskItem[],
  teamMembers: EventTeamMember[],
  now: Date = new Date()
): DerivedRisk[] {
  if (!eventId) return [];

  // Filter tasks strictly belonging to this event
  const eventTasks = tasks.filter((t) => t.eventId === eventId);
  const nowMs = now.getTime();
  const fortyEightHoursMs = 48 * 60 * 60 * 1000;

  const risks: DerivedRisk[] = [];

  // 1. Task-level risk detections
  for (const task of eventTasks) {
    const isDone = task.status === "Done" || task.completed;
    if (isDone) continue; // Resolved / Done tasks do not trigger active risks

    const deadlineMs = parseDateMs(task.deadline || task.dueText);
    const hasValidDeadline = deadlineMs !== null;

    // Rule 1: OVERDUE_TASK
    // Condition: deadline has passed and task is not Done
    if (hasValidDeadline && deadlineMs < nowMs) {
      const overdueByMs = nowMs - deadlineMs;
      const isHighPriority = task.priority === "Urgent" || task.priority === "High";
      const severity: RiskSeverity = isHighPriority ? "High" : "Medium";

      risks.push({
        id: `risk-overdue-${task.id}`,
        eventId,
        type: "OVERDUE_TASK",
        title: `Overdue Task: "${task.title}"`,
        description: `This task was scheduled to be completed by ${task.deadline || task.dueText} but is currently ${task.status || "unfinished"}.`,
        severity,
        evidence: `Deadline expired ${formatDuration(overdueByMs)} ago. Assigned to: ${task.assigneeName} (${task.assigneeRole || "Unassigned"}). Priority: ${task.priority}.`,
        status: "Open",
      });
    }

    // Rule 2: UNASSIGNED_IMPORTANT_TASK
    // Condition: task has no owner and task priority is High or Urgent
    const isUnassigned =
      !task.assigneeMemberId ||
      task.assigneeName === "Unassigned" ||
      task.assigneeName.trim().toLowerCase() === "unassigned";

    const isImportant = task.priority === "Urgent" || task.priority === "High";

    if (isUnassigned && isImportant) {
      const severity: RiskSeverity = task.priority === "Urgent" ? "Critical" : "High";

      risks.push({
        id: `risk-unassigned-${task.id}`,
        eventId,
        type: "UNASSIGNED_IMPORTANT_TASK",
        title: `Unassigned ${task.priority} Task: "${task.title}"`,
        description: `This high-importance task is currently unassigned. Without an assigned owner, milestone execution is at risk.`,
        severity,
        evidence: `Priority is ${task.priority}. Due: ${task.deadline || task.dueText}. Requires immediate assignment by Club/Event Head.`,
        status: "Open",
      });
    }

    // Rule 3: APPROACHING_DEADLINE
    // Condition: deadline is within the next 48 hours (and not already overdue)
    if (
      hasValidDeadline &&
      deadlineMs >= nowMs &&
      deadlineMs <= nowMs + fortyEightHoursMs
    ) {
      const remainingMs = deadlineMs - nowMs;
      const isHighPriority = task.priority === "Urgent" || task.priority === "High";
      const severity: RiskSeverity = isHighPriority ? "High" : "Medium";

      risks.push({
        id: `risk-deadline-${task.id}`,
        eventId,
        type: "APPROACHING_DEADLINE",
        title: `Approaching Deadline: "${task.title}"`,
        description: `This task is due within the next 48 hours and is currently ${task.status || "in progress"}.`,
        severity,
        evidence: `Due in ${formatDuration(remainingMs)} (${task.deadline || task.dueText}). Assigned to: ${task.assigneeName}. Priority: ${task.priority}.`,
        status: "Open",
      });
    }

    // Rule 4: BLOCKED_DEPENDENCY
    // Condition: task has dependencies and at least one dependency is not Done
    const depState = getTaskDependencyState(task, eventTasks);
    if (depState.hasDependencies && depState.isBlocked) {
      const pendingCount = depState.pendingDependencies.length;
      const pendingNames = depState.pendingDependencies
        .map((d) => `"${d.title}"`)
        .slice(0, 3)
        .join(", ");

      risks.push({
        id: `risk-blocked-${task.id}`,
        eventId,
        type: "BLOCKED_DEPENDENCY",
        title: `Blocked Task: "${task.title}"`,
        description: `This task cannot proceed because it depends on ${pendingCount} prerequisite task${pendingCount > 1 ? "s" : ""} that ${pendingCount > 1 ? "are" : "is"} not finished.`,
        severity: "High",
        evidence: `Waiting on: ${pendingNames}${pendingCount > 3 ? ` and ${pendingCount - 3} more` : ""}. Assigned to: ${task.assigneeName}.`,
        status: "Open",
      });
    }
  }

  // 2. Member-level risk detections
  // Rule 5: OVERLOADED_MEMBER
  // Condition: event-team member has workload state "Overloaded" (reusing Step 4.16 calculateTeamWorkloads)
  const teamWorkloads = calculateTeamWorkloads(teamMembers, eventTasks, now);

  for (const member of teamMembers) {
    const workload = teamWorkloads.get(member.id);
    if (workload && workload.workloadState === "Overloaded") {
      risks.push({
        id: `risk-overloaded-${member.id}`,
        eventId,
        type: "OVERLOADED_MEMBER",
        title: `Overloaded Team Member: ${member.name}`,
        description: `${member.name} has ${workload.activeCount} active tasks, exceeding sustainable team capacity limits.`,
        severity: "High",
        evidence: `Active tasks: ${workload.activeCount} (threshold is 7+). Overdue tasks: ${workload.overdueCount}. Role: ${member.role}. Workload State: Overloaded.`,
        status: "Open",
      });
    }
  }

  // Sort risks deterministically: Critical first, then High, Medium, Low
  const severityRank: Record<RiskSeverity, number> = {
    Critical: 0,
    High: 1,
    Medium: 2,
    Low: 3,
  };

  risks.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return risks;
}

/**
 * Returns human-readable label for a risk type.
 */
export function getRiskTypeLabel(type: RiskType): string {
  switch (type) {
    case "OVERDUE_TASK":
      return "Overdue Task";
    case "UNASSIGNED_IMPORTANT_TASK":
      return "Unassigned Critical Task";
    case "APPROACHING_DEADLINE":
      return "Approaching Deadline";
    case "BLOCKED_DEPENDENCY":
      return "Blocked Dependency";
    case "OVERLOADED_MEMBER":
      return "Overloaded Member";
    default:
      return "Operational Risk";
  }
}

/**
 * Returns color classes tailored for each severity level matching the design system.
 */
export function getSeverityStyle(severity: RiskSeverity): {
  badge: string;
  dot: string;
  cardBorder: string;
  iconBg: string;
} {
  switch (severity) {
    case "Critical":
      return {
        badge: "bg-rose-50 text-rose-700 border-rose-200",
        dot: "bg-rose-600 animate-ping",
        cardBorder: "border-rose-200 hover:border-rose-300",
        iconBg: "bg-rose-100 text-rose-700",
      };
    case "High":
      return {
        badge: "bg-orange-50 text-orange-700 border-orange-200",
        dot: "bg-orange-500",
        cardBorder: "border-orange-200 hover:border-orange-300",
        iconBg: "bg-orange-100 text-orange-700",
      };
    case "Medium":
      return {
        badge: "bg-amber-50 text-amber-700 border-amber-200",
        dot: "bg-amber-500",
        cardBorder: "border-amber-200 hover:border-amber-300",
        iconBg: "bg-amber-100 text-amber-700",
      };
    case "Low":
    default:
      return {
        badge: "bg-slate-100 text-slate-700 border-slate-200",
        dot: "bg-slate-400",
        cardBorder: "border-slate-200 hover:border-slate-300",
        iconBg: "bg-slate-100 text-slate-700",
      };
  }
}
