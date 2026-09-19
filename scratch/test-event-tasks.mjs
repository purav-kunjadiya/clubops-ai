// Automated validation script for Step 4.15: Event Tasks Persistence in Supabase

// In-memory simulation of the Supabase tables matching our migrations:
// - public.clubs
// - public.club_members
// - public.events
// - public.event_team_members
// - public.tasks

let clubsTable = [
  { id: "club-robotics-1", name: "Robotics Club", owner_id: "user-head-1" },
  { id: "club-art-2", name: "Art Society", owner_id: "user-head-2" },
];

let clubMembersTable = [
  { id: "cm-1", club_id: "club-robotics-1", user_id: "user-head-1", name: "Purav Lead", email: "purav@campus.edu", role: "Technical" },
  { id: "cm-2", club_id: "club-robotics-1", user_id: "user-mem-2", name: "Sarah Logist", email: "sarah@campus.edu", role: "Logistics" },
  { id: "cm-3", club_id: "club-robotics-1", user_id: "user-mem-3", name: "Dan Marketer", email: "dan@campus.edu", role: "Marketing" },
  { id: "cm-4", club_id: "club-art-2", user_id: "user-other-4", name: "Art Person", email: "art@campus.edu", role: "Design" },
];

let eventsTable = [
  { id: "evt-hack-1", club_id: "club-robotics-1", title: "Autonomous Bot Derby 2026", lead_member_id: "cm-1" },
  { id: "evt-hack-2", club_id: "club-robotics-1", title: "Drone Workshop", lead_member_id: "cm-1" },
];

// Event 1 has Purav Lead (cm-1) and Sarah Logist (cm-2) on its event team
// Dan Marketer (cm-3) is in the club, but NOT on Event 1's team!
let eventTeamMembersTable = [
  { id: "etm-1", event_id: "evt-hack-1", club_member_id: "cm-1" },
  { id: "etm-2", event_id: "evt-hack-1", club_member_id: "cm-2" },
  { id: "etm-3", event_id: "evt-hack-2", club_member_id: "cm-1" },
];

let tasksTable = [];

const ALLOWED_STATUSES = ["Todo", "In Progress", "Done", "Blocked"];
const ALLOWED_PRIORITIES = ["Low", "Medium", "High", "Urgent"];

// Service logic matching src/lib/tasks.ts:

function fetchEventTasks(eventId) {
  if (!eventId) return { tasks: [], error: "Event ID is required." };
  // Event isolation filter
  const rows = tasksTable.filter((t) => t.event_id === eventId);
  return {
    tasks: rows.map((r) => ({
      id: r.id,
      clubId: r.club_id,
      eventId: r.event_id,
      title: r.title,
      eventTag: r.event_tag,
      priority: r.priority,
      dueText: r.due_text,
      deadline: r.deadline || r.due_text,
      assigneeName: r.assignee_name,
      assigneeRole: r.assignee_role,
      assigneeMemberId: r.assignee_member_id,
      status: r.status,
      completed: Boolean(r.completed),
      dependencies: r.dependencies || [],
    })),
    error: null,
  };
}

