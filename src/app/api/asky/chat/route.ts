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

export const GEMINI_EVENTRA_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "tool_create_event",
        description: "Propose creating a new event in the current club workspace.",
        parameters: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING", description: "Title or name of the event" },
            category: {
              type: "STRING",
              enum: ["Hackathon", "Workshop", "Social", "Speaker", "Competition"],
              description: "Category of event"
            },
            date: { type: "STRING", description: "Event date (e.g., 15 October 2026)" },
            time: { type: "STRING", description: "Event time window" },
            location: { type: "STRING", description: "Event location or venue" },
            capacity: { type: "NUMBER", description: "Expected attendee capacity" },
            budgetAllocated: { type: "NUMBER", description: "Allocated budget" }
          },
          required: ["title"]
        }
      },
      {
        name: "tool_update_event",
        description: "Propose updating fields on the currently open event.",
        parameters: {
          type: "OBJECT",
          properties: {
            eventId: { type: "STRING", description: "Event ID to update" },
            field: {
              type: "STRING",
              enum: ["title", "date", "time", "location", "capacity", "status", "category"],
              description: "Field name to update"
            },
            value: { type: "STRING", description: "New value for the field" }
          },
          required: ["field", "value"]
        }
      },
      {
        name: "tool_create_task",
        description: "Propose creating a new task for the current event.",
        parameters: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING", description: "Task title" },
            priority: {
              type: "STRING",
              enum: ["Low", "Medium", "High", "Urgent"],
              description: "Task priority level"
            },
            dueText: { type: "STRING", description: "Due date or relative deadline" },
            assigneeName: { type: "STRING", description: "Name of team member to assign" },
            assigneeRole: { type: "STRING", description: "Role of team member" }
          },
          required: ["title"]
        }
      },
      {
        name: "tool_update_task",
        description: "Propose updating status or details of a task.",
        parameters: {
          type: "OBJECT",
          properties: {
            taskId: { type: "STRING", description: "Task ID" },
            field: {
              type: "STRING",
              enum: ["status", "priority", "dueText", "completed"],
              description: "Field name to update"
            },
            value: { type: "STRING", description: "New value" }
          },
          required: ["taskId", "field", "value"]
        }
      },
      {
        name: "tool_assign_task",
        description: "Propose assigning a task to a team member.",
        parameters: {
          type: "OBJECT",
          properties: {
            taskId: { type: "STRING", description: "ID of task to assign" },
            assigneeName: { type: "STRING", description: "Target team member name" },
            assigneeRole: { type: "STRING", description: "Target team member role" }
          },
          required: ["taskId", "assigneeName"]
        }
      },
      {
        name: "tool_create_dependency",
        description: "Propose establishing a dependency between two tasks.",
        parameters: {
          type: "OBJECT",
          properties: {
            taskId: { type: "STRING", description: "Task that depends on another task" },
            dependsOnTaskId: { type: "STRING", description: "Prerequisite task ID" }
          },
          required: ["taskId", "dependsOnTaskId"]
        }
      }
    ]
  }
];

