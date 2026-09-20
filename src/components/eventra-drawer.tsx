"use client";

import React, { useState, useEffect, useRef } from "react";
import type { Club, ClubEvent, EventTeamMember, TaskItem } from "./types";
import {
  IconX,
  IconSparkles,
  IconSend,
  IconShieldAlert,
  IconCheckSquare,
  IconUsers,
  IconRefreshCw,
} from "./icons";
import {
  executeApprovedActions,
  type AgentPlan,
} from "@/lib/agent";
import { calculateTeamWorkloads } from "@/lib/workload";
import { detectEventRisks } from "@/lib/risks";
import { fetchEventTasks } from "@/lib/tasks";
import { AgentThinking } from "./agent-thinking";
import { AgentApprovalCard } from "./agent-approval-card";

interface MessageItem {
  id: string;
  sender: "ai" | "user";
  text: string;
  time: string;
  isError?: boolean;
  plan?: AgentPlan;
  executionStatus?: "proposed" | "approved" | "executing" | "completed" | "failed";
  executionResultText?: string;
  functionCalls?: Record<string, unknown>[];
  modelParts?: unknown[];
  promptText?: string;
}

interface EventraDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  event: ClubEvent;
  club?: Club;
  currentUserId?: string;
  teamMembers: EventTeamMember[];
  eventTasks: TaskItem[];
  onTasksUpdated: () => void;
  initialPrompt?: string;
}