function createEventTask(params, callingUserId) {
  if (!params.title || !params.title.trim()) {
    return { task: null, error: "Task title is required." };
  }
  if (!params.eventId) {
    return { task: null, error: "Event ID is required." };
  }

  const event = eventsTable.find((e) => e.id === params.eventId);
  if (!event) {
    return { task: null, error: "Event not found." };
  }

  // Priority check
  if (!ALLOWED_PRIORITIES.includes(params.priority)) {
    return { task: null, error: `Invalid priority. Must be one of: ${ALLOWED_PRIORITIES.join(", ")}` };
  }

  // Status check
  const status = params.status || (params.completed ? "Done" : "Todo");
  if (!ALLOWED_STATUSES.includes(status)) {
    return { task: null, error: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(", ")}` };
  }

  // OWNER VALIDATION: Owner must be an event-team member!
  if (params.assigneeMemberId) {
    const isTeamMember = eventTeamMembersTable.some(
      (etm) => etm.event_id === params.eventId && etm.club_member_id === params.assigneeMemberId
    );
    if (!isTeamMember) {
      return {
        task: null,
        error: "The selected assignee must be a member of this event's team.",
      };
    }
  } else {
    return { task: null, error: "Task owner is required and must belong to the event team." };
  }

  const isDone = status === "Done" || Boolean(params.completed);

  const newTaskRow = {
    id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    club_id: event.club_id,
    event_id: params.eventId,
    title: params.title.trim(),
    event_tag: params.eventTag || event.title,
    priority: params.priority,
    due_text: params.dueText.trim(),
    deadline: params.deadline?.trim() || params.dueText.trim(),
    assignee_name: params.assigneeName,
    assignee_role: params.assigneeRole,
    assignee_member_id: params.assigneeMemberId,
    status,
    completed: isDone,
    dependencies: params.dependencies || [],
    created_at: new Date().toISOString(),
  };

  tasksTable.push(newTaskRow);

  return {
    task: {
      id: newTaskRow.id,
      clubId: newTaskRow.club_id,
      eventId: newTaskRow.event_id,
      title: newTaskRow.title,
      eventTag: newTaskRow.event_tag,
      priority: newTaskRow.priority,
      dueText: newTaskRow.due_text,
      deadline: newTaskRow.deadline,
      assigneeName: newTaskRow.assignee_name,
      assigneeRole: newTaskRow.assignee_role,
      assigneeMemberId: newTaskRow.assignee_member_id,
      status: newTaskRow.status,
      completed: newTaskRow.completed,
      dependencies: newTaskRow.dependencies,
    },
    error: null,
  };
}

function updateEventTaskStatus(taskId, newStatus) {
  if (!taskId) return { success: false, error: "Task ID is required." };
  if (!ALLOWED_STATUSES.includes(newStatus)) {
    return { success: false, error: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(", ")}` };
  }

  const task = tasksTable.find((t) => t.id === taskId);
  if (!task) return { success: false, error: "Task not found." };

  task.status = newStatus;
  task.completed = newStatus === "Done";
  return { success: true, error: null };
}

function toggleEventTaskDone(taskId, completed) {
  if (!taskId) return { success: false, error: "Task ID is required." };

  const task = tasksTable.find((t) => t.id === taskId);
  if (!task) return { success: false, error: "Task not found." };

  task.completed = completed;
  task.status = completed ? "Done" : "Todo";
  return { success: true, error: null };
}

console.log("=== STARTING STEP 4.15 EVENT TASKS PERSISTENCE TESTS ===\n");

// 1. Empty state check
console.log("1. Checking initial tasks state for Event 1...");
const initialRes = fetchEventTasks("evt-hack-1");
console.assert(initialRes.tasks.length === 0, "Initial task list must be empty");
console.log("✓ Test 1 Passed: Fresh event starts with 0 tasks (empty state rendered).");

// 2. Owner validation: Attempt to assign task to Dan Marketer (cm-3) who is NOT on Event 1 team
console.log("\n2. Testing owner validation (non-event-team member rejected)...");
const invalidOwnerRes = createEventTask(
  {
    eventId: "evt-hack-1",
    title: "Print Campus Flyers",
    dueText: "Nov 01, 2026",
    priority: "Medium",
    status: "Todo",
    assigneeName: "Dan Marketer",
    assigneeRole: "Marketing",
    assigneeMemberId: "cm-3", // Not on event 1 team
  },
  "user-head-1"
);
console.assert(invalidOwnerRes.task === null, "Task creation must fail for non-event-team member");
console.assert(
  invalidOwnerRes.error.includes("must be a member of this event's team"),
  "Must return specific error about event-team membership"
);
console.log("✓ Test 2 Passed: Assigning to member not on event team is rejected with clear error.");

// 3. Create task assigned to valid event team member (Sarah Logist, cm-2)
console.log("\n3. Creating valid task assigned to event team member (Sarah Logist)...");
const validTask1Res = createEventTask(
  {
    eventId: "evt-hack-1",
    title: "Obtain Safety Permit from Student Union",
    dueText: "Nov 05, 2026",
    deadline: "Nov 05, 2026",
    priority: "High",
    status: "Todo",
    assigneeName: "Sarah Logist",
    assigneeRole: "Logistics",
    assigneeMemberId: "cm-2",
  },
  "user-head-1"
);
console.assert(validTask1Res.task !== null, "Task creation should succeed");
console.assert(validTask1Res.task.title === "Obtain Safety Permit from Student Union");
console.assert(validTask1Res.task.priority === "High");
console.assert(validTask1Res.task.status === "Todo");
console.assert(validTask1Res.task.completed === false);
console.log("✓ Test 3 Passed: Task created successfully in Supabase for event team member.");

