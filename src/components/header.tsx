"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { IconSearch, IconBell, IconMenu, IconLogOut, IconX } from "./icons";

interface HeaderProps {
  onOpenMobileMenu: () => void;
  onOpenInbox: () => void;
  unreadCount?: number;
  userInitial?: string;
  userEmail?: string;
  userName?: string;
  activeClubName?: string;
  onSignOut?: () => void | Promise<void>;
}

export function Header({
  onOpenMobileMenu,
  onOpenInbox,
  unreadCount = 6,
  userInitial = "A",
  userEmail = "user@clubops.ai",
  userName = "ClubOps Member",
  activeClubName,
  onSignOut,
}: HeaderProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close profile dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    if (isProfileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isProfileOpen]);

  return (
    <header className="flex items-center justify-between gap-3 sm:gap-4 py-3 px-4 sm:px-6 bg-transparent relative z-30">
      {/* Mobile Menu Icon & Brand Logo for smaller screens */}
      <div className="flex items-center gap-2 lg:hidden">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="p-2 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 cursor-pointer"
          aria-label="Open navigation"
        >
          <IconMenu className="w-5 h-5" />
        </button>

        <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-indigo-100 shadow-2xs bg-white flex-shrink-0">
          <Image
            src="/clubops-logo.png"
            alt="ClubOps AI"
            fill
            sizes="32px"
            className="object-contain p-0.5"
            priority
          />
        </div>
      </div>

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
      <div className="flex items-center gap-3 relative" ref={profileRef}>
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

        {/* User Profile Avatar Toggle Button */}
        <button
          type="button"
          onClick={() => setIsProfileOpen((prev) => !prev)}
          className={`w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-sm flex items-center justify-center shadow-md cursor-pointer transition-all hover:scale-105 active:scale-95 ring-2 ${
            isProfileOpen ? "ring-indigo-500 ring-offset-2" : "ring-white hover:ring-indigo-200"
          }`}
          title="View profile details"
          aria-label="User profile menu"
        >
          {userInitial}
        </button>

        {/* Profile Information Dropdown Modal */}
        {isProfileOpen && (
          <div className="absolute right-0 top-12 w-80 bg-white rounded-3xl border border-indigo-100 shadow-2xl p-5 z-50 animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                User Profile
              </span>
              <button
                type="button"
                onClick={() => setIsProfileOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>

            {/* User Identity Details */}
            <div className="flex items-center gap-3.5 pt-1">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white font-extrabold text-lg flex items-center justify-center shadow-md flex-shrink-0">
                {userInitial}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-[#1E1B4B] truncate">
                  {userName}
                </h3>
                <p className="text-xs text-slate-500 truncate font-medium">
                  {userEmail}
                </p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Active Club Leader
                </span>
              </div>
            </div>

            {/* Profile Information List */}
            <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
              <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <span className="text-slate-500 font-medium">Current Workspace</span>
                <span className="font-bold text-[#1E1B4B] truncate max-w-[140px]">
                  {activeClubName || "General Workspace"}
                </span>
              </div>

              <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <span className="text-slate-500 font-medium">Authentication</span>
                <span className="font-bold text-emerald-600 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Verified Session
                </span>
              </div>
            </div>

            {/* Actions */}
            {onSignOut && (
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(false);
                    onSignOut();
                  }}
                  className="w-full py-2.5 px-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 border border-rose-200/80"
                >
                  <IconLogOut className="w-4 h-4" />
                  Sign Out of ClubOps
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

