"use client";

import { useState } from "react";
import type { ClubEvent } from "./types";
import { IconX, IconCalendar, IconSparkles, IconPlus } from "./icons";
import { createEventInSupabase } from "@/lib/events";
import { formatDisplayDate } from "@/lib/date-utils";

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEventCreated: (event: ClubEvent) => void;
  clubId?: string;
  userId?: string;
  defaultLeadName?: string;
}

export function CreateEventModal({
  isOpen,
  onClose,
  onEventCreated,
  clubId,
  userId,
  defaultLeadName,
}: CreateEventModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ClubEvent["category"]>("Workshop");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("100");
  const [budget, setBudget] = useState("500");
  const [leadName, setLeadName] = useState("");
  const [aiChecklistEnabled, setAiChecklistEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleModalClose = () => {
    setTitle("");
    setDescription("");
    setCategory("Workshop");
    setDate("");
    setLocation("");
    setCapacity("100");
    setBudget("500");
    setLeadName("");
    setErrorMessage(null);
    setIsSubmitting(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    if (!clubId) {
      setErrorMessage("Please select a club before creating an event.");
      return;
    }

    setIsSubmitting(true);
    const formattedDate = date.trim() ? formatDisplayDate(date.trim()) : "Upcoming Date";

    const { event, error } = await createEventInSupabase(
      {
        clubId,
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        date: formattedDate,
        time: "6:00 PM - 8:00 PM",
        location: location.trim() || "Campus Center",
        capacity: parseInt(capacity, 10) || 100,
        budgetAllocated: parseInt(budget, 10) || 500,
        leadName: leadName.trim() || defaultLeadName || "Event Lead",
        leadRole: "Event Lead",
      },
      userId
    );

    setIsSubmitting(false);

    if (error || !event) {
      setErrorMessage(error || "Failed to create event. Please try again.");
      return;
    }

    onEventCreated(event);
    handleModalClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-white border border-slate-200/90 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <IconCalendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1E1B4B]">Create New Campus Event</h3>
              <p className="text-xs text-slate-500">Initialize event workspace, budget & AI compliance watcher</p>
            </div>
          </div>

          <button
            onClick={handleModalClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium animate-in fade-in flex items-start gap-2">
              <span className="shrink-0 text-rose-500 font-bold">✕</span>
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Event Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Event Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              disabled={isSubmitting}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Spring Hackathon 2027 or Intro to Web3 Workshop"
              className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-colors disabled:opacity-60"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Description <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              disabled={isSubmitting}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief overview of the event..."
              className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors resize-none disabled:opacity-60"
            />
          </div>

          {/* Category & Date Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Category
              </label>
              <select
                value={category}
                disabled={isSubmitting}
                onChange={(e) => setCategory(e.target.value as ClubEvent["category"])}
                className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-60"
              >
                <option value="Workshop">Workshop</option>
                <option value="Hackathon">Hackathon</option>
                <option value="Speaker">Speaker Session</option>
                <option value="Competition">Competition</option>
                <option value="Social">Club Social</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Target Date
              </label>
              <input
                type="date"
                disabled={isSubmitting}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-60 cursor-pointer"
              />
            </div>
          </div>

          {/* Location & Capacity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Campus Location / Room
              </label>
              <input
                type="text"
                disabled={isSubmitting}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Student Union 204"
                className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Target Capacity (RSVPs)
              </label>
              <input
                type="number"
                disabled={isSubmitting}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="100"
                className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-60"
              />
            </div>
          </div>

          {/* Budget & Lead */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Allocated Budget ($)
              </label>
              <input
                type="number"
                disabled={isSubmitting}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="800"
                className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Lead Organizer
              </label>
              <input
                type="text"
                disabled={isSubmitting}
                value={leadName}
                onChange={(e) => setLeadName(e.target.value)}
                placeholder={defaultLeadName || "Officer Name"}
                className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-60"
              />
            </div>
          </div>

          {/* AI Autonomous Watcher Callout */}
          <div
            onClick={() => !isSubmitting && setAiChecklistEnabled(!aiChecklistEnabled)}
            className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-100 flex items-start gap-3 cursor-pointer select-none hover:bg-indigo-50 transition-colors"
          >
            <input
              type="checkbox"
              checked={aiChecklistEnabled}
              disabled={isSubmitting}
              onChange={() => {}}
              className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900">
                <IconSparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Auto-generate Campus Permits & Run-of-Show with AI</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                ClubOps Sentinel will scan your university guidelines, draft safety permits, and assign logistics milestones.
              </p>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleModalClose}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Creating Event…</span>
                </>
              ) : (
                <>
                  <IconPlus className="w-4 h-4" />
                  <span>Create Event Workspace</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

