"use client";

import type { Club } from "./types";
import { IconUsers, IconPlus, IconCheck } from "./icons";

interface ClubsListViewProps {
  clubs: Club[];
  activeClub: Club;
  onSelectClub: (club: Club) => void;
  onOpenCreateClub: () => void;
  onOpenJoinClub: () => void;
}

export function ClubsListView({
  clubs,
  activeClub,
  onSelectClub,
  onOpenCreateClub,
  onOpenJoinClub,
}: ClubsListViewProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1E1B4B]">My Campus Clubs</h2>
          <p className="text-xs text-slate-500">
            Select an active club workspace or initialize a new one
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenJoinClub}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-sm transition-all cursor-pointer"
          >
            <IconUsers className="w-3.5 h-3.5 text-slate-500" />
            <span>Join with Code</span>
          </button>

          <button
            type="button"
            onClick={onOpenCreateClub}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all cursor-pointer"
          >
            <IconPlus className="w-3.5 h-3.5" />
            <span>Create Club</span>
          </button>
        </div>
      </div>

      {/* Grid of Clubs */}
      {clubs.length === 0 ? (
        <div className="border border-dashed border-slate-300/80 rounded-3xl p-12 bg-white/60 text-center space-y-4 shadow-sm">
          <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-indigo-100 bg-indigo-50/50 flex items-center justify-center">
              <IconUsers className="w-7 h-7 text-indigo-600" />
            </div>
            <span className="absolute -top-1 left-3 w-1 h-1 rounded-full bg-indigo-400" />
            <span className="absolute -top-1 right-3 w-1 h-1 rounded-full bg-indigo-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-[#1E1B4B]">No clubs yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Create your first club or join an existing one with a club code to get started.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={onOpenJoinClub}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-sm transition-all cursor-pointer"
            >
              <IconUsers className="w-3.5 h-3.5 text-slate-500" />
              <span>Join with Code</span>
            </button>
            <button
              type="button"
              onClick={onOpenCreateClub}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm hover:shadow transition-all cursor-pointer"
            >
              <IconPlus className="w-3.5 h-3.5" />
              <span>Create Club</span>
            </button>
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {clubs.map((club) => {
          const isActive = club.id === activeClub.id;
          const initial = club.name.trim().charAt(0).toUpperCase() || "C";

          return (
            <div
              key={club.id}
              onClick={() => onSelectClub(club)}
              className={`p-5 rounded-2xl border transition-all cursor-pointer bg-white shadow-sm hover:shadow-md ${
                isActive
                  ? "border-indigo-500 ring-2 ring-indigo-100"
                  : "border-slate-200/80 hover:border-slate-300"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#EDE9FE] text-[#5B21B6] font-bold text-lg flex items-center justify-center">
                    {initial}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#1E1B4B]">{club.name}</h3>
                    <p className="text-[11px] font-mono text-indigo-600 font-semibold">
                      Code: {club.code}
                    </p>
                  </div>
                </div>

                {isActive && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                    <IconCheck className="w-3 h-3" />
                    Active
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                {club.description || "Active student organization workspace for events and operations."}
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>Alpha Campus</span>
                <span className="text-indigo-600 font-semibold group-hover:underline">
                  Open Workspace →
                </span>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
