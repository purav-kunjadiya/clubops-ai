"use client";

import React, { useState, useEffect, useRef } from "react";
import type { ClubEvent, EventTeamMember, TaskItem } from "./types";
import {
  IconX,
  IconSparkles,
  IconSend,
} from "./icons";
import {
  executeApprovedActions,
  type AgentPlan,
} from "@/lib/agent";
import { calculateTeamWorkloads } from "@/lib/workload";
import { detectEventRisks } from "@/lib/risks";
import { fetchEventTasks } from "@/lib/tasks";
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
  club?: unknown;
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
  currentUserId,
  teamMembers,
  eventTasks,
  onTasksUpdated,
  initialPrompt,
}: EventraDrawerProps) {
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
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

  const [messages, setMessages] = useState<MessageItem[]>([]);

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
    } catch (err: unknown) {
      console.error("Plan execution error:", err);
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, executionStatus: "failed" } : m))
      );
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
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[400px] lg:w-[420px] bg-white border-l border-slate-200/90 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 max-sm:inset-0 max-sm:w-full max-sm:rounded-none sm:rounded-l-3xl overflow-hidden font-sans">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 bg-white/90 backdrop-blur-sm flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs flex-shrink-0">
            <IconSparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-[#1E1B4B]">Eventra AI</h3>
            <p className="text-[11px] font-medium text-slate-500">Your Event Management Agent</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Small Status Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/60 text-[10px] font-bold text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Online</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close Eventra AI Panel"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages Container / Empty State */}
      <div className="flex-1 p-4 sm:p-5 space-y-4 overflow-y-auto bg-slate-50/40">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 my-auto space-y-5">
            <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg ring-4 ring-indigo-50">
              <IconSparkles className="w-7 h-7" />
            </div>

            <div className="space-y-1.5 max-w-xs">
              <h3 className="text-base font-extrabold text-[#1E1B4B]">Eventra AI</h3>
              <p className="text-xs font-semibold text-indigo-600">Your Event Management Agent</p>
              <p className="text-xs text-slate-500 leading-relaxed pt-1">
                &ldquo;Plan events, manage tasks, identify risks, and keep your team moving.&rdquo;
              </p>
            </div>

            <div className="w-full max-w-xs space-y-2 pt-2">
              {[
                "Create an event",
                "Show event risks",
                "Plan my tasks",
              ].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSendMessage(prompt)}
                  className="w-full py-2.5 px-4 rounded-2xl text-xs font-semibold text-[#1E1B4B] bg-white border border-slate-200/90 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all cursor-pointer shadow-2xs flex items-center justify-between group"
                >
                  <span>{prompt}</span>
                  <span className="text-indigo-400 group-hover:translate-x-0.5 transition-transform font-bold">→</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.sender === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[90%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-indigo-50 border border-indigo-100 text-[#1E1B4B] rounded-tr-xs shadow-2xs font-medium"
                    : msg.isError
                    ? "bg-rose-50 border border-rose-200 text-rose-800 rounded-tl-xs font-medium"
                    : "bg-white border border-slate-200/90 text-[#1E1B4B] rounded-tl-xs shadow-2xs"
                }`}
              >
                {msg.sender === "user" ? (
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                ) : (
                  <div>
                    {renderMarkdownContent(msg.text)}
                  </div>
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
          ))
        )}

        {/* Subtle Thinking Indicator */}
        {isThinking && (
          <div className="flex items-start gap-2.5 my-2">
            <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs flex-shrink-0">
              <IconSparkles className="w-4 h-4 animate-spin" />
            </div>
            <div className="p-3 rounded-2xl bg-white border border-slate-200/90 shadow-2xs text-xs text-[#1E1B4B] flex items-center gap-2">
              <span className="font-semibold text-indigo-700">Eventra AI</span>
              <span className="text-slate-400">Thinking...</span>
              <span className="flex items-center gap-1 ml-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-pulse" />
              </span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Bar Fixed at Bottom */}
      <div className="p-4 border-t border-slate-100 bg-white flex-shrink-0">
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
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Ask Eventra AI..."
            className="flex-1 px-4 py-3 text-xs text-[#1E1B4B] bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all placeholder-slate-400 disabled:opacity-60"
          />

          <button
            type="submit"
            disabled={!input.trim() || isThinking}
            className="p-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex-shrink-0"
            aria-label="Send message to Eventra AI"
          >
            <IconSend className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function renderMarkdownContent(text: string) {
  if (!text) return null;

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = () => {
    if (currentList.length > 0 && listType) {
      if (listType === "ul") {
        elements.push(
          <ul key={`ul-${elements.length}`} className="list-disc list-inside space-y-1 my-2 text-[#1E1B4B]">
            {currentList}
          </ul>
        );
      } else {
        elements.push(
          <ol key={`ol-${elements.length}`} className="list-decimal list-inside space-y-1 my-2 text-[#1E1B4B]">
            {currentList}
          </ol>
        );
      }
      currentList = [];
      listType = null;
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      return;
    }

    if (trimmed.startsWith("### ")) {
      flushList();
      elements.push(
        <h3 key={idx} className="text-xs font-bold text-[#1E1B4B] mt-2 mb-1 border-b border-slate-100 pb-1">
          {formatInline(trimmed.replace(/^###\s+/, ""))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(
        <h2 key={idx} className="text-xs font-extrabold text-[#1E1B4B] mt-2.5 mb-1">
          {formatInline(trimmed.replace(/^##\s+/, ""))}
        </h2>
      );
      return;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (listType !== "ul") flushList();
      listType = "ul";
      const content = trimmed.replace(/^[-*]\s+/, "");
      currentList.push(
        <li key={idx} className="text-xs leading-relaxed text-[#1E1B4B]">
          {formatInline(content)}
        </li>
      );
      return;
    }

    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      if (listType !== "ol") flushList();
      listType = "ol";
      currentList.push(
        <li key={idx} className="text-xs leading-relaxed text-[#1E1B4B]">
          {formatInline(numMatch[2])}
        </li>
      );
      return;
    }

    flushList();
    elements.push(
      <p key={idx} className="text-xs leading-relaxed text-[#1E1B4B] my-1">
        {formatInline(trimmed)}
      </p>
    );
  });

  flushList();
  return <div className="space-y-1">{elements}</div>;
}

function formatInline(str: string): React.ReactNode {
  const parts = str.split(/(\*\*.+?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-[#1E1B4B]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}
