"use client";

import { IconSparkles, IconCheck } from "./icons";

interface StepItem {
  id: string;
  label: string;
  status: "completed" | "running" | "pending";
}

interface AgentThinkingProps {
  statusText?: string;
  steps?: StepItem[];
}

export function AgentThinking({
  statusText = "Eventra AI is working...",
  steps = [
    { id: "1", label: "Reading event context & tasks", status: "completed" },
    { id: "2", label: "Checking club team workloads", status: "completed" },
    { id: "3", label: "Synthesizing operational plan", status: "running" },
    { id: "4", label: "Preparing approval actions", status: "pending" },
  ],
}: AgentThinkingProps) {
  return (
    <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 shadow-2xs space-y-3 animate-in fade-in duration-200">
      <div className="flex items-center gap-2.5 text-xs font-semibold text-indigo-900">
        <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-xs animate-pulse">
          <IconSparkles className="w-3.5 h-3.5" />
        </div>
        <span>{statusText}</span>
      </div>

      <div className="space-y-2 pl-2">
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-2 text-[11px]">
            {step.status === "completed" && (
              <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                <IconCheck className="w-2.5 h-2.5" />
              </span>
            )}
            {step.status === "running" && (
              <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping" />
              </span>
            )}
            {step.status === "pending" && (
              <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              </span>
            )}
            <span
              className={
                step.status === "completed"
                  ? "text-slate-600 line-through font-medium"
                  : step.status === "running"
                  ? "text-indigo-900 font-semibold"
                  : "text-slate-400"
              }
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
