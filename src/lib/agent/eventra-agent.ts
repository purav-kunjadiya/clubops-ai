/**
 * Eventra AI — Central Orchestration Service
 *
 * This is the single entry point for all Eventra AI agent operations.
 *
 * processUserRequest(input, context) → AgentPlan
 *
 * Current implementation: heuristic intent detection + plan generation.
 * Architecture is explicitly designed so Gemini can replace the heuristic
 * planner in Step 5.2 without changing the tool layer or the approval/
 * execution contract.
 *
 * ─── Three-Layer Architecture ───────────────────────────────────────────────
 *
 *   LAYER A  AI REASONING  (this file)
 *            Receives user input + EventraAgentContext.
 *            Decides intent, constructs AgentActions, returns AgentPlan.
 *            Does NOT touch Supabase.
 *
 *   LAYER B  HUMAN APPROVAL  (UI — Event Workspace "AI" tab, Step 5.2+)
 *            Club Head reviews proposed actions.
 *            Sets action.status = "approved" | "rejected".
 *
 *   LAYER C  TOOL EXECUTION  (src/lib/agent/tools.ts)
 *            executeApprovedActions() calls the correct tool per action type.
 *            Write tools validate status === "approved" before ANY DB write.
 *
 * ─── Security ────────────────────────────────────────────────────────────────
 *   - GEMINI_API_KEY remains server-side (used in /api/asky/chat route only).
 *   - No AI-generated ID is trusted without validation in the tool layer.
 *   - Assignment targets must be in event.teamMembers (enforced in tools.ts).
 *   - Cross-club access is impossible (context is club-scoped).
 * ────────────────────────────────────────────────────────────────────────────
 */

import type { AgentPlan, AgentIntent, AgentAction } from "./types";
import type { EventraAgentContext } from "./context";

function generateId(): string {
  return "agent-" + Math.random().toString(36).substring(2, 11);
}
import {
  tool_create_event,
  tool_create_task,
  tool_update_task,
  tool_assign_task,
  tool_create_dependency,
  tool_update_event,
} from "./tools";
import type { TaskItem } from "@/components/types";

// ─── Intent Detection ─────────────────────────────────────────────────────────

/**
 * Maps a natural-language user request to an AgentIntent.
 *
 * This is a keyword-based heuristic for now.
 * In Step 5.2 this function will be replaced by a Gemini classification call.
 */
function detectIntent(input: string): AgentIntent {
  const q = input.toLowerCase();

  // Creation intents
  if (
    (q.includes("create") || q.includes("organize") || q.includes("plan") ||
     q.includes("set up") || q.includes("schedule")) &&
    (q.includes("event") || q.includes("fest") || q.includes("hackathon") ||
     q.includes("workshop") || q.includes("meetup") || q.includes("talk"))
  ) {
    return "CREATE_EVENT";
  }

  if (
    (q.includes("create") || q.includes("add") || q.includes("generate") ||
     q.includes("make") || q.includes("set up")) &&
    (q.includes("task") || q.includes("tasks") || q.includes("todo") ||
     q.includes("checklist") || q.includes("work item"))
  ) {
    return "CREATE_TASKS";
  }

  // Assignment
  if (
    q.includes("assign") || q.includes("allocate") ||
    (q.includes("give") && q.includes("task")) ||
    (q.includes("who should") && q.includes("handle"))
  ) {
    return "ASSIGN_TASKS";
  }

  // Dependencies
  if (
    q.includes("depend") || q.includes("prerequisite") ||
    q.includes("blocks") || q.includes("after") && q.includes("task") ||
    q.includes("sequence") || q.includes("order the tasks")
  ) {
    return "CREATE_DEPENDENCIES";
  }

  // Workload
  if (
    q.includes("workload") || q.includes("busy") || q.includes("overload") ||
    q.includes("capacity") || q.includes("who has the most") ||
    q.includes("redistribute")
  ) {
    return "ANALYZE_WORKLOAD";
  }

  // Risk detection
  if (
    q.includes("risk") || q.includes("warn") || q.includes("danger") ||
    q.includes("alert") || q.includes("blocked") || q.includes("overdue") ||
    q.includes("issue") || q.includes("problem")
  ) {
    return "DETECT_RISKS";
  }

  // Event update
  if (
    (q.includes("update") || q.includes("change") || q.includes("edit") ||
     q.includes("modify") || q.includes("reschedule")) &&
    (q.includes("event") || q.includes("date") || q.includes("location") ||
     q.includes("venue") || q.includes("capacity"))
  ) {
    return "UPDATE_EVENT";
  }

  // General question
  if (
    q.includes("what") || q.includes("how") || q.includes("when") ||
    q.includes("who") || q.includes("where") || q.includes("show") ||
    q.includes("list") || q.includes("tell me") || q.includes("status") ||
    q.includes("summary") || q.includes("overview")
  ) {
    return "GENERAL_EVENT_QUERY";
  }

  return "UNKNOWN";
}

