"use client";

import type { RiskAlert } from "./types";
import {
  IconShieldAlert,
  IconAlertTriangle,
  IconSparkles,
  IconClock,
} from "./icons";

interface RisksSectionProps {
  risks: RiskAlert[];
  onTriggerCopilotAction: (prompt: string) => void;
}

export function RisksSection({ risks, onTriggerCopilotAction }: RisksSectionProps) {
  const getSeverityBadge = (severity: RiskAlert["severity"]) => {
    switch (severity) {
      case "high":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
            High Severity
          </span>
        );
      case "medium":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Medium Severity
          </span>
        );
      case "low":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/20 text-blue-300 border border-blue-500/40 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            Advisory
          </span>
        );
    }
  };

  const getCardBorder = (severity: RiskAlert["severity"]) => {
    switch (severity) {
      case "high":
        return "border-rose-500/40 bg-gradient-to-r from-rose-950/20 via-[#0e1526] to-[#0e1526]";
      case "medium":
        return "border-amber-500/40 bg-gradient-to-r from-amber-950/20 via-[#0e1526] to-[#0e1526]";
      case "low":
        return "border-blue-500/30 bg-gradient-to-r from-blue-950/15 via-[#0e1526] to-[#0e1526]";
    }
  };

  return (
    <section className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between pb-1 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20">
            <IconShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-tight">
                AI Risk Sentinel
              </h2>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                {risks.length} Detected
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Autonomous deadline slips, permit blocks & budget variances
            </p>
          </div>
        </div>
      </div>

      {/* Risk Cards */}
      <div className="grid grid-cols-1 gap-3">
        {risks.map((risk) => (
          <div
            key={risk.id}
            className={`p-4 rounded-2xl border transition-all duration-200 ${getCardBorder(
              risk.severity
            )}`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <IconAlertTriangle
                  className={`w-4 h-4 ${
                    risk.severity === "high"
                      ? "text-rose-400"
                      : risk.severity === "medium"
                      ? "text-amber-400"
                      : "text-blue-400"
                  }`}
                />
                <h3 className="text-xs font-bold text-white tracking-tight">
                  {risk.title}
                </h3>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 rounded">
                  {risk.relatedEvent}
                </span>
                {getSeverityBadge(risk.severity)}
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {risk.description}
            </p>

            {/* Impact + Suggested Action Callout */}
            <div className="mt-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
              <div className="text-[11px] text-slate-400">
                <span className="font-semibold text-rose-300">Operational Impact: </span>
                <span>{risk.impact}</span>
              </div>

              <div className="pt-2 border-t border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-[11px] text-slate-300">
                  <span className="font-semibold text-emerald-400">Suggested Action: </span>
                  <span>{risk.suggestedAction}</span>
                </div>

                <button
                  onClick={() =>
                    onTriggerCopilotAction(
                      `Help me resolve risk: "${risk.title}" for event "${risk.relatedEvent}". Suggested action is: ${risk.suggestedAction}`
                    )
                  }
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-indigo-300 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 rounded-lg transition-colors self-start sm:self-auto"
                >
                  <IconSparkles className="w-3 h-3 text-indigo-400" />
                  <span>Fix with Asky</span>
                </button>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-end text-[10px] text-slate-400 gap-1 font-mono">
              <IconClock className="w-3 h-3" />
              <span>Flagged {risk.detectedTime}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
