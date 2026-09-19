"use client";

import type { Club, ClubEvent, TaskItem } from "./types";
import { IconCalendar, IconCheckSquare, IconShieldAlert, IconPlus } from "./icons";

interface ClubOverviewTabProps {
  club: Club;
  events: ClubEvent[];
  tasks: TaskItem[];
  onOpenCreateEvent: () => void;
  onGoToTab: (tab: "events" | "tasks") => void;
  onSelectEvent?: (event: ClubEvent) => void;
}

export function ClubOverviewTab({
  club,
  events,
  tasks,
  onOpenCreateEvent,
  onGoToTab,
  onSelectEvent,
}: ClubOverviewTabProps) {
  const openTasks = tasks.filter((t) => !t.completed);

  return (
    <div className="space-y-6">
      {/* Welcome / Mission Spotlight */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-3">
        <h2 className="text-base font-bold text-[#1E1B4B]">About {club.name}</h2>
        <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
          {club.description ||
            "No description provided."}
        </p>
      </div>

      {/* 2-Column Split: Next Event & Upcoming Tasks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Next Event Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <IconCalendar className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold text-[#1E1B4B] uppercase tracking-wider">
                  Upcoming Event
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onGoToTab("events")}
                className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
              >
                View all ({events.length})
              </button>
            </div>

            {events.length > 0 ? (
              <div
                onClick={() => onSelectEvent?.(events[0])}
                className={`space-y-1.5 pt-1 rounded-xl p-2 -mx-2 transition-colors ${
                  onSelectEvent ? "cursor-pointer hover:bg-slate-50" : ""
                }`}
              >
                <h4 className="text-sm font-bold text-slate-900 hover:text-indigo-600">
                  {events[0].title}
                </h4>
                <p className="text-xs text-slate-500">{events[0].date} · {events[0].location}</p>
                <div className="text-[11px] text-indigo-600 font-medium">
                  {events[0].rsvpCount} / {events[0].capacity} RSVPs
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-3">
                No events currently scheduled.
              </p>
            )}
          </div>

          {events.length === 0 && (
            <button
              type="button"
              onClick={onOpenCreateEvent}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors self-start cursor-pointer"
            >
              <IconPlus className="w-3.5 h-3.5" />
              <span>Create Event</span>
            </button>
          )}
        </div>

        {/* Priority Tasks Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <IconCheckSquare className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold text-[#1E1B4B] uppercase tracking-wider">
                  Urgent Operations
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onGoToTab("tasks")}
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                View tasks ({openTasks.length})
              </button>
            </div>

            <div className="space-y-2">
              {openTasks.slice(0, 2).map((task) => (
                <div key={task.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                  <p className="font-medium text-slate-800 truncate">{task.title}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{task.dueText} · {task.assigneeName}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Campus Guidelines Notice */}
      <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 flex items-start gap-3">
        <IconShieldAlert className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs">
          <h4 className="font-bold text-indigo-950">Campus Club Compliance</h4>
          <p className="text-slate-600 mt-0.5 leading-relaxed">
            All room reservations and catering sound permits must be submitted at least 7 days before event execution.
          </p>
        </div>
      </div>
    </div>
  );
}