// ─── Plan Builders ────────────────────────────────────────────────────────────

/**
 * Builds an AgentPlan that contains no write actions — only a PROVIDE_ANSWER
 * action for read/query intents. This plan requires no approval.
 */
function buildQueryPlan(
  userRequest: string,
  intent: AgentIntent,
  reasoningSummary: string,
  answerText: string
): AgentPlan {
  return {
    userRequest,
    intent,
    reasoningSummary,
    actions: [
      {
        id: generateId(),
        type: "PROVIDE_ANSWER",
        description: "Return a data-driven answer to the user's question.",
        requiresApproval: false,
        payload: { answerText },
        status: "completed",
        result: { success: true, data: answerText },
      },
    ],
    requiresApproval: false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Builds a plan proposing the creation of a new event.
 * Extracts structured fields from the user's free-text request as best it can.
 * These extracted values will be confirmed / refined by Gemini in Step 5.2.
 */
function findBestAssignee(
  roleNeeded: string,
  teamMembers: import("@/components/types").EventTeamMember[],
  workloads: Map<string, import("@/lib/workload").MemberWorkload>
): { name: string; role: string; memberId?: string } {
  if (!teamMembers || teamMembers.length === 0) {
    return { name: "Unassigned", role: roleNeeded };
  }

  const matchingMembers = teamMembers.filter((m) =>
    m.role.toLowerCase().includes(roleNeeded.toLowerCase())
  );

  const candidates = matchingMembers.length > 0 ? matchingMembers : teamMembers;

  const sorted = [...candidates].sort((a, b) => {
    const wA = workloads.get(a.id)?.activeCount ?? 0;
    const wB = workloads.get(b.id)?.activeCount ?? 0;
    return wA - wB;
  });

  const chosen = sorted[0];
  return {
    name: chosen.name,
    role: chosen.role,
    memberId: chosen.clubMemberId,
  };
}

/**
 * Builds a plan proposing the creation of a new event.
 * Extracts structured fields from the user's free-text request.
 */
function buildCreateEventPlan(
  userRequest: string,
  context: EventraAgentContext
): AgentPlan {
  const extracted = extractEventParamsFromText(userRequest);
  const titleToUse = extracted.title || "Tech Fest 2026";
  const dateToUse = extracted.date || "15 October 2026";
  const locToUse = extracted.location || "Campus Center";
  const capToUse = extracted.capacity || 500;
  const categoryToUse = extracted.category || "Workshop";

  const eventAction: AgentAction = {
    id: generateId(),
    type: "CREATE_EVENT",
    description: `Create Event: "${titleToUse}" on ${dateToUse} at ${locToUse} (~${capToUse} attendees)`,
    requiresApproval: true,
    payload: {
      clubId: context.currentClub.id,
      title: titleToUse,
      category: categoryToUse,
      date: dateToUse,
      time: "10:00 AM - 6:00 PM",
      location: locToUse,
      capacity: capToUse,
      budgetAllocated: 1500,
      leadName: "Event Lead",
      leadRole: "Event Lead",
    },
    status: "proposed",
  };

  const reasoningSummary = `### Event Plan

**${titleToUse}**
- 📅 ${dateToUse}
- 📍 ${locToUse}
- 👥 Expected: ${capToUse} attendees

**I’ll prepare:**
- Event workspace
- Initial team structure
- Operational task plan
- Risk & workload tracking

**Approval required**
I’m ready to create this plan. Please approve below to proceed.`;

  return {
    userRequest,
    intent: "CREATE_EVENT",
    reasoningSummary,
    actions: [eventAction],
    requiresApproval: true,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Builds a plan proposing task creation for an event with role & workload matching.
 */
function buildCreateTasksPlan(
  userRequest: string,
  context: EventraAgentContext
): AgentPlan {
  if (!context.currentEvent) {
    return buildErrorPlan(
      userRequest,
      "CREATE_TASKS",
      "No event workspace is currently open. Please open an event first."
    );
  }

  const event = context.currentEvent;
  const team = context.eventTeamMembers;
  const workloads = context.workloads;

  const taskTemplates = [
    {
      title: `Venue Booking & Campus Clearances`,
      roleNeeded: "Logistics",
      priority: "Urgent" as const,
      dueText: "5 days before event",
    },
    {
      title: `Sponsorship Deck & Budget Proposal`,
      roleNeeded: "Sponsorship",
      priority: "High" as const,
      dueText: "7 days before event",
    },
    {
      title: `Poster Design & Social Media Campaign`,
      roleNeeded: "Marketing",
      priority: "Medium" as const,
      dueText: "4 days before event",
    },
    {
      title: `Attendee Registration & Ticketing`,
      roleNeeded: "Registration",
      priority: "High" as const,
      dueText: "3 days before event",
    },
    {
      title: `Sound, Stage & Technical Setup`,
      roleNeeded: "Technical",
      priority: "High" as const,
      dueText: "1 day before event",
    },
  ];

  const actions: AgentAction[] = taskTemplates.map((tmpl) => {
    const assignee = findBestAssignee(tmpl.roleNeeded, team, workloads);

    return {
      id: generateId(),
      type: "CREATE_TASK",
      description: `Task: "${tmpl.title}" → Assign: ${assignee.name} (${assignee.role}) [${tmpl.priority}]`,
      requiresApproval: true,
      payload: {
        clubId: context.currentClub.id,
        eventId: event.id,
        title: tmpl.title,
        eventTag: event.title,
        priority: tmpl.priority,
        dueText: tmpl.dueText,
        deadline: tmpl.dueText,
        assigneeName: assignee.name,
        assigneeRole: assignee.role,
        assigneeMemberId: assignee.memberId,
        status: "Todo",
        dependencies: [],
      },
      status: "proposed",
    };
  });

  const reasoningSummary = `### Task Plan

**${event.title}**
- 📋 ${actions.length} operational tasks prepared
- 👥 Matched to team roles and current workload

**I’ll prepare:**
- Logistics & venue clearances
- Sponsorship deck & budget
- Marketing campaign & posters
- Registration & ticketing
- Technical & sound setup

**Approval required**
I’m ready to add these tasks. Please approve below to proceed.`;

  return {
    userRequest,
    intent: "CREATE_TASKS",
    reasoningSummary,
    actions,
    requiresApproval: true,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Builds a workload analysis plan — read-only, no approval needed.
 */
function buildAnalyzeWorkloadPlan(
  userRequest: string,
  context: EventraAgentContext
): AgentPlan {
  if (!context.currentEvent) {
    return buildQueryPlan(
      userRequest,
      "ANALYZE_WORKLOAD",
      "Workload analysis requires an active event workspace.",
      "Open an event workspace to analyze team workload."
    );
  }

  const workloadArray = Array.from(context.workloads.values()).sort(
    (a, b) => b.activeCount - a.activeCount
  );

  const overloaded = workloadArray.filter(
    (w) => w.workloadState === "Overloaded" || w.workloadState === "High"
  );

  const summary = workloadArray
    .slice(0, 6)
    .map(
      (w) =>
        `- **${w.name}** (${w.role}): ${w.activeCount} active tasks, ${w.overdueCount} overdue — *${w.workloadState}*`
    )
    .join("\n");

  const recommendation =
    overloaded.length > 0
      ? `\n\n**Action Recommended:**\nConsider redistributing tasks from **${overloaded[0].name}** to lower-load members.`
      : "\n\n**Status:** Team workload is balanced.";

  const answerText =
    workloadArray.length === 0
      ? `### Workload Analysis\n\nNo team members assigned to **${context.currentEvent.title}** yet.`
      : `### Workload Analysis\n\n**${context.currentEvent.title}**\n\n${summary}${recommendation}`;

  return buildQueryPlan(
    userRequest,
    "ANALYZE_WORKLOAD",
    "Live workload analysis based on current task assignments.",
    answerText
  );
}

/**
 * Builds a risk detection plan — read-only, no approval needed.
 */
function buildDetectRisksPlan(
  userRequest: string,
  context: EventraAgentContext
): AgentPlan {
  if (!context.currentEvent) {
    return buildQueryPlan(
      userRequest,
      "DETECT_RISKS",
      "Risk detection requires an active event workspace.",
      "Open an event workspace to analyze operational risks."
    );
  }

  if (context.risks.length === 0) {
    return buildQueryPlan(
      userRequest,
      "DETECT_RISKS",
      "No active risks detected.",
      `### Risk Assessment\n\n**${context.currentEvent.title}**\n- Status: All operations on track\n- Tasks & deadlines: Normal\n- Team capacity: Balanced`
    );
  }

  const riskList = context.risks
    .map(
      (r) =>
        `- **[${r.severity}] ${r.title}**\n  ${r.description}${r.evidence ? ` *(${r.evidence})*` : ""}`
    )
    .join("\n\n");

  const answerText = `### Operational Risks\n\nI found **${context.risks.length} issue${context.risks.length !== 1 ? "s" : ""}** requiring attention for **${context.currentEvent.title}**:\n\n${riskList}`;

  return buildQueryPlan(
    userRequest,
    "DETECT_RISKS",
    `Detected ${context.risks.length} operational risk${context.risks.length !== 1 ? "s" : ""}.`,
    answerText
  );
}

/**
 * Builds a plan for a general informational query.
 * Generates a context-aware answer directly from EventraAgentContext.
 */
function buildGeneralQueryPlan(
  userRequest: string,
  context: EventraAgentContext
): AgentPlan {
  const q = userRequest.toLowerCase();
  const event = context.currentEvent;
  const tasks = context.tasks;
  const teamMembers = context.eventTeamMembers;
  const risks = context.risks;

  let answerText = "";

  const openTasks = tasks.filter((t) => !t.completed && t.status !== "Done");
  const completedTasks = tasks.filter(
    (t) => t.completed || t.status === "Done"
  );
  const overdueTasks = openTasks.filter((t) => {
    const d = t.deadline || t.dueText;
    if (!d) return false;
    const ms = Date.parse(d);
    return !isNaN(ms) && ms < Date.now();
  });
  const unassignedTasks = openTasks.filter(
    (t) => !t.assigneeName || t.assigneeName === "Unassigned"
  );

  if (!event) {
    answerText = `### Dashboard Overview\n\nViewing **${context.currentClub.name}**.\n\nOpen an event workspace to get specific event insights.`;
  } else if (
    q.includes("overdue") || q.includes("late") || q.includes("past due")
  ) {
    answerText =
      overdueTasks.length === 0
        ? `### Overdue Tasks\n\n**${event.title}**\n- No overdue tasks. All ${openTasks.length} open items are on schedule.`
        : `### Overdue Tasks\n\nFound **${overdueTasks.length} task${overdueTasks.length !== 1 ? "s" : ""}** needing urgent follow-up for **${event.title}**:\n\n` +
          overdueTasks
            .map(
              (t) =>
                `- **${t.title}**\n  Assigned: ${t.assigneeName || "Unassigned"} | Due: ${t.deadline || t.dueText} | Priority: ${t.priority}`
            )
            .join("\n\n");
  } else if (
    q.includes("pending") || q.includes("open") || q.includes("todo")
  ) {
    answerText =
      openTasks.length === 0
        ? `### Pending Tasks\n\n**${event.title}**\n- All tasks are completed.`
        : `### Pending Tasks\n\nHere are **${openTasks.length} open task${openTasks.length !== 1 ? "s" : ""}** for **${event.title}**:\n\n` +
          openTasks
            .slice(0, 8)
            .map(
              (t) =>
                `- **${t.title}** — ${t.assigneeName || "Unassigned"} (${t.priority})`
            )
            .join("\n");
  } else if (q.includes("unassigned") || q.includes("no owner")) {
    answerText =
      unassignedTasks.length === 0
        ? `### Unassigned Tasks\n\n**${event.title}**\n- All open tasks have assigned owners.`
        : `### Unassigned Tasks\n\nFound **${unassignedTasks.length} task${unassignedTasks.length !== 1 ? "s" : ""}** needing an owner for **${event.title}**:\n\n` +
          unassignedTasks
            .map((t) => `- **${t.title}** (${t.priority} Priority)`)
            .join("\n");
  } else if (q.includes("team") || q.includes("member") || q.includes("people")) {
    answerText =
      teamMembers.length === 0
        ? `### Event Team\n\nNo team members added to **${event.title}** yet.`
        : `### Event Team\n\n**${event.title}** (${teamMembers.length} members):\n\n` +
          teamMembers
            .map((m) => {
              const w = context.workloads.get(m.id);
              return `- **${m.name}** (${m.role})${w ? ` — ${w.activeCount} active tasks [${w.workloadState}]` : ""}`;
            })
            .join("\n");
  } else if (q.includes("risk") || q.includes("warning") || q.includes("alert")) {
    answerText =
      risks.length === 0
        ? `### Operational Risks\n\n**${event.title}**\n- No active risks detected.`
        : `### Operational Risks\n\nFound **${risks.length} active risk${risks.length !== 1 ? "s" : ""}** for **${event.title}**:\n\n` +
          risks
            .slice(0, 5)
            .map((r) => `- **[${r.severity}] ${r.title}**\n  ${r.description}`)
            .join("\n\n");
  } else {
    const pct =
      tasks.length > 0
        ? Math.round((completedTasks.length / tasks.length) * 100)
        : 0;
    answerText =
      `### Event Summary\n\n**${event.title}**\n\n` +
      `- **Progress:** ${pct}% (${completedTasks.length}/${tasks.length} tasks completed)\n` +
      `- **Open Tasks:** ${openTasks.length} (${overdueTasks.length} overdue, ${unassignedTasks.length} unassigned)\n` +
      `- **Team:** ${teamMembers.length} members\n` +
      `- **Operational Risks:** ${risks.length}\n\n` +
      `**Suggested actions:**\n` +
      `- "Show overdue tasks"\n` +
      `- "Analyze team workload"\n` +
      `- "Check operational risks"`;
  }

  return buildQueryPlan(
    userRequest,
    "GENERAL_EVENT_QUERY",
    "Analyzed current event state.",
    answerText
  );
}

/** Returns a plan that signals a clear, user-visible error. */
function buildErrorPlan(
  userRequest: string,
  intent: AgentIntent,
  errorMessage: string
): AgentPlan {
  return {
    userRequest,
    intent,
    reasoningSummary: `### Action Needed\n\n${errorMessage}`,
    actions: [],
    requiresApproval: false,
    createdAt: new Date().toISOString(),
    error: errorMessage,
  };
}

// ─── Simple Text Extraction ───────────────────────────────────────────────────

/**
 * Very basic heuristic extraction of event parameters from free text.
 * Will be replaced by Gemini structured output (JSON mode) in Step 5.2.
 */
function extractEventParamsFromText(text: string): {
  title?: string;
  date?: string;
  location?: string;
  capacity?: number;
  budget?: number;
  category?: "Hackathon" | "Workshop" | "Social" | "Speaker" | "Competition";
  time?: string;
} {
  const t = text;

  // Detect category keyword
  let category: "Hackathon" | "Workshop" | "Social" | "Speaker" | "Competition" | undefined;
  if (/hackathon/i.test(t)) category = "Hackathon";
  else if (/workshop/i.test(t)) category = "Workshop";
  else if (/speaker|talk|lecture/i.test(t)) category = "Speaker";
  else if (/competition|contest/i.test(t)) category = "Competition";
  else if (/social|meet|hangout|party/i.test(t)) category = "Social";

  // Detect capacity: "for N students/people/attendees"
  const capMatch = t.match(
    /for\s+(?:around\s+)?(\d+)\s*(?:students|people|attendees|participants)/i
  );
  const capacity = capMatch ? parseInt(capMatch[1], 10) : undefined;

  // Detect date: common patterns
  const datePatterns = [
    /on\s+((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?)/i,
    /on\s+(\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+\d{4})?)/i,
    /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/,
    /(\d{4}-\d{2}-\d{2})/,
  ];
  let date: string | undefined;
  for (const pat of datePatterns) {
    const m = t.match(pat);
    if (m) {
      date = m[1];
      break;
    }
  }

  // Detect location: "at X" or "in X"
  const locMatch = t.match(/\bat\s+([A-Z][^,.]+(?:\s+[A-Z][^,.\n]+)*)/);
  const location = locMatch ? locMatch[1].trim() : undefined;

  // Detect event title-like phrases: look for quoted text or Fest/Workshop/Hackathon words
  const titleMatch =
    t.match(/["']([^"']{3,60})["']/) ||
    t.match(
      /(?:organize|plan|create|set up)\s+(?:a|an|the)?\s+([A-Z][a-zA-Z\s]+(?:Fest|Hackathon|Workshop|Summit|Social|Night|Day|Sprint|Week))/
    );
  const title = titleMatch ? titleMatch[1].trim() : undefined;

  return { title, date, location, capacity, category };
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

/**
 * Core Eventra AI entry point.
 *
 * Receives a natural-language request and a full EventraAgentContext, then
 * returns an AgentPlan describing what Eventra AI proposes to do.
 *
 * LAYER A responsibility: reasoning only — no DB writes, no side effects.
 *
 * The returned plan is handed to:
 *   → LAYER B (UI) if requiresApproval is true, OR
 *   → LAYER C (executeApprovedActions) directly for read/query plans.
 */
export async function processUserRequest(
  input: string,
  context: EventraAgentContext
): Promise<AgentPlan> {
  const trimmed = input.trim();

  if (!trimmed) {
    return buildErrorPlan(
      input,
      "UNKNOWN",
      "Please provide a question or instruction for Eventra AI."
    );
  }

  const intent = detectIntent(trimmed);

  switch (intent) {
    case "CREATE_EVENT":
      return buildCreateEventPlan(trimmed, context);

    case "CREATE_TASKS":
      return buildCreateTasksPlan(trimmed, context);

    case "ASSIGN_TASKS":
      // In Step 5.2 this will propose specific assignments via Gemini
      return buildQueryPlan(
        trimmed,
        "ASSIGN_TASKS",
        "I understood that you want to assign tasks. I'll analyze workloads and propose assignments in Step 5.2 with Gemini.",
        `I can see ${context.eventTeamMembers.length} team members and ${context.tasks.filter((t) => !t.completed).length} open tasks. In the next step, I will propose specific assignments based on role fit and current workload. For now, use the Tasks tab to assign manually or try "Who has the highest workload?" to guide your decisions.`
      );

    case "CREATE_DEPENDENCIES":
      return buildQueryPlan(
        trimmed,
        "CREATE_DEPENDENCIES",
        "I understood that you want to create task dependencies.",
        "Dependency management will be available in Step 5.2. For now, you can add dependencies directly when creating or editing tasks in the Tasks tab."
      );

    case "ANALYZE_WORKLOAD":
      return buildAnalyzeWorkloadPlan(trimmed, context);

    case "DETECT_RISKS":
      return buildDetectRisksPlan(trimmed, context);

    case "UPDATE_EVENT":
      return buildQueryPlan(
        trimmed,
        "UPDATE_EVENT",
        "I understood that you want to update event details.",
        "Event updates via Eventra AI will be available in Step 5.2. For now, edit event details directly in the Event Workspace settings."
      );

    case "GENERAL_EVENT_QUERY":
      return buildGeneralQueryPlan(trimmed, context);

    default:
      return buildGeneralQueryPlan(trimmed, context);
  }
}

// ─── Plan Execution ───────────────────────────────────────────────────────────

/**
 * LAYER C: Executes all approved actions in a plan sequentially.
 *
 * Only actions with status === "approved" are sent to tool functions.
 * PROVIDE_ANSWER and SUGGEST_PLAN actions are skipped (already handled by UI).
 *
 * Returns the plan with result fields populated on each action.
 */
export async function executeApprovedActions(
  plan: AgentPlan,
  options: {
    userId?: string;
    existingTasks?: TaskItem[];
  } = {}
): Promise<AgentPlan> {
  const mutablePlan = {
    ...plan,
    actions: plan.actions.map((a) => ({
      ...a,
      payload: { ...((a.payload as Record<string, unknown>) || {}) },
    })),
  };

  let newlyCreatedEventId: string | null = null;
  const taskTitleToIdMap = new Map<string, string>();

  for (const action of mutablePlan.actions) {
    // Only execute approved write actions
    if (action.status !== "approved") continue;

    // Read/informational actions don't need execution here
    if (
      action.type === "PROVIDE_ANSWER" ||
      action.type === "SUGGEST_PLAN" ||
      action.type === "FLAG_RISK" ||
      action.type === "FETCH_EVENT_CONTEXT" ||
      action.type === "FETCH_EVENT_TEAM" ||
      action.type === "FETCH_TASKS" ||
      action.type === "COMPUTE_WORKLOAD" ||
      action.type === "DETECT_RISKS"
    ) {
      action.status = "completed";
      continue;
    }

    // Write actions
    action.status = "executing";

    try {
      let result;

      // Auto-propagate newly created eventId to subsequent actions in batch
      if (newlyCreatedEventId) {
        const curEventId = String(action.payload.eventId || "");
        if (!curEventId || curEventId === "club-1") {
          action.payload.eventId = newlyCreatedEventId;
        }
      }

      switch (action.type) {
        case "CREATE_EVENT":
          result = await tool_create_event(action, options.userId);
          if (result.success && result.data?.id) {
            newlyCreatedEventId = result.data.id;
          }
          break;

        case "UPDATE_EVENT_FIELD":
          result = await tool_update_event(action, options.userId);
          break;

        case "CREATE_TASK":
          result = await tool_create_task(
            action,
            options.existingTasks ?? [],
            options.userId
          );
          if (result.success && result.data?.id) {
            const title = String(action.payload.title || result.data.title || "").toLowerCase().trim();
            if (title) {
              taskTitleToIdMap.set(title, result.data.id);
            }
          }
          break;

        case "UPDATE_TASK_STATUS":
        case "UPDATE_TASK_FIELD":
          result = await tool_update_task(action);
          break;

        case "ASSIGN_TASK": {
          const reqTaskId = String(action.payload.taskId || "").toLowerCase().trim();
          if (taskTitleToIdMap.has(reqTaskId)) {
            action.payload.taskId = taskTitleToIdMap.get(reqTaskId);
          }
          result = await tool_assign_task(action);
          break;
        }

        case "CREATE_TASK_DEPENDENCY": {
          const reqTaskId = String(action.payload.taskId || "").toLowerCase().trim();
          const reqDependsId = String(
            action.payload.dependsOnTaskId || (action.payload.dependencyIds as string[])?.[0] || ""
          ).toLowerCase().trim();

          if (taskTitleToIdMap.has(reqTaskId)) {
            action.payload.taskId = taskTitleToIdMap.get(reqTaskId);
          }
          if (taskTitleToIdMap.has(reqDependsId)) {
            const realDependsId = taskTitleToIdMap.get(reqDependsId)!;
            action.payload.dependsOnTaskId = realDependsId;
            action.payload.dependencyIds = [realDependsId];
          }
          result = await tool_create_dependency(action);
          break;
        }

        default:
          result = {
            success: false,
            error: `No executor found for action type "${action.type}".`,
          };
      }

      action.status = result.success ? "completed" : "failed";
      action.result = result;
    } catch (err) {
      action.status = "failed";
      action.result = {
        success: false,
        error: err instanceof Error ? err.message : "Unexpected execution error.",
      };
    }
  }

  return mutablePlan;
}
