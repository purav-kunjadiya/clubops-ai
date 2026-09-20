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
  suggestions?: string[];
}

interface EventraDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  event?: ClubEvent | null;
  club?: unknown;
  currentUserId?: string;
  teamMembers: EventTeamMember[];
  eventTasks: TaskItem[];
  onTasksUpdated: () => void;
  initialPrompt?: string;
}

function generateFollowUpSuggestions(prompt: string, answerText: string): string[] {
  const p = prompt.toLowerCase();
  const a = answerText.toLowerCase();

  if (p.includes("overdue") || a.includes("overdue")) {
    return [
      "Who is assigned to overdue tasks?",
      "What should we prioritize first?",
      "Create a task to resolve this",
    ];
  }
  if (p.includes("workload") || a.includes("workload") || a.includes("overloaded")) {
    return [
      "Who has the most active tasks?",
      "How can we rebalance the team?",
      "Show all team members",
    ];
  }
  if (p.includes("risk") || a.includes("risk")) {
    return [
      "Which risk is most critical?",
      "How do we mitigate these risks?",
      "Create a safety task",
    ];
  }
  if (p.includes("plan") || p.includes("fest") || p.includes("create")) {
    return [
      "What tasks should we assign next?",
      "Check our event schedule",
      "Show team workload summary",
    ];
  }

  return [
    "What tasks are currently overdue?",
    "Who has the highest workload?",
    "What risks should I be aware of?",
  ];
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
    () => detectEventRisks(event?.id || "general", eventTasks, teamMembers, event || undefined),
    [eventTasks, teamMembers, event]
  );

  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: "msg-init-0",
      sender: "ai",
      text: "Hi! I'm **Eventra AI**, your event management assistant.\n\nI can help you manage tasks, team workload, risks, meetings, and event planning.",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      suggestions: [
        "What tasks are currently overdue?",
        "Who has the highest workload?",
        "What risks should I be aware of?",
        "What should we focus on today?",
      ],
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

      const conversationHistory = messages.map((m) => ({
        role: m.sender === "user" ? "user" : "model",
        text: m.text,
      }));

      const res = await fetch("/api/asky/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          history: conversationHistory,
          context: {
            event: event
              ? {
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
                }
              : null,
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
      const responseText = data.answer || (hasPlan ? "Here is your proposed action plan:" : "Here is your operational summary:");
      const suggestions = generateFollowUpSuggestions(promptText, responseText);

      setMessages((prev) => [
        ...prev,
        {
          id: `msg-ai-${counterRef.current}`,
          sender: "ai",
          text: responseText,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          plan: activePlan,
          executionStatus: hasPlan ? "proposed" : undefined,
          functionCalls: data.functionCalls,
          modelParts: data.modelParts,
          promptText,
          suggestions,
        },
      ]);
    } catch {
      counterRef.current += 1;
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-err-${counterRef.current}`,
          sender: "ai",
          text: "Something went wrong while checking that. Please try again.",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          isError: true,
          promptText,
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

      onTasksUpdated();

      // Trigger Turn 2: Send tool results back to Gemini for final response synthesis
      const executedResults = resultPlan.actions.map((act) => ({
        name: act.type.toLowerCase(),
        result: {
          actionId: act.id,
          status: act.status,
          description: act.description,
        },
      }));

      const res = await fetch("/api/asky/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: targetMsg?.promptText || "Action executed",
          context: {
            event,
            tasks: eventTasks,
            teamMembers,
          },
          previousFunctionCalls: targetMsg?.functionCalls,
          modelParts: targetMsg?.modelParts,
          toolResults: executedResults,
        }),
      });

      const data = await res.json();
      const finalAnswer = data.answer || "Actions executed successfully!";

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                executionStatus: "completed",
                executionResultText: finalAnswer,
              }
            : m
        )
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Execution failed";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                executionStatus: "failed",
                executionResultText: `Execution failed: ${errMsg}`,
              }
            : m
        )
      );
    }
  };

  const handleRejectPlan = (msgId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, executionStatus: "failed" } : m))
    );
  };

  return (
    <div
      className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-white border-l border-slate-200/90 shadow-2xl transition-transform duration-300 ease-in-out flex flex-col font-sans ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-md">
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

      {/* Messages Container */}
      <div className="flex-1 p-4 sm:p-5 space-y-4 overflow-y-auto bg-slate-50/40">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.sender === "user" ? "items-end" : "items-start"
            }`}
          >
            {/* Sender Header Label */}
            <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] font-semibold">
              {msg.sender === "user" ? (
                <span className="text-slate-500 font-bold">You</span>
              ) : (
                <div className="flex items-center gap-1 text-indigo-700">
                  <div className="w-4 h-4 rounded-md bg-indigo-600 text-white flex items-center justify-center">
                    <IconSparkles className="w-2.5 h-2.5" />
                  </div>
                  <span className="font-extrabold text-[#1E1B4B]">Eventra AI</span>
                </div>
              )}
            </div>

            <div
              className={`max-w-[90%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                msg.sender === "user"
                  ? "bg-indigo-600 text-white rounded-tr-xs shadow-xs font-medium"
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

              {/* Retry button for errors */}
              {msg.isError && msg.promptText && (
                <div className="mt-2.5 pt-2 border-t border-rose-200/60 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-rose-700">Request failed</span>
                  <button
                    type="button"
                    onClick={() => handleSendMessage(msg.promptText)}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold shadow-2xs transition-colors cursor-pointer"
                  >
                    Retry
                  </button>
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

            {/* Follow-up Suggestion Chips under AI message */}
            {msg.sender === "ai" && msg.suggestions && msg.suggestions.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5 max-w-[90%] pt-0.5">
                {msg.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleSendMessage(suggestion)}
                    className="px-3 py-1.5 rounded-full text-[11px] font-semibold text-indigo-700 bg-white hover:bg-indigo-50/80 border border-indigo-200/80 transition-all cursor-pointer shadow-2xs flex items-center gap-1 group"
                  >
                    <span>{suggestion}</span>
                    <span className="text-indigo-400 group-hover:translate-x-0.5 transition-transform font-bold">→</span>
                  </button>
                ))}
              </div>
            )}

            <span className="text-[10px] text-slate-400 mt-1 px-1">
              {msg.time}
            </span>
          </div>
        ))}

        {/* Typing Indicator */}
        {isThinking && (
          <div className="flex items-start gap-2.5 my-2">
            <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs flex-shrink-0">
              <IconSparkles className="w-4 h-4 animate-spin" />
            </div>
            <div className="p-3 rounded-2xl bg-white border border-slate-200/90 shadow-2xs text-xs text-[#1E1B4B] flex items-center gap-2">
              <span className="font-semibold text-indigo-700">Eventra AI</span>
              <span className="text-slate-400">Eventra is thinking...</span>
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
