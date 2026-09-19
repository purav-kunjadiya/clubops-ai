import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface AskyTaskContext {
  id: string;
  title: string;
  priority: string;
  dueText?: string;
  deadline?: string;
  assigneeName?: string;
  assigneeRole?: string;
  status?: string;
  completed?: boolean;
}

export interface AskyMemberContext {
  id: string;
  name: string;
  role?: string;
  email?: string;
}

export interface AskyWorkloadContext {
  memberName: string;
  activeCount: number;
  completedCount: number;
  overdueCount: number;
  workloadState: "Low" | "Medium" | "High" | "Overloaded";
}

export interface AskyRiskContext {
  id: string;
  type: string;
  title: string;
  severity: string;
  description: string;
  evidence?: string;
}

export interface AskyEventContext {
  id: string;
  title: string;
  category?: string;
  date?: string;
  time?: string;
  location?: string;
  status?: string;
  rsvpCount?: number;
  capacity?: number;
  leadName?: string;
  leadRole?: string;
  budgetAllocated?: number;
  budgetSpent?: number;
}

export interface AskyChatRequestBody {
  prompt: string;
  context?: {
    event?: AskyEventContext | null;
    tasks?: AskyTaskContext[];
    teamMembers?: AskyMemberContext[];
    workloads?: AskyWorkloadContext[];
    risks?: AskyRiskContext[];
  };
}

