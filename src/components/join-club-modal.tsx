"use client";

import { useState } from "react";
import type { Club, ClubMember } from "./types";
import { IconX, IconCheck, IconUsers, IconAlertTriangle } from "./icons";
import { joinClubByCode } from "@/lib/clubs";

interface JoinClubModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingClubs?: Club[];
  members?: ClubMember[];
  currentUserEmail: string;
  onJoinClub: (club: Club, member?: ClubMember) => void;
  userId?: string;
  currentUserName?: string;
}

export function JoinClubModal({
  isOpen,
  onClose,
  currentUserEmail,
  onJoinClub,
  userId,
  currentUserName,
}: JoinClubModalProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successClub, setSuccessClub] = useState<Club | null>(null);
  const [alreadyMemberMessage, setAlreadyMemberMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setAlreadyMemberMessage(null);

    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
      setError("Please enter a club code.");
      return;
    }

    setIsSubmitting(true);
    const result = await joinClubByCode(trimmedCode, userId, currentUserEmail, currentUserName);
    setIsSubmitting(false);

    if (!result.success || !result.club) {
      setError(result.error || `No club found with code "${trimmedCode}". Please verify the code with your club lead.`);
      return;
    }

    if (result.alreadyMember) {
      setAlreadyMemberMessage(result.message || `You are already a member of ${result.club.name}.`);
      setSuccessClub(result.club);
      onJoinClub(result.club, result.member);
      return;
    }

    // Successfully join
    onJoinClub(result.club, result.member);
    setSuccessClub(result.club);
  };

  const handleModalClose = () => {
    setCode("");
    setError(null);
    setSuccessClub(null);
    setAlreadyMemberMessage(null);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white border border-slate-200/90 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <IconUsers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1E1B4B]">Join Club</h3>
              <p className="text-xs text-slate-500">
                Enter your invitation code to join a campus club
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
        {!successClub ? (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Club Code Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Club Code <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                disabled={isSubmitting}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="e.g. ACM or ROBO or AIM-392"
                className="w-full px-3 py-2 text-xs font-mono tracking-wide uppercase text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-colors disabled:opacity-60"
              />
            </div>

            {/* Error Banner */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-700">
                <IconAlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">{error}</p>
              </div>
            )}

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
                disabled={!code.trim() || isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Joining…</span>
                  </>
                ) : (
                  "Join Club"
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-5 space-y-4">
            <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 space-y-2 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-1">
                <IconCheck className="w-5 h-5" />
              </div>

              <h4 className="text-sm font-bold text-[#1E1B4B]">
                {alreadyMemberMessage ? "Already Joined" : "Club Joined Successfully!"}
              </h4>

              <p className="text-xs text-slate-700 font-semibold">
                {successClub.name}
              </p>

              <p className="text-[11px] font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 py-1 px-2 rounded-md inline-block">
                Code: {successClub.code}
              </p>

              {alreadyMemberMessage && (
                <p className="text-xs text-amber-700 pt-1">
                  {alreadyMemberMessage}
                </p>
              )}
            </div>

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
