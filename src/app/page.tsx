"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/use-auth";
import { fetchUserClubs, fetchClubMembers, updateMemberRoleInSupabase } from "@/lib/clubs";
import { fetchClubEvents } from "@/lib/events";
import { AuthScreen } from "@/components/auth-screen";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { ClubHeader } from "@/components/club-header";
import { ClubTabs, type ClubTabType } from "@/components/club-tabs";
import { EventsSection } from "@/components/events-section";
import { TasksSection } from "@/components/tasks-section";
import { MembersSection } from "@/components/members-section";
import { ClubOverviewTab } from "@/components/club-overview-tab";
import { ClubSettingsView } from "@/components/club-settings-view";
import { ClubsListView } from "@/components/clubs-list-view";
import { EventWorkspace } from "@/components/event-workspace";
import { CopilotSidebar } from "@/components/copilot-sidebar";
import { InboxModal } from "@/components/inbox-modal";
import { CreateEventModal } from "@/components/create-event-modal";
import { CreateClubModal } from "@/components/create-club-modal";
import { JoinClubModal } from "@/components/join-club-modal";
import {
  MOCK_CLUBS,
  MOCK_MEMBERS,
  MOCK_EVENTS,
  MOCK_TASKS,
  MOCK_INBOX,
} from "@/components/mock-data";
import type { Club, ClubMember, ClubRole, ClubEvent, InboxItem, TaskItem, TaskStatus } from "@/components/types";
import {
  IconPlus,
  IconUsers,
  IconCalendar,
  IconCheckSquare,
  IconSparkles,
  IconLogOut,
} from "@/components/icons";

