"use client";

import {
  IconDashboard,
  IconCalendar,
  IconCheckSquare,
  IconUsers,
  IconSettings,
} from "./icons";

export type ClubTabType = "overview" | "events" | "tasks" | "members" | "settings";

interface ClubTabsProps {
  activeTab: ClubTabType;
  onTabChange: (tab: ClubTabType) => void;
  taskCount?: number;
  memberCount?: number;
}

export function ClubTabs({
  activeTab,
  onTabChange,
  taskCount = 4,
  memberCount,
}: ClubTabsProps) {
  const tabs = [
    { id: "overview" as const, label: "Overview", icon: IconDashboard },
    { id: "events" as const, label: "Events", icon: IconCalendar },
    { id: "tasks" as const, label: "Tasks", icon: IconCheckSquare, badge: taskCount },
    { id: "members" as const, label: "Members", icon: IconUsers, badge: memberCount },
    { id: "settings" as const, label: "Settings", icon: IconSettings },
  ];

  return (
    <div className="border-b border-slate-200">
      <nav className="flex items-center gap-6 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 py-3 text-xs font-semibold transition-all relative whitespace-nowrap cursor-pointer ${
                isActive
                  ? "text-indigo-600"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />
              <span>{tab.label}</span>

              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                    isActive
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {tab.badge}
                </span>
              )}

              {/* Purple active bottom border underline */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
