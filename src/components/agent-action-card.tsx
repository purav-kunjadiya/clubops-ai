"use client";

import type { AgentAction } from "@/lib/agent";
import { IconCheck, IconAlertTriangle } from "./icons";

interface AgentActionCardProps {
  title?: string;
  subtitle?: string;
  actions: AgentAction[];
  onReview?: () => void;
}

export function AgentActionCard({
  title = "Event Action Plan",
  subtitle,
  actions,
  onReview,
}: AgentActionCardProps) {
  const approvalCount = actions.filter((a) => a.requiresApproval).length;

  return (
    <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-[#1E1B4B]">{title}</h4>
          {subtitle && <p className="text-[10px] text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
          {actions.length} Actions
        </span>
      </div>

      <div className="space-y-1.5 pt-1">
        {actions.map((act) => (
          <div
            key={act.id}
            className="p-2 rounded-xl bg-slate-50/80 border border-slate-100 flex items-start gap-2 text-[11px]"
          >
            {act.requiresApproval ? (
              <span className="p-1 rounded-md bg-amber-100 text-amber-800 flex-shrink-0 mt-0.5">
                <IconAlertTriangle className="w-3 h-3" />
              </span>
            ) : (
              <span className="p-1 rounded-md bg-emerald-100 text-emerald-800 flex-shrink-0 mt-0.5">
                <IconCheck className="w-3 h-3" />
              </span>
            )}
            <div className="flex-1 min-w-0">
              <span className="text-slate-800 font-medium leading-relaxed block truncate">
                {act.description}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {act.type} {act.requiresApproval ? "· Requires Approval" : "· Auto-executable"}
              </span>
            </div>
          </div>
        ))}
      </div>

      {approvalCount > 0 && (
        <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium flex items-center gap-1.5">
          <IconAlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
          <span>{approvalCount} action(s) require human review before writing to database.</span>
        </div>
      )}

      {onReview && (
        <button
          type="button"
          onClick={onReview}
          className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
        >
          Review Plan
        </button>
      )}
    </div>
  );
}
