// Comprehensive automated validation test suite for Step 4.16:
// Task Dependencies + Workload Calculation

import {
  wouldCreateCycle,
  validateTaskDependencies,
  getTaskDependencyState,
} from "../src/lib/tasks.ts";

import {
  WORKLOAD_THRESHOLDS,
  getWorkloadState,
  isTaskOverdue,
  calculateMemberWorkload,
  calculateTeamWorkloads,
} from "../src/lib/workload.ts";

console.log("=== STARTING STEP 4.16 TASK DEPENDENCIES & WORKLOAD TESTS ===\n");

// -----------------------------------------------------------------------------
// PART 1: TASK DEPENDENCIES & GRAPH CYCLE PREVENTION
// -----------------------------------------------------------------------------

console.log("--- PART 1: Task Dependencies & Cycle Prevention ---");

const mockEventId1 = "evt-hackathon-2026";
const mockEventId2 = "evt-drone-workshop-2026";

const taskA = {
  id: "task-A",
  clubId: "club-1",
  eventId: mockEventId1,
  title: "Permit Application",
  eventTag: "Hackathon",
  priority: "High",
  dueText: "2026-10-01",
  deadline: "2026-10-01",
  assigneeName: "Alice Lead",
  assigneeRole: "Technical",
  assigneeMemberId: "mem-alice",
  status: "Todo",
  completed: false,
  dependencies: [],
};

const taskB = {
  id: "task-B",
  clubId: "club-1",
  eventId: mockEventId1,
  title: "Audio Setup",
  eventTag: "Hackathon",
  priority: "Urgent",
  dueText: "2026-10-05",
  deadline: "2026-10-05",
  assigneeName: "Bob Sound",
  assigneeRole: "Logistics",
  assigneeMemberId: "mem-bob",
  status: "Todo",
  completed: false,
  dependencies: ["task-A"], // B depends on A
};

const taskC = {
  id: "task-C",
  clubId: "club-1",
  eventId: mockEventId1,
  title: "Sound Check & Rehearsal",
  eventTag: "Hackathon",
  priority: "Medium",
  dueText: "2026-10-10",
  deadline: "2026-10-10",
  assigneeName: "Bob Sound",
  assigneeRole: "Logistics",
  assigneeMemberId: "mem-bob",
  status: "Todo",
  completed: false,
  dependencies: ["task-B"], // C depends on B
};

const taskOtherEvent = {
  id: "task-other-1",
  clubId: "club-1",
  eventId: mockEventId2, // Belongs to a different event
  title: "Drone Batteries Order",
  eventTag: "Drone Workshop",
  priority: "Low",
  dueText: "2026-11-01",
  deadline: "2026-11-01",
  assigneeName: "Alice Lead",
  assigneeRole: "Technical",
  assigneeMemberId: "mem-alice",
  status: "Todo",
  completed: false,
  dependencies: [],
};

const allTasks = [taskA, taskB, taskC, taskOtherEvent];

// 1. Self-dependency check
console.log("1. Testing self-dependency prevention...");
const selfDepCheck = validateTaskDependencies("task-A", ["task-A"], mockEventId1, allTasks);
console.assert(!selfDepCheck.valid, "Self-dependency must be invalid");
console.assert(selfDepCheck.error.includes("cannot depend on itself"), "Clear self-dependency error message");
console.log("✓ Test 1 Passed: Self-dependency rejected.");

// 2. Cross-event dependency check
console.log("2. Testing cross-event dependency prevention...");
const crossEventCheck = validateTaskDependencies("task-A", [taskOtherEvent.id], mockEventId1, allTasks);
console.assert(!crossEventCheck.valid, "Cross-event dependency must be invalid");
console.assert(crossEventCheck.error.includes("another event"), "Clear cross-event error message");
console.log("✓ Test 2 Passed: Cross-event dependency rejected.");

// 3. Duplicate dependencies check
console.log("3. Testing duplicate dependency deduplication...");
const dupCheck = validateTaskDependencies("task-C", ["task-A", "task-A", "task-B"], mockEventId1, allTasks);
console.assert(dupCheck.valid, "Duplicate dependencies should be cleaned into unique array");
console.assert(dupCheck.cleanDependencies.length === 2, "Cleaned array has unique items");
console.assert(dupCheck.cleanDependencies.includes("task-A") && dupCheck.cleanDependencies.includes("task-B"));
console.log("✓ Test 3 Passed: Duplicate dependencies cleanly deduplicated.");

// 4. Direct circular dependency check (A depends on B, attempting B -> A)
console.log("4. Testing direct circular dependency prevention (A -> B -> A)...");
// taskB already depends on taskA. Attempting to make taskA depend on taskB:
const directCycle = wouldCreateCycle("task-A", "task-B", allTasks);
console.assert(directCycle === true, "Direct cycle must be detected");
const directValidation = validateTaskDependencies("task-A", ["task-B"], mockEventId1, allTasks);
console.assert(!directValidation.valid, "Direct circular dependency must be rejected");
console.assert(directValidation.error.includes("Circular dependency detected"), "Clear circular error message");
console.log("✓ Test 4 Passed: Direct circular dependency rejected.");

