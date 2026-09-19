"use client";

import { useState } from "react";
import type { Club } from "./types";
import { IconSettings, IconCopy, IconCheck } from "./icons";

interface ClubSettingsViewProps {
  club: Club;
}

export function ClubSettingsView({ club }: ClubSettingsViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(club.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <IconSettings className="w-5 h-5 text-indigo-600" />
        <h2 className="text-lg font-bold text-[#1E1B4B]">Club Settings</h2>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-6 max-w-2xl">
        {/* Invite Code Section */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
            Club Invite Code
          </label>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-indigo-50/50 border border-indigo-100 max-w-sm">
            <span className="text-base font-mono font-bold text-indigo-900 tracking-wider">
              {club.code}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="ml-auto p-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer"
              title="Copy Code"
            >
              {copied ? (
                <IconCheck className="w-4 h-4 text-emerald-600" />
              ) : (
                <IconCopy className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Share this code with fellow officers to let them join this workspace.
          </p>
        </div>

        {/* Club Details */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">
              Club Name
            </label>
            <input
              type="text"
              readOnly
              value={club.name}
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">
              Club Description
            </label>
            <textarea
              readOnly
              rows={3}
              value={club.description || "Bringing together students passionate about technology, innovation and community."}
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 resize-none"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