export default function Home() {
  // ─── Auth state ────────────────────────────────────────────────
  const auth = useAuth();

  // Derive the user's initial and email from auth state
  const userEmail = auth.user?.email ?? "user@example.com";
  const userInitial = (userEmail.charAt(0) || "U").toUpperCase();
  const userName = userEmail
    .split("@")[0]
    .split(/[._-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Member";

  const [activeClubTab, setActiveClubTab] = useState<ClubTabType>("events");
  const [activeEvent, setActiveEvent] = useState<ClubEvent | null>(null);
  const [isClubsListOpen, setIsClubsListOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [isCreateClubOpen, setIsCreateClubOpen] = useState(false);
  const [isJoinClubOpen, setIsJoinClubOpen] = useState(false);
  const [copilotInput, setCopilotInput] = useState("");
  const [loadingClubs, setLoadingClubs] = useState(true);
  const [clubsError, setClubsError] = useState<string | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  // Dynamic state — all arrays start empty (zero demo data)
  const [clubs, setClubs] = useState<Club[]>(MOCK_CLUBS);
  const [members, setMembers] = useState<ClubMember[]>(MOCK_MEMBERS);
  const [activeClub, setActiveClub] = useState<Club | null>(MOCK_CLUBS[0] ?? null);
  const [events, setEvents] = useState<ClubEvent[]>(MOCK_EVENTS);
  const [tasks, setTasks] = useState<TaskItem[]>(MOCK_TASKS);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>(MOCK_INBOX);

  // Fetch user's clubs from Supabase when authenticated (initial load & refresh)
  useEffect(() => {
    if (!auth.user) return;

    let isMounted = true;

    fetchUserClubs(auth.user.id).then(({ clubs: fetchedClubs, error }) => {
      if (!isMounted) return;
      setLoadingClubs(false);
      if (error) {
        console.error("Failed to load clubs:", error);
        setClubsError(error);
        return;
      }
      setClubsError(null);
      setClubs(fetchedClubs);
      if (fetchedClubs.length > 0) {
        setActiveClub((current) => {
          if (current && fetchedClubs.some((c) => c.id === current.id)) {
            return current;
          }
          return fetchedClubs[0];
        });
      } else {
        setActiveClub(null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [auth.user]);

  // Fetch members for the active club from Supabase
  useEffect(() => {
    if (!activeClub?.id) return;

    let isMounted = true;
    const clubId = activeClub.id;
    const clubOwnerId = activeClub.ownerId;

    fetchClubMembers(clubId, clubOwnerId).then(({ members: fetchedMembers, error }) => {
      if (!isMounted) return;
      setLoadingMembers(false);
      if (error) {
        console.error("Failed to load club members:", error);
        setMembersError(error);
      } else {
        setMembersError(null);
        setMembers((prev) => [
          ...prev.filter((m) => m.clubId !== clubId),
          ...fetchedMembers,
        ]);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeClub?.id, activeClub?.ownerId]);

  // Fetch events for the active club from Supabase
  useEffect(() => {
    if (!activeClub?.id) return;

    let isMounted = true;
    const clubId = activeClub.id;

    fetchClubEvents(clubId).then(({ events: fetchedEvents, error }) => {
      if (!isMounted) return;
      setLoadingEvents(false);
      if (error) {
        console.error("Failed to load club events:", error);
        setEventsError(error);
      } else {
        setEventsError(null);
        setEvents((prev) => [
          ...prev.filter((e) => e.clubId !== clubId),
          ...fetchedEvents,
        ]);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeClub?.id]);

  // Derived data
  const activeClubMembers = activeClub
    ? members.filter((m) => m.clubId === activeClub.id)
    : [];
  const displayMemberCount = activeClubMembers.length;
  const activeClubEvents = activeClub
    ? events.filter((e) => e.clubId === activeClub.id)
    : [];
  const openTasksCount = tasks.filter((t) => !t.completed).length;
  const unreadInboxCount = inboxItems.filter((i) => i.unread).length;

  const currentSidebarTab = isClubsListOpen
    ? ""
    : activeEvent
    ? "events"
    : activeClubTab === "overview"
    ? "dashboard"
    : activeClubTab;

  // ─── Handlers ───────────────────────────────────────────────────

  const handleSelectSidebarTab = (tabId: string) => {
    setIsClubsListOpen(false);
    setActiveEvent(null);
    if (tabId === "dashboard" || tabId === "analytics") {
      setActiveClubTab("overview");
    } else if (tabId === "events") {
      setActiveClubTab("events");
    } else if (tabId === "tasks") {
      setActiveClubTab("tasks");
    } else if (tabId === "members") {
      setActiveClubTab("members");
    }
  };

  const handleMarkAllRead = () => {
    setInboxItems((prev) => prev.map((item) => ({ ...item, unread: false })));
  };

  const handleRetryLoadMembers = () => {
    if (!activeClub) return;
    setLoadingMembers(true);
    setMembersError(null);
    fetchClubMembers(activeClub.id, activeClub.ownerId).then(
      ({ members: fetchedMembers, error }) => {
        setLoadingMembers(false);
        if (error) {
          setMembersError(error);
        } else {
          setMembersError(null);
          setMembers((prev) => [
            ...prev.filter((m) => m.clubId !== activeClub.id),
            ...fetchedMembers,
          ]);
        }
      }
    );
  };

  const handleRetryLoadEvents = () => {
    if (!activeClub) return;
    setLoadingEvents(true);
    setEventsError(null);
    fetchClubEvents(activeClub.id).then(({ events: fetchedEvents, error }) => {
      setLoadingEvents(false);
      if (error) {
        setEventsError(error);
      } else {
        setEventsError(null);
        setEvents((prev) => [
          ...prev.filter((e) => e.clubId !== activeClub.id),
          ...fetchedEvents,
        ]);
      }
    });
  };

  const handleUpdateMemberRole = async (
    memberId: string,
    newRole: ClubRole
  ): Promise<{ success: boolean; error?: string }> => {
    if (!activeClub) return { success: false, error: "No active club selected." };

    const result = await updateMemberRoleInSupabase(activeClub.id, memberId, newRole);
    if (!result.success) {
      return result;
    }

    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
    );

    return { success: true };
  };

  const handleClubCreated = (newClub: Club) => {
    setClubs((prev) => {
      if (prev.some((c) => c.id === newClub.id)) return prev;
      return [newClub, ...prev];
    });
    setActiveClub(newClub);
    setIsClubsListOpen(false);
    setActiveEvent(null);
    setActiveClubTab("events");

    // Add the creator as the initial member/owner
    const emailPrefix = userEmail.split("@")[0] || "member";
    const formattedName = emailPrefix
      .split(/[._-]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

    const creatorMember: ClubMember = {
      id: `mem-${newClub.id.slice(-4)}`,
      name: formattedName || "Club Head",
      email: userEmail,
      clubId: newClub.id,
      role: "Technical",
      joinedAt: new Date().toISOString().split("T")[0],
    };
    setMembers((prev) => [...prev, creatorMember]);
  };

  const handleJoinClub = (club: Club, member?: ClubMember) => {
    setClubs((prev) => {
      if (prev.some((c) => c.id === club.id)) return prev;
      return [club, ...prev];
    });

    const newMember: ClubMember = member || {
      id: `mem-${Date.now().toString().slice(-4)}`,
      name: userName,
      email: userEmail,
      clubId: club.id,
      role: "Registration",
      joinedAt: new Date().toISOString().split("T")[0],
    };

    setMembers((prev) => {
      if (
        prev.some(
          (m) =>
            m.id === newMember.id ||
            (m.clubId === club.id && m.email.toLowerCase() === newMember.email.toLowerCase())
        )
      ) {
        return prev;
      }
      return [...prev, newMember];
    });

    setActiveClub(club);
    setIsClubsListOpen(false);
    setActiveEvent(null);
    setActiveClubTab("events");
  };

  const handleEventCreated = (newEvent: ClubEvent) => {
    setEvents((prev) => [
      newEvent,
      ...prev.filter((e) => e.id !== newEvent.id),
    ]);
    setActiveEvent(newEvent);
  };

  const handleAddTask = (newTask: TaskItem) => {
    setTasks((prev) => [newTask, ...prev]);
  };

  const handleUpdateTaskStatus = (taskId: string, newStatus: TaskStatus) => {
    setTasks((prev) =>
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
  };

  const handleToggleTaskDone = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const willBeDone = !(t.completed || t.status === "Done");
        return {
          ...t,
          completed: willBeDone,
          status: willBeDone ? "Done" : "Todo",
        };
      })
    );
  };

  const handleCopilotPrompt = (prompt: string) => {
    setCopilotInput(prompt);
  };

  const handleSignOut = async () => {
    setClubs([]);
    setActiveClub(null);
    setClubsError(null);
    setLoadingClubs(true);
    await auth.signOut();
  };

  // ─── Determine view mode ──────────────────────────────────────

  const showOnboarding = !activeClub && !isClubsListOpen;

  // ─── Auth loading: full-screen spinner ─────────────────────────

  if (auth.loading && !auth.user) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">Loading ClubOps AI…</p>
        </div>
      </div>
    );
  }

  // ─── Auth gate: Login / Sign Up ────────────────────────────────

  if (!auth.user) {
    return (
      <AuthScreen
        onSignIn={auth.signIn}
        onSignUp={auth.signUp}
        loading={auth.loading}
        error={auth.error}
        onClearError={auth.clearError}
      />
    );
  }

  // ─── Clubs loading: initial fetch for authenticated user ───────

  if (loadingClubs && clubs.length === 0 && !clubsError) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">Loading your clubs…</p>
        </div>
      </div>
    );
  }

  // ─── Clubs error state: clear message with Retry ──────────────

  if (clubsError && clubs.length === 0) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center space-y-5 bg-white p-8 rounded-2xl border border-rose-200/80 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100">
            <span className="text-xl font-bold">⚠</span>
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-bold text-[#1E1B4B]">
              Unable to load your clubs
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              {clubsError}
            </p>
          </div>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (!auth.user) return;
                setClubsError(null);
                setLoadingClubs(true);
                fetchUserClubs(auth.user.id).then(({ clubs: fetchedClubs, error }) => {
                  setLoadingClubs(false);
                  if (error) {
                    setClubsError(error);
                  } else {
                    setClubs(fetchedClubs);
                    if (fetchedClubs.length > 0) {
                      setActiveClub(fetchedClubs[0]);
                    } else {
                      setActiveClub(null);
                    }
                  }
                });
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all cursor-pointer shadow-sm"
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Onboarding: full-screen, no sidebar/header ────────────────

  if (showOnboarding) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center px-4 py-12 selection:bg-indigo-500/20 selection:text-indigo-900 relative">
        {/* Top-right authenticated user header */}
        <div className="absolute top-4 sm:top-6 right-4 sm:right-6 flex items-center gap-2.5">
          <div className="flex items-center gap-2 bg-white/80 backdrop-blur-sm border border-slate-200/80 rounded-full py-1 px-2.5 shadow-xs">
            <span className="w-6 h-6 rounded-full bg-[#EDE9FE] text-[#5B21B6] font-bold flex items-center justify-center text-[11px]">
              {userInitial}
            </span>
            <span className="hidden sm:inline max-w-[140px] truncate text-xs text-slate-600 font-medium">
              {userEmail}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50/50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-rose-100"
            title="Sign out"
          >
            <IconLogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>

        <div className="max-w-xl w-full text-center space-y-10">

          {/* Brand mark */}
          <div className="space-y-6">
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-50 to-[#EDE9FE] flex items-center justify-center border border-indigo-100/60">
                <IconSparkles className="w-7 h-7 text-indigo-600" />
              </div>
              <span className="absolute -top-1.5 left-3 w-1.5 h-1.5 rounded-full bg-indigo-300 animate-pulse" />
              <span className="absolute -top-1.5 right-3 w-1.5 h-1.5 rounded-full bg-purple-300 animate-pulse" />
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold text-indigo-600 tracking-widest uppercase">
                ClubOps AI
              </p>
              <h1
                className="text-3xl sm:text-4xl font-bold text-[#1E1B4B] tracking-tight"
                style={{ fontFamily: "var(--font-playfair), serif" }}
              >
                Welcome to ClubOps AI
              </h1>
              <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed pt-2">
                Your AI-powered operating system for running college clubs and events.
              </p>
            </div>
          </div>

          {/* Primary action cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-lg mx-auto">
            <button
              type="button"
              onClick={() => setIsCreateClubOpen(true)}
              className="group relative p-7 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-lg hover:border-indigo-200 transition-all text-left cursor-pointer"
            >
              <div className="space-y-4">
                <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                  <IconPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1E1B4B] group-hover:text-indigo-600 transition-colors">
                    Create a Club
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Start a new club and invite members with a unique code.
                  </p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setIsJoinClubOpen(true)}
              className="group relative p-7 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-lg hover:border-indigo-200 transition-all text-left cursor-pointer"
            >
              <div className="space-y-4">
                <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                  <IconUsers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1E1B4B] group-hover:text-indigo-600 transition-colors">
                    Join a Club
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Enter a club code to join an existing organization.
                  </p>
                </div>
              </div>
            </button>
          </div>

          {/* Subtle feature ribbon */}
          <div className="pt-6 flex items-center justify-center gap-8 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <IconCalendar className="w-3.5 h-3.5" /> Events
            </span>
            <span className="flex items-center gap-1.5">
              <IconCheckSquare className="w-3.5 h-3.5" /> Tasks
            </span>
            <span className="flex items-center gap-1.5">
              <IconUsers className="w-3.5 h-3.5" /> Members
            </span>
            <span className="flex items-center gap-1.5">
              <IconSparkles className="w-3.5 h-3.5" /> Asky
            </span>
          </div>
        </div>

        {/* Modals — must render even during onboarding */}
        <CreateClubModal
          isOpen={isCreateClubOpen}
          onClose={() => setIsCreateClubOpen(false)}
          onClubCreated={handleClubCreated}
          existingClubs={clubs}
          userId={auth.user?.id}
        />

        <JoinClubModal
          isOpen={isJoinClubOpen}
          onClose={() => setIsJoinClubOpen(false)}
          existingClubs={clubs}
          members={members}
          currentUserEmail={userEmail}
          currentUserName={userName}
          userId={auth.user?.id}
          onJoinClub={handleJoinClub}
        />
      </div>
    );
  }

  // ─── Club Workspace: Sidebar + Header + Content + Copilot ─────

  return (
    <div className="min-h-screen bg-[#F8F9FD] text-slate-900 flex antialiased selection:bg-indigo-500/20 selection:text-indigo-900">
      {/* Left Navigation Sidebar */}
      <Sidebar
        currentTab={currentSidebarTab}
        onSelectTab={handleSelectSidebarTab}
        unreadInboxCount={unreadInboxCount}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onOpenInbox={() => setIsInboxOpen(true)}
        clubs={clubs}
        activeClub={activeClub ?? undefined}
        onSelectClub={(club) => {
          setActiveClub(club);
          setIsClubsListOpen(false);
          setActiveEvent(null);
        }}
        onOpenCreateClub={() => setIsCreateClubOpen(true)}
        onOpenJoinClub={() => setIsJoinClubOpen(true)}
        memberCount={displayMemberCount}
        taskCount={openTasksCount > 0 ? openTasksCount : 0}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <Header
          onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
          onOpenInbox={() => setIsInboxOpen(true)}
          unreadCount={unreadInboxCount}
          userInitial={userInitial}
          onSignOut={handleSignOut}
        />

        {/* 2-Column Responsive Workspace */}
        <div className="flex-1 flex flex-col lg:flex-row gap-6 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {/* Center Workspace */}
          <main className="flex-1 space-y-6 min-w-0">
            {isClubsListOpen ? (
              <ClubsListView
                clubs={clubs}
                activeClub={activeClub ?? clubs[0]}
                onSelectClub={(club) => {
                  setActiveClub(club);
                  setIsClubsListOpen(false);
                  setActiveEvent(null);
                }}
                onOpenCreateClub={() => setIsCreateClubOpen(true)}
                onOpenJoinClub={() => setIsJoinClubOpen(true)}
              />
            ) : activeEvent && activeClub ? (
              <EventWorkspace
                event={activeEvent}
                club={activeClub}
                currentUserId={auth.user?.id}
                onBackToEvents={() => setActiveEvent(null)}
                tasks={tasks}
                members={activeClubMembers}
                onAddTask={handleAddTask}
                onUpdateTaskStatus={handleUpdateTaskStatus}
                onToggleTaskDone={handleToggleTaskDone}
              />
            ) : activeClub ? (
              <>
                {/* Active Club Profile Header Banner */}
                <ClubHeader
                  club={activeClub}
                  memberCount={displayMemberCount}
                  onBackToClubs={() => setIsClubsListOpen(true)}
                  onManageClub={() => setActiveClubTab("settings")}
                />

                {/* Club Tabs */}
                <ClubTabs
                  activeTab={activeClubTab}
                  onTabChange={setActiveClubTab}
                  taskCount={openTasksCount}
                  memberCount={displayMemberCount}
                />

                {/* Tab Views */}
                {activeClubTab === "events" && (
                  <EventsSection
                    events={activeClubEvents}
                    onOpenCreateEvent={() => setIsCreateEventOpen(true)}
                    onSelectEvent={setActiveEvent}
                    isLoading={loadingEvents}
                    error={eventsError}
                    onRetry={handleRetryLoadEvents}
                  />
                )}

                {activeClubTab === "tasks" && (
                  <TasksSection initialTasks={tasks} />
                )}

                {activeClubTab === "members" && (
                  <MembersSection
                    club={activeClub}
                    members={activeClubMembers}
                    onUpdateMemberRole={handleUpdateMemberRole}
                    currentUserId={auth.user?.id}
                    isLoading={loadingMembers}
                    error={membersError}
                    onRetry={handleRetryLoadMembers}
                  />
                )}

                {activeClubTab === "overview" && (
                  <ClubOverviewTab
                    club={activeClub}
                    events={activeClubEvents}
                    tasks={tasks}
                    onOpenCreateEvent={() => setIsCreateEventOpen(true)}
                    onGoToTab={(tab) => setActiveClubTab(tab)}
                    onSelectEvent={setActiveEvent}
                  />
                )}

                {activeClubTab === "settings" && (
                  <ClubSettingsView club={activeClub} />
                )}
              </>
            ) : null}
          </main>

          {/* Right Panel: Asky & Quick Stats */}
          <CopilotSidebar
            eventCount={activeClubEvents.length}
            taskCount={openTasksCount}
            memberCount={displayMemberCount}
            input={copilotInput}
            onInputChange={setCopilotInput}
            onSendPrompt={handleCopilotPrompt}
          />
        </div>
      </div>

      {/* Modals */}
      <CreateEventModal
        isOpen={isCreateEventOpen}
        onClose={() => setIsCreateEventOpen(false)}
        onEventCreated={handleEventCreated}
        clubId={activeClub?.id}
        userId={auth.user?.id}
        defaultLeadName={userName}
      />

      <CreateClubModal
        isOpen={isCreateClubOpen}
        onClose={() => setIsCreateClubOpen(false)}
        onClubCreated={handleClubCreated}
        existingClubs={clubs}
        userId={auth.user?.id}
      />

      <JoinClubModal
        isOpen={isJoinClubOpen}
        onClose={() => setIsJoinClubOpen(false)}
        existingClubs={clubs}
        members={members}
        currentUserEmail={userEmail}
        currentUserName={userName}
        userId={auth.user?.id}
        onJoinClub={handleJoinClub}
      />

      <InboxModal
        isOpen={isInboxOpen}
        onClose={() => setIsInboxOpen(false)}
        items={inboxItems}
        onMarkAllRead={handleMarkAllRead}
      />
    </div>
  );
}
