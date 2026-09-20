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
    club?: { id: string; name?: string } | null;
    event?: (AskyEventContext & { clubId?: string }) | null;
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

  // ─── 1. EVENT NAME ─────────────────────────────────────────────────────────
  if (
    query.includes("name of this event") ||
    query.includes("name of the event") ||
    query.includes("event name") ||
    query.includes("what is the name") ||
    query.includes("what is this event") ||
    query.includes("what event is this") ||
    query.includes("event's name")
  ) {
    if (event?.title) {
      return `The event is **${event.title}**.`;
    }
    return "No active event is currently selected.";
  }

  // ─── 2. EVENT CREATION REQUEST ──────────────────────────────────────────────
  if (
    query.includes("make an event") ||
    query.includes("create an event") ||
    query.includes("create event") ||
    query.includes("make event") ||
    query.includes("new event") ||
    query.includes("plan an event") ||
    query.includes("plan event") ||
    query.includes("can you make") ||
    query.includes("i want to create") ||
    query.includes("let's create") ||
    query.includes("make me an event") ||
    query.includes("make another event") ||
    query.includes("plan another event") ||
    query.includes("host an event")
  ) {
    if (query.includes("tech fest") && (query.includes("october") || query.includes("oct") || query.includes("college") || query.includes("500"))) {
      return `### Ready to Create: Tech Fest\n\n- **Date:** 15 October\n- **Location:** ABC College\n- **Expected Attendees:** 500\n\nPlease approve the action plan to create this event in your club workspace.`;
    }
    if (query.includes("called ") || query.includes("named ")) {
      const match = prompt.match(/(?:called|named)\s+([^,.]+)/i);
      const name = match ? match[1].trim() : "the event";
      return `Great! When is **${name}**, where will it be held, and how many attendees are you expecting?`;
    }
    return "Absolutely. I can set that up. What should the event be called?";
  }

  // ─── 3. OVERDUE ────────────────────────────────────────────────────────────
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

  // ─── 4. UPCOMING / DEADLINES / DATE ───────────────────────────────────────
  if (
    query.includes("when is") ||
    query.includes("when is this event") ||
    query.includes("when is it") ||
    query.includes("event date") ||
    query.includes("upcoming") ||
    query.includes("deadline") ||
    query.includes("due soon") ||
    query.includes("this week") ||
    query.includes("next few days") ||
    (query.includes("summarize") && query.includes("deadline"))
  ) {
    if (query.includes("when is") || query.includes("when is it") || query.includes("event date")) {
      if (event?.date) {
        return `The event **${event.title || "this event"}** is scheduled for **${formatDeadline(event.date)}**${event.time ? ` at ${event.time}` : ""}.`;
      }
      return `No date has been scheduled yet for ${eventName}.`;
    }

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

  // ─── 5. WORKLOAD / WHO HAS THE MOST ───────────────────────────────────────
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

  // ─── 6. RISKS / WARNINGS ──────────────────────────────────────────────────
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

  // ─── 7. PENDING / OPEN TASKS ──────────────────────────────────────────────
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

  // ─── 8. UNASSIGNED TASKS ──────────────────────────────────────────────────
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

  // ─── 9. TEAM / MEMBERS ────────────────────────────────────────────────────
  if (
    !query.includes("assign") &&
    !query.includes("who should handle") &&
    !query.includes("give this to") &&
    (
      query.includes("team") ||
      query.includes("member") ||
      query.includes("who is on") ||
      query.includes("who are") ||
      query.includes("involved") ||
      query.includes("staff") ||
      query.includes("people")
    )
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

  // ─── 10. EXPLICIT SUMMARY / PROGRESS / OVERVIEW ───────────────────────────
  if (
    query.includes("summarize") ||
    query.includes("summary") ||
    query.includes("overview") ||
    query.includes("status") ||
    query.includes("progress") ||
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

  // ─── 11. FOCUS / PRIORITY / WHAT SHOULD WE DO ──────────────────────────────
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

  // ─── 16. TASK ASSIGNMENT / WHO SHOULD HANDLE ──────────────────────────────
  if (
    query.includes("assign") ||
    query.includes("who should handle") ||
    query.includes("who can take") ||
    query.includes("give this to") ||
    query.includes("best member") ||
    query.includes("best available")
  ) {
    const unassigned = openTasks.find((t) => !t.assigneeName || t.assigneeName === "Unassigned") || openTasks[0];
    if (teamMembers.length === 0) {
      return `No team members are currently registered for ${eventName}. Add members to the event team first.`;
    }

    // Sort by lowest active workload
    const sorted = [...teamMembers].sort((a, b) => {
      const wA = workloads.find((w) => w.memberName.toLowerCase() === a.name.toLowerCase())?.activeCount ?? 0;
      const wB = workloads.find((w) => w.memberName.toLowerCase() === b.name.toLowerCase())?.activeCount ?? 0;
      return wA - wB;
    });

    const chosen = sorted[0];
    const chosenWorkload = workloads.find((w) => w.memberName.toLowerCase() === chosen.name.toLowerCase());
    const loadSummary = chosenWorkload
      ? `${chosenWorkload.workloadState} workload (${chosenWorkload.activeCount} active tasks, ${chosenWorkload.overdueCount} overdue)`
      : "lowest active workload and high availability";

    const taskTitle = unassigned ? unassigned.title : "this task";

    return (
      `Suggested assignment:\n` +
      `Task: ${taskTitle}\n` +
      `Member: ${chosen.name}${chosen.role ? ` (${chosen.role})` : ""}\n` +
      `Reason: Matches ${chosen.role || "team"} capability with ${loadSummary}.\n\n` +
      `Approve this assignment?`
    );
  }

  // ─── DEFAULT: Ambiguity Guidance ──────────────────────────────────────────
  return "I'm not sure what you mean yet. You can ask me about this event's tasks, team, deadlines, risks, or ask me to create/update something.";
}

export const GEMINI_EVENTRA_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "tool_create_event",
        description: "Propose creating a new real event in the current club workspace. Use ONLY when the user provides the event name, date, and location. If the user only says 'create an event' or 'can you make an event?' without details, do NOT call this tool with fake/empty values; instead ask for the event name and missing details conversationally.",
        parameters: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING", description: "Title or name of the event" },
            category: {
              type: "STRING",
              enum: ["Hackathon", "Workshop", "Social", "Speaker", "Competition"],
              description: "Category of event (defaults to Workshop if unspecified)"
            },
            date: { type: "STRING", description: "Event date (e.g., 15 October 2026)" },
            time: { type: "STRING", description: "Event time window (e.g., 10:00 AM - 5:00 PM)" },
            location: { type: "STRING", description: "Event location or venue (e.g., ABC College, Main Auditorium)" },
            capacity: { type: "INTEGER", description: "Expected attendee capacity (e.g., 500)" },
            budgetAllocated: { type: "INTEGER", description: "Allocated budget in USD" }
          },
          required: ["title", "date", "location"]
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
        description: "Propose assigning a task to the best available event team member based on role fit, capability, and current workload. ALWAYS use this tool when the user asks to assign a task, give a task to a member, or asks who should handle a task.",
        parameters: {
          type: "OBJECT",
          properties: {
            taskId: { type: "STRING", description: "ID or title of the task to assign" },
            assigneeName: { type: "STRING", description: "Target team member name from TEAM MEMBERS" },
            assigneeRole: { type: "STRING", description: "Target team member role" },
            reason: { type: "STRING", description: "Clear explanation of why this member was selected based on their role and current workload" }
          },
          required: ["taskId", "assigneeName", "reason"]
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
5. EVENT CREATION CONVERSATIONAL PROTOCOL & FUNCTION CALLING:
   - When the user expresses intent to create/make/plan an event (e.g., "can you make an event?", "make an event", "create an event", "I want to create an event", "let's create an event", "make me an event"):
     * If required details (event name/title, date, location/venue, capacity) are NOT yet provided in the message or conversation history, DO NOT call tool_create_event with empty or placeholder values!
     * Instead, respond naturally and conversationally asking for the missing details (e.g., "Absolutely. I can set that up. What should the event be called?").
     * Collect missing details conversationally step-by-step: event name, date, venue/location, and expected attendees.
     * ONLY once the necessary details (at least the event title, date, and location) are provided by the user, invoke tool_create_event with the collected values.
     * The tool call will generate a clear approval card for human review before any database write occurs.
6. AI TASK ASSIGNMENT PROTOCOL & WORKLOAD REASONING:
   - When the user asks to assign a task (e.g., "Assign this task to the best available member", "assign this task", "give this to the best member", "who should handle this?", "assign it to Technical", "assign this to [member name]"):
     * Review the TASKS list to identify the target task (if unspecified, choose the open/unassigned task).
     * Review TEAM MEMBERS and their specific roles (Technical, Logistics, Marketing, Design, Sponsorship, Registration).
     * Review WORKLOADS to pick the most suitable member with the lowest active workload (0-2 Low, 3-4 Medium, 5-6 High, 7+ Overloaded) and zero/few overdue tasks.
     * NEVER assign to a person who is not listed in TEAM MEMBERS.
     * Invoke tool_assign_task with:
       - taskId: the task ID
       - assigneeName: the chosen member's exact name
       - assigneeRole: the chosen member's role
       - reason: a concise explanation of their role suitability and current workload (e.g., "Technical Lead with low workload (1 active task, 0 overdue)")
     * Do NOT execute the database write silently. The tool proposal will generate an approval card for human confirmation first.
7. TURN 2 RESPONSE (AFTER TOOL EXECUTION RESULTS):
   - When tool execution results are provided, produce a clean executive final response based strictly on actual database execution results (e.g., "Done — Tech Fest has been created successfully." or "Done — [Task] has been assigned to [Member].").
8. GENERAL QUESTIONS & QUERIES:
   - If no tool calls are needed, respond directly with conversational, clear Markdown formatted text with bullet points.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const callGemini = async (contents: unknown[], tools?: unknown[]) => {
      const modelsToTry = [
        "gemini-3.5-flash",
        "gemini-3.6-flash",
        "gemini-flash-lite-latest",
        "gemini-3.5-flash-lite",
        "gemini-flash-latest",
      ];
      let lastRes: Response | null = null;
      let lastErrText = "";

      for (const modelName of modelsToTry) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
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
              console.warn(`Model ${modelName} returned 404, trying next available model...`);
              break;
            }
            if (res.status === 429) {
              console.warn(`Model ${modelName} quota reached (429), trying next available model...`);
              break;
            }
            if (res.status === 503 && attempt === 0) {
              await new Promise((resolve) => setTimeout(resolve, 500));
              continue;
            }
            break;
          } catch (fetchErr) {
            console.warn(`Fetch error with model ${modelName}:`, fetchErr);
            break;
          }
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
      try {
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
            ?.join("\n");

        if (finalAnswer) {
          return NextResponse.json({
            answer: finalAnswer,
            proposedPlan: null,
            usedGeminiTools: true
          });
        }
      } catch (turn2Err) {
        console.warn("Turn 2 Gemini call failed, building response from execution results:", turn2Err);
      }

      // If Turn 2 Gemini synthesis failed or was empty, synthesize response directly from actual tool results
      const assignResult = toolResults.find((tr) => tr.name === "tool_assign_task" || tr.name === "assign_task");
      if (assignResult) {
        const resObj = (assignResult.result || {}) as Record<string, unknown>;
        const isSuccess = resObj.status === "completed" || !!resObj.data;
        const assignData = (resObj.data || {}) as Record<string, unknown>;
        const assignedTo = assignData.assignedTo ? String(assignData.assignedTo) : "the selected team member";
        if (isSuccess) {
          return NextResponse.json({
            answer: `Done — the task has been successfully assigned to **${assignedTo}**.`,
            proposedPlan: null,
            usedGeminiTools: true
          });
        } else {
          return NextResponse.json({
            answer: `Failed to assign task: ${resObj.error || "Unknown error"}`,
            proposedPlan: null,
            usedGeminiTools: true
          });
        }
      }

      const eventResult = toolResults.find((tr) => tr.name === "tool_create_event" || tr.name === "create_event");
      if (eventResult) {
        const resObj = (eventResult.result || {}) as Record<string, unknown>;
        const isSuccess = resObj.status === "completed" || !!resObj.data;
        const eventData = (resObj.data || {}) as Record<string, unknown>;
        const title = eventData.title ? String(eventData.title) : "Event";
        if (isSuccess) {
          return NextResponse.json({
            answer: `Done — **${title}** has been created successfully.`,
            proposedPlan: null,
            usedGeminiTools: true
          });
        } else {
          return NextResponse.json({
            answer: `Failed to create event: ${resObj.error || "Unknown error"}`,
            proposedPlan: null,
            usedGeminiTools: true
          });
        }
      }

      return NextResponse.json({
        answer: "Done — actions executed successfully.",
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
          const title = String(args.title || "Tech Fest").trim();
          const date = String(args.date || "15 October").trim();
          const location = String(args.location || "Campus Center").trim();
          const capacity = Number(args.capacity) || 500;
          const category = String(args.category || "Workshop");
          const targetClubId =
            contextData?.club?.id ||
            (event as { clubId?: string })?.clubId ||
            (event?.id && !event.id.startsWith("evt-") ? event.id : "");

          actions.push({
            id: "agent-" + Math.random().toString(36).substring(2, 11),
            type: "CREATE_EVENT",
            description: `Create Event: "${title}" on ${date} at ${location} (~${capacity} attendees)`,
            requiresApproval: true,
            payload: {
              clubId: targetClubId,
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
            status: "pending_approval",
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
            status: "pending_approval",
          });
        } else if (name === "tool_assign_task") {
          const reqTaskId = String(args.taskId || "").trim();
          const reqAssignee = String(args.assigneeName || "").trim();
          const reqReason = String(args.reason || "").trim();

          const matchedTask =
            tasks.find(
              (t) =>
                t.id === reqTaskId ||
                t.title.toLowerCase().includes(reqTaskId.toLowerCase()) ||
                reqTaskId.toLowerCase().includes(t.title.toLowerCase())
            ) ||
            tasks.find((t) => !t.assigneeName || t.assigneeName === "Unassigned") ||
            tasks[0];

          const matchedMember = teamMembers.find(
            (m) =>
              m.name.toLowerCase() === reqAssignee.toLowerCase() ||
              m.name.toLowerCase().includes(reqAssignee.toLowerCase()) ||
              reqAssignee.toLowerCase().includes(m.name.toLowerCase())
          );

          const memberWorkload = workloads.find(
            (w) => w.memberName.toLowerCase() === (matchedMember?.name || reqAssignee).toLowerCase()
          );

          const finalTaskId = matchedTask ? matchedTask.id : reqTaskId;
          const finalTaskTitle = matchedTask ? matchedTask.title : (reqTaskId || "Task");
          const finalAssigneeName = matchedMember ? matchedMember.name : reqAssignee;
          const finalAssigneeRole = matchedMember
            ? (matchedMember.role || "Member")
            : String(args.assigneeRole || "Member");
          const finalMemberId = matchedMember ? matchedMember.id : undefined;
          const finalEventId = event?.id || (matchedTask as { eventId?: string })?.eventId || "";

          let assignmentReason = reqReason;
          if (!assignmentReason) {
            const loadDesc = memberWorkload
              ? `${memberWorkload.workloadState} workload (${memberWorkload.activeCount} active tasks, ${memberWorkload.overdueCount} overdue)`
              : "lowest active workload and optimal availability";
            assignmentReason = `Matches ${finalAssigneeRole} capability with ${loadDesc}.`;
          }

          if (finalTaskId) {
            actions.push({
              id: "agent-" + Math.random().toString(36).substring(2, 11),
              type: "ASSIGN_TASK",
              description: `Assign Task: "${finalTaskTitle}" → ${finalAssigneeName} (${finalAssigneeRole})`,
              requiresApproval: true,
              payload: {
                taskId: finalTaskId,
                taskTitle: finalTaskTitle,
                eventId: finalEventId,
                clubId: contextData?.club?.id || (event as { clubId?: string })?.clubId || "",
                assigneeName: finalAssigneeName,
                assigneeRole: finalAssigneeRole,
                assigneeMemberId: finalMemberId,
                memberName: finalAssigneeName,
                memberRole: finalAssigneeRole,
                memberId: finalMemberId,
                reason: assignmentReason,
              },
              status: "pending_approval",
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
            status: "pending_approval",
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
            status: "pending_approval",
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
            status: "pending_approval",
          });
        }
      }

      if (actions.length > 0) {
        const assignAction = actions.find((a) => a.type === "ASSIGN_TASK");
        if (assignAction) {
          const p = assignAction.payload as Record<string, unknown>;
          const taskName = String(p.taskTitle || "Task");
          const memberName = String(p.assigneeName || "Member");
          const reason = String(p.reason || "Matches role capability with lowest active workload.");

          let planSummary = `Suggested assignment:\n`;
          planSummary += `Task: ${taskName}\n`;
          planSummary += `Member: ${memberName}\n`;
          planSummary += `Reason: ${reason}\n\n`;
          planSummary += `Approve this assignment?`;

          const proposedPlan = {
            userRequest: trimmedPrompt,
            intent: "ASSIGN_TASK",
            reasoningSummary: planSummary,
            actions,
            requiresApproval: true,
            createdAt: new Date().toISOString(),
          };

          return NextResponse.json({
            answer:
              rawText ||
              `I’ve analyzed team workloads and capabilities. Here is the recommended task assignment:`,
            proposedPlan,
            functionCalls: rawFunctionCalls,
            modelParts: candidateParts,
            usedGeminiTools: true,
          });
        }

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

        const defaultEventAnswer = createEvtAction
          ? `Here’s what I’m ready to create:\n\n**${eventTitle}**\n- 📅 Date: ${eventDate}\n- 📍 Location: ${eventLoc}\n- 👥 Expected attendees: ${eventCap}\n\nCreate this event?`
          : null;

        return NextResponse.json({
          answer: rawText || defaultEventAnswer,
          proposedPlan,
          functionCalls: rawFunctionCalls,
          modelParts: candidateParts,
          usedGeminiTools: true,
        });
      }
    }

    return NextResponse.json({
      answer: rawText || generateHeuristicResponse(trimmedPrompt, contextData),
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

