"use client";

import type React from "react";
import type { InboxItem } from "./types";
import { IconX, IconInbox, IconCheck, IconClock, IconShieldAlert, IconDollarSign } from "./icons";

interface InboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: InboxItem[];
  onMarkAllRead: () => void;
}

export function InboxModal({
  isOpen,
  onClose,
  items,
  onMarkAllRead,
}: InboxModalProps) {
  if (!isOpen) return null;

  const getTypeIcon = (type: InboxItem["type"]) => {
    switch (type) {
      case "compliance":
        return <IconShieldAlert className="w-4 h-4 text-amber-400" />;
      case "sponsor":
        return <IconDollarSign className="w-4 h-4 text-emerald-400" />;
      case "ai_flag":
        return <IconInbox className="w-4 h-4 text-indigo-400" />;
      default:
        return <IconInbox className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-white border border-slate-200/90 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <IconInbox className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#1E1B4B]">Club Inbox & Approvals</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700">
                  Campus Admin & AI
                </span>
              </div>
              <p className="text-xs text-slate-500">Official student activities notices and sponsor dispatches</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close Inbox Modal"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-2.5 max-h-[60vh] overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.id}
              className={`p-3.5 rounded-xl border transition-colors ${
                item.unread
                  ? "bg-indigo-50/30 border-indigo-100 shadow-xs"
                  : "bg-slate-50/60 border-slate-100"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
                    {getTypeIcon(item.type)}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#1E1B4B]">{item.title}</h4>
                    <p className="text-[10px] text-slate-500">{item.sender}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <IconClock className="w-3 h-3" />
                    {item.time}
                  </span>
                  {item.unread && (
                    <span className="w-2 h-2 rounded-full bg-indigo-600" />
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-600 pl-8 leading-relaxed">
                {item.summary}
              </p>
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/60 text-xs">
          <button
            onClick={onMarkAllRead}
            className="flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer font-medium"
          >
            <IconCheck className="w-3.5 h-3.5" />
            <span>Mark all as reviewed</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors cursor-pointer shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
