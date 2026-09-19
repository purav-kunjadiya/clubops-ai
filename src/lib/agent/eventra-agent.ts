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

import { randomUUID } from "crypto";
import type { AgentPlan, AgentIntent, AgentAction } from "./types";
import type { EventraAgentContext } from "./context";
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
        id: randomUUID(),
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
function buildCreateEventPlan(
  userRequest: string,
  context: EventraAgentContext
): AgentPlan {
  // Simple extraction — will be replaced by Gemini JSON extraction in Step 5.2
  const extracted = extractEventParamsFromText(userRequest);

  const action: AgentAction = {
    id: randomUUID(),
    type: "CREATE_EVENT",
    description: `Create a new event: "${extracted.title || "Untitled Event"}" on ${extracted.date || "a date to be confirmed"} at ${extracted.location || "a location to be confirmed"}.`,
    requiresApproval: true,
    payload: {
      clubId: context.currentClub.id,
      title: extracted.title || "New Event",
      category: extracted.category || "Workshop",
      date: extracted.date || "",
      time: extracted.time || "6:00 PM",
      location: extracted.location || "",
      capacity: extracted.capacity,
      budgetAllocated: extracted.budget,
      leadName: "",
      leadRole: "Event Lead",
    },
    status: "proposed",
  };

  return {
    userRequest,
    intent: "CREATE_EVENT",
    reasoningSummary: `I understood that you want to organize a new event. I've prepared a proposal for "${extracted.title || "New Event"}" based on your request. Please review the details and approve to create it in your club workspace.`,
    actions: [action],
    requiresApproval: true,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Builds a plan proposing task creation for the current event.
 * In Step 5.2, Gemini will generate a full breakdown of tasks with deadlines
 * and suggested assignees. Here we return a SUGGEST_PLAN action that signals
 * the intent so the UI can prompt Gemini.
 */
function buildCreateTasksPlan(
  userRequest: string,
  context: EventraAgentContext
): AgentPlan {
  if (!context.currentEvent) {
    return buildErrorPlan(
      userRequest,
      "CREATE_TASKS",
      "No event is currently open. Please open an event workspace before asking me to create tasks."
    );
  }

  const action: AgentAction = {
    id: randomUUID(),
    type: "SUGGEST_PLAN",
    description: `Propose a task breakdown for "${context.currentEvent.title}".`,
    requiresApproval: false,
    payload: {
      eventId: context.currentEvent.id,
      userRequest,
      teamSize: context.eventTeamMembers.length,
      existingTaskCount: context.tasks.length,
    },
    status: "proposed",
    result: {
      success: true,
      data: "Task generation will be powered by Gemini in Step 5.2. Once Gemini proposes specific tasks, you will be able to review and approve each one before they are created.",
    },
  };

  return {
    userRequest,
    intent: "CREATE_TASKS",
    reasoningSummary: `I understand you want to create tasks for "${context.currentEvent.title}". I currently have ${context.eventTeamMembers.length} team members and ${context.tasks.length} existing tasks as context. In the next step, Gemini will generate a full task plan for your review.`,
    actions: [action],
    requiresApproval: false,
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
      "Please open an event workspace to analyze team workload."
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
        `• **${w.name}** (${w.role}): ${w.activeCount} active tasks, ${w.overdueCount} overdue — ${w.workloadState}`
    )
    .join("\n");

  const recommendation =
    overloaded.length > 0
      ? `\n\n⚠️ **${overloaded.length} member${overloaded.length > 1 ? "s" : ""} with High/Overloaded workload.** Consider redistributing tasks from ${overloaded[0].name} to a lighter-load team member.`
      : "\n\n✅ Team workload is balanced.";

  const answerText =
    workloadArray.length === 0
      ? `No team members have been added to "${context.currentEvent.title}" yet.`
      : `**Workload Analysis — ${context.currentEvent.title}:**\n\n${summary}${recommendation}`;

  return buildQueryPlan(
    userRequest,
    "ANALYZE_WORKLOAD",
    "I computed live workloads from your event team's current task assignments.",
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
      "Please open an event workspace to detect risks."
    );
  }

  if (context.risks.length === 0) {
    return buildQueryPlan(
      userRequest,
      "DETECT_RISKS",
      "I analyzed your event data and found no active risks.",
      `✅ No operational risks detected for "${context.currentEvent.title}". All tasks, workloads, and deadlines appear on track.`
    );
  }

  const riskList = context.risks
    .map(
      (r) =>
        `• **[${r.severity}] ${r.title}** — ${r.description}${r.evidence ? ` *(${r.evidence})*` : ""}`
    )
    .join("\n");

  const answerText = `⚠️ **${context.risks.length} active risk${context.risks.length !== 1 ? "s" : ""} for "${context.currentEvent.title}":**\n\n${riskList}`;

  return buildQueryPlan(
    userRequest,
    "DETECT_RISKS",
    `I analyzed your event's tasks, deadlines, and team workloads and detected ${context.risks.length} operational risk${context.risks.length !== 1 ? "s" : ""}.`,
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
    answerText =
      `You are viewing the club-level dashboard for **${context.currentClub.name}**. Open an event workspace to get event-specific insights.`;
  } else if (
    q.includes("overdue") || q.includes("late") || q.includes("past due")
  ) {
    answerText =
      overdueTasks.length === 0
        ? `✅ No overdue tasks for "${event.title}".`
        : `⚠️ **${overdueTasks.length} overdue task${overdueTasks.length !== 1 ? "s" : ""}**:\n\n` +
          overdueTasks
            .map(
              (t) =>
                `• **${t.title}** — ${t.assigneeName || "Unassigned"} | Due: ${t.deadline || t.dueText} | ${t.priority}`
            )
            .join("\n");
  } else if (
    q.includes("pending") || q.includes("open") || q.includes("todo")
  ) {
    answerText =
      openTasks.length === 0
        ? `✅ All tasks for "${event.title}" are completed!`
        : `📋 **${openTasks.length} pending task${openTasks.length !== 1 ? "s" : ""} for "${event.title}":**\n\n` +
          openTasks
            .slice(0, 8)
            .map(
              (t) =>
                `• **${t.title}** — ${t.assigneeName || "Unassigned"} | ${t.priority} | ${t.status || "Todo"}`
            )
            .join("\n");
  } else if (q.includes("unassigned") || q.includes("no owner")) {
    answerText =
      unassignedTasks.length === 0
        ? `✅ All open tasks for "${event.title}" have assigned owners.`
        : `📌 **${unassignedTasks.length} unassigned task${unassignedTasks.length !== 1 ? "s" : ""}**:\n\n` +
          unassignedTasks
            .map((t) => `• **${t.title}** — ${t.priority} priority`)
            .join("\n");
  } else if (q.includes("team") || q.includes("member") || q.includes("people")) {
    answerText =
      teamMembers.length === 0
        ? `No team members have been added to "${event.title}" yet.`
        : `👥 **Event team for "${event.title}" (${teamMembers.length} members):**\n\n` +
          teamMembers
            .map((m) => {
              const w = context.workloads.get(m.id);
              return `• **${m.name}** (${m.role})${w ? ` — ${w.activeCount} active tasks (${w.workloadState})` : ""}`;
            })
            .join("\n");
  } else if (q.includes("risk") || q.includes("warning") || q.includes("alert")) {
    answerText =
      risks.length === 0
        ? `✅ No active risks for "${event.title}".`
        : `⚠️ **${risks.length} active risk${risks.length !== 1 ? "s" : ""}**:\n\n` +
          risks
            .slice(0, 5)
            .map((r) => `• **[${r.severity}] ${r.title}**`)
            .join("\n");
  } else {
    // Default: event progress summary
    const pct =
      tasks.length > 0
        ? Math.round((completedTasks.length / tasks.length) * 100)
        : 0;
    answerText =
      `📊 **Event Summary — ${event.title}**\n\n` +
      `• Completion: **${pct}%** (${completedTasks.length}/${tasks.length} tasks done)\n` +
      `• Open: **${openTasks.length}** | Overdue: **${overdueTasks.length}** | Unassigned: **${unassignedTasks.length}**\n` +
      `• Team: **${teamMembers.length} members** | Active risks: **${risks.length}**\n\n` +
      `Ask me things like "What tasks are pending?", "Who has the highest workload?", or "What risks should I know about?"`;
  }

  return buildQueryPlan(
    userRequest,
    "GENERAL_EVENT_QUERY",
    "I answered your question using the current event and team data.",
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
    reasoningSummary: errorMessage,
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
    actions: plan.actions.map((a) => ({ ...a })),
  };

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

      switch (action.type) {
        case "CREATE_EVENT":
          result = await tool_create_event(action, options.userId);
          break;

        case "UPDATE_EVENT_FIELD":
          result = await tool_update_event(action);
          break;

        case "CREATE_TASK":
          result = await tool_create_task(
            action,
            options.existingTasks ?? [],
            options.userId
          );
          break;

        case "UPDATE_TASK_STATUS":
        case "UPDATE_TASK_FIELD":
          result = await tool_update_task(action);
          break;

        case "ASSIGN_TASK":
          result = await tool_assign_task(action);
          break;

        case "CREATE_TASK_DEPENDENCY":
          result = await tool_create_dependency(action);
          break;

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
