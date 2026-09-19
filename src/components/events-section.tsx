"use client";

import type { ClubEvent } from "./types";
import {
  IconCalendar,
  IconClock,
  IconMapPin,
  IconUsers,
  IconPlus,
  IconExternalLink,
  IconAlertTriangle,
} from "./icons";

interface EventsSectionProps {
  events: ClubEvent[];
  onOpenCreateEvent: () => void;
  onSelectEvent?: (event: ClubEvent) => void;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function EventsSection({
  events,
  onOpenCreateEvent,
  onSelectEvent,
  isLoading = false,
  error = null,
  onRetry,
}: EventsSectionProps) {
  return (
    <section className="space-y-4">
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#1E1B4B]">Events</h2>
        {events.length > 0 && (
          <button
            type="button"
            onClick={onOpenCreateEvent}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all cursor-pointer"
          >
            <IconPlus className="w-3.5 h-3.5" />
            <span>Add Event</span>
          </button>
        )}
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="border border-slate-200/80 rounded-3xl p-12 bg-white text-center space-y-3 shadow-sm">
          <div className="inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-1" />
          <p className="text-xs text-slate-500 font-medium">Loading club events...</p>
        </div>
      ) : error ? (
        /* Error State */
        <div className="rounded-3xl bg-red-50/50 border border-red-200/80 shadow-sm p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            <IconAlertTriangle className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-red-900">Failed to load events</h3>
          <p className="text-xs text-red-700 max-w-sm mx-auto leading-relaxed">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors shadow-sm cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      ) : events.length === 0 ? (
        /* If No Events: Exact Empty State */
        <div className="border border-dashed border-slate-300/80 rounded-3xl p-12 bg-white/60 text-center space-y-4 shadow-sm">
          {/* Calendar Graphic with Sparkle Rays */}
          <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
            {/* Sparkle dashes around circle */}
            <div className="absolute inset-0 rounded-full border border-indigo-100 bg-indigo-50/50 flex items-center justify-center">
              <IconCalendar className="w-7 h-7 text-indigo-600" />
            </div>
            {/* Ambient decorative dash dots */}
            <span className="absolute -top-1 left-3 w-1 h-1 rounded-full bg-indigo-400" />
            <span className="absolute -top-1 right-3 w-1 h-1 rounded-full bg-indigo-400" />
            <span className="absolute top-2 -left-2 w-1 h-1 rounded-full bg-indigo-300" />
            <span className="absolute top-2 -right-2 w-1 h-1 rounded-full bg-indigo-300" />
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-bold text-[#1E1B4B]">No events yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              This club doesn&apos;t have any events scheduled yet. Create your first event to get started.
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={onOpenCreateEvent}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm hover:shadow transition-all cursor-pointer"
            >
              <IconPlus className="w-3.5 h-3.5" />
              <span>Add Event</span>
            </button>
          </div>
        </div>
      ) : (
        /* Populated Event Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {events.map((evt) => {
            const rsvpPct = Math.min(100, Math.round((evt.rsvpCount / evt.capacity) * 100));

            return (
              <div
                key={evt.id}
                onClick={() => onSelectEvent?.(evt)}
                className={`bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all space-y-3 flex flex-col justify-between ${
                  onSelectEvent ? "cursor-pointer hover:border-indigo-300" : ""
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {evt.category}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                      {evt.status}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-[#1E1B4B] line-clamp-1 group-hover:text-indigo-600">
                    {evt.title}
                  </h3>

                  <div className="space-y-1 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <IconClock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{evt.date} · {evt.time}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <IconMapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{evt.location}</span>
                    </div>
                  </div>
                </div>

                {/* RSVP progress */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 flex items-center gap-1">
                      <IconUsers className="w-3 h-3" />
                      RSVPs
                    </span>
                    <span className="font-semibold text-slate-700">
                      {evt.rsvpCount} / {evt.capacity}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full"
                      style={{ width: `${rsvpPct}%` }}
                    />
                  </div>
                </div>

                {/* Card footer */}
                <div className="pt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>Lead: {evt.leadName}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSelectEvent) {
                        onSelectEvent(evt);
                      } else {
                        onOpenCreateEvent();
                      }
                    }}
                    className="flex items-center gap-1 text-indigo-600 font-semibold hover:text-indigo-800 cursor-pointer"
                  >
                    <span>Open Workspace</span>
                    <IconExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
