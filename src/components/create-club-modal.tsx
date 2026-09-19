"use client";

import { useState } from "react";
import type { Club } from "./types";
import { IconX, IconCheck, IconCopy, IconSparkles } from "./icons";
import { createClubInSupabase, generateClubCode } from "@/lib/clubs";

interface CreateClubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClubCreated: (club: Club) => void;
  existingClubs: Club[];
  userId?: string;
}

export function CreateClubModal({
  isOpen,
  onClose,
  onClubCreated,
  existingClubs,
  userId,
}: CreateClubModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [createdClub, setCreatedClub] = useState<Club | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const code = generateClubCode(
      name.trim(),
      existingClubs.map((c) => c.code)
    );

    const { club, error } = await createClubInSupabase(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        code,
      },
      userId
    );

    setIsSubmitting(false);

    if (error || !club) {
      setErrorMessage(error || "Failed to create club. Please try again.");
      return;
    }

    onClubCreated(club);
    setCreatedClub(club);
  };

  const handleCopyCode = () => {
    if (createdClub?.code) {
      navigator.clipboard.writeText(createdClub.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleModalClose = () => {
    setName("");
    setDescription("");
    setCreatedClub(null);
    setCopied(false);
    setErrorMessage(null);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white border border-slate-200/90 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <IconSparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1E1B4B]">
                {createdClub ? "Club Created Successfully" : "Create New Club"}
              </h3>
              <p className="text-xs text-slate-500">
                {createdClub
                  ? "Share your club code to invite officers"
                  : "Set up a new campus club workspace"}
              </p>
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

        {/* Modal Body */}
        {!createdClub ? (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium animate-in fade-in flex items-start gap-2">
                <span className="shrink-0 text-rose-500 font-bold">✕</span>
                <div className="flex-1 leading-relaxed">{errorMessage}</div>
              </div>
            )}

            {/* Club Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Club Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                disabled={isSubmitting}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. AI & Machine Learning Society"
                className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-colors disabled:opacity-60"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Description <span className="text-slate-400">(optional)</span>
              </label>
              <textarea
                rows={3}
                disabled={isSubmitting}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the club's mission and campus focus..."
                className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 resize-none transition-colors disabled:opacity-60"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleModalClose}
                disabled={isSubmitting}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Creating…</span>
                  </>
                ) : (
                  "Create Club"
                )}
              </button>
            </div>
          </form>

        ) : (
          <div className="p-5 space-y-4">
            <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200 space-y-3 text-center">
              <p className="text-xs font-bold text-[#1E1B4B]">
                {createdClub.name}
              </p>
              {createdClub.description && (
                <p className="text-[11px] text-slate-500 line-clamp-2">
                  {createdClub.description}
                </p>
              )}

              <div className="pt-2">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Invite Club Code
                </span>
                <div className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200 max-w-[220px] mx-auto">
                  <span className="text-lg font-mono font-bold text-indigo-900 tracking-wider">
                    {createdClub.code}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="p-1.5 rounded-lg bg-white hover:bg-indigo-100/70 text-indigo-700 border border-indigo-200 transition-colors cursor-pointer"
                    title="Copy Club Code"
                  >
                    {copied ? (
                      <IconCheck className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <IconCopy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                {copied && (
                  <p className="text-[10px] text-emerald-600 font-medium mt-1">
                    Club code copied to clipboard!
                  </p>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-500 text-center leading-relaxed">
              Use this code to invite officers and members to join your club workspace.
            </p>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleModalClose}
                className="w-full py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer"
              >
                Go to Club Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
