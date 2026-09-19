"use client";

import { useState } from "react";
import type { TaskItem } from "./types";
import {
  IconCheckSquare,
  IconCheck,
  IconClock,
  IconPlus,
} from "./icons";

interface TasksSectionProps {
  initialTasks: TaskItem[];
}

export function TasksSection({ initialTasks }: TasksSectionProps) {
  const [tasks, setTasks] = useState<TaskItem[]>(initialTasks);

  const toggleTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
    );
  };

  const getPriorityBadge = (priority: TaskItem["priority"]) => {
    switch (priority) {
      case "Urgent":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            Urgent
          </span>
        );
      case "High":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            High
          </span>
        );
      case "Medium":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
            Medium
          </span>
        );
      case "Low":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
            Low
          </span>
        );
    }
  };

  return (
    <section className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconCheckSquare className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-[#1E1B4B]">Tasks</h2>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">
            {tasks.filter((t) => !t.completed).length} open
          </span>
        </div>

        <button
          type="button"
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-colors cursor-pointer"
        >
          <IconPlus className="w-3.5 h-3.5" />
          <span>Add Task</span>
        </button>
      </div>

      {/* Task List */}
      {tasks.length === 0 ? (
        <div className="border border-dashed border-slate-300/80 rounded-3xl p-12 bg-white/60 text-center space-y-4 shadow-sm">
          <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-indigo-100 bg-indigo-50/50 flex items-center justify-center">
              <IconCheckSquare className="w-7 h-7 text-indigo-600" />
            </div>
            <span className="absolute -top-1 left-3 w-1 h-1 rounded-full bg-indigo-400" />
            <span className="absolute -top-1 right-3 w-1 h-1 rounded-full bg-indigo-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-[#1E1B4B]">No tasks yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Tasks will appear here once you create an event and add tasks to it.
            </p>
          </div>
        </div>
      ) : (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-sm divide-y divide-slate-100">
        {tasks.map((task) => (
          <div
            key={task.id}
            onClick={() => toggleTask(task.id)}
            className={`flex items-start sm:items-center justify-between gap-3 p-3 rounded-xl transition-all cursor-pointer select-none hover:bg-slate-50 ${
              task.completed ? "opacity-50" : ""
            }`}
          >
            {/* Checkbox + Title */}
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <button
                type="button"
                className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0 transition-colors ${
                  task.completed
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : "border-slate-300 bg-white hover:border-indigo-500"
                }`}
                aria-label="Toggle task completion"
              >
                {task.completed && <IconCheck className="w-3.5 h-3.5" />}
              </button>

              <div className="min-w-0">
                <p
                  className={`text-xs font-medium truncate ${
                    task.completed
                      ? "line-through text-slate-400"
                      : "text-slate-800"
                  }`}
                >
                  {task.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                  <span className="text-indigo-600 font-semibold">{task.eventTag}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <IconClock className="w-3 h-3 text-slate-400" />
                    {task.dueText}
                  </span>
                  <span>•</span>
                  <span>{task.assigneeName}</span>
                </div>
              </div>
            </div>

            {/* Priority Tag */}
            <div className="flex-shrink-0">{getPriorityBadge(task.priority)}</div>
          </div>
        ))}
      </div>
      )}
    </section>
  );
}
