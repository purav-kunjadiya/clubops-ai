import type {
  TaskItem,
  EventTeamMember,
  DerivedRisk,
  RiskType,
  RiskSeverity,
  ClubEvent,
} from "@/components/types";
import { CLUB_ROLES } from "@/components/types";
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
 * deadlines, priorities, team member workloads, and role structures.
 *
 * Risks are derived dynamically and deterministically.
 */
export function detectEventRisks(
  eventId: string,
  tasks: TaskItem[],
  teamMembers: EventTeamMember[],
  event?: ClubEvent | null,
  now: Date = new Date()
): DerivedRisk[] {
  if (!eventId) return [];

  // Filter tasks strictly belonging to this event
  const eventTasks = tasks.filter((t) => t.eventId === eventId);
  const nowMs = now.getTime();
  const fortyEightHoursMs = 48 * 60 * 60 * 1000;
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

  const activeTasks = eventTasks.filter((t) => t.status !== "Done" && !t.completed);
  const totalActiveCount = activeTasks.length;

  const risks: DerivedRisk[] = [];

  // Helper to check if task is unassigned
  const isTaskUnassigned = (t: TaskItem): boolean =>
    !t.assigneeMemberId ||
    !t.assigneeName ||
    t.assigneeName === "Unassigned" ||
    t.assigneeName.trim().toLowerCase() === "unassigned";

  // Helper to match member task assignment
  const isTaskAssignedToMember = (t: TaskItem, m: EventTeamMember): boolean => {
    if (t.assigneeMemberId && m.clubMemberId) {
      return t.assigneeMemberId === m.clubMemberId || t.assigneeMemberId === m.id;
    }
    return t.assigneeName.trim().toLowerCase() === m.name.trim().toLowerCase();
  };

  // ---------------------------------------------------------
  // 1. Task-Level Risks (Existing & New)
  // ---------------------------------------------------------
  for (const task of eventTasks) {
    const isDone = task.status === "Done" || task.completed;
    if (isDone) continue;

    const deadlineMs = parseDateMs(task.deadline || task.dueText);
    const hasValidDeadline = deadlineMs !== null;
    const isImportant = task.priority === "Urgent" || task.priority === "High";

    // --- Rule 1: OVERDUE_TASK (Existing) ---
    if (hasValidDeadline && deadlineMs < nowMs) {
      const overdueByMs = nowMs - deadlineMs;
      const severity: RiskSeverity = isImportant ? "High" : "Medium";

      risks.push({
        id: `risk-overdue-${task.id}`,
        eventId,
        type: "OVERDUE_TASK",
        title: `Overdue Task: "${task.title}"`,
        description: `This task was scheduled to be completed by ${task.deadline || task.dueText} but is currently ${task.status || "unfinished"}.`,
        severity,
        evidence: `Deadline expired ${formatDuration(overdueByMs)} ago. Assigned to: ${task.assigneeName} (${task.assigneeRole || "Unassigned"}). Priority: ${task.priority}.`,
        status: "Open",
        affectedTarget: `Task: "${task.title}" (${task.assigneeName})`,
        suggestedMitigation: `Expedite task completion immediately or adjust target deadline.`,
        mitigationPrompt: `Eventra, task "${task.title}" assigned to ${task.assigneeName} is overdue by ${formatDuration(overdueByMs)}. Please propose an expedited completion plan or deadline update.`,
      });
    }

    // --- Rule 2: UNASSIGNED_IMPORTANT_TASK (Existing) ---
    const unassigned = isTaskUnassigned(task);
    if (unassigned && isImportant) {
      const severity: RiskSeverity = task.priority === "Urgent" ? "Critical" : "High";

      risks.push({
        id: `risk-unassigned-${task.id}`,
        eventId,
        type: "UNASSIGNED_IMPORTANT_TASK",
        title: `Unassigned ${task.priority} Task: "${task.title}"`,
        description: `This high-importance task is currently unassigned. Without an assigned owner, milestone execution is at risk.`,
        severity,
        evidence: `Priority is ${task.priority}. Due: ${task.deadline || task.dueText}. Area/Tag: ${task.eventTag || "General"}.`,
        status: "Open",
        affectedTarget: `Task: "${task.title}"`,
        suggestedMitigation: `Assign an available event team member to take ownership immediately.`,
        mitigationPrompt: `Eventra, high-priority task "${task.title}" is currently unassigned. Suggest an appropriate team member to assign based on workload and role.`,
      });
    }

    // --- Rule 3: APPROACHING_DEADLINE (Existing) ---
    if (
      hasValidDeadline &&
      deadlineMs >= nowMs &&
      deadlineMs <= nowMs + fortyEightHoursMs
    ) {
      const remainingMs = deadlineMs - nowMs;
      const severity: RiskSeverity = isImportant ? "High" : "Medium";

      risks.push({
        id: `risk-deadline-${task.id}`,
        eventId,
        type: "APPROACHING_DEADLINE",
        title: `Approaching Deadline: "${task.title}"`,
        description: `This task is due within the next 48 hours and is currently ${task.status || "in progress"}.`,
        severity,
        evidence: `Due in ${formatDuration(remainingMs)} (${task.deadline || task.dueText}). Assigned to: ${task.assigneeName}. Priority: ${task.priority}.`,
        status: "Open",
        affectedTarget: `Task: "${task.title}" (${task.assigneeName})`,
        suggestedMitigation: `Verify progress with ${task.assigneeName} to ensure completion before cutoff.`,
        mitigationPrompt: `Eventra, task "${task.title}" is due in ${formatDuration(remainingMs)}. Check progress with ${task.assigneeName} and offer assistance if needed.`,
      });
    }

    // --- Rule 4: BLOCKED_DEPENDENCY (Existing) ---
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
        evidence: `Waiting on prerequisite${pendingCount > 1 ? "s" : ""}: ${pendingNames}${pendingCount > 3 ? ` and ${pendingCount - 3} more` : ""}. Assigned to: ${task.assigneeName}.`,
        status: "Open",
        affectedTarget: `Task: "${task.title}"`,
        suggestedMitigation: `Prioritize resolving prerequisite tasks first so "${task.title}" can begin.`,
        mitigationPrompt: `Eventra, task "${task.title}" is blocked by ${pendingNames}. Help unblock the prerequisite tasks.`,
      });
    }

    // --- Rule 5 (New): CASCADE_IMPACT ---
    // Detect blocked/overdue tasks that have multiple downstream dependent tasks
    const downstreamTasks = eventTasks.filter((t) =>
      t.dependencies?.includes(task.id) && t.status !== "Done" && !t.completed
    );
    const isTaskOverdue = hasValidDeadline && deadlineMs < nowMs;
    const isTaskBlocked = task.status === "Blocked" || depState.isBlocked;

    if ((isTaskBlocked || isTaskOverdue) && downstreamTasks.length >= 2) {
      const downstreamNames = downstreamTasks
        .map((d) => `"${d.title}"`)
        .slice(0, 3)
        .join(", ");
      const severity: RiskSeverity = downstreamTasks.length >= 3 ? "Critical" : "High";

      risks.push({
        id: `risk-cascade-${task.id}`,
        eventId,
        type: "CASCADE_IMPACT",
        title: `Cascade Impact: "${task.title}"`,
        description: `Task "${task.title}" is ${isTaskBlocked ? "blocked" : "overdue"} and is holding up ${downstreamTasks.length} downstream dependent tasks.`,
        severity,
        evidence: `Prerequisite "${task.title}" → blocks ${downstreamTasks.length} tasks (${downstreamNames}${downstreamTasks.length > 3 ? "..." : ""}). Resolving this unblocks multiple operational workstreams.`,
        status: "Open",
        affectedTarget: `Task: "${task.title}" (${downstreamTasks.length} downstream)`,
        suggestedMitigation: `Resolve "${task.title}" first or re-plan the dependent tasks.`,
        mitigationPrompt: `Eventra, task "${task.title}" is ${isTaskBlocked ? "blocked" : "overdue"} and holds up ${downstreamTasks.length} downstream tasks including ${downstreamNames}. Propose immediate resolution or dependency adjustments.`,
      });
    }

    // --- Rule 6 (New): LAST_MINUTE_TASK_RISK ---
    // Detect important tasks whose deadlines are dangerously close to the event date
    if (event?.date && hasValidDeadline && isImportant) {
      const eventDateMs = parseDateMs(event.date);
      if (eventDateMs !== null) {
        const timeDiffMs = eventDateMs - deadlineMs;
        // Dangerously close if deadline is within 24h before event date OR after event date
        if (timeDiffMs >= -twentyFourHoursMs && timeDiffMs <= twentyFourHoursMs) {
          const severity: RiskSeverity = task.priority === "Urgent" || timeDiffMs < 0 ? "Critical" : "High";

          risks.push({
            id: `risk-last-minute-${task.id}`,
            eventId,
            type: "LAST_MINUTE_TASK_RISK",
            title: `Last-Minute Critical Task: "${task.title}"`,
            description: `Task "${task.title}" (${task.priority} priority) is scheduled for ${task.deadline || task.dueText}, which is dangerously close to event date (${event.date}).`,
            severity,
            evidence: `Task deadline (${task.deadline || task.dueText}) is within 24 hours of Event Start (${event.date}). Risk of non-completion before event kickoff.`,
            status: "Open",
            affectedTarget: `Task: "${task.title}"`,
            suggestedMitigation: `Move deadline earlier or assign extra resources to complete it well ahead of the event.`,
            mitigationPrompt: `Eventra, task "${task.title}" is scheduled dangerously close to the event start on ${event.date}. Help move its deadline earlier or expedite execution.`,
          });
        }
      }
    }

    // --- Rule 7 (New): DEPENDENCY_CHAIN_RISK ---
    // Detect long dependency chains (depth >= 3) where a single delay propagates deeply
    if (depState.hasDependencies && !isDone) {
      // Calculate chain depth by walking up dependencies
      let depth = 0;
      let currId: string | undefined = task.id;
      const visited = new Set<string>();
      const chainTitles: string[] = [task.title];

      while (currId && !visited.has(currId)) {
        visited.add(currId);
        const currTask = eventTasks.find((t) => t.id === currId);
        if (!currTask || !currTask.dependencies || currTask.dependencies.length === 0) break;
        const parentId = currTask.dependencies[0];
        const parentTask = eventTasks.find((t) => t.id === parentId);
        if (parentTask) {
          chainTitles.unshift(parentTask.title);
          depth++;
          currId = parentId;
        } else {
          break;
        }
      }

      if (depth >= 2) { // 2 links = 3 tasks in chain
        const rootTitle = chainTitles[0];
        risks.push({
          id: `risk-dep-chain-${task.id}`,
          eventId,
          type: "DEPENDENCY_CHAIN_RISK",
          title: `Dependency Chain Risk: "${task.title}"`,
          description: `Task "${task.title}" sits at the end of a ${depth + 1}-level dependency chain starting from "${rootTitle}".`,
          severity: depth >= 3 ? "Critical" : "High",
          evidence: `Chain: ${chainTitles.join(" → ")}. A delay anywhere in this ${depth + 1}-step chain will push back "${task.title}".`,
          status: "Open",
          affectedTarget: `Chain ending in "${task.title}" (${depth + 1} steps)`,
          suggestedMitigation: `Prioritize root task "${rootTitle}" immediately or decouple non-critical dependencies to run in parallel.`,
          mitigationPrompt: `Eventra, task "${task.title}" has a long dependency chain (${chainTitles.join(" → ")}). Help optimize or decouple this chain.`,
        });
      }
    }
  }

  // ---------------------------------------------------------
  // 2. Member & Workload Risks (Existing & New)
  // ---------------------------------------------------------
  const teamWorkloads = calculateTeamWorkloads(teamMembers, activeTasks, now);

  for (const member of teamMembers) {
    const workload = teamWorkloads.get(member.id);
    const memberActiveTasks = activeTasks.filter((t) => isTaskAssignedToMember(t, member));
    const memberImportantTasks = memberActiveTasks.filter((t) => t.priority === "Urgent" || t.priority === "High");

    // --- Rule 8: OVERLOADED_MEMBER (Existing) ---
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
        affectedTarget: `Member: ${member.name} (${member.role})`,
        suggestedMitigation: `Reassign several active tasks to available team members with lower workload.`,
        mitigationPrompt: `Eventra, ${member.name} is overloaded with ${workload.activeCount} active tasks. Suggest task reassignments to balance team capacity.`,
      });
    }

    // --- Rule 9 (New): SINGLE_POINT_OF_FAILURE ---
    // Detect when a critical portion of work (>=40% of active tasks OR 3+ High/Urgent tasks) depends on one member
    const taskShareRatio = totalActiveCount > 0 ? memberActiveTasks.length / totalActiveCount : 0;
    const isSinglePoint = (totalActiveCount >= 3 && taskShareRatio >= 0.40) || memberImportantTasks.length >= 3;

    if (isSinglePoint) {
      const severity: RiskSeverity = memberImportantTasks.length >= 3 || taskShareRatio >= 0.5 ? "Critical" : "High";

      risks.push({
        id: `risk-spof-${member.id}`,
        eventId,
        type: "SINGLE_POINT_OF_FAILURE",
        title: `Single Point of Failure: ${member.name}`,
        description: `${member.name} owns ${memberActiveTasks.length} of ${totalActiveCount} active tasks (${Math.round(taskShareRatio * 100)}%), including ${memberImportantTasks.length} High/Urgent tasks.`,
        severity,
        evidence: `${member.name} (${member.role}) holds ${memberActiveTasks.length} active tasks (${memberImportantTasks.length} High/Urgent). If unavailable, ${Math.round(taskShareRatio * 100)}% of event operations will stall.`,
        status: "Open",
        affectedTarget: `Member: ${member.name} (${member.role})`,
        suggestedMitigation: `Reassign key tasks to available team members to eliminate single-person dependency.`,
        mitigationPrompt: `Eventra, ${member.name} is a Single Point of Failure holding ${memberActiveTasks.length} active tasks (${Math.round(taskShareRatio * 100)}% of event work). Suggest task reassignments to distribute responsibility.`,
      });
    }

    // --- Rule 10 (New): DEADLINE_COLLISION ---
    // Detect when the same member has multiple High/Urgent tasks clustered around the same 24h deadline window
    const memberTasksWithDeadlines = memberImportantTasks
      .map((t) => ({ task: t, ms: parseDateMs(t.deadline || t.dueText) }))
      .filter((x): x is { task: TaskItem; ms: number } => x.ms !== null)
      .sort((a, b) => a.ms - b.ms);

    if (memberTasksWithDeadlines.length >= 2) {
      for (let i = 0; i < memberTasksWithDeadlines.length - 1; i++) {
        const t1 = memberTasksWithDeadlines[i];
        const t2 = memberTasksWithDeadlines[i + 1];
        if (Math.abs(t2.ms - t1.ms) <= twentyFourHoursMs) {
          const colliding = [t1.task, t2.task];
          const collidingTitles = colliding.map((t) => `"${t.title}"`).join(" & ");

          risks.push({
            id: `risk-collision-${member.id}-${t1.task.id}`,
            eventId,
            type: "DEADLINE_COLLISION",
            title: `Deadline Collision: ${member.name}`,
            description: `${member.name} has ${colliding.length} High-priority tasks (${collidingTitles}) due within the same 24-hour window.`,
            severity: colliding.some((t) => t.priority === "Urgent") ? "Critical" : "High",
            evidence: `Tasks ${collidingTitles} are both due within 24 hours (around ${t1.task.deadline || t1.task.dueText}). High bottleneck risk.`,
            status: "Open",
            affectedTarget: `Member: ${member.name} (${colliding.length} tasks)`,
            suggestedMitigation: `Reassign one task to an available event-team member or stagger deadlines.`,
            mitigationPrompt: `Eventra, ${member.name} has a Deadline Collision with High-priority tasks ${collidingTitles} due within 24 hours. Help reassign one task or adjust deadlines.`,
          });
          break; // Avoid generating duplicate collision alerts for same member
        }
      }
    }
  }

  // ---------------------------------------------------------
  // 3. Operational & Team Structure Risks (New)
  // ---------------------------------------------------------

  // --- Rule 11 (New): ROLE_COVERAGE_GAP ---
  // Detect when an event has active tasks in a role/category, but NO team member on the event team has that role
  const existingTeamRoles = new Set(teamMembers.map((m) => m.role.trim().toLowerCase()));

  for (const role of CLUB_ROLES) {
    const roleLower = role.toLowerCase();
    const hasMemberInRole = existingTeamRoles.has(roleLower);

    if (!hasMemberInRole) {
      const tasksForRole = activeTasks.filter(
        (t) =>
          t.assigneeRole?.toLowerCase() === roleLower ||
          t.eventTag?.toLowerCase() === roleLower
      );

      if (tasksForRole.length > 0) {
        const sampleTitles = tasksForRole.slice(0, 2).map((t) => `"${t.title}"`).join(", ");
        const hasUrgent = tasksForRole.some((t) => t.priority === "Urgent" || t.priority === "High");

        risks.push({
          id: `risk-role-gap-${role.toLowerCase()}`,
          eventId,
          type: "ROLE_COVERAGE_GAP",
          title: `Role Coverage Gap: Missing ${role}`,
          description: `The event has ${tasksForRole.length} active task${tasksForRole.length > 1 ? "s" : ""} requiring "${role}", but zero event team members hold this role.`,
          severity: hasUrgent ? "High" : "Medium",
          evidence: `${tasksForRole.length} active tasks (e.g. ${sampleTitles}) belong to "${role}", but 0 team members on the event team hold this role.`,
          status: "Open",
          affectedTarget: `Role: ${role}`,
          suggestedMitigation: `Add a club member with the "${role}" role to the event team or reassign tasks.`,
          mitigationPrompt: `Eventra, there is a Role Coverage Gap for "${role}" with ${tasksForRole.length} active tasks and no team member holding that role. Suggest team coverage.`,
        });
      }
    }
  }

  // --- Rule 12 (New): UNOWNED_CRITICAL_AREA ---
  // Detect an important event operational area (eventTag) with 2+ active tasks and zero assigned owners
  const tasksByTag = new Map<string, TaskItem[]>();
  for (const task of activeTasks) {
    const tag = task.eventTag?.trim() || "General";
    if (!tasksByTag.has(tag)) tasksByTag.set(tag, []);
    tasksByTag.get(tag)!.push(task);
  }

  for (const [tag, tagTasks] of tasksByTag.entries()) {
    const unassignedInTag = tagTasks.filter(isTaskUnassigned);
    if (tagTasks.length >= 2 && unassignedInTag.length === tagTasks.length) {
      const tagTitles = unassignedInTag.slice(0, 3).map((t) => `"${t.title}"`).join(", ");
      const hasImportant = unassignedInTag.some((t) => t.priority === "Urgent" || t.priority === "High");

      risks.push({
        id: `risk-unowned-area-${tag.toLowerCase().replace(/\s+/g, "-")}`,
        eventId,
        type: "UNOWNED_CRITICAL_AREA",
        title: `Unowned Critical Area: "${tag}"`,
        description: `Operational area "${tag}" has ${unassignedInTag.length} active tasks with zero assigned owners.`,
        severity: hasImportant ? "Critical" : "High",
        evidence: `Area "${tag}" contains ${unassignedInTag.length} tasks (${tagTitles}). None of these tasks have an assigned owner.`,
        status: "Open",
        affectedTarget: `Area: "${tag}"`,
        suggestedMitigation: `Assign an operational lead or team member to own the "${tag}" area.`,
        mitigationPrompt: `Eventra, operational area "${tag}" has ${unassignedInTag.length} unassigned tasks (${tagTitles}). Please suggest owner assignments for this area.`,
      });
    }
  }

  // --- Rule 13 (New): TEAM_OVERDEPENDENCY ---
  // Detect when >60% of all active event tasks are concentrated in one role/team group
  if (totalActiveCount >= 4) {
    const tasksByRole = new Map<string, TaskItem[]>();
    for (const task of activeTasks) {
      const role = task.assigneeRole?.trim() || "Unassigned";
      if (!tasksByRole.has(role)) tasksByRole.set(role, []);
      tasksByRole.get(role)!.push(task);
    }

    for (const [role, roleTasks] of tasksByRole.entries()) {
      if (role === "Unassigned") continue;
      const ratio = roleTasks.length / totalActiveCount;
      if (ratio > 0.60) {
        risks.push({
          id: `risk-overdep-${role.toLowerCase()}`,
          eventId,
          type: "TEAM_OVERDEPENDENCY",
          title: `Team Overdependency on ${role}`,
          description: `The "${role}" role holds ${roleTasks.length} out of ${totalActiveCount} active event tasks (${Math.round(ratio * 100)}% of total work).`,
          severity: "High",
          evidence: `${Math.round(ratio * 100)}% of all active event work is concentrated in the "${role}" role. Creates a major bottleneck if this team is delayed.`,
          status: "Open",
          affectedTarget: `Role: ${role}`,
          suggestedMitigation: `Cross-train or redistribute non-specialized tasks to members in other roles to balance team load.`,
          mitigationPrompt: `Eventra, ${Math.round(ratio * 100)}% of active tasks are concentrated in "${role}". Help redistribute workload across other team roles.`,
        });
      }
    }
  }

  // --- Rule 14 (New): READINESS_RISK ---
  // Detect when the event date is approaching (within 3 days) but >30% of work remains incomplete
  if (event?.date) {
    const eventDateMs = parseDateMs(event.date);
    if (eventDateMs !== null) {
      const timeToEventMs = eventDateMs - nowMs;
      const isApproaching = timeToEventMs <= threeDaysMs && timeToEventMs >= -twentyFourHoursMs;
      const totalTasksCount = eventTasks.length;
      const incompleteRatio = totalTasksCount > 0 ? activeTasks.length / totalTasksCount : 0;

      if (isApproaching && (incompleteRatio > 0.30 || activeTasks.length >= 3)) {
        const urgentCount = activeTasks.filter((t) => t.priority === "Urgent" || t.priority === "High").length;
        const severity: RiskSeverity = timeToEventMs <= twentyFourHoursMs || urgentCount >= 2 ? "Critical" : "High";

        risks.push({
          id: `risk-readiness-${eventId}`,
          eventId,
          type: "READINESS_RISK",
          title: `Event Readiness Risk: "${event.title}"`,
          description: `Event date (${event.date}) is in ${timeToEventMs < 0 ? "progress/past" : formatDuration(timeToEventMs)}, but ${activeTasks.length} of ${totalTasksCount} tasks (${Math.round(incompleteRatio * 100)}%) remain incomplete.`,
          severity,
          evidence: `Event kickoff in ${timeToEventMs < 0 ? "< 24h" : formatDuration(timeToEventMs)}. ${activeTasks.length} incomplete tasks (${urgentCount} High/Urgent). Overall completion is only ${Math.round((1 - incompleteRatio) * 100)}%.`,
          status: "Open",
          affectedTarget: `Event: "${event.title}"`,
          suggestedMitigation: `Freeze non-essential scope and focus team exclusively on completing open high-priority tasks.`,
          mitigationPrompt: `Eventra, event "${event.title}" starts in ${formatDuration(timeToEventMs)} but ${activeTasks.length} tasks remain incomplete. Help prioritize the critical path for event readiness.`,
        });
      }
    }
  }

  // --- Rule 15 (New): NO_BACKUP_OWNER ---
  // Detect critical tasks assigned to a member who is the sole person in that role on the event team
  const roleMemberCounts = new Map<string, number>();
  for (const m of teamMembers) {
    const r = m.role.trim().toLowerCase();
    roleMemberCounts.set(r, (roleMemberCounts.get(r) || 0) + 1);
  }

  for (const task of activeTasks) {
    const isCriticalTask = task.priority === "Urgent" || task.priority === "High";
    if (!isCriticalTask || isTaskUnassigned(task)) continue;

    // Find assigned member
    const assignedMember = teamMembers.find((m) => isTaskAssignedToMember(task, m));
    if (assignedMember) {
      const memberRoleLower = assignedMember.role.trim().toLowerCase();
      const countInRole = roleMemberCounts.get(memberRoleLower) || 0;

      if (countInRole === 1) {
        risks.push({
          id: `risk-no-backup-${task.id}`,
          eventId,
          type: "NO_BACKUP_OWNER",
          title: `No Backup Owner: "${task.title}"`,
          description: `Critical task "${task.title}" is assigned to ${assignedMember.name}, who is the sole "${assignedMember.role}" member on the event team.`,
          severity: "High",
          evidence: `Priority: ${task.priority}. Owner: ${assignedMember.name} (${assignedMember.role}). Sole team member holding this role. If unavailable, execution halts completely.`,
          status: "Open",
          affectedTarget: `Task: "${task.title}" (Owner: ${assignedMember.name})`,
          suggestedMitigation: `Assign a secondary co-owner or cross-train another team member as backup.`,
          mitigationPrompt: `Eventra, task "${task.title}" is assigned to ${assignedMember.name}, the sole "${assignedMember.role}" member on the team. Suggest a backup co-owner.`,
        });
      }
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
    case "SINGLE_POINT_OF_FAILURE":
      return "Single Point of Failure";
    case "DEADLINE_COLLISION":
      return "Deadline Collision";
    case "DEPENDENCY_CHAIN_RISK":
      return "Dependency Chain Risk";
    case "ROLE_COVERAGE_GAP":
      return "Role Coverage Gap";
    case "LAST_MINUTE_TASK_RISK":
      return "Last-Minute Task Risk";
    case "UNOWNED_CRITICAL_AREA":
      return "Unowned Critical Area";
    case "TEAM_OVERDEPENDENCY":
      return "Team Overdependency";
    case "READINESS_RISK":
      return "Readiness Risk";
    case "NO_BACKUP_OWNER":
      return "No Backup Owner";
    case "CASCADE_IMPACT":
      return "Cascade Impact";
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