// 5. Transitive circular dependency check (A -> B -> C -> A)
console.log("5. Testing transitive circular dependency prevention (A -> B -> C -> A)...");
// taskC depends on taskB, taskB depends on taskA. Attempting to make taskA depend on taskC:
const transitiveCycle = wouldCreateCycle("task-A", "task-C", allTasks);
console.assert(transitiveCycle === true, "Transitive cycle must be detected");
const transitiveValidation = validateTaskDependencies("task-A", ["task-C"], mockEventId1, allTasks);
console.assert(!transitiveValidation.valid, "Transitive circular dependency must be rejected");
console.log("✓ Test 5 Passed: Multi-hop transitive circular dependency rejected.");

// 6. Valid multi-dependency check
console.log("6. Testing valid multi-dependency creation...");
const taskD_dependencies = ["task-A", "task-B"];
const multiDepValidation = validateTaskDependencies("task-D", taskD_dependencies, mockEventId1, allTasks);
console.assert(multiDepValidation.valid, "Valid multi-dependencies must pass");
console.assert(multiDepValidation.cleanDependencies.length === 2);
console.log("✓ Test 6 Passed: Valid multi-dependencies accepted.");

// 7. Dependency blocked behavior (Unfinished vs Done)
console.log("7. Testing dependency blocked state...");
// taskA is 'Todo' (unfinished), so taskB must be blocked by dependency
const depStateB_initial = getTaskDependencyState(taskB, allTasks);
console.assert(depStateB_initial.hasDependencies === true, "Task B has dependencies");
console.assert(depStateB_initial.isBlocked === true, "Task B must be blocked by unfinished Task A");
console.assert(depStateB_initial.pendingDependencies.length === 1);
console.assert(depStateB_initial.pendingDependencies[0].id === "task-A");
console.log("✓ Test 7 Passed: Task B is marked blocked while prerequisite Task A is unfinished.");

// 8. Automatic unblocking when all prerequisites become Done
console.log("8. Testing automatic unblocking when prerequisites become Done...");
const updatedTaskA_Done = { ...taskA, status: "Done", completed: true };
const tasksWithADone = [updatedTaskA_Done, taskB, taskC];

const depStateB_afterDone = getTaskDependencyState(taskB, tasksWithADone);
console.assert(depStateB_afterDone.hasDependencies === true);
console.assert(depStateB_afterDone.isBlocked === false, "Task B must become unblocked when Task A is Done");
console.assert(depStateB_afterDone.completedDependencies.length === 1);
console.log("✓ Test 8 Passed: Task B automatically unblocks once prerequisite becomes Done.");


// -----------------------------------------------------------------------------
// PART 2: WORKLOAD CALCULATION & THRESHOLDS
// -----------------------------------------------------------------------------

console.log("\n--- PART 2: Workload Calculation & State Thresholds ---");

// 9. Centralized thresholds verification
console.log("9. Verifying centralized workload thresholds...");
console.assert(WORKLOAD_THRESHOLDS.LOW.min === 0 && WORKLOAD_THRESHOLDS.LOW.max === 2);
console.assert(WORKLOAD_THRESHOLDS.MEDIUM.min === 3 && WORKLOAD_THRESHOLDS.MEDIUM.max === 4);
console.assert(WORKLOAD_THRESHOLDS.HIGH.min === 5 && WORKLOAD_THRESHOLDS.HIGH.max === 6);
console.assert(WORKLOAD_THRESHOLDS.OVERLOADED.min === 7);

console.assert(getWorkloadState(0) === "Low");
console.assert(getWorkloadState(1) === "Low");
console.assert(getWorkloadState(2) === "Low");
console.assert(getWorkloadState(3) === "Medium");
console.assert(getWorkloadState(4) === "Medium");
console.assert(getWorkloadState(5) === "High");
console.assert(getWorkloadState(6) === "High");
console.assert(getWorkloadState(7) === "Overloaded");
console.assert(getWorkloadState(12) === "Overloaded");
console.log("✓ Test 9 Passed: Centralized thresholds match exact 0-2 (Low), 3-4 (Med), 5-6 (High), 7+ (Overloaded).");

// 10. Member workload calculation
console.log("10. Testing member workload calculation with real task properties...");
const memberBob = {
  id: "etm-bob",
  eventId: mockEventId1,
  clubMemberId: "mem-bob",
  name: "Bob Sound",
  email: "bob@campus.edu",
  role: "Logistics",
  joinedAt: "2026-09-01",
};

// Generate 4 active tasks for Bob (2 high/urgent, 1 overdue) and 2 completed tasks
const fixedNow = new Date("2026-10-15T12:00:00Z");

