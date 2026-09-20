"use client";

import { IconCheck, IconAlertTriangle } from "./icons";

interface AgentResultProps {
  success: boolean;
  title?: string;
  message: string;
  details?: string[];
}

export function AgentResult({
  success,
  title = success ? "Agent Operation Complete" : "Execution Issue",
  message,
  details = [],
}: AgentResultProps) {
  return (
    <div
      className={`p-4 rounded-2xl border shadow-2xs space-y-2 animate-in fade-in duration-200 ${
        success
          ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
          : "bg-rose-50/70 border-rose-200 text-rose-950"
      }`}
    >
      <div className="flex items-center gap-2">
        <div
          className={`p-1.5 rounded-lg text-white shadow-2xs ${
            success ? "bg-emerald-600" : "bg-rose-600"
          }`}
        >
          {success ? <IconCheck className="w-3.5 h-3.5" /> : <IconAlertTriangle className="w-3.5 h-3.5" />}
        </div>
        <h4 className="text-xs font-bold">{title}</h4>
      </div>

      <p className="text-xs font-medium leading-relaxed pl-1">{message}</p>

      {details.length > 0 && (
        <div className="pt-1 pl-1 space-y-1">
          {details.map((item, idx) => (
            <div key={idx} className="text-[11px] opacity-80 flex items-start gap-1.5">
              <span>•</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
