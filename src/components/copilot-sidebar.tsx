"use client";

import { useState } from "react";
import {
  IconSparkles,
  IconArrowRight,
  IconCalendar,
  IconCheckSquare,
  IconUsers,
  IconTrendingUp,
  IconLightbulb,
} from "./icons";

interface CopilotSidebarProps {
  eventCount: number;
  taskCount: number;
  memberCount: number;
  input: string;
  onInputChange: (val: string) => void;
  onSendPrompt?: (prompt: string) => void;
  context?: {
    event?: Record<string, unknown> | null;
    tasks?: Array<Record<string, unknown>>;
    teamMembers?: Array<Record<string, unknown>>;
    workloads?: Array<Record<string, unknown>>;
    risks?: Array<Record<string, unknown>>;
  };
}

export function CopilotSidebar({
  eventCount,
  taskCount,
  memberCount,
  input,
  onInputChange,
  onSendPrompt,
  context,
}: CopilotSidebarProps) {
  const [responseSnippet, setResponseSnippet] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const suggestionChips = [
    "What tasks are currently overdue?",
    "Who has the highest workload?",
    "What risks should I be aware of?",
    "Summarize club activity",
  ];

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim() || isLoading) return;

    if (onSendPrompt) {
      onSendPrompt(text);
    }

    onInputChange("");
    setIsLoading(true);
    setIsError(false);
    setResponseSnippet("Eventra AI is thinking...");

    try {
      const res = await fetch("/api/asky/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text.trim(),
          context: context || {},
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setIsError(true);
        setResponseSnippet(data.error || "Sorry, I couldn't process your question right now.");
      } else {
        setIsError(false);
        setResponseSnippet(data.answer || "No response received.");
      }
    } catch {
      setIsError(true);
      setResponseSnippet("Network error: Unable to reach Eventra AI service. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <aside className="w-full lg:w-80 space-y-6 flex-shrink-0">
      {/* Card 1: Eventra AI */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
        {/* Header */}
        <div className="flex items-start gap-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
            <IconSparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#1E1B4B]">Eventra AI</h2>
            <p className="text-xs text-slate-500">Your ClubOps AI assistant</p>
          </div>
        </div>

        {/* Input Box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="relative"
        >
          <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50/70 border border-slate-200 focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-indigo-500/20 transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder="Ask Eventra AI anything..."
              className="flex-1 bg-transparent px-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                input.trim()
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shadow-sm"
                  : "bg-indigo-600/60 text-white/80 cursor-not-allowed"
              }`}
              aria-label="Send prompt"
            >
              <IconArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        {responseSnippet && (
          <div
            className={`p-2.5 rounded-xl text-[11px] leading-relaxed animate-in fade-in transition-all ${
              isError
                ? "bg-rose-50 border border-rose-200 text-rose-800"
                : isLoading
                ? "bg-indigo-50/70 border border-indigo-100 text-indigo-700 flex items-center gap-2"
                : "bg-indigo-50 border border-indigo-100 text-indigo-900 whitespace-pre-wrap max-h-60 overflow-y-auto"
            }`}
          >
            {isLoading && <IconSparkles className="w-3.5 h-3.5 text-indigo-600 animate-spin flex-shrink-0" />}
            <span>{responseSnippet}</span>
          </div>
        )}

        {/* Suggestion Chips */}
        <div className="space-y-2 pt-1">
          {suggestionChips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => handleSend(chip)}
              className="w-full text-center py-2 px-3 rounded-xl text-xs font-medium text-slate-700 bg-slate-50/80 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200/80 transition-all cursor-pointer"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      {/* Card 2: Quick Stats */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <IconTrendingUp className="w-4 h-4 text-indigo-600" />
          <h2 className="text-sm font-bold text-[#1E1B4B]">Quick Stats</h2>
        </div>

        {/* 2x2 Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Upcoming Events */}
          <div className="p-3 rounded-xl bg-slate-50/60 border border-slate-200/70 space-y-1">
            <IconCalendar className="w-4 h-4 text-indigo-500" />
            <div className="text-lg font-bold text-[#1E1B4B]">{eventCount}</div>
            <div className="text-[11px] text-slate-500">Upcoming Events</div>
          </div>

          {/* Open Tasks */}
          <div className="p-3 rounded-xl bg-slate-50/60 border border-slate-200/70 space-y-1">
            <IconCheckSquare className="w-4 h-4 text-indigo-500" />
            <div className="text-lg font-bold text-[#1E1B4B]">{taskCount}</div>
            <div className="text-[11px] text-slate-500">Open Tasks</div>
          </div>

          {/* Members */}
          <div className="p-3 rounded-xl bg-slate-50/60 border border-slate-200/70 space-y-1">
            <IconUsers className="w-4 h-4 text-indigo-500" />
            <div className="text-lg font-bold text-[#1E1B4B]">{memberCount}</div>
            <div className="text-[11px] text-slate-500">Members</div>
          </div>

          {/* This Month */}
          <div className="p-3 rounded-xl bg-slate-50/60 border border-slate-200/70 space-y-1">
            <IconTrendingUp className="w-4 h-4 text-indigo-500" />
            <div className="text-lg font-bold text-[#1E1B4B]">0</div>
            <div className="text-[11px] text-slate-500">This Month</div>
          </div>
        </div>

        {/* Get started! Callout Card */}
        <div className="p-3 rounded-xl bg-indigo-50/40 border border-indigo-100/80 flex items-start gap-2.5">
          <div className="p-1 rounded-md bg-indigo-100/80 text-indigo-600 mt-0.5">
            <IconLightbulb className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-indigo-950">Get started!</h4>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              Add your first event to see your club come to life.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
