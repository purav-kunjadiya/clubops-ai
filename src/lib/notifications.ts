import type { TaskItem, EventTeamMember, DerivedRisk } from "@/components/types";

export interface NotificationItem {
  id: string;
  clubId: string;
  eventId?: string;
  eventTitle?: string;
  taskId?: string;
  title: string;
  message: string;
  type: "task_assigned" | "task_overdue" | "risk_detected" | "approval_required" | "system";
  severity: "info" | "warning" | "urgent";
  createdAt: string;
  read: boolean;
  actionLabel?: string;
}

/**
 * Generate notifications dynamically from active event tasks, team members, and derived risks.
 */
export function generateClubNotifications(
  clubId: string,
  events: { id: string; title: string }[],
  tasks: TaskItem[],
  teamMembers: EventTeamMember[],
  risks: DerivedRisk[]
): NotificationItem[] {
  const notifications: NotificationItem[] = [];
  const eventMap = new Map(events.map((e) => [e.id, e.title]));

  // 1. Overdue Tasks Notifications
  const overdueTasks = tasks.filter((t) => !t.completed && t.status !== "Done" && t.deadline && new Date(t.deadline).getTime() < Date.now());
  overdueTasks.slice(0, 5).forEach((task) => {
    const eventTitle = eventMap.get(task.eventId || "") || "Event";
    notifications.push({
      id: `notif-overdue-${task.id}`,
      clubId,
      eventId: task.eventId,
      eventTitle,
      taskId: task.id,
      title: `Overdue Task in ${eventTitle}`,
      message: `"${task.title}" assigned to ${task.assigneeName} was due on ${task.deadline}.`,
      type: "task_overdue",
      severity: "urgent",
      createdAt: new Date().toISOString(),
      read: false,
      actionLabel: "View Task",
    });
  });

  // 2. Risk Detected Notifications
  risks.slice(0, 5).forEach((risk) => {
    const eventTitle = eventMap.get(risk.eventId) || "Event Workspace";
    notifications.push({
      id: `notif-risk-${risk.id}`,
      clubId,
      eventId: risk.eventId,
      eventTitle,
      title: `Risk Flagged: ${risk.title}`,
      message: risk.description,
      type: "risk_detected",
      severity: risk.severity === "Critical" || risk.severity === "High" ? "urgent" : "warning",
      createdAt: new Date().toISOString(),
      read: false,
      actionLabel: "Inspect Risk",
    });
  });

  // 3. Unassigned Critical Tasks
  const unassignedTasks = tasks.filter(
    (t) => (!t.assigneeMemberId || t.assigneeName === "Unassigned") && (t.priority === "High" || t.priority === "Urgent") && !t.completed
  );
  unassignedTasks.slice(0, 3).forEach((task) => {
    const eventTitle = eventMap.get(task.eventId || "") || "Event";
    notifications.push({
      id: `notif-unassigned-${task.id}`,
      clubId,
      eventId: task.eventId,
      eventTitle,
      taskId: task.id,
      title: `Unassigned High Priority Task`,
      message: `"${task.title}" in ${eventTitle} needs an assigned owner.`,
      type: "approval_required",
      severity: "warning",
      createdAt: new Date().toISOString(),
      read: false,
      actionLabel: "Assign Now",
    });
  });

  // 4. Fallback welcome notification if none generated yet
  if (notifications.length === 0) {
    notifications.push({
      id: `notif-welcome-${clubId}`,
      clubId,
      title: "ClubOps AI Ops Active",
      message: "All operational tasks, team workloads, and event risks are currently healthy and monitored.",
      type: "system",
      severity: "info",
      createdAt: new Date().toISOString(),
      read: true,
    });
  }

  return notifications;
}
