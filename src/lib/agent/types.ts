/**
 * Eventra AI — Agent Domain Types
 *
 * This module defines the canonical vocabulary for the agentic architecture:
 *   AgentIntent     — what the user wants to accomplish
 *   AgentActionType — the concrete operation to perform
 *   AgentAction     — a single proposable/approvable/executable step
 *   AgentPlan       — the full output of one AI reasoning cycle
 *
 * The three-layer flow is enforced via AgentActionStatus:
 *   proposed → approved/rejected → executing → completed/failed
 *
 * IMPORTANT: Write actions must never be executed unless status === "approved".
 */

// ─── Intent ──────────────────────────────────────────────────────────────────

/**
 * High-level intent inferred from the user's natural-language request.
 * The AI planner maps each request to exactly one intent.
 */
export type AgentIntent =
  /** User wants to create a new event in the club. */
  | "CREATE_EVENT"
  /** User wants to modify an existing event's details. */
  | "UPDATE_EVENT"
  /** User wants to generate a set of tasks for an event. */
  | "CREATE_TASKS"
  /** User wants to (re)assign tasks to team members. */
  | "ASSIGN_TASKS"
  | "ASSIGN_TASK"
  /** User wants to define task prerequisite chains. */
  | "CREATE_DEPENDENCIES"
  /** User wants a workload analysis for the event team. */
  | "ANALYZE_WORKLOAD"
  /** User wants to see or refresh operational risk detection. */
  | "DETECT_RISKS"
  /** User wants to schedule a team meeting. (future) */
  | "CREATE_MEETING"
  /** User wants to generate a document/report. (future) */
  | "CREATE_DOCUMENT"
  /** User is asking a question about the current event / club. */
  | "GENERAL_EVENT_QUERY"
  /** Intent could not be determined from the user's request. */
  | "UNKNOWN";

// ─── Action Type ─────────────────────────────────────────────────────────────

/**
 * Granular operation type for each proposed AgentAction.
 * One AgentPlan may contain multiple actions of different types.
 */
export type AgentActionType =
  // ── Write actions (all require human approval) ──────────────────────────
  | "CREATE_EVENT"
  | "UPDATE_EVENT_FIELD"
  | "CREATE_TASK"
  | "UPDATE_TASK_STATUS"
  | "UPDATE_TASK_FIELD"
  | "ASSIGN_TASK"
  | "UNASSIGN_TASK"
  | "CREATE_TASK_DEPENDENCY"
  | "REMOVE_TASK_DEPENDENCY"
  // ── Read / analysis actions (no approval needed) ─────────────────────────
  | "FETCH_EVENT_CONTEXT"
  | "FETCH_EVENT_TEAM"
  | "FETCH_TASKS"
  | "COMPUTE_WORKLOAD"
  | "DETECT_RISKS"
  // ── Informational (pure AI response, no Supabase write) ──────────────────
  | "PROVIDE_ANSWER"
  | "SUGGEST_PLAN"
  | "FLAG_RISK";

// ─── Action Status ────────────────────────────────────────────────────────────

/**
 * Lifecycle states an AgentAction passes through.
 *
 *  proposed   — AI has proposed the action; awaiting human review
 *  approved   — Club Head has explicitly approved the action
 *  rejected   — Club Head has declined the action; it will not execute
 *  executing  — Tool layer is currently performing the Supabase operation
 *  completed  — Tool operation succeeded
 *  failed     — Tool operation failed (error details in `result.error`)
 */
export type AgentActionStatus =
  | "pending_approval"
  | "proposed"
  | "approved"
  | "rejected"
  | "executing"
  | "completed"
  | "failed";

// ─── Action ──────────────────────────────────────────────────────────────────

/**
 * A single discrete step the agent wants to perform.
 *
 * Write actions (requiresApproval: true) MUST be approved before the tool
 * layer is allowed to call any Supabase mutation.
 *
 * Read / informational actions (requiresApproval: false) may execute
 * immediately as part of context gathering.
 */
export interface AgentAction {
  /** Unique identifier for this action within the plan (nanoid / uuid). */
  readonly id: string;

  /** The specific operation this action represents. */
  readonly type: AgentActionType;

  /**
   * Human-readable description of what this action will do.
   * Shown to the Club Head during the approval step.
   */
  readonly description: string;

  /**
   * If true, this action MUST be explicitly approved before execution.
   * All write actions must have requiresApproval: true.
   */
  readonly requiresApproval: boolean;

  /**
   * Structured data the tool layer needs to execute this action.
   * Shape depends on action.type — validated at execution time.
   *
   * Examples:
   *   CREATE_EVENT    → { clubId, title, date, location, capacity, ... }
   *   CREATE_TASK     → { eventId, title, priority, assigneeMemberId, deadline }
   *   ASSIGN_TASK     → { taskId, eventId, memberId, memberName, memberRole }
   */
  readonly payload: Record<string, unknown>;

  /** Current lifecycle state. Starts as "proposed". */
  status: AgentActionStatus;

  /**
   * Result populated by the tool layer after execution.
   * Contains the created/updated entity or the error message.
   */
  result?: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

/**
 * The full output of one Eventra AI reasoning cycle.
 *
 * Returned by `processUserRequest()` in eventra-agent.ts.
 * Never exposes raw chain-of-thought — only a user-facing reasoning summary.
 */
export interface AgentPlan {
  /** The original verbatim request from the user. */
  readonly userRequest: string;

  /** The high-level intent inferred from the request. */
  readonly intent: AgentIntent;

  /**
   * Short, user-facing explanation of what Eventra AI understood and why
   * it is proposing these actions. Max ~3 sentences.
   * Must NOT contain internal chain-of-thought, raw prompts, or API keys.
   */
  readonly reasoningSummary: string;

  /**
   * Ordered list of actions the AI is proposing.
   * Actions requiring approval are surfaced to the user before execution.
   */
  readonly actions: AgentAction[];

  /**
   * True if ANY action in the plan has requiresApproval: true.
   * Used by the UI to decide whether to show the approval gate.
   */
  readonly requiresApproval: boolean;

  /** ISO timestamp of when this plan was produced. */
  readonly createdAt: string;

  /**
   * If the plan could not be produced (e.g. missing context, auth error),
   * this field contains the reason and actions will be empty.
   */
  error?: string;
}

// ─── Tool Result ─────────────────────────────────────────────────────────────

/**
 * Standard return type from any agent tool execution.
 */
export interface AgentToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