function formatDeadline(d?: string): string {
  if (!d) return "No deadline";
  const ms = Date.parse(d);
  if (isNaN(ms)) return d;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isTaskOverdue(t: AskyTaskContext): boolean {
  if (t.completed || t.status === "Done") return false;
  const d = t.deadline || t.dueText;
  if (!d) return false;
  const ms = Date.parse(d);
  return !isNaN(ms) && ms < Date.now();
}

function isApproachingDeadline(t: AskyTaskContext, daysAhead = 7): boolean {
  if (t.completed || t.status === "Done") return false;
  const d = t.deadline || t.dueText;
  if (!d) return false;
  const ms = Date.parse(d);
  if (isNaN(ms)) return false;
  const now = Date.now();
  return ms >= now && ms <= now + daysAhead * 86400000;
}

/**
 * Rich, context-aware heuristic answer generator used when Gemini API key is
 * unconfigured or a Gemini call fails. Covers ~20 question patterns.
 */
function generateHeuristicResponse(
  prompt: string,
  context?: AskyChatRequestBody["context"]
): string {
  const query = prompt.toLowerCase();
  const event = context?.event;
  const tasks = context?.tasks || [];
  const workloads = context?.workloads || [];
  const risks = context?.risks || [];
  const teamMembers = context?.teamMembers || [];

  const openTasks = tasks.filter((t) => !t.completed && t.status !== "Done");
  const completedTasks = tasks.filter(
    (t) => t.completed || t.status === "Done"
  );
  const overdueTasks = tasks.filter(isTaskOverdue);
  const upcomingTasks = openTasks.filter((t) => isApproachingDeadline(t, 7));
  const unassignedTasks = openTasks.filter(
    (t) => !t.assigneeName || t.assigneeName.trim() === ""
  );
  const eventName = event?.title ? `"${event.title}"` : "this event";

  // ─── 1. OVERDUE ────────────────────────────────────────────────────────────
  if (
    query.includes("overdue") ||
    query.includes("past due") ||
    query.includes("late task") ||
    query.includes("missed deadline")
  ) {
    if (overdueTasks.length === 0) {
      return `✅ No overdue tasks for ${eventName}. All ${openTasks.length} open task${openTasks.length !== 1 ? "s" : ""} are within their scheduled deadlines.`;
    }
    const list = overdueTasks
      .map(
        (t) =>
          `• **${t.title}** — Priority: ${t.priority} | Assigned: ${t.assigneeName || "Unassigned"} | Due: ${formatDeadline(t.deadline || t.dueText)}`
      )
      .join("\n");
    return (
      `⚠️ **${overdueTasks.length} overdue task${overdueTasks.length !== 1 ? "s" : ""}** found for ${eventName}:\n\n${list}\n\n` +
      `Please follow up with the assigned leads to resolve blockers or adjust deadlines.`
    );
  }

  // ─── 2. UPCOMING / DEADLINES ───────────────────────────────────────────────
  if (
    query.includes("upcoming") ||
    query.includes("deadline") ||
    query.includes("due soon") ||
    query.includes("this week") ||
    query.includes("next few days") ||
    query.includes("summarize") && query.includes("deadline")
  ) {
    const allWithDeadlines = openTasks
      .filter((t) => {
        const d = t.deadline || t.dueText;
        if (!d) return false;
        const ms = Date.parse(d);
        return !isNaN(ms);
      })
      .sort((a, b) => {
        const da = Date.parse(a.deadline || a.dueText || "");
        const db = Date.parse(b.deadline || b.dueText || "");
        return da - db;
      });

    if (allWithDeadlines.length === 0) {
      return `📅 No open tasks with upcoming deadlines for ${eventName}. ${openTasks.length > 0 ? `There are ${openTasks.length} open tasks without set deadlines.` : "All tasks appear to be completed."}`;
    }

    const nearList = upcomingTasks
      .map(
        (t) =>
          `• **${t.title}** — Due: ${formatDeadline(t.deadline || t.dueText)} | ${t.assigneeName || "Unassigned"} | ${t.priority} priority`
      )
      .join("\n");

    const futureList = allWithDeadlines
      .filter((t) => !isApproachingDeadline(t, 7))
      .slice(0, 5)
      .map(
        (t) =>
          `• **${t.title}** — Due: ${formatDeadline(t.deadline || t.dueText)} | ${t.assigneeName || "Unassigned"}`
      )
      .join("\n");

    let reply = `📅 **Deadline Summary for ${eventName}**\n\n`;
    if (nearList) {
      reply += `**Due within 7 days (${upcomingTasks.length}):**\n${nearList}\n\n`;
    } else {
      reply += `No tasks due within the next 7 days.\n\n`;
    }
    if (futureList) {
      reply += `**Coming up next:**\n${futureList}`;
    }
    return reply.trim();
  }

  // ─── 3. WORKLOAD / WHO HAS THE MOST ───────────────────────────────────────
  if (
    query.includes("workload") ||
    query.includes("most tasks") ||
    query.includes("overloaded") ||
    query.includes("highest load") ||
    query.includes("who has the highest") ||
    query.includes("who is the busiest") ||
    query.includes("busiest")
  ) {
    const source =
      workloads.length > 0
        ? [...workloads].sort((a, b) => b.activeCount - a.activeCount)
        : (() => {
            const counts: Record<
              string,
              { active: number; overdue: number; name: string }
            > = {};
            for (const t of openTasks) {
              const name = t.assigneeName || "Unassigned";
              if (!counts[name]) counts[name] = { active: 0, overdue: 0, name };
              counts[name].active++;
              if (isTaskOverdue(t)) counts[name].overdue++;
            }
            return Object.values(counts)
              .sort((a, b) => b.active - a.active)
              .map((c) => ({
                memberName: c.name,
                activeCount: c.active,
                overdueCount: c.overdue,
                completedCount: 0,
                workloadState: (c.active >= 5
                  ? "Overloaded"
                  : c.active >= 3
                  ? "High"
                  : c.active >= 1
                  ? "Medium"
                  : "Low") as AskyWorkloadContext["workloadState"],
              }));
          })();

    if (source.length === 0 || source[0].activeCount === 0) {
      return `✅ All team members for ${eventName} currently have a light or zero active task workload.`;
    }

    const top = source[0];
    const overloaded = source.filter(
      (w) => w.workloadState === "Overloaded" || w.workloadState === "High"
    );

    let reply = `📊 **Workload Overview for ${eventName}:**\n\n`;
    reply += `🔴 **${top.memberName}** has the highest workload — **${top.activeCount} active task${top.activeCount !== 1 ? "s" : ""}** (${top.workloadState} state, ${top.overdueCount} overdue).\n\n`;

    if (source.length > 1) {
      reply += `**Full team workload:**\n`;
      reply += source
        .slice(0, 6)
        .map(
          (w) =>
            `• **${w.memberName}**: ${w.activeCount} active, ${w.overdueCount} overdue — ${w.workloadState}`
        )
        .join("\n");
    }

    if (overloaded.length > 1) {
      reply += `\n\n⚠️ ${overloaded.length} team members have a High or Overloaded workload. Consider redistributing tasks to prevent burnout.`;
    }

    return reply;
  }

  // ─── 4. RISKS / WARNINGS ──────────────────────────────────────────────────
  if (
    query.includes("risk") ||
    query.includes("warning") ||
    query.includes("danger") ||
    query.includes("alert") ||
    query.includes("aware of") ||
    query.includes("issue")
  ) {
    if (risks.length === 0) {
      return `✅ No active operational risks detected for ${eventName}. Tasks, workloads, and deadlines currently appear on track.`;
    }

    const critical = risks.filter(
      (r) => r.severity.toLowerCase() === "critical"
    );
    const high = risks.filter((r) => r.severity.toLowerCase() === "high");
    const medium = risks.filter((r) => r.severity.toLowerCase() === "medium");

    const list = risks
      .map(
        (r) =>
          `• **[${r.severity.toUpperCase()}] ${r.title}** — ${r.description}${r.evidence ? ` *(${r.evidence})*` : ""}`
      )
      .join("\n");

    let reply = `⚠️ **${risks.length} active risk${risks.length !== 1 ? "s" : ""} for ${eventName}:**\n\n${list}\n\n`;

    if (critical.length > 0 || high.length > 0) {
      reply += `🔴 **Action required**: ${critical.length + high.length} critical/high-severity risk${critical.length + high.length !== 1 ? "s" : ""} need immediate attention.`;
    } else if (medium.length > 0) {
      reply += `🟡 Monitor the ${medium.length} medium-severity risk${medium.length !== 1 ? "s" : ""} closely as the event approaches.`;
    }

    return reply;
  }

  // ─── 5. PENDING / OPEN TASKS ──────────────────────────────────────────────
  if (
    query.includes("pending") ||
    (query.includes("task") && query.includes("open")) ||
    query.includes("not done") ||
    query.includes("incomplete") ||
    query.includes("in progress") ||
    query.includes("todo")
  ) {
    if (openTasks.length === 0) {
      return `✅ All tasks for ${eventName} are complete! Great work by the team.`;
    }

    const byPriority: Record<string, AskyTaskContext[]> = {
      Critical: [],
      High: [],
      Medium: [],
      Low: [],
    };
    for (const t of openTasks) {
      (byPriority[t.priority] || byPriority["Medium"]).push(t);
    }

    let reply = `📋 **${openTasks.length} pending task${openTasks.length !== 1 ? "s" : ""} for ${eventName}:**\n\n`;
    for (const [pri, tList] of Object.entries(byPriority)) {
      if (tList.length === 0) continue;
      reply += `**${pri} Priority (${tList.length}):**\n`;
      reply += tList
        .slice(0, 4)
        .map(
          (t) =>
            `• **${t.title}** — ${t.assigneeName || "Unassigned"} | Due: ${formatDeadline(t.deadline || t.dueText)} | ${t.status || "Todo"}`
        )
        .join("\n");
      reply += "\n\n";
    }

    return reply.trim();
  }

  // ─── 6. UNASSIGNED TASKS ──────────────────────────────────────────────────
  if (
    query.includes("unassigned") ||
    query.includes("no owner") ||
    query.includes("not assigned") ||
    query.includes("needs owner") ||
    query.includes("who should handle")
  ) {
    if (unassignedTasks.length === 0) {
      return `✅ All open tasks for ${eventName} have assigned owners. No unassigned tasks found.`;
    }

    const list = unassignedTasks
      .map(
        (t) =>
          `• **${t.title}** — Priority: ${t.priority} | Due: ${formatDeadline(t.deadline || t.dueText)}`
      )
      .join("\n");

    const lightMembers = workloads
      .filter((w) => w.workloadState === "Low" || w.workloadState === "Medium")
      .slice(0, 3)
      .map((w) => `${w.memberName} (${w.activeCount} active tasks)`)
      .join(", ");

    let reply = `📌 **${unassignedTasks.length} unassigned task${unassignedTasks.length !== 1 ? "s" : ""} for ${eventName}:**\n\n${list}`;
    if (lightMembers) {
      reply += `\n\n💡 **Suggested assignment targets** (low workload): ${lightMembers}`;
    }
    return reply;
  }

  // ─── 7. TEAM / MEMBERS ────────────────────────────────────────────────────
  if (
    query.includes("team") ||
    query.includes("member") ||
    query.includes("who is") ||
    query.includes("who are") ||
    query.includes("involved") ||
    query.includes("staff") ||
    query.includes("people")
  ) {
    if (teamMembers.length === 0) {
      return `No team members have been added to ${eventName} yet. Add members from the Team tab in the Event Workspace.`;
    }

    const list = teamMembers
      .map((m) => {
        const w = workloads.find((wl) => wl.memberName === m.name);
        const taskInfo = w
          ? ` | ${w.activeCount} active task${w.activeCount !== 1 ? "s" : ""} (${w.workloadState})`
          : "";
        return `• **${m.name}** — ${m.role || "Member"}${taskInfo}`;
      })
      .join("\n");

    return (
      `👥 **Event Team for ${eventName} (${teamMembers.length} member${teamMembers.length !== 1 ? "s" : ""}):**\n\n${list}\n\n` +
      (event?.leadName
        ? `**Event Lead:** ${event.leadName}${event.leadRole ? ` (${event.leadRole})` : ""}`
        : "")
    ).trim();
  }

  // ─── 8. STATUS / PROGRESS / OVERVIEW ──────────────────────────────────────
  if (
    query.includes("status") ||
    query.includes("progress") ||
    query.includes("overview") ||
    query.includes("summary") ||
    query.includes("how is") ||
    query.includes("how are")
  ) {
    const pct =
      tasks.length > 0
        ? Math.round((completedTasks.length / tasks.length) * 100)
        : 0;
    const highPriOpen = openTasks.filter(
      (t) => t.priority === "High" || t.priority === "Critical"
    );
    const overloadedCount = workloads.filter(
      (w) => w.workloadState === "Overloaded" || w.workloadState === "High"
    ).length;

    let reply = `📊 **Event Progress Report — ${eventName}**\n\n`;
    reply += `• **Overall completion:** ${pct}% (${completedTasks.length}/${tasks.length} tasks done)\n`;
    reply += `• **Open tasks:** ${openTasks.length} | **Overdue:** ${overdueTasks.length} | **Unassigned:** ${unassignedTasks.length}\n`;
    reply += `• **Team size:** ${teamMembers.length} member${teamMembers.length !== 1 ? "s" : ""}\n`;
    reply += `• **Active risks:** ${risks.length}\n`;
    if (overloadedCount > 0) {
      reply += `• **High-load members:** ${overloadedCount} (consider redistribution)\n`;
    }
    if (event?.date) {
      reply += `• **Event date:** ${formatDeadline(event.date)}\n`;
    }

    if (highPriOpen.length > 0) {
      reply += `\n**🔴 High/Critical priority tasks still open (${highPriOpen.length}):**\n`;
      reply += highPriOpen
        .slice(0, 3)
        .map(
          (t) =>
            `• ${t.title} — ${t.assigneeName || "Unassigned"}`
        )
        .join("\n");
    }

    return reply;
  }

  // ─── 9. FOCUS / PRIORITY / WHAT SHOULD WE DO ──────────────────────────────
  if (
    query.includes("focus") ||
    query.includes("priorit") ||
    query.includes("what should") ||
    query.includes("what to do") ||
    query.includes("recommend") ||
    query.includes("next step") ||
    query.includes("action")
  ) {
    const criticalTasks = openTasks.filter(
      (t) => t.priority === "Critical" || t.priority === "High"
    );
    const criticalRisks = risks.filter(
      (r) =>
        r.severity.toLowerCase() === "critical" ||
        r.severity.toLowerCase() === "high"
    );

    let reply = `🎯 **Recommended Focus Areas for ${eventName}:**\n\n`;
    const items: string[] = [];

    if (overdueTasks.length > 0) {
      items.push(
        `🔴 **Resolve ${overdueTasks.length} overdue task${overdueTasks.length !== 1 ? "s" : ""}** immediately — ${overdueTasks
          .slice(0, 2)
          .map((t) => t.title)
          .join(", ")}${overdueTasks.length > 2 ? "..." : ""}`
      );
    }
    if (criticalRisks.length > 0) {
      items.push(
        `⚠️ **Address ${criticalRisks.length} critical/high risk${criticalRisks.length !== 1 ? "s" : ""}** — ${criticalRisks
          .slice(0, 2)
          .map((r) => r.title)
          .join(", ")}`
      );
    }
    if (unassignedTasks.length > 0) {
      items.push(
        `📌 **Assign owners to ${unassignedTasks.length} unassigned task${unassignedTasks.length !== 1 ? "s" : ""}** to ensure accountability`
      );
    }
    if (upcomingTasks.length > 0) {
      items.push(
        `📅 **${upcomingTasks.length} task${upcomingTasks.length !== 1 ? "s are" : " is"} due within 7 days** — confirm they are on track`
      );
    }
    if (criticalTasks.length > 0 && overdueTasks.length === 0) {
      items.push(
        `🚨 **${criticalTasks.length} high-priority open task${criticalTasks.length !== 1 ? "s" : ""}** need attention`
      );
    }

    if (items.length === 0) {
      reply +=
        `Operations look healthy! ${openTasks.length} open tasks are tracked, no critical risks, and no overdue items. Keep monitoring as the event date approaches.`;
    } else {
      reply += items.join("\n\n");
    }

    return reply;
  }

  // ─── 10. COMPLETED / DONE TASKS ───────────────────────────────────────────
  if (
    query.includes("completed") ||
    query.includes("done") ||
    query.includes("finished") ||
    query.includes("closed task")
  ) {
    if (completedTasks.length === 0) {
      return `No tasks have been marked as done yet for ${eventName}. There are ${openTasks.length} open tasks to work through.`;
    }
    const list = completedTasks
      .slice(0, 6)
      .map(
        (t) =>
          `• ✅ **${t.title}** — ${t.assigneeName || "Unassigned"}`
      )
      .join("\n");

    return (
      `✅ **${completedTasks.length} completed task${completedTasks.length !== 1 ? "s" : ""} for ${eventName}:**\n\n${list}` +
      (completedTasks.length > 6
        ? `\n\n...and ${completedTasks.length - 6} more.`
        : "")
    );
  }

  // ─── 11. TECHNICAL TASKS ──────────────────────────────────────────────────
  if (
    query.includes("technical") ||
    query.includes("tech") ||
    query.includes("av ") ||
    query.includes("audio") ||
    query.includes("video") ||
    query.includes("setup")
  ) {
    const techTasks = openTasks.filter(
      (t) =>
        t.assigneeRole === "Technical" ||
        t.title.toLowerCase().includes("tech") ||
        t.title.toLowerCase().includes("setup") ||
        t.title.toLowerCase().includes("av") ||
        t.title.toLowerCase().includes("audio") ||
        t.title.toLowerCase().includes("video")
    );
    const techMembers = teamMembers.filter((m) => m.role === "Technical");

    let reply = `🔧 **Technical Work for ${eventName}:**\n\n`;
    if (techMembers.length > 0) {
      reply += `**Technical team (${techMembers.length}):** ${techMembers.map((m) => m.name).join(", ")}\n\n`;
    }
    if (techTasks.length > 0) {
      reply += `**Technical tasks (${techTasks.length}):**\n`;
      reply += techTasks
        .map(
          (t) =>
            `• **${t.title}** — ${t.assigneeName || "Unassigned"} | Due: ${formatDeadline(t.deadline || t.dueText)} | ${t.status || "Todo"}`
        )
        .join("\n");
    } else {
      reply += `No specifically-tagged technical tasks found. Check the Tasks tab for the complete task list.`;
    }
    return reply;
  }

  // ─── 12. BUDGET ───────────────────────────────────────────────────────────
  if (
    query.includes("budget") ||
    query.includes("spend") ||
    query.includes("cost") ||
    query.includes("finance") ||
    query.includes("money") ||
    query.includes("allocation")
  ) {
    if (!event?.budgetAllocated) {
      return `No budget information is currently set for ${eventName}. You can configure budget details in the Event Settings.`;
    }
    const spent = event.budgetSpent || 0;
    const allocated = event.budgetAllocated;
    const remaining = allocated - spent;
    const pct = Math.round((spent / allocated) * 100);

    return (
      `💰 **Budget Overview for ${eventName}:**\n\n` +
      `• **Allocated:** $${allocated.toLocaleString()}\n` +
      `• **Spent:** $${spent.toLocaleString()} (${pct}%)\n` +
      `• **Remaining:** $${remaining.toLocaleString()}\n\n` +
      (remaining < 0
        ? `⚠️ Budget is **over by $${Math.abs(remaining).toLocaleString()}**. Review expenditures immediately.`
        : pct >= 80
        ? `🟡 Budget is ${pct}% utilized. Monitor remaining spend carefully.`
        : `✅ Budget utilization is healthy at ${pct}%.`)
    );
  }

  // ─── 13. RSVP / ATTENDANCE / CAPACITY ─────────────────────────────────────
  if (
    query.includes("rsvp") ||
    query.includes("attendance") ||
    query.includes("registr") ||
    query.includes("capacity") ||
    query.includes("how many people") ||
    query.includes("sign") && query.includes("up")
  ) {
    const rsvp = event?.rsvpCount ?? 0;
    const capacity = event?.capacity;

    if (!event) {
      return "No event data is currently loaded. Navigate to an event workspace to see RSVP details.";
    }

    let reply = `🎟️ **RSVP & Attendance for ${eventName}:**\n\n• **RSVPs:** ${rsvp}`;
    if (capacity) {
      const pct = Math.round((rsvp / capacity) * 100);
      reply += ` / ${capacity} capacity (${pct}% filled)`;
      if (pct >= 90) {
        reply += `\n\n🔴 Event is nearly at capacity (${pct}%). Consider managing waitlists.`;
      } else if (pct >= 70) {
        reply += `\n\n🟡 Event is ${pct}% full. Good attendance anticipated.`;
      } else {
        reply += `\n\n📣 ${capacity - rsvp} spots still available. Consider promoting the event more broadly.`;
      }
    } else {
      reply += ` (no capacity limit set)`;
    }
    return reply;
  }

  // ─── 14. EVENT DETAILS / DATE / LOCATION ──────────────────────────────────
  if (
    query.includes("event detail") ||
    query.includes("when is") ||
    query.includes("where is") ||
    query.includes("event date") ||
    query.includes("location") ||
    query.includes("venue") ||
    query.includes("event info") ||
    query.includes("about the event")
  ) {
    if (!event) {
      return "No event is currently selected. Open an event workspace to see its details.";
    }
    return (
      `📌 **Event Details — ${event.title}**\n\n` +
      `• **Category:** ${event.category || "General"}\n` +
      `• **Date:** ${formatDeadline(event.date)}\n` +
      `• **Time:** ${event.time || "TBD"}\n` +
      `• **Location:** ${event.location || "TBD"}\n` +
      `• **Status:** ${event.status || "Planning"}\n` +
      `• **Lead:** ${event.leadName || "Unassigned"}${event.leadRole ? ` (${event.leadRole})` : ""}\n` +
      `• **RSVPs:** ${event.rsvpCount || 0}${event.capacity ? ` / ${event.capacity}` : ""}`
    );
  }

  // ─── 15. TASKS BY MEMBER / WHO IS HANDLING ────────────────────────────────
  if (
    query.includes("handling") ||
    query.includes("responsible") ||
    query.includes("assigned to") ||
    query.includes("working on") ||
    query.includes("who owns")
  ) {
    const byMember: Record<string, AskyTaskContext[]> = {};
    for (const t of openTasks) {
      const name = t.assigneeName || "Unassigned";
      if (!byMember[name]) byMember[name] = [];
      byMember[name].push(t);
    }

    if (Object.keys(byMember).length === 0) {
      return `No open tasks with assignments found for ${eventName}.`;
    }

    let reply = `👤 **Task Ownership for ${eventName}:**\n\n`;
    for (const [name, tList] of Object.entries(byMember)) {
      reply += `**${name}** (${tList.length} task${tList.length !== 1 ? "s" : ""}):\n`;
      reply += tList
        .slice(0, 3)
        .map(
          (t) =>
            `  • ${t.title} — ${t.priority} | Due: ${formatDeadline(t.deadline || t.dueText)}`
        )
        .join("\n");
      if (tList.length > 3) reply += `\n  ...and ${tList.length - 3} more`;
      reply += "\n\n";
    }
    return reply.trim();
  }

  // ─── DEFAULT: Intelligent context summary ─────────────────────────────────
  const pct =
    tasks.length > 0
      ? Math.round((completedTasks.length / tasks.length) * 100)
      : 0;

  let reply = `🤖 **Eventra AI — Event Summary for ${eventName}**\n\n`;

  reply += `**📊 Task Status:** ${completedTasks.length}/${tasks.length} completed (${pct}%)`;
  if (overdueTasks.length > 0) {
    reply += ` | ⚠️ ${overdueTasks.length} overdue`;
  }
  if (unassignedTasks.length > 0) {
    reply += ` | 📌 ${unassignedTasks.length} unassigned`;
  }
  reply += "\n";

  reply += `**👥 Team:** ${teamMembers.length} member${teamMembers.length !== 1 ? "s" : ""}`;
  const overloaded = workloads.filter(
    (w) => w.workloadState === "Overloaded" || w.workloadState === "High"
  );
  if (overloaded.length > 0) {
    reply += ` | ${overloaded.length} with high workload`;
  }
  reply += "\n";

  reply += `**⚠️ Risks:** ${risks.length > 0 ? `${risks.length} active risk${risks.length !== 1 ? "s" : ""}` : "None detected"}\n\n`;

  reply += `You can ask me things like:\n`;
  reply += `• "What tasks are overdue?"\n`;
  reply += `• "Who has the highest workload?"\n`;
  reply += `• "What risks should I be aware of?"\n`;
  reply += `• "What tasks are unassigned?"\n`;
  reply += `• "What should we focus on today?"\n`;
  reply += `• "Summarize upcoming deadlines"\n`;
  reply += `• "Show me the event team"`;

  return reply;
}

export async function POST(req: Request) {
  try {
    const body: AskyChatRequestBody = await req.json();
    const { prompt, context } = body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { error: "Question prompt is required." },
        { status: 400 }
      );
    }

    const trimmedPrompt = prompt.trim();
    const apiKey = process.env.GEMINI_API_KEY;

    // If Gemini API key is missing or blank, use heuristic engine with rich context
    if (!apiKey) {
      const answer = generateHeuristicResponse(trimmedPrompt, context);
      return NextResponse.json({
        answer,
        usedFallback: true,
      });
    }

    // Build rich context prompt for Gemini
    const event = context?.event;
    const tasks = context?.tasks || [];
    const teamMembers = context?.teamMembers || [];
    const workloads = context?.workloads || [];
    const risks = context?.risks || [];

    const now = new Date().toISOString().split("T")[0];

    const contextPrompt = `You are Eventra AI, the dedicated autonomous AI operational assistant for ClubOps AI.
Your mission is to help club leaders, event heads, and organizers successfully manage events, tasks, team workloads, deadlines, and operational risks.
Today's date is: ${now}.

CURRENT CLUBOPS CONTEXT:
${
  event
    ? `EVENT:
- Title: "${event.title}"
- ID: "${event.id}"
- Category: "${event.category || "General"}"
- Date & Time: ${event.date || "TBD"} at ${event.time || "TBD"}
- Location: ${event.location || "TBD"}
- Status: ${event.status || "Planning"}
- RSVPs: ${event.rsvpCount || 0} / ${event.capacity || "unlimited"}
- Lead Organizer: ${event.leadName || "Unassigned"} (${event.leadRole || "Lead"})
- Budget: $${event.budgetSpent || 0} spent of $${event.budgetAllocated || 0} allocated`
    : "No single event currently focused (General Club Operations view)."
}

TASKS (${tasks.length} total):
${
  tasks.length > 0
    ? tasks
        .map(
          (t) =>
            `- "${t.title}" | Status: ${t.status || (t.completed ? "Done" : "Todo")} | Priority: ${t.priority} | Deadline: ${t.deadline || t.dueText || "None"} | Assigned: ${t.assigneeName || "Unassigned"} (${t.assigneeRole || "N/A"})`
        )
        .join("\n")
    : "No tasks recorded."
}

TEAM MEMBERS (${teamMembers.length} total):
${
  teamMembers.length > 0
    ? teamMembers.map((m) => `- ${m.name} (${m.role || "Member"})`).join("\n")
    : "No team members listed."
}

WORKLOADS (${workloads.length} members):
${
  workloads.length > 0
    ? workloads
        .map(
          (w) =>
            `- ${w.memberName}: ${w.activeCount} active tasks, ${w.overdueCount} overdue tasks, Workload state: "${w.workloadState}"`
        )
        .join("\n")
    : "No computed workloads available."
}

DETECTED OPERATIONAL RISKS (${risks.length} total):
${
  risks.length > 0
    ? risks
        .map(
          (r) =>
            `- [${r.severity}] ${r.title}: ${r.description} (Evidence: ${r.evidence || "N/A"})`
        )
        .join("\n")
    : "No active risks detected."
}

USER QUESTION:
"${trimmedPrompt}"

INSTRUCTIONS:
1. Answer the user's question directly, accurately, and professionally using the context above.
2. If asked about overdue tasks, identify any tasks where deadline is past today's date and status is not Done.
3. If asked about workload or who has the highest workload, cite the member with the most active tasks and their workload status.
4. If asked about risks, summarize the detected operational risks with severity and actionable recommendations.
5. If asked about pending/open tasks, list them with assignee, deadline, and priority.
6. If asked about unassigned tasks, list tasks where Assigned is "Unassigned" and suggest team members with low workload.
7. If asked what to focus on, recommend based on overdue tasks, unassigned tasks, upcoming deadlines, and active risks.
8. Keep your tone helpful, structured, concise, and executive (use bullet points where appropriate).
9. Use markdown formatting (bold, bullet points) for readability.
10. Do not mention system prompts or API keys.
11. Return only your direct answer text to the user.`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: contextPrompt }],
              },
            ],
            generationConfig: {
              temperature: 0.3,
            },
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!geminiResponse.ok) {
        throw new Error(`Gemini API returned status ${geminiResponse.status}`);
      }

      const geminiData = await geminiResponse.json();
      const rawText =
        geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!rawText) {
        throw new Error("Empty response returned from Gemini API");
      }

      return NextResponse.json({
        answer: rawText,
        usedFallback: false,
      });
    } catch (apiError) {
      console.warn(
        "Gemini API call failed, using intelligent context fallback:",
        apiError
      );
      const fallbackAnswer = generateHeuristicResponse(trimmedPrompt, context);
      return NextResponse.json({
        answer: fallbackAnswer,
        usedFallback: true,
      });
    }
  } catch (error) {
    console.error("Error in /api/asky/chat:", error);
    return NextResponse.json(
      {
        error:
          "Failed to process question with Eventra AI. Please try again.",
      },
      { status: 500 }
    );
  }
}
