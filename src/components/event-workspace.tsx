"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import type {
  Club,
  ClubEvent,
  ClubMember,
  EventTeamMember,
  TaskItem,
  TaskPriority,
  TaskStatus,
} from "./types";
import { TASK_PRIORITIES, TASK_STATUSES } from "./types";
import {
  IconArrowLeft,
  IconCalendar,
  IconClock,
  IconMapPin,
  IconUsers,
  IconDollarSign,
  IconCheckSquare,
  IconCheck,
  IconVideo,
  IconFileText,
  IconShieldAlert,
  IconSparkles,
  IconPlus,
  IconX,
  IconChevronDown,
  IconAlertTriangle,
  IconSend,
} from "./icons";
import {
  fetchEventTeam,
  addMemberToEventTeam,
  removeMemberFromEventTeam,
} from "@/lib/events";
import {
  fetchEventTasks,
  createEventTaskInSupabase,
  updateEventTaskStatusInSupabase,
  toggleEventTaskDoneInSupabase,
  updateEventTaskAssigneeInSupabase,
  getTaskDependencyState,
} from "@/lib/tasks";
import { calculateTeamWorkloads } from "@/lib/workload";
import { detectEventRisks, getSeverityStyle, getRiskTypeLabel } from "@/lib/risks";
import {
  processUserRequest,
  executeApprovedActions,
  buildEventraAgentContext,
  type AgentPlan,
} from "@/lib/agent";
import { formatDisplayDate } from "@/lib/date-utils";
import { EventraDrawer } from "./eventra-drawer";

export type EventSectionType =
  | "overview"
  | "tasks"
  | "team"
  | "meetings"
  | "documents"
  | "risks"
  | "ai";

interface EventWorkspaceProps {
  event: ClubEvent;
  club?: Club;
  currentUserId?: string;
  onBackToEvents: () => void;
  tasks: TaskItem[];
  members: ClubMember[];
  onAddTask: (task: TaskItem) => void;
  onUpdateTaskStatus: (taskId: string, status: TaskStatus) => void;
  onToggleTaskDone: (taskId: string) => void;
}

