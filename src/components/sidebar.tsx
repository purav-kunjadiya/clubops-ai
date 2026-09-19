"use client";

import { useState } from "react";
import type { Club } from "./types";
import {
  IconDashboard,
  IconCalendar,
  IconCheckSquare,
  IconUsers,
  IconInbox,
  IconTrendingUp,
  IconPlus,
  IconCheck,
  IconArrowRight,
  IconX,
} from "./icons";

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  unreadInboxCount: number;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onOpenInbox: () => void;
  clubs?: Club[];
  activeClub?: Club;
  onSelectClub?: (club: Club) => void;
  onOpenCreateClub?: () => void;
  onOpenJoinClub?: () => void;
  memberCount?: number;
  taskCount?: number;
}

export function Sidebar({
  currentTab,
  onSelectTab,
  unreadInboxCount,
  isOpenMobile,
  onCloseMobile,
  onOpenInbox,
  clubs = [],
  activeClub,
  onSelectClub,
  onOpenCreateClub,
  onOpenJoinClub,
  memberCount = 0,
  taskCount = 0,
}: SidebarProps) {
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: IconDashboard, badge: null },
    { id: "events", label: "Events", icon: IconCalendar, badge: null },
    { id: "tasks", label: "Tasks", icon: IconCheckSquare, badge: taskCount > 0 ? taskCount : null },
    { id: "members", label: "Members", icon: IconUsers, badge: null },
    { id: "inbox", label: "Inbox & Approvals", icon: IconInbox, badge: unreadInboxCount > 0 ? unreadInboxCount : null },
    { id: "analytics", label: "Analytics", icon: IconTrendingUp, badge: null },
  ];

  const clubInitial = activeClub ? activeClub.name.trim().charAt(0).toUpperCase() : "A";

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col w-60 bg-white border-r border-slate-200/80 transition-transform duration-200 lg:static lg:translate-x-0 ${
          isOpenMobile ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="px-5 py-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-[#1E1B4B] tracking-tight">ClubOps</span>
              <span className="px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-100/80 rounded-full">
                AI
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Campus Club OS</p>
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg lg:hidden"
            aria-label="Close Sidebar"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === "inbox") {
                    onOpenInbox();
                  } else {
                    onSelectTab(item.id);
                  }
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? "bg-[#EDE9FE] text-indigo-700 font-semibold"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? "text-indigo-700" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                </div>

                {item.badge !== null && item.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                      isActive
                        ? "bg-indigo-200 text-indigo-800"
                        : "bg-indigo-100 text-indigo-700"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Active Club Card & Switcher Dropdown */}
        <div className="p-3 border-t border-slate-100 relative">
          <button
            type="button"
            onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
            className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-50/70 border border-slate-200/60 hover:bg-slate-100/80 transition-colors text-left group cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-[#EDE9FE] text-[#5B21B6] flex items-center justify-center font-bold text-xs flex-shrink-0">
                {clubInitial}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-indigo-600">
                  {activeClub ? activeClub.name : "No Club Selected"}
                </p>
                <p className="text-[10px] text-slate-400 truncate">
                  Alpha Campus · {memberCount} Members
                </p>
              </div>
            </div>

            <IconArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 flex-shrink-0" />
          </button>

          {/* Switcher Dropdown */}
          {isSwitcherOpen && (
            <div className="absolute left-3 right-3 bottom-full mb-2 z-40 p-2 rounded-2xl bg-white border border-slate-200 shadow-xl space-y-1 animate-in fade-in zoom-in-95">
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                My Clubs
              </div>
              {clubs.map((club) => {
                const isSelected = activeClub?.id === club.id;
                return (
                  <button
                    key={club.id}
                    type="button"
                    onClick={() => {
                      onSelectClub?.(club);
                      setIsSwitcherOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors text-left cursor-pointer ${
                      isSelected
                        ? "bg-indigo-50 text-indigo-700 font-semibold"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <p className="truncate font-medium">{club.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">Code: {club.code}</p>
                    </div>
                    {isSelected && <IconCheck className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />}
                  </button>
                );
              })}

              <div className="pt-1.5 border-t border-slate-100 space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsSwitcherOpen(false);
                    onOpenCreateClub?.();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                >
                  <IconPlus className="w-3.5 h-3.5" />
                  <span>Create Club</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsSwitcherOpen(false);
                    onOpenJoinClub?.();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <IconUsers className="w-3.5 h-3.5 text-slate-400" />
                  <span>Join Club</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
