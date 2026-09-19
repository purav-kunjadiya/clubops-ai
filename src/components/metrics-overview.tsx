import type React from "react";
import type { MetricCardData } from "./types";
import {
  IconCalendar,
  IconCheckSquare,
  IconDollarSign,
  IconUsers,
  IconTrendingUp,
} from "./icons";

interface MetricsOverviewProps {
  metrics: MetricCardData[];
}

export function MetricsOverview({ metrics }: MetricsOverviewProps) {
  const getIcon = (type: MetricCardData["metricType"]) => {
    switch (type) {
      case "events":
        return <IconCalendar className="w-5 h-5 text-indigo-400" />;
      case "tasks":
        return <IconCheckSquare className="w-5 h-5 text-amber-400" />;
      case "budget":
        return <IconDollarSign className="w-5 h-5 text-emerald-400" />;
      case "engagement":
        return <IconUsers className="w-5 h-5 text-cyan-400" />;
    }
  };

  const getBorderGlow = (type: MetricCardData["metricType"]) => {
    switch (type) {
      case "events":
        return "hover:border-indigo-500/40 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)]";
      case "tasks":
        return "hover:border-amber-500/40 hover:shadow-[0_0_20px_rgba(245,158,11,0.15)]";
      case "budget":
        return "hover:border-emerald-500/40 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]";
      case "engagement":
        return "hover:border-cyan-500/40 hover:shadow-[0_0_20px_rgba(6,182,212,0.15)]";
    }
  };

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {metrics.map((m) => (
        <div
          key={m.title}
          className={`p-4 rounded-2xl bg-[#0e1526]/80 border border-slate-800/80 backdrop-blur-sm transition-all duration-200 ${getBorderGlow(
            m.metricType
          )} flex flex-col justify-between group`}
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400 group-hover:text-slate-300 transition-colors">
                {m.title}
              </span>
              <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800/80 shadow-sm">
                {getIcon(m.metricType)}
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-white">
                {m.value}
              </span>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
            <span className="text-slate-400 text-[11px] truncate">{m.subtitle}</span>
            <span
              className={`flex items-center gap-1 text-[11px] font-semibold flex-shrink-0 ${
                m.isPositive ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {m.isPositive && <IconTrendingUp className="w-3 h-3" />}
              {m.change}
            </span>
          </div>
        </div>
      ))}
    </section>
  );
}
