"use client";

import type { AgentPlan } from "@/lib/agent";
import { IconCheck, IconX, IconSparkles } from "./icons";

interface AgentApprovalCardProps {
  plan: AgentPlan;
  status?: "pending_approval" | "proposed" | "approved" | "rejected" | "executing" | "completed" | "failed";
  executionResultText?: string;
  onApprove: () => void;
  onReject: () => void;
  onReview?: () => void;
}

export function AgentApprovalCard({
  plan,
  status = "pending_approval",
  executionResultText,
  onApprove,
  onReject,
  onReview,
}: AgentApprovalCardProps) {
  const getStatusBadge = () => {
    switch (status) {
      case "approved":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            Approved
          </span>
        );
      case "executing":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
            Executing Supabase Writes...
          </span>
        );
      case "completed":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Completed & Persisted
          </span>
        );
      case "failed":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            Execution Error
          </span>
        );
      case "rejected":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
            Rejected
          </span>
        );
      case "pending_approval":
      case "proposed":
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
            Approval Required
          </span>
        );
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-white border border-indigo-200 shadow-sm space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
            <IconSparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#1E1B4B]">Eventra Proposed Plan</h4>
            <p className="text-[10px] text-slate-500 font-mono">{plan.intent}</p>
          </div>
        </div>
        {getStatusBadge()}
      </div>

      {/* Reasoning Summary */}
      <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
        {plan.reasoningSummary}
      </p>

      {/* Action Breakdown */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Actions ({plan.actions.length})
        </p>
        {plan.actions.map((act) => (
          <div
            key={act.id}
            className="p-2 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-2 text-[11px]"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1.5 flex-shrink-0" />
            <span className="text-slate-700 font-medium leading-snug">{act.description}</span>
          </div>
        ))}
      </div>

      {/* Result feedback if finished */}
      {executionResultText && (
        <div
          className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            status === "failed"
              ? "bg-rose-50 border-rose-200 text-rose-900"
              : "bg-emerald-50 border-emerald-200 text-emerald-900"
          }`}
        >
          {status === "failed" ? (
            <IconX className="w-4 h-4 text-rose-600 flex-shrink-0" />
          ) : (
            <IconCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          )}
          <span>{executionResultText}</span>
        </div>
      )}

      {/* Actions */}
      {(status === "proposed" || status === "pending_approval") && (
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onApprove}
            className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <IconCheck className="w-3.5 h-3.5" />
            {plan.intent === "CREATE_EVENT"
              ? "Approve & Create Event"
              : plan.intent === "ASSIGN_TASK"
              ? "Approve & Assign"
              : "Approve & Execute"}
          </button>
          {onReview && (
            <button
              type="button"
              onClick={onReview}
              className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              Review
            </button>
          )}
          <button
            type="button"
            onClick={onReject}
            className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1"
            title="Reject"
          >
            <IconX className="w-3.5 h-3.5" />
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