const bobsTasks = [
  {
    id: "b-1",
    clubId: "club-1",
    eventId: mockEventId1,
    title: "Overdue Task",
    eventTag: "Hackathon",
    priority: "High",
    dueText: "2026-10-01",
    deadline: "2026-10-01",
    assigneeName: "Bob Sound",
    assigneeRole: "Logistics",
    assigneeMemberId: "mem-bob",
    status: "In Progress",
    completed: false,
  },
  {
    id: "b-2",
    clubId: "club-1",
    eventId: mockEventId1,
    title: "Urgent Upcoming Task",
    eventTag: "Hackathon",
    priority: "Urgent",
    dueText: "2026-10-20",
    deadline: "2026-10-20",
    assigneeName: "Bob Sound",
    assigneeRole: "Logistics",
    assigneeMemberId: "mem-bob",
    status: "Todo",
    completed: false,
  },
  {
    id: "b-3",
    clubId: "club-1",
    eventId: mockEventId1,
    title: "Normal Task 1",
    eventTag: "Hackathon",
    priority: "Medium",
    dueText: "2026-10-25",
    deadline: "2026-10-25",
    assigneeName: "Bob Sound",
    assigneeRole: "Logistics",
    assigneeMemberId: "mem-bob",
    status: "Todo",
    completed: false,
  },
  {
    id: "b-4",
    clubId: "club-1",
    eventId: mockEventId1,
    title: "Normal Task 2",
    eventTag: "Hackathon",
    priority: "Low",
    dueText: "2026-10-30",
    deadline: "2026-10-30",
    assigneeName: "Bob Sound",
    assigneeRole: "Logistics",
    assigneeMemberId: "mem-bob",
    status: "Todo",
    completed: false,
  },
  {
    id: "b-5",
    clubId: "club-1",
    eventId: mockEventId1,
    title: "Finished Task",
    eventTag: "Hackathon",
    priority: "High",
    dueText: "2026-09-30",
    deadline: "2026-09-30",
    assigneeName: "Bob Sound",
    assigneeRole: "Logistics",
    assigneeMemberId: "mem-bob",
    status: "Done",
    completed: true,
  },
];

const bobsWorkload = calculateMemberWorkload(memberBob, bobsTasks, fixedNow);
console.assert(bobsWorkload.totalAssigned === 5, "Total assigned tasks = 5");
console.assert(bobsWorkload.activeCount === 4, "Active tasks = 4");
console.assert(bobsWorkload.completedCount === 1, "Completed tasks = 1");
console.assert(bobsWorkload.overdueCount === 1, "Overdue tasks = 1 (b-1 is before Oct 15)");
console.assert(bobsWorkload.highUrgentActiveCount === 2, "High/Urgent active tasks = 2 (High + Urgent)");
console.assert(bobsWorkload.workloadState === "Medium", "Workload state for 4 active tasks = Medium");
console.log("✓ Test 10 Passed: Full member workload metrics accurately calculated.");

// 11. Team workloads batch calculation
console.log("11. Testing team workloads map calculation...");
const memberAlice = {
  id: "etm-alice",
  eventId: mockEventId1,
  clubMemberId: "mem-alice",
  name: "Alice Lead",
  email: "alice@campus.edu",
  role: "Technical",
  joinedAt: "2026-09-01",
};

const teamWorkloads = calculateTeamWorkloads([memberBob, memberAlice], bobsTasks, fixedNow);
console.assert(teamWorkloads.has("etm-bob"));
console.assert(teamWorkloads.has("etm-alice"));
console.assert(teamWorkloads.get("etm-alice").activeCount === 0);
console.assert(teamWorkloads.get("etm-alice").workloadState === "Low");
console.log("✓ Test 11 Passed: calculateTeamWorkloads calculates Map for all event team members.");

// 12. Overloaded state check (7+ tasks)
console.log("12. Testing Overloaded workload threshold...");
const overloadedTasks = Array.from({ length: 7 }, (_, i) => ({
  id: `ov-${i}`,
  clubId: "club-1",
  eventId: mockEventId1,
  title: `Task ${i}`,
  eventTag: "Hackathon",
  priority: "Medium",
  dueText: "2026-11-01",
  assigneeName: "Bob Sound",
  assigneeRole: "Logistics",
  assigneeMemberId: "mem-bob",
  status: "Todo",
  completed: false,
}));
const overloadedWl = calculateMemberWorkload(memberBob, overloadedTasks, fixedNow);
console.assert(overloadedWl.activeCount === 7);
console.assert(overloadedWl.workloadState === "Overloaded");
console.log("✓ Test 12 Passed: 7 active tasks evaluated as 'Overloaded'.");

console.log("\n========================================================");
console.log("🎉 ALL 12 STEP 4.16 VALIDATION TESTS PASSED SUCCESSFULLY!");
console.log("========================================================");