export function EventraDrawer({
  isOpen,
  onClose,
  event,
  club,
  currentUserId,
  teamMembers,
  eventTasks,
  onTasksUpdated,
  initialPrompt,
}: EventraDrawerProps) {
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [status, setStatus] = useState<"Online" | "Ready" | "Working..." | "Approval required">("Ready");
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const counterRef = useRef(200);
  const lastInitialPromptRef = useRef<string | undefined>(undefined);

  const teamWorkloads = React.useMemo(
    () => calculateTeamWorkloads(teamMembers, eventTasks),
    [teamMembers, eventTasks]
  );

  const detectedRisks = React.useMemo(
    () => detectEventRisks(event.id, eventTasks, teamMembers, event),
    [eventTasks, teamMembers, event]
  );

  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: "welcome-msg",
      sender: "ai",
      text: `### Eventra AI Assistant\n\nI’m your event management agent for **${event.title}**.\n\n**Here’s how I can help:**\n- Prepare event plans & task checklists\n- Analyze team workloads & capacity\n- Identify operational risks & deadlines\n\nWhat would you like to do?`,
      time: "Just now",
    },
  ]);

  // Handle Escape key to close drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isThinking, isOpen]);

  const handleSendMessage = async (customPrompt?: string) => {
    const promptText = (customPrompt || input).trim();
    if (!promptText || isThinking) return;

    if (!currentUserId) {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-auth-${Date.now()}`,
          sender: "ai",
          text: "### Authentication Required\n\nPlease sign in to use Eventra AI.",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          isError: true,
        },
      ]);
      return;
    }

    counterRef.current += 1;
    const userMsg: MessageItem = {
      id: `msg-u-${counterRef.current}`,
      sender: "user",
      text: promptText,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);
    setStatus("Working...");

    try {
      const workloadList = teamMembers.map((m) => {
        const w = teamWorkloads.get(m.id);
        return {
          memberName: m.name,
          activeCount: w?.activeCount ?? 0,
          completedCount: w?.completedCount ?? 0,
          overdueCount: w?.overdueCount ?? 0,
          workloadState: w?.workloadState ?? ("Low" as const),
        };
      });

      const res = await fetch("/api/asky/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          context: {
            event: {
              id: event.id,
              title: event.title,
              category: event.category,
              date: event.date,
              time: event.time,
              location: event.location,
              status: event.status,
              rsvpCount: event.rsvpCount,
              capacity: event.capacity,
              leadName: event.leadName,
              leadRole: event.leadRole,
              budgetAllocated: event.budgetAllocated,
              budgetSpent: event.budgetSpent,
            },
            tasks: eventTasks.map((t) => ({
              id: t.id,
              title: t.title,
              priority: t.priority,
              dueText: t.dueText,
              deadline: t.deadline,
              assigneeName: t.assigneeName,
              assigneeRole: t.assigneeRole,
              status: t.status,
              completed: t.completed,
            })),
            teamMembers: teamMembers.map((m) => ({
              id: m.id,
              name: m.name,
              role: m.role,
              email: m.email,
            })),
            workloads: workloadList,
            risks: detectedRisks.map((r) => ({
              id: r.id,
              type: r.type,
              title: r.title,
              severity: r.severity,
              description: r.description,
              evidence: r.evidence,
            })),
          },
        }),
      });

      const data = await res.json();
      counterRef.current += 1;

      if (!res.ok || data.error) {
        throw new Error(data.error || "Eventra AI service encountered an issue.");
      }

      const activePlan = data.proposedPlan || undefined;
      const hasPlan = !!activePlan && activePlan.actions?.length > 0;

      setMessages((prev) => [
        ...prev,
        {
          id: `msg-ai-${counterRef.current}`,
          sender: "ai",
          text: data.answer || (hasPlan ? "Here is your proposed action plan:" : "Here is your operational summary:"),
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          plan: activePlan,
          executionStatus: hasPlan ? "proposed" : undefined,
          functionCalls: data.functionCalls,
          modelParts: data.modelParts,
          promptText,
        },
      ]);

      setStatus(hasPlan ? "Approval required" : "Ready");
    } catch (err: unknown) {
      counterRef.current += 1;
      const errMsg = err instanceof Error ? err.message : "Unable to complete request right now. Please try again.";
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-err-${counterRef.current}`,
          sender: "ai",
          text: `### Issue Detected\n\n${errMsg}\n\n**Next step:** Try resubmitting your request or check your connection.`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          isError: true,
        },
      ]);
      setStatus("Ready");
    } finally {
      setIsThinking(false);
    }
  };

  // Auto-trigger initial prompt when passed
  useEffect(() => {
    if (isOpen && initialPrompt && initialPrompt !== lastInitialPromptRef.current) {
      lastInitialPromptRef.current = initialPrompt;
      handleSendMessage(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialPrompt]);

  const handleApprovePlan = async (msgId: string, plan: AgentPlan) => {
    const targetMsg = messages.find((m) => m.id === msgId);

    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, executionStatus: "executing" } : m))
    );
    setStatus("Working...");

    try {
      const approvedPlan: AgentPlan = {
        ...plan,
        actions: plan.actions.map((a) => ({ ...a, status: "approved" as const })),
      };

      const resultPlan = await executeApprovedActions(approvedPlan, {
        userId: currentUserId,
        existingTasks: eventTasks,
      });

      const successCount = resultPlan.actions.filter((a) => a.result?.success).length;

      // Re-fetch tasks from Supabase to update workspace in real-time
      const { tasks: updatedTasks } = await fetchEventTasks(event.id);
      if (updatedTasks) {
        onTasksUpdated();
      }

      // TURN 2: Send tool results BACK to Gemini to generate final response based on DB execution
      let turn2AnswerText = "";
      if (targetMsg?.functionCalls && targetMsg.functionCalls.length > 0) {
        try {
          const toolResults = resultPlan.actions.map((act) => {
            let toolName = "tool_create_event";
            if (act.type === "CREATE_TASK") toolName = "tool_create_task";
            else if (act.type === "ASSIGN_TASK") toolName = "tool_assign_task";
            else if (act.type === "UPDATE_EVENT_FIELD") toolName = "tool_update_event";
            else if (act.type === "UPDATE_TASK_FIELD") toolName = "tool_update_task";
            else if (act.type === "CREATE_TASK_DEPENDENCY") toolName = "tool_create_dependency";

            return {
              name: toolName,
              result: act.result,
            };
          });

          const turn2Res = await fetch("/api/asky/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: targetMsg.promptText || plan.userRequest,
              context: {
                event: {
                  id: event.id,
                  title: event.title,
                  category: event.category,
                  date: event.date,
                  time: event.time,
                  location: event.location,
                  status: event.status,
                  rsvpCount: event.rsvpCount,
                  capacity: event.capacity,
                },
                tasks: eventTasks.map((t) => ({
                  id: t.id,
                  title: t.title,
                  priority: t.priority,
                  assigneeName: t.assigneeName,
                  status: t.status,
                })),
                teamMembers: teamMembers.map((m) => ({
                  id: m.id,
                  name: m.name,
                  role: m.role,
                })),
              },
              previousFunctionCalls: targetMsg.functionCalls,
              modelParts: targetMsg.modelParts,
              toolResults,
            }),
          });

          const turn2Data = await turn2Res.json();
          if (turn2Data.answer) {
            turn2AnswerText = turn2Data.answer;
          }
        } catch (turn2Err) {
          console.warn("Turn 2 Gemini summary error:", turn2Err);
        }
      }

      const isEventCreate = plan.intent === "CREATE_EVENT";
      const isTaskCreate = plan.intent === "CREATE_TASKS";

      let executionResultText = `Done — ${successCount} action(s) persisted to Supabase database.`;
      if (isEventCreate) {
        executionResultText = `Done — Event workspace created and synced to database.`;
      } else if (isTaskCreate) {
        executionResultText = `Done — ${successCount} task(s) added and assigned in database.`;
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                text: turn2AnswerText || m.text,
                executionStatus: "completed",
                executionResultText,
              }
            : m
        )
      );
      setStatus("Ready");
    } catch (err: unknown) {
      console.error("Plan execution error:", err);
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, executionStatus: "failed" } : m))
      );
      setStatus("Ready");
    }
  };

  const handleRejectPlan = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? {
              ...m,
              executionStatus: undefined,
              plan: undefined,
              text: m.text + "\n\n*(Proposed plan cancelled by user)*",
            }
          : m
      )
    );
    setStatus("Ready");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[400px] lg:w-[420px] bg-white border-l border-slate-200/90 shadow-2xl flex flex-col animate-in slide-in-from-right duration-250">
      {/* Drawer Header */}
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <IconSparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#1E1B4B]">Eventra AI</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                Agent
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              Your Event Management Agent
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-slate-200 shadow-2xs text-[11px] font-semibold text-slate-700">
            <span
              className={`w-2 h-2 rounded-full ${
                status === "Working..."
                  ? "bg-amber-500 animate-ping"
                  : status === "Approval required"
                  ? "bg-indigo-600 animate-bounce"
                  : "bg-emerald-500"
              }`}
            />
            <span>{status}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close Eventra AI Panel"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Real Context Header Bar */}
      <div className="px-5 py-2.5 bg-indigo-50/40 border-b border-indigo-100/60 flex items-center justify-between text-[11px] text-slate-600">
        <span className="truncate font-semibold text-indigo-950 max-w-[200px]">
          {event.title}
        </span>
        <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
          <span className="flex items-center gap-1">
            <IconCheckSquare className="w-3 h-3 text-indigo-600" />
            {eventTasks.length} tasks
          </span>
          <span className="flex items-center gap-1">
            <IconUsers className="w-3 h-3 text-indigo-600" />
            {teamMembers.length} team
          </span>
          {detectedRisks.length > 0 && (
            <span className="flex items-center gap-1 text-rose-600 font-bold">
              <IconShieldAlert className="w-3 h-3" />
              {detectedRisks.length} risks
            </span>
          )}
        </div>
      </div>

      {/* Prompt Suggestions */}
      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/30 overflow-x-auto flex items-center gap-2 text-nowrap scrollbar-none">
        {[
          "Auto-assign unassigned tasks",
          "Analyze team workload",
          "Run risk mitigation audit",
          "Generate stage setup checklist",
        ].map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => handleSendMessage(prompt)}
            className="px-2.5 py-1 rounded-xl text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:border-indigo-400 hover:text-indigo-700 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Chat Messages */}
      <div className="flex-1 p-5 space-y-4 overflow-y-auto">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.sender === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[90%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                msg.sender === "user"
                  ? "bg-indigo-600 text-white rounded-br-none shadow-xs"
                  : msg.isError
                  ? "bg-rose-50 border border-rose-200 text-rose-800 rounded-bl-none font-medium"
                  : "bg-slate-50 border border-slate-200/90 text-slate-800 rounded-bl-none shadow-2xs"
              }`}
            >
              {msg.sender === "ai" && (
                <div className="flex items-center gap-1.5 mb-1 text-[11px] font-bold text-indigo-700">
                  <IconSparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Eventra AI Agent</span>
                </div>
              )}

              {msg.sender === "user" ? (
                <div className="whitespace-pre-wrap">{msg.text}</div>
              ) : (
                <div
                  className="whitespace-pre-wrap [&_strong]:font-semibold"
                  dangerouslySetInnerHTML={{
                    __html: msg.text
                      .replace(/&/g, "&amp;")
                      .replace(/</g, "&lt;")
                      .replace(/>/g, "&gt;")
                      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                      .replace(/\*(.+?)\*/g, "<em>$1</em>"),
                  }}
                />
              )}

              {/* Agent Approval Card when a multi-action plan is generated */}
              {msg.plan && (
                <div className="mt-3">
                  <AgentApprovalCard
                    plan={msg.plan}
                    status={msg.executionStatus || "proposed"}
                    executionResultText={msg.executionResultText}
                    onApprove={() => msg.plan && handleApprovePlan(msg.id, msg.plan)}
                    onReject={() => handleRejectPlan(msg.id)}
                  />
                </div>
              )}
            </div>

            <span className="text-[10px] text-slate-400 mt-1 px-1">
              {msg.time}
            </span>
          </div>
        ))}

        {isThinking && (
          <AgentThinking
            statusText="Eventra AI is evaluating real event state..."
            steps={[
              { id: "1", label: "Loading event tasks & team members", status: "completed" },
              { id: "2", label: "Evaluating team workload capacity", status: "completed" },
              { id: "3", label: "Synthesizing optimization plan", status: "running" },
              { id: "4", label: "Generating approval actions", status: "pending" },
            ]}
          />
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-4 border-t border-slate-100 bg-white">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            disabled={isThinking}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Instruct Eventra AI (e.g. create task setup stage)..."
            className="flex-1 px-3.5 py-2.5 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all disabled:opacity-60"
          />

          <button
            type="submit"
            disabled={!input.trim() || isThinking}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            aria-label="Send instruction to Eventra AI"
          >
            {isThinking ? (
              <IconRefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <IconSend className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
