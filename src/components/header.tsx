"use client";

import { IconSearch, IconBell, IconMenu, IconLogOut } from "./icons";

interface HeaderProps {
  onOpenMobileMenu: () => void;
  onOpenInbox: () => void;
  unreadCount?: number;
  userInitial?: string;
  onSignOut?: () => void | Promise<void>;
}

export function Header({
  onOpenMobileMenu,
  onOpenInbox,
  unreadCount = 6,
  userInitial = "A",
  onSignOut,
}: HeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 py-3 px-4 sm:px-6 bg-transparent">
      {/* Mobile Menu Icon */}
      <button
        type="button"
        onClick={onOpenMobileMenu}
        className="p-2 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 lg:hidden"
        aria-label="Open navigation"
      >
        <IconMenu className="w-5 h-5" />
      </button>

      {/* Global Search Bar */}
      <div className="relative flex-1 max-w-2xl">
        <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search events, tasks, or anything..."
          className="w-full pl-10 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all shadow-sm"
        />
      </div>

      {/* Right Controls: Notification Bell + Sign Out + User Avatar */}
      <div className="flex items-center gap-3">
        {/* Notification Bell */}
        <button
          type="button"
          onClick={onOpenInbox}
          className="relative p-2 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-white border border-transparent hover:border-slate-200 transition-all cursor-pointer"
          title="Inbox & Approvals"
        >
          <IconBell className="w-5 h-5 text-slate-700" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-600 ring-2 ring-[#F8F9FD]" />
          )}
        </button>

        {/* Sign Out */}
        {onSignOut && (
          <button
            type="button"
            onClick={() => onSignOut()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50/50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-rose-100"
            title="Sign out"
          >
            <IconLogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        )}

        {/* User Profile Avatar */}
        <div className="w-8 h-8 rounded-full bg-[#EDE9FE] text-[#5B21B6] border border-indigo-100 font-bold text-xs flex items-center justify-center shadow-sm cursor-pointer hover:ring-2 hover:ring-indigo-200 transition-all">
          {userInitial}
        </div>
      </div>
    </header>
  );
}

