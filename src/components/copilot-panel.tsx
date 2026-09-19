"use client";

import { useState, useRef } from "react";
import {
  IconSparkles,
  IconSend,
  IconPaperclip,
  IconX,
  IconClock,
  IconExternalLink,
} from "./icons";

interface CopilotPanelProps {
  isOpen: boolean;
  onClose: () => void;
  input: string;
  onInputChange: (val: string) => void;
}

interface Message {
  id: string;
  sender: "ai" | "user";
  text: string;
  time: string;
  tags?: string[];
  actionSuggestion?: string;
}

export function CopilotPanel({
  isOpen,
  onClose,
  input,
  onInputChange,
}: CopilotPanelProps) {
  const counterRef = useRef(10);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "m-1",
      sender: "ai",
      text: "Hello! I'm Asky, your ClubOps AI assistant. I can help you manage events, tasks, and club operations. What would you like to work on?",
      time: "10:30 AM",
      tags: ["Campus Safety", "Budget Audit"],
      actionSuggestion: "Would you like me to draft the permit justification letter for Student Activities?",
    },
  ]);

  const suggestedPrompts = [
    "Draft sound permit appeal to Student Life",
    "Generate 36h Hackathon Run-of-Show schedule",
    "Reallocate $350 marketing surplus to catering",
    "Draft sponsor thank-you email to GitHub",
  ];

  const handleSend = (textToSend?: string) => {
    const text = textToSend || input;
    if (!text.trim()) return;

    counterRef.current += 1;
    const userMsg: Message = {
      id: `u-${counterRef.current}`,
      sender: "user",
      text,
      time: "Just now",
    };

    setMessages((prev) => [...prev, userMsg]);
    onInputChange("");

    // Simulate mock intelligent assistant response
    setTimeout(() => {
      counterRef.current += 1;
      const aiReply: Message = {
        id: `ai-${counterRef.current}`,
        sender: "ai",
        text: `Got it! I'm reviewing the club parameters for "${text}". I have cross-referenced the Student Union guidelines and our treasury sheets. In full integration mode, I will automatically execute this action with your co-officers.`,
        time: "Just now",
        tags: ["Action Queued", "Verified with Guidelines"],
      };
      setMessages((prev) => [...prev, aiReply]);
    }, 600);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 bg-[#0c121e] border-l border-slate-800/80 flex flex-col shadow-2xl transition-all duration-300">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800/80 bg-[#090d16]/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-[0_0_12px_rgba(99,102,241,0.4)]">
            <IconSparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-bold text-white">Asky</h2>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Gemini 1.5
              </span>
            </div>
            <p className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Connected to Club Docs & Treasury
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          aria-label="Close Asky Panel"
        >
          <IconX className="w-4 h-4" />
        </button>
      </div>

      {/* Suggested Quick Prompts */}
      <div className="p-3 border-b border-slate-800/60 bg-slate-950/40">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Suggested Autonomous Tasks
        </p>
        <div className="flex flex-wrap gap-1.5">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => handleSend(prompt)}
              className="text-left px-2.5 py-1 rounded-lg text-[11px] text-slate-300 bg-slate-900/90 border border-slate-800 hover:border-indigo-500/40 hover:text-indigo-300 transition-all truncate max-w-full"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Message Chat Feed */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${
              m.sender === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[90%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                m.sender === "user"
                  ? "bg-indigo-600 text-white rounded-br-none shadow-md"
                  : "bg-slate-900/90 border border-slate-800 text-slate-200 rounded-bl-none shadow-sm"
              }`}
            >
              {m.sender === "ai" && (
                <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-semibold text-indigo-400">
                  <IconSparkles className="w-3 h-3" />
                  <span>ClubOps Sentinel</span>
                </div>
              )}
              <p className="whitespace-pre-wrap">{m.text}</p>

              {m.tags && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {m.actionSuggestion && (
                <div className="mt-2.5 pt-2 border-t border-slate-800/80">
                  <button
                    onClick={() => handleSend(m.actionSuggestion!)}
                    className="w-full text-left text-[11px] font-medium text-cyan-300 hover:text-cyan-200 flex items-center justify-between"
                  >
                    <span>{m.actionSuggestion}</span>
                    <IconExternalLink className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            <span className="text-[9px] text-slate-400 mt-1 px-1 flex items-center gap-1">
              <IconClock className="w-2.5 h-2.5" />
              {m.time}
            </span>
          </div>
        ))}
      </div>

      {/* Interactive Input Box */}
      <div className="p-3 border-t border-slate-800/80 bg-[#090d16]/80 backdrop-blur-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="relative"
        >
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-900/90 border border-slate-800 focus-within:border-indigo-500/70 focus-within:ring-1 focus-within:ring-indigo-500/30 transition-all">
            <button
              type="button"
              className="p-2 text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800 transition-colors"
              title="Attach Event Schedule or Document"
            >
              <IconPaperclip className="w-4 h-4" />
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder="Ask Asky anything..."
              className="flex-1 bg-transparent px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
            />

            <button
              type="submit"
              disabled={!input.trim()}
              className={`p-2 rounded-xl text-white transition-all ${
                input.trim()
                  ? "bg-indigo-600 hover:bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] cursor-pointer"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              }`}
              aria-label="Send message to Asky"
            >
              <IconSend className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-slate-400">
            <span>Powered by Gemini & Campus Policies</span>
            <span className="font-mono">Club context: 4 events</span>
          </div>
        </form>
      </div>
    </aside>
  );
}
