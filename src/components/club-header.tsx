"use client";

import type { Club } from "./types";
import { IconArrowLeft, IconSettings } from "./icons";

interface ClubHeaderProps {
  club: Club;
  memberCount: number;
  onBackToClubs: () => void;
  onManageClub: () => void;
}

export function ClubHeader({
  club,
  memberCount,
  onBackToClubs,
  onManageClub,
}: ClubHeaderProps) {
  const initial = club.name.trim().charAt(0).toUpperCase() || "C";

  return (
    <div className="space-y-4">
      {/* Back link */}
      <button
        type="button"
        onClick={onBackToClubs}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer group"
      >
        <IconArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
        <span>Back to Clubs</span>
      </button>

      {/* Main Club Profile Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          {/* Large Circle Avatar */}
          <div className="w-16 h-16 rounded-full bg-[#EDE9FE] text-[#5B21B6] flex items-center justify-center font-bold text-2xl flex-shrink-0 shadow-sm border border-indigo-100">
            {initial}
          </div>

          {/* Details */}
          <div className="min-w-0 space-y-1">
            <h1 className="text-xl sm:text-2xl font-bold text-[#1E1B4B] tracking-tight truncate">
              {club.name}
            </h1>
            <p className="text-xs font-medium text-slate-500">
              Alpha Campus · {memberCount} {memberCount === 1 ? "Member" : "Members"}
            </p>
            <p className="text-xs text-slate-600 leading-relaxed max-w-xl">
              {club.description || "No description provided."}
            </p>
          </div>
        </div>

        {/* Manage Club Button */}
        <button
          type="button"
          onClick={onManageClub}
          className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-sm transition-all cursor-pointer"
        >
          <IconSettings className="w-3.5 h-3.5 text-slate-500" />
          <span>Manage Club</span>
        </button>
      </div>
    </div>
  );
}