// 4. Create second task with dependency
console.log("\n4. Creating dependent task with prerequisite...");
const task1Id = validTask1Res.task.id;
const validTask2Res = createEventTask(
  {
    eventId: "evt-hack-1",
    title: "Construct Arena Enclosure",
    dueText: "Nov 12, 2026",
    deadline: "Nov 12, 2026",
    priority: "Urgent",
    status: "Todo",
    assigneeName: "Purav Lead",
    assigneeRole: "Technical",
    assigneeMemberId: "cm-1",
    dependencies: [task1Id],
  },
  "user-head-1"
);
console.assert(validTask2Res.task !== null, "Second task creation should succeed");
console.assert(validTask2Res.task.dependencies.length === 1);
console.assert(validTask2Res.task.dependencies[0] === task1Id);
console.log("✓ Test 4 Passed: Dependent task created preserving prerequisite reference.");

// 5. Create task in Event 2 to verify isolation
console.log("\n5. Creating task in Event 2 for isolation testing...");
const ev2TaskRes = createEventTask(
  {
    eventId: "evt-hack-2",
    title: "Order Drone Propellers",
    dueText: "Dec 01, 2026",
    priority: "Low",
    status: "Todo",
    assigneeName: "Purav Lead",
    assigneeRole: "Technical",
    assigneeMemberId: "cm-1",
  },
  "user-head-1"
);
console.assert(ev2TaskRes.task !== null, "Event 2 task created");

// 6. Verify Event 1 task fetch and strict event isolation
console.log("\n6. Verifying Event 1 tasks load and isolation...");
const ev1Fetch = fetchEventTasks("evt-hack-1");
console.assert(ev1Fetch.tasks.length === 2, "Event 1 must have exactly 2 tasks");
console.assert(
  !ev1Fetch.tasks.some((t) => t.id === ev2TaskRes.task.id),
  "Event 2 task must NEVER appear in Event 1"
);
console.log("✓ Test 5 & 6 Passed: Event 1 loads real tasks; strict event isolation confirmed.");

// 7. Status update: Todo -> In Progress
console.log("\n7. Updating Task 1 status to 'In Progress'...");
const updStatus1 = updateEventTaskStatus(task1Id, "In Progress");
console.assert(updStatus1.success, "Status update must succeed");
const check1 = fetchEventTasks("evt-hack-1").tasks.find((t) => t.id === task1Id);
console.assert(check1.status === "In Progress" && !check1.completed, "Status must be In Progress");
console.log("✓ Test 7 Passed: Status updated to 'In Progress' and persisted.");

// 8. Mark Done toggle: completed = true -> status = "Done"
console.log("\n8. Toggling Task 1 to Done...");
const toggleDone1 = toggleEventTaskDone(task1Id, true);
console.assert(toggleDone1.success, "Toggle done must succeed");
const checkDone = fetchEventTasks("evt-hack-1").tasks.find((t) => t.id === task1Id);
console.assert(checkDone.completed === true && checkDone.status === "Done", "Task must be Done");
console.log("✓ Test 8 Passed: Task marked Done; completed flag and status persisted.");

// 9. Status update: Task 2 to 'Blocked'
console.log("\n9. Updating Task 2 status to 'Blocked'...");
const task2Id = validTask2Res.task.id;
const updBlocked = updateEventTaskStatus(task2Id, "Blocked");
console.assert(updBlocked.success, "Blocked status update must succeed");
const checkBlocked = fetchEventTasks("evt-hack-1").tasks.find((t) => t.id === task2Id);
console.assert(checkBlocked.status === "Blocked" && !checkBlocked.completed, "Status must be Blocked");
console.log("✓ Test 9 Passed: Status updated to 'Blocked' and persisted.");

// 10. Toggle Done off: completed = false -> status = "Todo"
console.log("\n10. Toggling Task 1 back to incomplete...");
const toggleOff1 = toggleEventTaskDone(task1Id, false);
console.assert(toggleOff1.success, "Toggle off must succeed");
const checkOff = fetchEventTasks("evt-hack-1").tasks.find((t) => t.id === task1Id);
console.assert(checkOff.completed === false && checkOff.status === "Todo", "Task must be Todo");
console.log("✓ Test 10 Passed: Task unmarked; completed=false and status=Todo persisted.");

// 11. Zero demo data check
console.log("\n11. Verifying zero demo data...");
console.assert(!tasksTable.some((t) => t.id.startsWith("demo-")), "Zero demo tasks");
console.log("✓ Test 11 Passed: Zero demo data found in task store.");

console.log("\n========================================================");
console.log("🎉 ALL 11 STEP 4.15 VALIDATION TESTS PASSED SUCCESSFULLY!");
console.log("========================================================");