export async function POST(req: Request) {
  let trimmedPrompt = "";
  let contextData: AskyChatRequestBody["context"] = undefined;

  try {
    const body: AskyChatRequestBody & {
      history?: { role: string; text: string }[];
      previousFunctionCalls?: Record<string, unknown>[];
      modelParts?: unknown[];
      toolResults?: { name: string; result: Record<string, unknown> }[];
    } = await req.json();

    const { prompt, context, history, previousFunctionCalls, modelParts, toolResults } = body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { error: "Question prompt is required." },
        { status: 400 }
      );
    }

    trimmedPrompt = prompt.trim();
    contextData = context;
    const apiKey = process.env.GEMINI_API_KEY;

    // If Gemini API key is missing or blank, fallback to heuristic engine
    if (!apiKey) {
      const answer = generateHeuristicResponse(trimmedPrompt, contextData);
      return NextResponse.json({
        answer,
        usedFallback: true,
      });
    }

    // Context details
    const event = contextData?.event;
    const tasks = contextData?.tasks || [];
    const teamMembers = contextData?.teamMembers || [];
    const workloads = contextData?.workloads || [];
    const risks = contextData?.risks || [];

    const now = new Date().toISOString().split("T")[0];

    const contextPrompt = `You are Eventra AI, the dedicated autonomous AI operational assistant for ClubOps AI.
Your mission is to help club leaders, event heads, and organizers successfully manage events, tasks, team workloads, deadlines, and operational risks.
Today's date is: ${now}.

CURRENT CLUBOPS CONTEXT:
EVENT: ${event ? `"${event.title}" (ID: "${event.id}", Category: ${event.category}, Date: ${event.date}, Location: ${event.location}, Status: ${event.status})` : "No active event select."}

TASKS (${tasks.length} total):
${
  tasks.length > 0
    ? tasks
        .map(
          (t) =>
            `- ID: "${t.id}" | Title: "${t.title}" | Status: ${t.status || (t.completed ? "Done" : "Todo")} | Priority: ${t.priority} | Deadline: ${t.deadline || t.dueText || "None"} | Assigned: ${t.assigneeName || "Unassigned"} (${t.assigneeRole || "N/A"})`
        )
        .join("\n")
    : "No tasks recorded."
}

TEAM MEMBERS (${teamMembers.length} total):
${
  teamMembers.length > 0
    ? teamMembers.map((m) => `- ID: "${m.id}" | Name: ${m.name} | Role: (${m.role || "Member"})`).join("\n")
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

USER REQUEST:
"${trimmedPrompt}"

INSTRUCTIONS FOR EVENTRA AI CONVERSATIONAL ASSISTANT & AGENT:
1. You are Eventra AI, a senior executive event planner and operational AI assistant.
2. CONVERSATIONAL ASSISTANT BEHAVIOR & RESPONSES:
   - Respond like a natural assistant, NOT like a rigid static dashboard dump (avoid dumping raw "Task Status: 0/0, Team: 2 members, Risks: None" repeatedly).
   - Answer the user's specific question directly. If there are no overdue tasks or risks, respond conversationally (e.g. "There aren't any tasks recorded yet, so there's nothing overdue. Your event currently has X team members.").
   - Keep answers easy to scan using short paragraphs, bold key names/statuses, and bulleted lists. Avoid long giant blocks of text.
3. CONTINUOUS CONVERSATION & FOLLOW-UPS:
   - Use the conversation history context to answer follow-up questions seamlessly (e.g., if previous question was about overdue tasks and user asks "Why is venue setup urgent?", reference the venue setup details naturally).
4. DUPLICATE CHECK (AVOID DUPLICATE CREATION):
   - Review CURRENT CLUBOPS CONTEXT carefully. If an event or task with a matching title already exists, DO NOT call tool_create_event or tool_create_task again unnecessarily!
5. FULL EVENT PLANNING FLOW:
   - When the user asks to plan or create a new event (e.g. "Mare Tech Fest karvo chhe...", "Plan an event...", "Create Tech Fest"):
   - Propose tool_create_event (if not existing).
   - Propose multiple tool_create_task calls for initial execution tasks.
   - Set deadlines BEFORE the event date. NEVER create deadlines after the event date.
   - Propose tool_assign_task calls assigning tasks to members in TEAM MEMBERS based on role fit.
   - Propose tool_create_dependency calls for logical task prerequisites.
6. TURN 2 RESPONSE (AFTER TOOL EXECUTION RESULTS):
   - When tool execution results are provided, produce a clean executive final response based strictly on actual database execution results.
7. GENERAL QUESTIONS & QUERIES:
   - If no tool calls are needed, respond directly with conversational, clear Markdown formatted text with bullet points.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const callGemini = async (contents: unknown[], tools?: unknown[]) => {
      const modelsToTry = ["gemini-2.5-flash", "gemini-flash-latest"];
      let lastRes: Response | null = null;
      let lastErrText = "";

      for (const modelName of modelsToTry) {
        for (let attempt = 0; attempt < 2; attempt++) {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents,
                tools,
                generationConfig: { temperature: 0.2 },
              }),
              signal: controller.signal,
            }
          );

          if (res.ok) {
            return await res.json();
          }

          lastRes = res;
          lastErrText = await res.text();
          if (res.status === 404) {
            break;
          }
          if ((res.status === 503 || res.status === 429) && attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          }
          throw new Error(`Gemini API returned status ${res.status}: ${lastErrText}`);
        }
      }

      throw new Error(`Gemini API returned status ${lastRes?.status || 500}: ${lastErrText}`);
    };

    // Build multi-turn contents history for Gemini
    const contentsHistory: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (history && Array.isArray(history)) {
      for (const turn of history.slice(-6)) {
        if (turn.text && typeof turn.text === "string" && turn.text.trim()) {
          contentsHistory.push({
            role: turn.role === "user" ? "user" : "model",
            parts: [{ text: turn.text.trim() }],
          });
        }
      }
    }

    // Add current turn with full context
    contentsHistory.push({
      role: "user",
      parts: [{ text: contextPrompt }],
    });

    // TURN 2: Responding after Tool Execution Result
    if (toolResults && toolResults.length > 0 && (previousFunctionCalls || modelParts)) {
      const contents = [
        {
          role: "user",
          parts: [{ text: contextPrompt }]
        },
        {
          role: "model",
          parts: modelParts && modelParts.length > 0
            ? modelParts
            : (previousFunctionCalls || []).map((fc) => ({ functionCall: fc }))
        },
        {
          role: "user",
          parts: toolResults.map((tr) => ({
            functionResponse: {
              name: tr.name,
              response: tr.result
            }
          }))
        }
      ];

      const geminiData = await callGemini(contents, GEMINI_EVENTRA_TOOLS);
      clearTimeout(timeoutId);

      const partsArray = geminiData?.candidates?.[0]?.content?.parts as Array<Record<string, unknown>> | undefined;
      const finalAnswer =
        partsArray
          ?.filter((p) => typeof p.text === "string")
          ?.map((p) => p.text as string)
          ?.join("\n") || "Done — action completed.";

      return NextResponse.json({
        answer: finalAnswer,
        proposedPlan: null,
        usedGeminiTools: true
      });
    }

    // TURN 1: Initial Reasoning & Function Call Decision
    const geminiData = await callGemini(
      contentsHistory,
      GEMINI_EVENTRA_TOOLS
    );
    clearTimeout(timeoutId);
    const candidateParts = (geminiData?.candidates?.[0]?.content?.parts as Array<Record<string, unknown>> | undefined) || [];

    const rawFunctionCalls = candidateParts
      .filter((p) => p.functionCall)
      .map((p) => p.functionCall as Record<string, unknown>);

    const rawText = candidateParts
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text as string)
      .join("\n")
      .trim();

    // If Gemini chose function calls (tools), convert them into Eventra proposed actions
    if (rawFunctionCalls.length > 0) {
      const actions: import("@/lib/agent").AgentAction[] = [];

      for (const fc of rawFunctionCalls) {
        const name = String(fc.name || "");
        const args = (fc.args as Record<string, unknown>) || {};

        if (name === "tool_create_event") {
          const title = String(args.title || "Tech Fest 2026").trim();
          const date = String(args.date || "15 October 2026").trim();
          const location = String(args.location || "Campus Center").trim();
          const capacity = Number(args.capacity) || 500;
          const category = String(args.category || "Workshop");

          actions.push({
            id: "agent-" + Math.random().toString(36).substring(2, 11),
            type: "CREATE_EVENT",
            description: `Create Event: "${title}" on ${date} at ${location} (~${capacity} attendees)`,
            requiresApproval: true,
            payload: {
              clubId: event?.id || "club-1",
              title,
              category,
              date,
              time: String(args.time || "10:00 AM - 6:00 PM"),
              location,
              capacity,
              budgetAllocated: Number(args.budgetAllocated) || 1500,
              leadName: "Event Lead",
              leadRole: "Event Lead",
            },
            status: "proposed",
          });
        } else if (name === "tool_create_task") {
          const title = String(args.title || "New Task").trim();
          const priorityStr = String(args.priority || "Medium");
          const priority = (["Low", "Medium", "High", "Urgent"].includes(priorityStr)
            ? priorityStr
            : "Medium") as "Low" | "Medium" | "High" | "Urgent";
          const dueText = String(args.dueText || "Upcoming").trim();
          const reqAssignee = String(args.assigneeName || "Unassigned").trim();

          // Match member from context for security & alignment
          const matchedMember = teamMembers.find(
            (m) => m.name.toLowerCase() === reqAssignee.toLowerCase()
          );

          actions.push({
            id: "agent-" + Math.random().toString(36).substring(2, 11),
            type: "CREATE_TASK",
            description: `Task: "${title}" → Assign: ${matchedMember ? matchedMember.name : reqAssignee} [${priority}]`,
            requiresApproval: true,
            payload: {
              clubId: event?.id || "club-1",
              eventId: event?.id || "",
              title,
              eventTag: event?.title || "General",
              priority,
              dueText,
              deadline: dueText,
              assigneeName: matchedMember ? matchedMember.name : reqAssignee,
              assigneeRole: matchedMember ? (matchedMember.role || "Member") : String(args.assigneeRole || "Member"),
              assigneeMemberId: matchedMember?.id,
              status: "Todo",
              dependencies: [],
            },
            status: "proposed",
          });
        } else if (name === "tool_assign_task") {
          const reqTaskId = String(args.taskId || "").trim();
          const reqAssignee = String(args.assigneeName || "").trim();

          const matchedTask = tasks.find(
            (t) => t.id === reqTaskId || t.title.toLowerCase().includes(reqTaskId.toLowerCase())
          );

          const matchedMember = teamMembers.find(
            (m) => m.name.toLowerCase() === reqAssignee.toLowerCase()
          );

          if (matchedTask || reqTaskId) {
            actions.push({
              id: "agent-" + Math.random().toString(36).substring(2, 11),
              type: "ASSIGN_TASK",
              description: `Assign Task: "${matchedTask ? matchedTask.title : reqTaskId}" → ${matchedMember ? matchedMember.name : reqAssignee}`,
              requiresApproval: true,
              payload: {
                taskId: matchedTask ? matchedTask.id : reqTaskId,
                assigneeName: matchedMember ? matchedMember.name : reqAssignee,
                assigneeRole: matchedMember ? matchedMember.role : String(args.assigneeRole || "Member"),
                assigneeMemberId: matchedMember?.id,
              },
              status: "proposed",
            });
          }
        } else if (name === "tool_update_event") {
          actions.push({
            id: "agent-" + Math.random().toString(36).substring(2, 11),
            type: "UPDATE_EVENT_FIELD",
            description: `Update Event: Change ${args.field} to "${args.value}"`,
            requiresApproval: true,
            payload: {
              eventId: String(args.eventId || event?.id),
              field: String(args.field),
              value: args.value,
            },
            status: "proposed",
          });
        } else if (name === "tool_update_task") {
          actions.push({
            id: "agent-" + Math.random().toString(36).substring(2, 11),
            type: "UPDATE_TASK_FIELD",
            description: `Update Task (${args.taskId}): Change ${args.field} to "${args.value}"`,
            requiresApproval: true,
            payload: {
              taskId: String(args.taskId),
              field: String(args.field),
              value: args.value,
            },
            status: "proposed",
          });
        } else if (name === "tool_create_dependency") {
          actions.push({
            id: "agent-" + Math.random().toString(36).substring(2, 11),
            type: "CREATE_TASK_DEPENDENCY",
            description: `Dependency: Task ${args.taskId} depends on ${args.dependsOnTaskId}`,
            requiresApproval: true,
            payload: {
              taskId: String(args.taskId),
              dependsOnTaskId: String(args.dependsOnTaskId),
            },
            status: "proposed",
          });
        }
      }

      if (actions.length > 0) {
        const createEvtAction = actions.find((a) => a.type === "CREATE_EVENT");
        const evtPayload = (createEvtAction?.payload || {}) as Record<string, unknown>;
        const eventTitle = String(evtPayload.title || event?.title || "Event Plan");
        const eventDate = String(evtPayload.date || event?.date || "TBD");
        const eventLoc = String(evtPayload.location || event?.location || "TBD");
        const eventCap = String(evtPayload.capacity || event?.capacity || "500");

        const taskActions = actions.filter((a) => a.type === "CREATE_TASK");
        const depActions = actions.filter((a) => a.type === "CREATE_TASK_DEPENDENCY");

        const teamSet = new Set<string>();
        for (const ta of taskActions) {
          const p = ta.payload as Record<string, unknown>;
          if (p.assigneeRole) teamSet.add(String(p.assigneeRole));
          if (p.assigneeName && p.assigneeName !== "Unassigned") teamSet.add(String(p.assigneeName));
        }

        let planSummary = `### ${eventTitle} — Event Plan\n\n`;
        planSummary += `**Event**\n`;
        planSummary += `- Date: **${eventDate}**\n`;
        planSummary += `- Location: **${eventLoc}**\n`;
        planSummary += `- Expected Attendees: **${eventCap}**\n\n`;

        if (teamSet.size > 0) {
          planSummary += `**Teams & Roles**\n`;
          teamSet.forEach((t) => {
            planSummary += `- ${t}\n`;
          });
          planSummary += `\n`;
        }

        if (taskActions.length > 0) {
          planSummary += `**Initial Tasks (${taskActions.length})**\n`;
          taskActions.forEach((ta, idx) => {
            const p = ta.payload as Record<string, unknown>;
            planSummary += `${idx + 1}. **${p.title}**\n`;
            planSummary += `   Owner: ${p.assigneeName || p.assigneeRole || "Unassigned"} | Deadline: ${p.dueText || p.deadline || "TBD"} | Priority: ${p.priority || "Medium"}\n`;
          });
          planSummary += `\n`;
        }

        if (depActions.length > 0) {
          planSummary += `**Dependencies (${depActions.length})**\n`;
          depActions.forEach((da) => {
            const p = da.payload as Record<string, unknown>;
            planSummary += `- Task "${p.taskId}" depends on "${p.dependsOnTaskId || (p.dependencyIds as string[])?.[0] || "Prerequisite"}"\n`;
          });
          planSummary += `\n`;
        }

        planSummary += `**Approval Required**\nPlease review and approve below to execute this plan in Supabase.`;

        const proposedPlan = {
          userRequest: trimmedPrompt,
          intent: createEvtAction ? "CREATE_EVENT" : actions[0].type,
          reasoningSummary: planSummary,
          actions,
          requiresApproval: true,
          createdAt: new Date().toISOString(),
        };

        return NextResponse.json({
          answer: rawText || null,
          proposedPlan,
          functionCalls: rawFunctionCalls,
          modelParts: candidateParts,
          usedGeminiTools: true,
        });
      }
    }

    return NextResponse.json({
      answer: rawText || "Here is your operational summary.",
      proposedPlan: null,
      usedGeminiTools: true,
    });
  } catch (apiError) {
    console.warn(
      "Gemini API call failed, using intelligent context fallback:",
      apiError
    );
    const fallbackAnswer = generateHeuristicResponse(trimmedPrompt, contextData);
    return NextResponse.json({
      answer: fallbackAnswer,
      usedFallback: true,
    });
  }
}