export function EventWorkspace({
  event,
  club,
  currentUserId,
  onBackToEvents,
  tasks,
  members,
  onAddTask,
  onUpdateTaskStatus,
  onToggleTaskDone,
}: EventWorkspaceProps) {
  const [activeSection, setActiveSection] = useState<EventSectionType>("overview");
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [isEventraDrawerOpen, setIsEventraDrawerOpen] = useState(false);

  // Team state
  const [teamMembers, setTeamMembers] = useState<EventTeamMember[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamActionError, setTeamActionError] = useState<string | null>(null);
  const [isAddTeamModalOpen, setIsAddTeamModalOpen] = useState(false);
  const [selectedMemberIdToAdd, setSelectedMemberIdToAdd] = useState("");
  const [isSubmittingTeam, setIsSubmittingTeam] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  // Authorization: Club Head or Event Lead can manage event team
  const isClubHead = Boolean(
    currentUserId && club?.ownerId && currentUserId === club.ownerId
  );
  const isEventHead = Boolean(
    currentUserId &&
      event.leadMemberId &&
      members.some((m) => m.id === event.leadMemberId && m.userId === currentUserId)
  );
  const canManageTeam = isClubHead || isEventHead;

  // Fetch event team members from Supabase
  useEffect(() => {
    if (!event.id) return;
    let isMounted = true;

    fetchEventTeam(event.id).then(({ team, error }) => {
      if (!isMounted) return;
      setLoadingTeam(false);
      if (error) {
        console.error("Failed to load event team:", error);
        setTeamError(error);
      } else {
        setTeamError(null);
        setTeamMembers(team);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [event.id]);

  const handleRetryLoadTeam = () => {
    setLoadingTeam(true);
    setTeamError(null);
    fetchEventTeam(event.id).then(({ team, error }) => {
      setLoadingTeam(false);
      if (error) {
        setTeamError(error);
      } else {
        setTeamError(null);
        setTeamMembers(team);
      }
    });
  };

  const availableMembersToAdd = members.filter(
    (m) => !teamMembers.some((tm) => tm.clubMemberId === m.id)
  );

  const handleAddMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberIdToAdd || isSubmittingTeam) return;

    setTeamActionError(null);
    setIsSubmittingTeam(true);

    const targetMem = members.find((m) => m.id === selectedMemberIdToAdd);
    const { teamMember, error } = await addMemberToEventTeam(
      event.id,
      selectedMemberIdToAdd,
      targetMem?.role
    );

    setIsSubmittingTeam(false);

    if (error || !teamMember) {
      setTeamActionError(error || "Failed to add member to event team.");
      return;
    }

    setTeamMembers((prev) => [...prev, teamMember]);
    setSelectedMemberIdToAdd("");
    setIsAddTeamModalOpen(false);
  };

  const handleRemoveTeamMember = async (teamMemberId: string) => {
    if (removingMemberId) return;
    setTeamActionError(null);
    setRemovingMemberId(teamMemberId);

    const { success, error } = await removeMemberFromEventTeam(
      event.id,
      teamMemberId
    );

    setRemovingMemberId(null);

    if (!success) {
      setTeamActionError(error || "Failed to remove member from event team.");
      return;
    }

    setTeamMembers((prev) => prev.filter((m) => m.id !== teamMemberId));
  };

  // Tasks state from Supabase (seeded with matching event tasks)
  const [eventTasks, setEventTasks] = useState<TaskItem[]>(() =>
    tasks ? tasks.filter((t) => t.eventId === event.id) : []
  );
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [taskActionError, setTaskActionError] = useState<string | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [mutatingTaskId, setMutatingTaskId] = useState<string | null>(null);

  // Form State for Add Task
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskOwnerId, setTaskOwnerId] = useState("");
  const [taskDeadline, setTaskDeadline] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("Medium");
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("Todo");
  const [taskDependencyIds, setTaskDependencyIds] = useState<string[]>([]);

  // AI Assignee Suggestion State for Create Task
  const [isSuggestingAssignee, setIsSuggestingAssignee] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{
    memberId: string;
    memberName: string;
    role: string;
    activeCount: number;
    workloadState: "Low" | "Medium" | "High" | "Overloaded";
    reason: string;
    confidence: "low" | "medium" | "high";
  } | null>(null);
  const [aiSuggestionError, setAiSuggestionError] = useState<string | null>(null);
  const [aiApprovedMessage, setAiApprovedMessage] = useState<string | null>(null);

  // Quick Assign Modal State for Existing Tasks
  const [assigningTask, setAssigningTask] = useState<TaskItem | null>(null);
  const [assigningTaskOwnerId, setAssigningTaskOwnerId] = useState("");
  const [isAssigningExistingTask, setIsAssigningExistingTask] = useState(false);
  const [existingTaskAiSuggestion, setExistingTaskAiSuggestion] = useState<{
    memberId: string;
    memberName: string;
    role: string;
    activeCount: number;
    workloadState: "Low" | "Medium" | "High" | "Overloaded";
    reason: string;
    confidence: "low" | "medium" | "high";
  } | null>(null);
  const [existingTaskAiError, setExistingTaskAiError] = useState<string | null>(null);

  // Effective task owner ID derived from teamMembers
  const effectiveTaskOwnerId =
    taskOwnerId !== ""
      ? taskOwnerId
      : teamMembers[0]?.clubMemberId || "unassigned";

  // Workload calculation from real Supabase event tasks
  const teamWorkloads = useMemo(
    () => calculateTeamWorkloads(teamMembers, eventTasks),
    [teamMembers, eventTasks]
  );

  // Derived risks for this event
  const [resolvedRiskIds, setResolvedRiskIds] = useState<Set<string>>(new Set());
  const [dismissedRiskIds, setDismissedRiskIds] = useState<Set<string>>(new Set());
  const [eventraInitialPrompt, setEventraInitialPrompt] = useState<string | undefined>(undefined);

  const detectedRisks = useMemo(
    () => detectEventRisks(event.id, eventTasks, teamMembers, event),
    [eventTasks, teamMembers, event]
  );

  const activeRisks = useMemo(
    () =>
      detectedRisks.filter(
        (r) => !resolvedRiskIds.has(r.id) && !dismissedRiskIds.has(r.id)
      ),
    [detectedRisks, resolvedRiskIds, dismissedRiskIds]
  );

  // View mode for tasks (List vs Calendar)
  const [taskViewMode, setTaskViewMode] = useState<"list" | "calendar">("list");

  // Meetings state
  const [meetings, setMeetings] = useState<
    Array<{
      id: string;
      title: string;
      date: string;
      time: string;
      location: string;
      type: string;
      attendeesCount: number;
      linkUrl?: string;
    }>
  >([
    {
      id: "m-1",
      title: `${event.title} Steering Sync`,
      date: event.date || "Upcoming",
      time: "4:00 PM",
      location: "Student Center Room 204 / Zoom",
      type: "Committee Sync",
      attendeesCount: teamMembers.length || 4,
      linkUrl: "https://meet.google.com/abc-defg-hij",
    },
    {
      id: "m-2",
      title: "Logistics & Stage Walkthrough",
      date: event.date || "Upcoming",
      time: "6:30 PM",
      location: "Main Auditorium",
      type: "Briefing",
      attendeesCount: 5,
    },
  ]);
  const [isAddMeetingOpen, setIsAddMeetingOpen] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState("");
  const [newMeetingDate, setNewMeetingDate] = useState(event.date || "");
  const [newMeetingTime, setNewMeetingTime] = useState("10:00 AM");
  const [newMeetingLocation, setNewMeetingLocation] = useState(event.location || "");
  const [newMeetingType, setNewMeetingType] = useState("Standup");
  const [newMeetingLink, setNewMeetingLink] = useState("");

  // Documents state
  const [documents, setDocuments] = useState<
    Array<{
      id: string;
      title: string;
      category: string;
      authorName: string;
      dateAdded: string;
      fileSize?: string;
      url: string;
    }>
  >([
    {
      id: "d-1",
      title: "Campus Facilities Permit & Safety Clearance",
      category: "Permits & Safety",
      authorName: event.leadName || "Club Lead",
      dateAdded: "Yesterday",
      fileSize: "1.2 MB",
      url: "https://example.com/permit.pdf",
    },
    {
      id: "d-2",
      title: "Event Run of Show & Speaker Schedule",
      category: "Run of Show",
      authorName: "Operations Team",
      dateAdded: "2 days ago",
      fileSize: "450 KB",
      url: "https://example.com/run-of-show.docx",
    },
    {
      id: "d-3",
      title: "Sponsorship Deck & Budget Sheet",
      category: "Sponsorship & Budget",
      authorName: "Finance Lead",
      dateAdded: "3 days ago",
      fileSize: "2.8 MB",
      url: "https://example.com/budget.xlsx",
    },
  ]);
  const [isAddDocOpen, setIsAddDocOpen] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocCategory, setNewDocCategory] = useState("Permits & Safety");
  const [newDocUrl, setNewDocUrl] = useState("");

  // Eventra AI Chat state for Event Workspace -> AI Tab
  const [askyInput, setAskyInput] = useState("");
  const [isAskyThinking, setIsAskyThinking] = useState(false);
  const askyCounterRef = useRef(100);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [askyMessages, setAskyMessages] = useState<
    Array<{
      id: string;
      sender: "ai" | "user";
      text: string;
      time: string;
      isError?: boolean;
      plan?: AgentPlan;
      executionResult?: string;
    }>
  >([
    {
      id: "asky-welcome",
      sender: "ai",
      text: `Hello! I'm Eventra AI, your ClubOps operational copilot for "${event.title}". Ask me to auto-assign tasks, generate a task checklist, detect risks, or balance team workloads!`,
      time: "Just now",
    },
  ]);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [askyMessages, isAskyThinking]);

  const handleExecuteAgentPlan = async (msgId: string, plan: AgentPlan) => {
    const approvedPlan: AgentPlan = {
      ...plan,
      actions: plan.actions.map((a) => ({ ...a, status: "approved" as const })),
    };

    const updatedPlan = await executeApprovedActions(approvedPlan, {
      userId: currentUserId,
      existingTasks: eventTasks,
    });

    const successCount = updatedPlan.actions.filter((a) => a.result?.success).length;

    fetchEventTasks(event.id).then(({ tasks: fetchedTasks }) => {
      if (fetchedTasks) setEventTasks(fetchedTasks);
    });

    setAskyMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? {
              ...m,
              executionResult: `✓ Successfully executed ${successCount} of ${updatedPlan.actions.length} action(s) in Supabase!`,
            }
          : m
      )
    );
  };

  const handleAddMeetingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMeetingTitle.trim()) return;

    setMeetings((prev) => [
      ...prev,
      {
        id: `m-${Date.now()}`,
        title: newMeetingTitle.trim(),
        date: newMeetingDate || event.date || "Upcoming",
        time: newMeetingTime || "10:00 AM",
        location: newMeetingLocation || event.location || "Campus Facility",
        type: newMeetingType,
        attendeesCount: teamMembers.length || 3,
        linkUrl: newMeetingLink.trim() || undefined,
      },
    ]);

    setNewMeetingTitle("");
    setNewMeetingLink("");
    setIsAddMeetingOpen(false);
  };

  const handleAddDocSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim()) return;

    setDocuments((prev) => [
      ...prev,
      {
        id: `d-${Date.now()}`,
        title: newDocTitle.trim(),
        category: newDocCategory,
        authorName: event.leadName || "Team Lead",
        dateAdded: "Just now",
        fileSize: "URL Asset",
        url: newDocUrl.trim() || "https://example.com/doc",
      },
    ]);

    setNewDocTitle("");
    setNewDocUrl("");
    setIsAddDocOpen(false);
  };

  const handleSendAsky = async (customPrompt?: string) => {
    const text = customPrompt || askyInput;
    if (!text.trim() || isAskyThinking) return;

    askyCounterRef.current += 1;
    const userMsg = {
      id: `asky-u-${askyCounterRef.current}`,
      sender: "user" as const,
      text: text.trim(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setAskyMessages((prev) => [...prev, userMsg]);
    setAskyInput("");
    setIsAskyThinking(true);

    // Format workloads array
    const workloadList = teamMembers.map((m) => {
      const w = teamWorkloads.get(m.id);
      return {
        memberName: m.name,
        activeCount: w?.activeCount ?? 0,
        completedCount: w?.completedCount ?? 0,
        overdueCount: w?.overdueCount ?? 0,
        workloadState: w?.workloadState ?? ("Low" as const),
      };
    });

    // 1. Process request via Eventra AI Agent pipeline (Three-layer architecture)
    let agentPlan: AgentPlan | undefined;
    if (currentUserId && club) {
      const { context: agentCtx } = await buildEventraAgentContext({
        user: { id: currentUserId } as unknown as import("@supabase/supabase-js").User,
        club,
        event,
      });

      if (agentCtx) {
        agentPlan = await processUserRequest(text.trim(), agentCtx);
      }
    }

    const hasExecutablePlan = agentPlan && agentPlan.actions.some((a) => a.type !== "PROVIDE_ANSWER");

    try {
      const res = await fetch("/api/asky/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text.trim(),
          context: {
            event: {
              id: event.id,
              title: event.title,
              category: event.category,
              date: event.date,
              time: event.time,
              location: event.location,
              status: event.status,
              rsvpCount: event.rsvpCount,
              capacity: event.capacity,
              leadName: event.leadName,
              leadRole: event.leadRole,
              budgetAllocated: event.budgetAllocated,
              budgetSpent: event.budgetSpent,
            },
            tasks: eventTasks.map((t) => ({
              id: t.id,
              title: t.title,
              priority: t.priority,
              dueText: t.dueText,
              deadline: t.deadline,
              assigneeName: t.assigneeName,
              assigneeRole: t.assigneeRole,
              status: t.status,
              completed: t.completed,
            })),
            teamMembers: teamMembers.map((m) => ({
              id: m.id,
              name: m.name,
              role: m.role,
              email: m.email,
            })),
            workloads: workloadList,
            risks: detectedRisks.map((r) => ({
              id: r.id,
              type: r.type,
              title: r.title,
              severity: r.severity,
              description: r.description,
              evidence: r.evidence,
            })),
          },
        }),
      });

      const data = await res.json();
      askyCounterRef.current += 1;

      if (!res.ok || data.error) {
        const errorText = data.error || "Failed to receive an answer from Eventra AI. Please try again.";
        setAskyMessages((prev) => [
          ...prev,
          {
            id: `asky-err-${askyCounterRef.current}`,
            sender: "ai",
            text: errorText,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            isError: true,
          },
        ]);
      } else {
        setAskyMessages((prev) => [
          ...prev,
          {
            id: `asky-ai-${askyCounterRef.current}`,
            sender: "ai",
            text: data.answer || "No response received.",
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            plan: hasExecutablePlan ? agentPlan : undefined,
          },
        ]);
      }
    } catch {
      askyCounterRef.current += 1;
      const networkErr = "Network error: Unable to contact Eventra AI service. Please check your connection.";
      setAskyMessages((prev) => [
        ...prev,
        {
          id: `asky-err-${askyCounterRef.current}`,
          sender: "ai",
          text: networkErr,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          isError: true,
        },
      ]);
    } finally {
      setIsAskyThinking(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "Technical":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "Design":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "Marketing":
        return "bg-pink-50 text-pink-700 border-pink-200";
      case "Sponsorship":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "Logistics":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "Registration":
        return "bg-cyan-50 text-cyan-700 border-cyan-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const getWorkloadBadgeColor = (state: string) => {
    switch (state) {
      case "Low":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "Medium":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "High":
        return "bg-orange-50 text-orange-700 border-orange-200";
      case "Overloaded":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const handleRequestAiSuggestion = async (isForExistingTask = false, targetTask?: TaskItem) => {
    const taskObj = targetTask || assigningTask;
    const titleToUse = isForExistingTask && taskObj ? taskObj.title : taskTitle.trim();
    const priorityToUse = isForExistingTask && taskObj ? taskObj.priority : taskPriority;
    const descToUse = isForExistingTask ? "" : taskDescription.trim();

    if (!titleToUse) {
      if (isForExistingTask) {
        setExistingTaskAiError("Task title is required to evaluate assignment.");
      } else {
        setAiSuggestionError("Please enter a task title first so AI can evaluate requirements.");
      }
      return;
    }

    if (teamMembers.length === 0) {
      const errMsg = "No event team members available. Add team members under the Team tab first.";
      if (isForExistingTask) setExistingTaskAiError(errMsg);
      else setAiSuggestionError(errMsg);
      return;
    }

    if (isForExistingTask) {
      setExistingTaskAiError(null);
    } else {
      setAiSuggestionError(null);
      setAiApprovedMessage(null);
    }
    setIsSuggestingAssignee(true);

    try {
      const payloadMembers = teamMembers.map((tm) => {
        const wl = teamWorkloads.get(tm.id);
        return {
          id: tm.id,
          clubMemberId: tm.clubMemberId,
          name: tm.name,
          role: tm.role,
          workload: {
            activeCount: wl ? wl.activeCount : 0,
            completedCount: wl ? wl.completedCount : 0,
            overdueCount: wl ? wl.overdueCount : 0,
            workloadState: wl ? wl.workloadState : ("Low" as const),
            highUrgentActiveCount: wl ? wl.highUrgentActiveCount : 0,
          },
        };
      });

      const res = await fetch("/api/tasks/suggest-assignee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskTitle: titleToUse,
          taskDescription: descToUse || undefined,
          taskPriority: priorityToUse,
          teamMembers: payloadMembers,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.suggestion) {
        throw new Error(data.error || "Failed to generate AI suggestion.");
      }

      const existsInTeam = teamMembers.some(
        (tm) => tm.clubMemberId === data.suggestion.memberId
      );

      if (!existsInTeam) {
        throw new Error("AI suggested a member that does not belong to this event's team.");
      }

      if (isForExistingTask) {
        setExistingTaskAiSuggestion(data.suggestion);
      } else {
        setAiSuggestion(data.suggestion);
      }
    } catch (err: unknown) {
      console.warn("AI suggestion error:", err);
      const msg = err instanceof Error ? err.message : "Unable to generate AI suggestion.";
      if (isForExistingTask) {
        setExistingTaskAiError(`${msg} You can select an owner manually.`);
      } else {
        setAiSuggestionError(`${msg} You can select an owner manually.`);
      }
    } finally {
      setIsSuggestingAssignee(false);
    }
  };

  const handleApproveAiSuggestion = () => {
    if (!aiSuggestion) return;
    if (!canManageTeam) {
      setAiSuggestionError("Approval requires Club Head or Event Lead permissions.");
      return;
    }
    setTaskOwnerId(aiSuggestion.memberId);
    setAiApprovedMessage(`Approved AI recommendation: ${aiSuggestion.memberName} (${aiSuggestion.role}) assigned.`);
    setAiSuggestion(null);
    setAiSuggestionError(null);
  };

  const handleRejectAiSuggestion = () => {
    setAiSuggestion(null);
    setTaskOwnerId("unassigned");
    setAiApprovedMessage(null);
  };

  const handleSaveExistingTaskAssignee = async (memberId: string) => {
    if (!assigningTask) return;
    if (!canManageTeam) {
      setExistingTaskAiError("Approval requires Club Head or Event Lead permissions.");
      return;
    }

    setIsAssigningExistingTask(true);
    setExistingTaskAiError(null);

    let newName = "Unassigned";
    let newRole = "Unassigned";
    let newMemberId: string | undefined = undefined;

    if (memberId && memberId !== "unassigned") {
      const selectedOwner = teamMembers.find((tm) => tm.clubMemberId === memberId);
      if (selectedOwner) {
        newName = selectedOwner.name;
        newRole = selectedOwner.role;
        newMemberId = selectedOwner.clubMemberId;
      }
    }

    const { success, error } = await updateEventTaskAssigneeInSupabase(
      assigningTask.id,
      event.id,
      {
        name: newName,
        role: newRole,
        memberId: newMemberId,
      }
    );

    setIsAssigningExistingTask(false);

    if (!success) {
      setExistingTaskAiError(error || "Failed to update task assignee in Supabase.");
      return;
    }

    // Update local UI immediately
    setEventTasks((prev) =>
      prev.map((t) =>
        t.id === assigningTask.id
          ? {
              ...t,
              assigneeName: newName,
              assigneeRole: newRole,
              assigneeMemberId: newMemberId,
            }
          : t
      )
    );

    setAssigningTask(null);
    setExistingTaskAiSuggestion(null);
  };

  // Fetch tasks for this event from Supabase
  useEffect(() => {
    if (!event.id) return;
    let isMounted = true;

    fetchEventTasks(event.id).then(({ tasks: fetchedTasks, error }) => {
      if (!isMounted) return;
      setLoadingTasks(false);
      if (error) {
        console.error("Failed to load event tasks:", error);
        setTasksError(error);
      } else {
        setTasksError(null);
        setEventTasks(fetchedTasks);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [event.id]);

  const handleRetryLoadTasks = () => {
    setLoadingTasks(true);
    setTasksError(null);
    fetchEventTasks(event.id).then(({ tasks: fetchedTasks, error }) => {
      setLoadingTasks(false);
      if (error) {
        setTasksError(error);
      } else {
        setTasksError(null);
        setEventTasks(fetchedTasks);
      }
    });
  };

  const navigationSections: {
    id: EventSectionType;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: "overview", label: "Overview", icon: IconCalendar },
    { id: "tasks", label: "Tasks", icon: IconCheckSquare },
    { id: "team", label: "Team", icon: IconUsers },
    { id: "meetings", label: "Meetings", icon: IconVideo },
    { id: "documents", label: "Documents", icon: IconFileText },
    { id: "risks", label: "Risks", icon: IconShieldAlert },
    { id: "ai", label: "Eventra AI", icon: IconSparkles },
  ];

  const openEventTasksCount = eventTasks.filter((t) => !t.completed && t.status !== "Done").length;

  const rsvpPercentage = Math.min(
    100,
    Math.round((event.rsvpCount / (event.capacity || 1)) * 100)
  );

  const budgetUtilizedPercentage = Math.min(
    100,
    Math.round((event.budgetSpent / (event.budgetAllocated || 1)) * 100)
  );

  const handleCreateTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !taskDeadline.trim() || isCreatingTask) return;

    const ownerIdToUse = taskOwnerId || effectiveTaskOwnerId;
    let assigneeName = "Unassigned";
    let assigneeRole = "Unassigned";
    let assigneeMemberId: string | undefined = undefined;

    if (ownerIdToUse && ownerIdToUse !== "unassigned") {
      const selectedOwner = teamMembers.find((tm) => tm.clubMemberId === ownerIdToUse);
      if (selectedOwner) {
        assigneeName = selectedOwner.name;
        assigneeRole = selectedOwner.role;
        assigneeMemberId = selectedOwner.clubMemberId;
      }
    }

    setTaskActionError(null);
    setIsCreatingTask(true);

    const formattedDeadline = formatDisplayDate(taskDeadline.trim());

    const { task: createdTask, error } = await createEventTaskInSupabase(
      {
        clubId: event.clubId || club?.id || "",
        eventId: event.id,
        title: taskTitle.trim(),
        eventTag: event.title,
        priority: taskPriority,
        dueText: formattedDeadline,
        deadline: formattedDeadline,
        assigneeName,
        assigneeRole,
        assigneeMemberId,
        status: taskStatus,
        completed: taskStatus === "Done",
        dependencies: taskDependencyIds.length > 0 ? taskDependencyIds : undefined,
      },
      currentUserId,
      eventTasks
    );

    setIsCreatingTask(false);

    if (error || !createdTask) {
      setTaskActionError(error || "Failed to create task in Supabase.");
      return;
    }

    // Immediately update local UI
    setEventTasks((prev) => [createdTask, ...prev]);
    onAddTask(createdTask);

    // Reset form
    setTaskTitle("");
    setTaskDescription("");
    setTaskDeadline("");
    setTaskPriority("Medium");
    setTaskStatus("Todo");
    setTaskOwnerId("");
    setTaskDependencyIds([]);
    setAiSuggestion(null);
    setAiApprovedMessage(null);
    setAiSuggestionError(null);
    setIsAddTaskOpen(false);
  };

  const handleUpdateStatus = async (taskId: string, newStatus: TaskStatus) => {
    setMutatingTaskId(taskId);
    setTaskActionError(null);

    // Optimistic / immediate UI update
    setEventTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: newStatus,
              completed: newStatus === "Done",
            }
          : t
      )
    );
    onUpdateTaskStatus(taskId, newStatus);

    const { success, error } = await updateEventTaskStatusInSupabase(taskId, newStatus);
    setMutatingTaskId(null);

    if (!success) {
      setTaskActionError(error || "Failed to update task status in Supabase.");
      handleRetryLoadTasks();
    }
  };

  const handleToggleDone = async (taskId: string) => {
    const task = eventTasks.find((t) => t.id === taskId);
    if (!task) return;

    const willBeDone = !(task.completed || task.status === "Done");
    const newStatus: TaskStatus = willBeDone ? "Done" : "Todo";

    setMutatingTaskId(taskId);
    setTaskActionError(null);

    // Optimistic / immediate UI update
    setEventTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              completed: willBeDone,
              status: newStatus,
            }
          : t
      )
    );
    onToggleTaskDone(taskId);

    const { success, error } = await toggleEventTaskDoneInSupabase(taskId, willBeDone);
    setMutatingTaskId(null);

    if (!success) {
      setTaskActionError(error || "Failed to toggle task completion in Supabase.");
      handleRetryLoadTasks();
    }
  };

  const getPriorityBadge = (priority: TaskPriority) => {
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
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
            Low
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Back Navigation */}
      <div>
        <button
          type="button"
          onClick={onBackToEvents}
          className="inline-flex items-center gap-2 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer group"
        >
          <IconArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Events</span>
        </button>
      </div>

      {/* Event Header Banner */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-7 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100">
                {event.category}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                {event.status}
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                ID: {event.id}
              </span>
            </div>

            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#1E1B4B] tracking-tight">
              {event.title}
            </h1>

            <p className="text-xs text-slate-500 flex flex-wrap items-center gap-y-1 gap-x-4">
              <span className="inline-flex items-center gap-1.5">
                <IconClock className="w-3.5 h-3.5 text-slate-400" />
                {event.date} · {event.time}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <IconMapPin className="w-3.5 h-3.5 text-slate-400" />
                {event.location}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-center flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsEventraDrawerOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-indigo-700 text-white text-xs font-semibold shadow-sm hover:shadow-md hover:opacity-95 transition-all cursor-pointer group"
              title="Open Eventra AI Copilot Panel"
            >
              <IconSparkles className="w-4 h-4 text-purple-200 group-hover:scale-110 transition-transform" />
              <span>Eventra AI</span>
            </button>
            <div className="text-right hidden sm:block">
              <p className="text-[11px] text-slate-400 font-medium">Lead Organizer</p>
              <p className="text-xs font-semibold text-slate-800">{event.leadName}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-[#EDE9FE] text-[#5B21B6] font-bold text-xs flex items-center justify-center border border-indigo-100 shadow-sm">
              {event.leadName.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>

        {/* Horizontal Navigation Sections Bar */}
        <div className="pt-3 border-t border-slate-100">
          <nav className="flex items-center gap-2 sm:gap-4 overflow-x-auto no-scrollbar">
            {navigationSections.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              const badge = sec.id === "tasks" && eventTasks.length > 0 ? eventTasks.length : null;

              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => {
                    setActiveSection(sec.id);
                    if (sec.id === "ai") {
                      setIsEventraDrawerOpen(true);
                    }
                  }}
                  className={`flex items-center gap-2 py-2.5 px-3 rounded-xl text-xs font-medium transition-all relative whitespace-nowrap cursor-pointer ${
                    isActive
                      ? "bg-indigo-50 text-indigo-700 font-semibold"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />
                  <span>{sec.label}</span>
                  {badge !== null && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        isActive
                          ? "bg-indigo-200 text-indigo-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content Area Based on Active Section */}
      {activeSection === "overview" && (
        <div className="space-y-6">
          {/* Key Metric Snapshot Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* RSVPs & Capacity */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-medium">RSVPs</span>
                <IconUsers className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-xl font-bold text-[#1E1B4B]">
                {event.rsvpCount}{" "}
                <span className="text-xs font-normal text-slate-400">
                  / {event.capacity}
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all"
                  style={{ width: `${rsvpPercentage}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500">{rsvpPercentage}% capacity booked</p>
            </div>

            {/* Budget */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-medium">Allocated Budget</span>
                <IconDollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl font-bold text-[#1E1B4B]">
                ${event.budgetAllocated}
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full transition-all"
                  style={{ width: `${budgetUtilizedPercentage}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500">
                ${event.budgetSpent} spent ({budgetUtilizedPercentage}%)
              </p>
            </div>

            {/* Schedule */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-medium">Schedule</span>
                <IconCalendar className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-sm font-bold text-[#1E1B4B] truncate">
                {event.date}
              </div>
              <p className="text-[11px] text-slate-500 truncate">{event.time}</p>
            </div>

            {/* Venue */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-2">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-medium">Campus Location</span>
                <IconMapPin className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-sm font-bold text-[#1E1B4B] truncate">
                {event.location}
              </div>
              <p className="text-[11px] text-slate-500 truncate">On-Campus Facility</p>
            </div>
          </div>

          {/* Event Details Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-[#1E1B4B] tracking-tight">
              Event Details & Logistics Summary
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-100 space-y-2">
                <span className="font-semibold text-slate-700 block">Lead Organizer</span>
                <p className="text-slate-600 font-medium">{event.leadName}</p>
                <p className="text-[11px] text-slate-400">{event.leadRole}</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-100 space-y-2">
                <span className="font-semibold text-slate-700 block">Execution Status</span>
                <p className="text-emerald-700 font-semibold">{event.status}</p>
                <p className="text-[11px] text-slate-400">Workspace initialized and active</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tasks Section */}
      {activeSection === "tasks" && (
        <section className="space-y-4">
          {/* Header Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconCheckSquare className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-[#1E1B4B]">Event Tasks</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">
                {openEventTasksCount} open · {eventTasks.length} total
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Task View Mode Switcher */}
              <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setTaskViewMode("list")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    taskViewMode === "list"
                      ? "bg-white text-indigo-700 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  List
                </button>
                <button
                  type="button"
                  onClick={() => setTaskViewMode("calendar")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    taskViewMode === "calendar"
                      ? "bg-white text-indigo-700 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Calendar
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsAddTaskOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all cursor-pointer"
              >
                <IconPlus className="w-3.5 h-3.5" />
                <span>Add Task</span>
              </button>
            </div>
          </div>

          {/* Action Error Banner */}
          {taskActionError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <IconAlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{taskActionError}</span>
              </div>
              <button
                type="button"
                onClick={() => setTaskActionError(null)}
                className="text-rose-600 hover:text-rose-900 font-bold ml-2 cursor-pointer"
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          )}

          {/* Fetch Error Banner */}
          {tasksError && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <IconAlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>Failed to load tasks: {tasksError}</span>
              </div>
              <button
                type="button"
                onClick={handleRetryLoadTasks}
                className="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg font-semibold text-[11px] cursor-pointer transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* Task List, Loading, or Empty State */}
          {loadingTasks ? (
            <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center space-y-4 shadow-sm">
              <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-500 font-medium">Loading event tasks from Supabase…</p>
            </div>
          ) : eventTasks.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-300/80 p-12 text-center space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                <IconCheckSquare className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#1E1B4B]">No tasks yet for this event</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Add task milestones, permit approvals, and logistical checklists for this event.
                </p>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setIsAddTaskOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all cursor-pointer"
                >
                  <IconPlus className="w-3.5 h-3.5" />
                  <span>Add First Task</span>
                </button>
              </div>
            </div>
          ) : taskViewMode === "calendar" ? (
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-[#1E1B4B]">Task Deadlines Calendar</h3>
                <span className="text-xs text-slate-500 font-medium">Event Month Overview</span>
              </div>

              <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div>Sat</div>
                <div>Sun</div>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 28 }).map((_, idx) => {
                  const dayNum = idx + 1;
                  const dayTasks = eventTasks.filter((t, i) => i % 5 === idx % 5 || (t.deadline && t.deadline.includes(`${dayNum}`)));

                  return (
                    <div
                      key={idx}
                      className="min-h-[85px] p-2 bg-slate-50/50 rounded-2xl border border-slate-100 flex flex-col justify-between"
                    >
                      <span className="text-xs font-bold text-slate-600 self-end">{dayNum}</span>
                      <div className="space-y-1">
                        {dayTasks.slice(0, 2).map((t) => (
                          <div
                            key={t.id}
                            className={`p-1.5 rounded-lg text-[10px] font-medium truncate ${
                              t.completed || t.status === "Done"
                                ? "bg-slate-200/60 text-slate-500 line-through"
                                : t.priority === "Urgent" || t.priority === "High"
                                ? "bg-amber-100 text-amber-800 font-semibold"
                                : "bg-indigo-100 text-indigo-800"
                            }`}
                            title={t.title}
                          >
                            {t.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-sm divide-y divide-slate-100">
              {eventTasks.map((task) => {
                const isDone = task.status === "Done" || task.completed;
                const currentStatus: TaskStatus = task.status || (task.completed ? "Done" : "Todo");
                const isMutating = mutatingTaskId === task.id;

                // Evaluate real-time task dependency state
                const depState = getTaskDependencyState(task, eventTasks);

                return (
                  <div
                    key={task.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl transition-all hover:bg-slate-50/70 ${
                      isDone ? "opacity-60" : ""
                    } ${isMutating ? "opacity-75 pointer-events-none" : ""}`}
                  >
                    {/* Left: Checkbox + Title + Metadata */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {/* Done Checkbox */}
                      <button
                        type="button"
                        onClick={() => handleToggleDone(task.id)}
                        disabled={isMutating}
                        className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors cursor-pointer ${
                          isDone
                            ? "bg-indigo-600 border-indigo-600 text-white"
                            : "border-slate-300 bg-white hover:border-indigo-500"
                        } ${isMutating ? "cursor-wait opacity-60" : ""}`}
                        title={isDone ? "Mark as Todo" : "Mark as Done"}
                        aria-label={`Toggle task ${task.title}`}
                      >
                        {isMutating ? (
                          <div className="w-2.5 h-2.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                        ) : (
                          isDone && <IconCheck className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* Details */}
                      <div className="min-w-0 space-y-1 flex-1">
                        <p
                          className={`text-xs font-semibold ${
                            isDone
                              ? "line-through text-slate-400"
                              : "text-slate-800"
                          }`}
                        >
                          {task.title}
                        </p>

                        {/* Metadata row */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                          {/* Owner */}
                          {task.assigneeName === "Unassigned" || !task.assigneeMemberId ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                Unassigned
                              </span>
                              {canManageTeam && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAssigningTask(task);
                                    setAssigningTaskOwnerId("");
                                    setExistingTaskAiSuggestion(null);
                                    setExistingTaskAiError(null);
                                    handleRequestAiSuggestion(true, task);
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/90 shadow-2xs transition-all cursor-pointer group"
                                  title="AI analyze task and recommend best assignee"
                                >
                                  <IconSparkles className="w-3 h-3 text-indigo-600 group-hover:rotate-12 transition-transform" />
                                  <span>AI Assign</span>
                                </button>
                              )}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-800 text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                                {task.assigneeName.charAt(0).toUpperCase()}
                              </span>
                              <span className="font-medium text-slate-700">{task.assigneeName}</span>
                              {task.assigneeRole && task.assigneeRole !== "Unassigned" && (
                                <span className="text-slate-400">({task.assigneeRole})</span>
                              )}
                            </span>
                          )}

                          <span>•</span>

                          {/* Deadline */}
                          <span className="flex items-center gap-1 text-slate-500">
                            <IconClock className="w-3 h-3 text-slate-400" />
                            <span>{task.deadline || task.dueText}</span>
                          </span>

                          {/* Dependencies & Blocked State */}
                          {depState.hasDependencies && (
                            <>
                              <span>•</span>
                              {depState.isBlocked ? (
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md"
                                  title={`Blocked by unfinished tasks: ${depState.pendingDependencies
                                    .map((d) => d.title)
                                    .join(", ")}`}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                  <span>
                                    Blocked by {depState.pendingDependencies.length}{" "}
                                    {depState.pendingDependencies.length === 1
                                      ? "prerequisite"
                                      : "prerequisites"}
                                    : {depState.pendingDependencies.map((d) => d.title).join(", ")}
                                  </span>
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md"
                                  title="All prerequisite tasks have been marked Done"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  <span>Prerequisites completed</span>
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Priority, Blocked State & Status Selector */}
                    <div className="flex items-center gap-2 self-start sm:self-center flex-shrink-0 pt-2 sm:pt-0 pl-8 sm:pl-0">
                      {/* Priority Badge */}
                      {getPriorityBadge(task.priority)}

                      {/* Blocked Badge */}
                      {depState.isBlocked && (
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1"
                          title="This task is waiting on unfinished prerequisite tasks"
                        >
                          🔒 Blocked
                        </span>
                      )}

                      {/* Status Selector Dropdown */}
                      <div className="relative">
                        <select
                          value={currentStatus}
                          disabled={isMutating}
                          onChange={(e) =>
                            handleUpdateStatus(task.id, e.target.value as TaskStatus)
                          }
                          className={`appearance-none pl-2.5 pr-7 py-1 rounded-xl text-[11px] font-semibold border focus:outline-none transition-all cursor-pointer shadow-2xs ${
                            isMutating ? "cursor-wait opacity-60" : ""
                          } ${
                            currentStatus === "Done"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : currentStatus === "In Progress"
                              ? "bg-indigo-50 text-indigo-800 border-indigo-200"
                              : currentStatus === "Blocked"
                              ? "bg-rose-50 text-rose-800 border-rose-200"
                              : "bg-slate-50 text-slate-700 border-slate-200"
                          }`}
                          aria-label={`Update status for ${task.title}`}
                        >
                          {TASK_STATUSES.map((status) => (
                            <option key={status} value={status} className="bg-white text-slate-800 py-1">
                              {status}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-slate-400">
                          {isMutating ? (
                            <div className="w-2.5 h-2.5 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
                          ) : (
                            <IconChevronDown className="w-3 h-3" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Team Navigation Section */}
      {activeSection === "team" && (
        <section className="space-y-4">
          {/* Header Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconUsers className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-[#1E1B4B]">Event Team</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">
                {teamMembers.length} {teamMembers.length === 1 ? "member" : "members"}
              </span>
            </div>

            {canManageTeam ? (
              <button
                type="button"
                onClick={() => {
                  setTeamActionError(null);
                  setSelectedMemberIdToAdd(availableMembersToAdd[0]?.id || "");
                  setIsAddTeamModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all cursor-pointer"
              >
                <IconPlus className="w-3.5 h-3.5" />
                <span>Add Member</span>
              </button>
            ) : (
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                View-only
              </span>
            )}
          </div>

          {/* Action Error Banner */}
          {teamActionError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconAlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>{teamActionError}</span>
              </div>
              <button
                type="button"
                onClick={() => setTeamActionError(null)}
                className="text-red-500 hover:text-red-800 p-1 transition-colors"
                title="Dismiss"
              >
                <IconX className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Loading State */}
          {loadingTeam ? (
            <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm p-12 text-center space-y-3">
              <div className="inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-500 font-medium">Loading event team...</p>
            </div>
          ) : teamError ? (
            /* Error State */
            <div className="rounded-2xl bg-red-50/50 border border-red-200/80 shadow-sm p-8 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <IconAlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-red-900">Failed to load event team</h3>
              <p className="text-xs text-red-700 max-w-sm mx-auto">{teamError}</p>
              <button
                type="button"
                onClick={handleRetryLoadTeam}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors shadow-sm cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : teamMembers.length === 0 ? (
            /* Empty State */
            <div className="rounded-2xl bg-white border border-dashed border-slate-200/90 shadow-sm p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                <IconUsers className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-[#1E1B4B]">No team members assigned yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                Add members from this club to build the organizing and operations team for {event.title}.
              </p>
              {canManageTeam && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTeamActionError(null);
                      setSelectedMemberIdToAdd(availableMembersToAdd[0]?.id || "");
                      setIsAddTeamModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all cursor-pointer"
                  >
                    <IconPlus className="w-3.5 h-3.5" />
                    <span>Add First Team Member</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Populated Team Members Table */
            <div className="overflow-hidden rounded-2xl bg-white border border-slate-200/80 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th scope="col" className="py-3 px-5">Member</th>
                      <th scope="col" className="py-3 px-5">Email</th>
                      <th scope="col" className="py-3 px-5">Role</th>
                      <th scope="col" className="py-3 px-5">Workload</th>
                      <th scope="col" className="py-3 px-5">Joined</th>
                      {canManageTeam && (
                        <th scope="col" className="py-3 px-5 text-right">Action</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {teamMembers.map((tm) => (
                      <tr key={tm.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-5 font-semibold text-slate-800 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                              {(tm.name || "M").charAt(0).toUpperCase()}
                            </span>
                            <span>{tm.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-5 font-mono text-slate-500 whitespace-nowrap">
                          {tm.email || "—"}
                        </td>
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {tm.role}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          {(() => {
                            const wl = teamWorkloads.get(tm.id);
                            const activeCount = wl ? wl.activeCount : 0;
                            const state = wl ? wl.workloadState : "Low";

                            return (
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                      state === "Overloaded"
                                        ? "bg-rose-50 text-rose-700 border-rose-200"
                                        : state === "High"
                                        ? "bg-amber-50 text-amber-700 border-amber-200"
                                        : state === "Medium"
                                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    }`}
                                  >
                                    <span
                                      className={`w-1.5 h-1.5 rounded-full ${
                                        state === "Overloaded"
                                          ? "bg-rose-500"
                                          : state === "High"
                                          ? "bg-amber-500"
                                          : state === "Medium"
                                          ? "bg-indigo-500"
                                          : "bg-emerald-500"
                                      }`}
                                    />
                                    <span>
                                      {activeCount} active · {state}
                                    </span>
                                  </span>
                                </div>
                                {wl && (wl.overdueCount > 0 || wl.highUrgentActiveCount > 0) && (
                                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                    {wl.overdueCount > 0 && (
                                      <span className="text-rose-600 font-medium">
                                        {wl.overdueCount} overdue
                                      </span>
                                    )}
                                    {wl.highUrgentActiveCount > 0 && (
                                      <span className="text-amber-600 font-medium">
                                        {wl.highUrgentActiveCount} urgent
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-3.5 px-5 text-slate-500 whitespace-nowrap text-[11px]">
                          {tm.joinedAt}
                        </td>
                        {canManageTeam && (
                          <td className="py-3.5 px-5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              disabled={removingMemberId === tm.id}
                              onClick={() => handleRemoveTeamMember(tm.id)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {removingMemberId === tm.id ? (
                                <span className="inline-block w-3 h-3 border border-rose-600 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                "Remove"
                              )}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {activeSection === "meetings" && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#1E1B4B]">Event Syncs & Meetings</h3>
              <p className="text-xs text-slate-500">
                Committee briefings, standups, and virtual rooms for {event.title}
              </p>
            </div>
            <button
              onClick={() => setIsAddMeetingOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <IconPlus className="w-4 h-4" />
              Schedule Sync
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {meetings.map((m) => (
              <div
                key={m.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs hover:border-indigo-200 transition-colors space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                      <IconVideo className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#1E1B4B]">{m.title}</h4>
                      <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 mt-1">
                        {m.type}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50/60 p-3 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <IconCalendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{m.date}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <IconClock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{m.time}</span>
                  </div>
                  <div className="col-span-2 flex items-center gap-1.5 text-slate-500 text-[11px] truncate">
                    <IconMapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="truncate">{m.location}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <IconUsers className="w-4 h-4 text-slate-400" />
                    <span>{m.attendeesCount} Expected</span>
                  </div>
                  {m.linkUrl && (
                    <a
                      href={m.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200/80 transition-colors"
                    >
                      Join Link →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeSection === "documents" && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#1E1B4B]">Event Documents & Assets</h3>
              <p className="text-xs text-slate-500">
                Permits, vendor contracts, run of show, and budget sheets
              </p>
            </div>
            <button
              onClick={() => setIsAddDocOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              <IconPlus className="w-4 h-4" />
              Attach Document
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs hover:border-indigo-200 transition-colors flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
                      <IconFileText className="w-4 h-4" />
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {doc.category}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#1E1B4B] line-clamp-2">{doc.title}</h4>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Added by {doc.authorName} · {doc.dateAdded}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400">{doc.fileSize || "Link"}</span>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    View Document →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeSection === "risks" && (
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#1E1B4B]">Risks & Safety Audit</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                  {activeRisks.length} Active Flags
                </span>
                {resolvedRiskIds.size > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {resolvedRiskIds.size} Resolved
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Automated risk engine tracking single points of failure, deadline collisions, dependency chains, coverage gaps, and workload limits.
              </p>
            </div>
            <button
              onClick={() => {
                setEventraInitialPrompt("Run a complete risk mitigation audit for this event");
                setIsEventraDrawerOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-semibold shadow-sm hover:opacity-95 transition-opacity cursor-pointer"
            >
              <IconSparkles className="w-4 h-4" />
              Auto-Mitigate with Eventra AI
            </button>
          </div>

          {activeRisks.length === 0 ? (
            <div className="bg-emerald-50/50 border border-emerald-200 rounded-3xl p-10 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <IconCheck className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-emerald-900">Zero Active Operational Risks</h4>
              <p className="text-xs text-emerald-700 max-w-sm mx-auto">
                All event tasks are appropriately assigned, deadlines are within safe margins, and role coverage is complete.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeRisks.map((risk) => {
                const style = getSeverityStyle(risk.severity);
                return (
                  <div
                    key={risk.id}
                    className={`bg-white rounded-2xl border p-5 shadow-xs transition-all ${style.cardBorder}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex items-start gap-3.5 flex-1">
                        <div className={`p-2.5 rounded-xl border flex-shrink-0 ${style.iconBg}`}>
                          <IconShieldAlert className="w-5 h-5" />
                        </div>
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-[#1E1B4B]">{risk.title}</h4>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${style.badge}`}>
                              {risk.severity} Severity
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              {getRiskTypeLabel(risk.type)}
                            </span>
                            {risk.affectedTarget && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                                Target: {risk.affectedTarget}
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-600 leading-relaxed">{risk.description}</p>

                          <div className="text-[11px] font-mono text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                            <span className="font-bold text-slate-700">Evidence: </span>
                            {risk.evidence}
                          </div>

                          {risk.suggestedMitigation && (
                            <div className="text-xs text-indigo-900 bg-indigo-50/70 p-2.5 rounded-xl border border-indigo-100/80 flex items-start gap-2">
                              <span className="font-bold text-indigo-700 flex-shrink-0">Suggested Mitigation:</span>
                              <span>{risk.suggestedMitigation}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center sm:flex-col gap-2 flex-shrink-0 sm:pt-1">
                        <button
                          onClick={() => {
                            const prompt = risk.mitigationPrompt || `Mitigate risk: ${risk.title}. Evidence: ${risk.evidence}`;
                            setEventraInitialPrompt(prompt);
                            setIsEventraDrawerOpen(true);
                          }}
                          className="flex-1 sm:w-full px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <IconSparkles className="w-3.5 h-3.5" />
                          Mitigate
                        </button>
                        <button
                          onClick={() => {
                            setResolvedRiskIds((prev) => new Set(prev).add(risk.id));
                          }}
                          className="flex-1 sm:w-full px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold border border-emerald-200 transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center gap-1"
                        >
                          <IconCheck className="w-3.5 h-3.5" />
                          Resolve
                        </button>
                        <button
                          onClick={() => {
                            setDismissedRiskIds((prev) => new Set(prev).add(risk.id));
                          }}
                          className="flex-1 sm:w-full px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200 transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeSection === "ai" && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col min-h-[560px]">
          {/* Section Top Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100/80 shadow-xs">
                <IconSparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[#1E1B4B]">Eventra AI</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                    Event Operational Copilot
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Context: {event.title} · {eventTasks.length} tasks · {teamMembers.length} team members · {detectedRisks.length} active risks
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-medium text-slate-600">Gemini Integrated</span>
            </div>
          </div>

          {/* Quick Prompt Chips */}
          <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/30">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Operational Inquiries
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                "What tasks are currently overdue?",
                "Who has the highest workload?",
                "What risks should I be aware of?",
                "Summarize upcoming task deadlines",
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleSendAsky(chip)}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:border-indigo-400 hover:text-indigo-600 transition-all cursor-pointer shadow-2xs"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Chat Messages Feed */}
          <div className="flex-1 p-6 space-y-4 overflow-y-auto max-h-[460px]">
            {askyMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[85%] p-4 rounded-2xl text-xs leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-indigo-600 text-white rounded-br-none shadow-sm"
                      : msg.isError
                      ? "bg-rose-50 border border-rose-200 text-rose-800 rounded-bl-none shadow-2xs font-medium"
                      : "bg-slate-50 border border-slate-200/80 text-slate-800 rounded-bl-none shadow-2xs"
                  }`}
                >
                  {msg.sender === "ai" && (
                    <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-indigo-600">
                      <IconSparkles className="w-3.5 h-3.5" />
                      <span>Eventra AI</span>
                    </div>
                  )}
                  {msg.sender === "user" ? (
                    <div className="whitespace-pre-wrap">{msg.text}</div>
                  ) : (
                    <div
                      className="whitespace-pre-wrap [&_strong]:font-semibold"
                      dangerouslySetInnerHTML={{
                        __html: msg.text
                          .replace(/&/g, "&amp;")
                          .replace(/</g, "&lt;")
                          .replace(/>/g, "&gt;")
                          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                          .replace(/\*(.+?)\*/g, "<em>$1</em>"),
                      }}
                    />
                  )}

                  {msg.plan && (
                    <div className="mt-3 p-3.5 bg-white border border-indigo-200 rounded-xl shadow-xs space-y-2.5 text-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                          Proposed Agent Execution Plan
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {msg.plan.actions.length} action(s)
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {msg.plan.actions.map((act) => (
                          <div
                            key={act.id}
                            className="p-2 bg-slate-50 rounded-lg text-[11px] border border-slate-100 flex items-start gap-2"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1.5 flex-shrink-0" />
                            <span className="text-slate-700 leading-snug">{act.description}</span>
                          </div>
                        ))}
                      </div>

                      {msg.executionResult ? (
                        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-semibold flex items-center gap-1.5 border border-emerald-200">
                          <IconCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{msg.executionResult}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => msg.plan && handleExecuteAgentPlan(msg.id, msg.plan)}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs"
                          >
                            Approve Plan & Execute
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 mt-1 px-1">
                  {msg.time}
                </span>
              </div>
            ))}

            {isAskyThinking && (
              <div className="flex flex-col items-start animate-in fade-in duration-200">
                <div className="max-w-[85%] p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 text-indigo-900 rounded-bl-none shadow-2xs">
                  <div className="flex items-center gap-2 mb-1 text-[11px] font-semibold text-indigo-700">
                    <IconSparkles className="w-3.5 h-3.5 animate-spin" />
                    <span>Eventra AI is thinking...</span>
                  </div>
                  <div className="flex items-center gap-1.5 py-1">
                    <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce" />
                    <span className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce [animation-delay:0.2s]" />
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Form Input Box */}
          <div className="p-4 border-t border-slate-100 bg-white">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendAsky();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={askyInput}
                onChange={(e) => setAskyInput(e.target.value)}
                placeholder={`Ask Eventra AI about ${event.title}...`}
                className="flex-1 px-4 py-2.5 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={!askyInput.trim() || isAskyThinking}
                className={`p-2.5 rounded-xl transition-all ${
                  askyInput.trim() && !isAskyThinking
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shadow-sm"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                }`}
                aria-label="Send message to Eventra AI"
              >
                <IconSend className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Minimal Create Task Modal with ONLY Required 6 Fields */}
      {isAddTaskOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-white border border-slate-200/90 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <IconCheckSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1E1B4B]">Add Event Task</h3>
                  <p className="text-xs text-slate-500 truncate max-w-xs">{event.title}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAddTaskOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Close add task modal"
              >
                <IconX className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateTaskSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Modal Error Banner */}
              {taskActionError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center justify-between shadow-2xs">
                  <div className="flex items-center gap-2">
                    <IconAlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    <span>{taskActionError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTaskActionError(null)}
                    className="text-rose-600 hover:text-rose-900 font-bold ml-2 cursor-pointer"
                    aria-label="Dismiss error"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* 1. Task Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Task Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g. Submit audio amplification permit to Student Union"
                  className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-colors"
                />
              </div>

              {/* Optional Task Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Task Description <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder="Additional context or requirements to assist AI skill matching..."
                  className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-colors resize-none"
                />
              </div>

              {/* 2. Owner with AI Suggestion Button */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Owner <span className="text-slate-400 font-normal">(Event team members)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleRequestAiSuggestion(false)}
                    disabled={!taskTitle.trim() || teamMembers.length === 0 || isSuggestingAssignee}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-2xs group"
                    title="Suggest assignee based on role, workload, and task requirements"
                  >
                    {isSuggestingAssignee ? (
                      <>
                        <div className="w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                        <span>Analyzing Team…</span>
                      </>
                    ) : (
                      <>
                        <IconSparkles className="w-3.5 h-3.5 text-indigo-600 group-hover:rotate-12 transition-transform" />
                        <span>AI Suggest Assignee</span>
                      </>
                    )}
                  </button>
                </div>

                {/* AI Error banner if suggestion fails or times out */}
                {aiSuggestionError && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IconAlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                      <span>{aiSuggestionError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAiSuggestionError(null)}
                      className="text-amber-700 hover:text-amber-900 font-bold ml-2 cursor-pointer"
                      aria-label="Dismiss message"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* AI Approved Message banner */}
                {aiApprovedMessage && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-xl flex items-center justify-between animate-in fade-in duration-150">
                    <div className="flex items-center gap-2">
                      <IconCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      <span>{aiApprovedMessage}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAiApprovedMessage(null)}
                      className="text-emerald-700 hover:text-emerald-900 font-bold ml-2 cursor-pointer"
                      aria-label="Dismiss message"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* AI Suggestion Card with Mandatory Human Approval */}
                {aiSuggestion && (
                  <div className="p-3.5 bg-gradient-to-br from-indigo-50/90 via-purple-50/50 to-white border border-indigo-200/90 rounded-2xl shadow-sm space-y-3 animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="p-1 rounded-md bg-indigo-600 text-white">
                          <IconSparkles className="w-3 h-3" />
                        </div>
                        <span className="text-xs font-bold text-[#1E1B4B]">
                          AI Recommended Assignee
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                          aiSuggestion.confidence === "high"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : aiSuggestion.confidence === "medium"
                            ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {aiSuggestion.confidence} confidence
                      </span>
                    </div>

                    <div className="bg-white/85 border border-indigo-100 rounded-xl p-2.5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
                            {aiSuggestion.memberName.charAt(0).toUpperCase()}
                          </span>
                          <span className="text-xs font-bold text-slate-900">
                            {aiSuggestion.memberName}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getRoleBadgeColor(aiSuggestion.role)}`}>
                            {aiSuggestion.role}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className="text-slate-500 font-medium">
                            {aiSuggestion.activeCount} active tasks
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getWorkloadBadgeColor(aiSuggestion.workloadState)}`}>
                            {aiSuggestion.workloadState}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-600 italic bg-slate-50/70 p-2 rounded-lg border border-slate-100">
                        &ldquo;{aiSuggestion.reason}&rdquo;
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-slate-500 font-medium">
                        Approval required to assign
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleRejectAiSuggestion}
                          className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={handleApproveAiSuggestion}
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
                        >
                          <IconCheck className="w-3.5 h-3.5" />
                          <span>Approve & Assign</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Manual Dropdown Selector */}
                {teamMembers.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs space-y-1">
                    <p className="font-semibold">No event team members available</p>
                    <p className="text-[11px] text-amber-700">
                      Tasks must be assigned to members of this event&apos;s team. Please add members under the Team tab first.
                    </p>
                  </div>
                ) : (
                  <select
                    value={effectiveTaskOwnerId}
                    onChange={(e) => {
                      setTaskOwnerId(e.target.value);
                      setAiApprovedMessage(null);
                    }}
                    className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                  >
                    <option value="unassigned">Unassigned (Assign later)</option>
                    {teamMembers.map((tm) => {
                      const wl = teamWorkloads.get(tm.id);
                      return (
                        <option key={tm.clubMemberId} value={tm.clubMemberId}>
                          {tm.name} ({tm.role}) — {wl ? `${wl.activeCount} active (${wl.workloadState})` : "0 active"}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              {/* 3. Deadline */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Deadline <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={taskDeadline}
                  onChange={(e) => setTaskDeadline(e.target.value)}
                  className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-colors cursor-pointer"
                />
              </div>

              {/* 4. Priority & 5. Status Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Priority
                  </label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                    className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                  >
                    {TASK_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Status
                  </label>
                  <select
                    value={taskStatus}
                    onChange={(e) => setTaskStatus(e.target.value as TaskStatus)}
                    className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                  >
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 6. Dependencies (optional) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Dependencies <span className="text-slate-400 font-normal">(optional prerequisites)</span>
                  </label>
                  {taskDependencyIds.length > 0 && (
                    <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                      {taskDependencyIds.length} selected
                    </span>
                  )}
                </div>

                {eventTasks.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    No other tasks exist yet in this event to set as prerequisites.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
                    {eventTasks.map((t) => {
                      const isChecked = taskDependencyIds.includes(t.id);
                      const isDone = t.status === "Done" || t.completed;

                      return (
                        <label
                          key={t.id}
                          className={`flex items-center gap-2.5 p-2 rounded-lg transition-colors cursor-pointer text-xs border ${
                            isChecked
                              ? "bg-indigo-50/70 border-indigo-200 text-indigo-950 font-medium"
                              : "bg-white border-slate-200/70 text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setTaskDependencyIds((prev) => [...prev, t.id]);
                              } else {
                                setTaskDependencyIds((prev) =>
                                  prev.filter((id) => id !== t.id)
                                );
                              }
                            }}
                            className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                          />
                          <span className="truncate flex-1">{t.title}</span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0 ${
                              isDone
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {isDone ? "Done" : t.status || "Todo"}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="text-[11px] text-slate-400 mt-1">
                  Select any tasks that must be finished before this task can be unblocked.
                </p>
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddTaskOpen(false);
                    setTaskActionError(null);
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    !taskTitle.trim() ||
                    !taskDeadline.trim() ||
                    teamMembers.length === 0 ||
                    isCreatingTask
                  }
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  {isCreatingTask ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>Creating Task…</span>
                    </>
                  ) : (
                    <>
                      <IconPlus className="w-4 h-4" />
                      <span>Create Task</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Owner to Existing Task Modal */}
      {assigningTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-white border border-slate-200/90 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <IconSparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1E1B4B]">AI Task Assignment</h3>
                  <p className="text-xs text-slate-500 truncate max-w-xs">{assigningTask.title}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setAssigningTask(null);
                  setExistingTaskAiSuggestion(null);
                  setExistingTaskAiError(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <IconX className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Error banner */}
              {existingTaskAiError && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <IconAlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <span>{existingTaskAiError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExistingTaskAiError(null)}
                    className="text-amber-700 hover:text-amber-900 font-bold ml-2 cursor-pointer"
                    aria-label="Dismiss error"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Task Summary */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Task Priority
                  </span>
                  {getPriorityBadge(assigningTask.priority)}
                </div>
                <p className="text-xs font-semibold text-slate-800">{assigningTask.title}</p>
              </div>

              {/* Analysis in progress banner */}
              {isSuggestingAssignee && (
                <div className="p-3.5 bg-indigo-50/80 border border-indigo-200/70 rounded-xl flex items-center gap-3 text-xs text-indigo-900 animate-pulse">
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-indigo-700 rounded-full animate-spin flex-shrink-0" />
                  <span>ClubOps AI is evaluating task requirements, member capabilities, and active workloads…</span>
                </div>
              )}

              {/* AI Suggestion Card */}
              {existingTaskAiSuggestion && (
                <div className="p-3.5 bg-gradient-to-br from-indigo-50 via-purple-50/40 to-white border border-indigo-200 rounded-2xl shadow-sm space-y-3 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="p-1 rounded-md bg-indigo-600 text-white">
                        <IconSparkles className="w-3 h-3" />
                      </div>
                      <span className="text-xs font-bold text-[#1E1B4B]">
                        Recommended Assignee
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                        existingTaskAiSuggestion.confidence === "high"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : existingTaskAiSuggestion.confidence === "medium"
                          ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                      }`}
                    >
                      {existingTaskAiSuggestion.confidence} confidence
                    </span>
                  </div>

                  <div className="bg-white/90 border border-indigo-100 rounded-xl p-2.5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
                          {existingTaskAiSuggestion.memberName.charAt(0).toUpperCase()}
                        </span>
                        <span className="text-xs font-bold text-slate-900">
                          {existingTaskAiSuggestion.memberName}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getRoleBadgeColor(
                            existingTaskAiSuggestion.role
                          )}`}
                        >
                          {existingTaskAiSuggestion.role}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-slate-500 font-medium">
                          {existingTaskAiSuggestion.activeCount} active
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getWorkloadBadgeColor(
                            existingTaskAiSuggestion.workloadState
                          )}`}
                        >
                          {existingTaskAiSuggestion.workloadState}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
                      &ldquo;{existingTaskAiSuggestion.reason}&rdquo;
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setExistingTaskAiSuggestion(null);
                        setAssigningTask(null);
                      }}
                      className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    >
                      Reject (Keep Unassigned)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleSaveExistingTaskAssignee(existingTaskAiSuggestion.memberId)
                      }
                      disabled={isAssigningExistingTask}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm cursor-pointer disabled:opacity-50 transition-colors"
                    >
                      <IconCheck className="w-3.5 h-3.5" />
                      <span>{isAssigningExistingTask ? "Saving…" : "Approve & Assign"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Manual Selection Dropdown */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-600">
                    Or choose another member manually:
                  </label>
                  {!isSuggestingAssignee && !existingTaskAiSuggestion && (
                    <button
                      type="button"
                      onClick={() => handleRequestAiSuggestion(true)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                    >
                      <IconSparkles className="w-3 h-3" />
                      <span>Re-analyze with AI</span>
                    </button>
                  )}
                </div>
                <select
                  value={assigningTaskOwnerId || assigningTask.assigneeMemberId || "unassigned"}
                  onChange={(e) => setAssigningTaskOwnerId(e.target.value)}
                  className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="unassigned">Unassigned (Leave unassigned)</option>
                  {teamMembers.map((tm) => {
                    const wl = teamWorkloads.get(tm.id);
                    return (
                      <option key={tm.clubMemberId} value={tm.clubMemberId}>
                        {tm.name} ({tm.role}) — {wl ? `${wl.activeCount} active (${wl.workloadState})` : "0 active"}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setAssigningTask(null);
                    setExistingTaskAiSuggestion(null);
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSaveExistingTaskAssignee(
                      assigningTaskOwnerId || assigningTask.assigneeMemberId || ""
                    )
                  }
                  disabled={isAssigningExistingTask}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isAssigningExistingTask ? "Saving…" : "Save Manual Assignee"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Member to Event Team Modal */}
      {isAddTeamModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-white border border-slate-200/90 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <IconUsers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1E1B4B]">Add Member to Event Team</h3>
                  <p className="text-xs text-slate-500">
                    Select a member from this club to join the organizing team
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsAddTeamModalOpen(false);
                  setTeamActionError(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <IconX className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleAddMemberSubmit} className="p-5 space-y-4">
              {teamActionError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-start gap-2">
                  <IconAlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">{teamActionError}</div>
                </div>
              )}

              {availableMembersToAdd.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 text-center space-y-1 text-xs text-slate-600">
                  <p className="font-semibold text-slate-800">No more members available</p>
                  <p className="text-slate-500">
                    All members of this club are already part of the event team.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Select Club Member <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={selectedMemberIdToAdd}
                    disabled={isSubmittingTeam}
                    onChange={(e) => setSelectedMemberIdToAdd(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    {availableMembersToAdd.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — {m.role} ({m.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isSubmittingTeam}
                  onClick={() => {
                    setIsAddTeamModalOpen(false);
                    setTeamActionError(null);
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                {availableMembersToAdd.length > 0 && (
                  <button
                    type="submit"
                    disabled={!selectedMemberIdToAdd || isSubmittingTeam}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                  >
                    {isSubmittingTeam ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Adding…</span>
                      </>
                    ) : (
                      <>
                        <IconPlus className="w-4 h-4" />
                        <span>Add to Team</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Schedule Meeting Modal */}
      {isAddMeetingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-white border border-slate-200/90 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <IconVideo className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1E1B4B]">Schedule Event Sync</h3>
                  <p className="text-xs text-slate-500">Create a briefing room or committee sync</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddMeetingOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <IconX className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddMeetingSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Meeting Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Stage Logistics & Safety Briefing"
                  value={newMeetingTitle}
                  onChange={(e) => setNewMeetingTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="text"
                    value={newMeetingDate}
                    onChange={(e) => setNewMeetingDate(e.target.value)}
                    placeholder="e.g. Oct 24, 2026"
                    className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Time</label>
                  <input
                    type="text"
                    value={newMeetingTime}
                    onChange={(e) => setNewMeetingTime(e.target.value)}
                    placeholder="e.g. 4:00 PM"
                    className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Location / Room</label>
                <input
                  type="text"
                  value={newMeetingLocation}
                  onChange={(e) => setNewMeetingLocation(e.target.value)}
                  placeholder="e.g. Student Center 204 or Zoom"
                  className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Meeting Type</label>
                <select
                  value={newMeetingType}
                  onChange={(e) => setNewMeetingType(e.target.value)}
                  className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="Standup">Daily Standup</option>
                  <option value="Committee Sync">Committee Sync</option>
                  <option value="Briefing">Safety & Logistics Briefing</option>
                  <option value="Vendor Review">Vendor Review</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Video Call Link (Optional)</label>
                <input
                  type="url"
                  placeholder="https://meet.google.com/..."
                  value={newMeetingLink}
                  onChange={(e) => setNewMeetingLink(e.target.value)}
                  className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddMeetingOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm cursor-pointer"
                >
                  Schedule Sync
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Attach Document Modal */}
      {isAddDocOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-white border border-slate-200/90 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <IconFileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1E1B4B]">Attach Event Document</h3>
                  <p className="text-xs text-slate-500">Link permits, run-of-show, or contracts</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddDocOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <IconX className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddDocSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Document Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sound & Stage Safety Permit"
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                <select
                  value={newDocCategory}
                  onChange={(e) => setNewDocCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="Permits & Safety">Permits & Safety</option>
                  <option value="Contracts">Vendor Contracts</option>
                  <option value="Sponsorship & Budget">Sponsorship & Budget</option>
                  <option value="Run of Show">Run of Show & Agenda</option>
                  <option value="General">General</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Document / Asset Link <span className="text-rose-500">*</span>
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://drive.google.com/..."
                  value={newDocUrl}
                  onChange={(e) => setNewDocUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddDocOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm cursor-pointer"
                >
                  Attach Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Right-Side Eventra AI Panel Drawer */}
      <EventraDrawer
        isOpen={isEventraDrawerOpen}
        onClose={() => setIsEventraDrawerOpen(false)}
        event={event}
        club={club}
        currentUserId={currentUserId}
        teamMembers={teamMembers}
        eventTasks={eventTasks}
        onTasksUpdated={handleRetryLoadTasks}
        initialPrompt={eventraInitialPrompt}
      />
    </div>
  );
}
