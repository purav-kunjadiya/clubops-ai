/**
 * Eventra AI Agent — Public Module Barrel
 *
 * All consumer code should import from "@/lib/agent" instead of
 * individual sub-modules, so internal refactors don't break callers.
 */

// Domain types
export type {
  AgentIntent,
  AgentActionType,
  AgentActionStatus,
  AgentAction,
  AgentPlan,
  AgentToolResult,
} from "./types";

// Context
export type {
  EventraAgentContext,
  BuildContextParams,
  SerializedAgentContext,
} from "./context";
export { buildEventraAgentContext, serializeContext } from "./context";

// Agent service
export { processUserRequest, executeApprovedActions } from "./eventra-agent";

// Tools (read tools only exported for external use; write tools stay internal)
export {
  tool_get_event_context,
  tool_get_event_team,
  tool_get_tasks,
  tool_get_member_workload,
  tool_get_risks,
} from "./tools";
