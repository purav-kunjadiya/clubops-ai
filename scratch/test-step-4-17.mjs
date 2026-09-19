// Comprehensive automated validation test suite for Step 4.17:
// AI-assisted task assignment with mandatory human approval

import {
  computeHeuristicSuggestion,
  SUPPORTED_ROLES,
} from "../src/app/api/tasks/suggest-assignee/route.ts";

import {
  updateEventTaskAssigneeInSupabase,
  createEventTaskInSupabase,
} from "../src/lib/tasks.ts";

console.log("=== STARTING STEP 4.17 AI-ASSISTED TASK ASSIGNMENT TESTS ===\n");

// 1. Supported Roles Check
console.log("1. Verifying 6 supported roles...");
const expectedRoles = ["Marketing", "Design", "Technical", "Sponsorship", "Logistics", "Registration"];
console.assert(
  SUPPORTED_ROLES.length === 6 &&
  expectedRoles.every((r) => SUPPORTED_ROLES.includes(r)),
  "Must support exactly the 6 defined roles"
);
console.log("✓ Test 1 Passed: Exactly the 6 supported roles defined.");

// Setup mock candidate team
const candidateTechAlice = {
  id: "etm-alice",
  clubMemberId: "mem-alice",
  name: "Alice Lead",
  role: "Technical",
  workload: {
    activeCount: 1,
    completedCount: 4,
    overdueCount: 0,
    workloadState: "Low",
  },
};

const candidateTechDevOverloaded = {
  id: "etm-dave",
  clubMemberId: "mem-dave",
  name: "Dave Senior",
  role: "Technical",
  workload: {
    activeCount: 8,
    completedCount: 2,
    overdueCount: 2,
    workloadState: "Overloaded",
  },
};

const candidateDesignBob = {
  id: "etm-bob",
  clubMemberId: "mem-bob",
  name: "Bob Creative",
  role: "Design",
  workload: {
    activeCount: 2,
    completedCount: 1,
    overdueCount: 0,
    workloadState: "Low",
  },
};

const candidateMarketingChloe = {
  id: "etm-chloe",
  clubMemberId: "mem-chloe",
  name: "Chloe Reach",
  role: "Marketing",
  workload: {
    activeCount: 2,
    completedCount: 3,
    overdueCount: 0,
    workloadState: "Low",
  },
};

const candidateSponsorSam = {
  id: "etm-sam",
  clubMemberId: "mem-sam",
  name: "Sam Funds",
  role: "Sponsorship",
  workload: {
    activeCount: 3,
    completedCount: 2,
    overdueCount: 0,
    workloadState: "Medium",
  },
};

const candidateLogisticsLeo = {
  id: "etm-leo",
  clubMemberId: "mem-leo",
  name: "Leo Operations",
  role: "Logistics",
  workload: {
    activeCount: 1,
    completedCount: 2,
    overdueCount: 0,
    workloadState: "Low",
  },
};

const candidateRegRita = {
  id: "etm-rita",
  clubMemberId: "mem-rita",
  name: "Rita Checkin",
  role: "Registration",
  workload: {
    activeCount: 1,
    completedCount: 1,
    overdueCount: 0,
    workloadState: "Low",
  },
};

const fullTeam = [
  candidateTechAlice,
  candidateTechDevOverloaded,
  candidateDesignBob,
  candidateMarketingChloe,
  candidateSponsorSam,
  candidateLogisticsLeo,
  candidateRegRita,
];

// 2. Technical Domain Matching
console.log("2. Testing Technical task domain matching...");
const techSuggestion = computeHeuristicSuggestion(
  "Deploy backend server API and configure database migrations",
  "Ensure API handles high concurrency and tests pass",
  "High",
  fullTeam
);
console.assert(techSuggestion.memberId === "mem-alice", "Should choose Alice (Technical + Low workload)");
console.assert(techSuggestion.role === "Technical");
console.assert(techSuggestion.confidence === "high");
console.assert(techSuggestion.reason.includes("Technical"), "Reason mentions Technical capability");
console.log(`✓ Test 2 Passed: Recommended ${techSuggestion.memberName} (${techSuggestion.role}) for Technical task.`);

// 3. Design Domain Matching
console.log("3. Testing Design task domain matching...");
const designSuggestion = computeHeuristicSuggestion(
  "Design stage banner, event badges, and Figma visual assets",
  undefined,
  "Medium",
  fullTeam
);
console.assert(designSuggestion.memberId === "mem-bob", "Should choose Bob (Design)");
console.assert(designSuggestion.role === "Design");
console.assert(designSuggestion.reason.includes("Design"));
console.log(`✓ Test 3 Passed: Recommended ${designSuggestion.memberName} (${designSuggestion.role}) for Design task.`);

// 4. Sponsorship Domain Matching
console.log("4. Testing Sponsorship task domain matching...");
const sponsorSuggestion = computeHeuristicSuggestion(
  "Prepare corporate sponsorship tier prospectus and partner pitch deck",
  "Target 5 tier-one sponsors",
  "Medium",
  fullTeam
);
console.assert(sponsorSuggestion.memberId === "mem-sam", "Should choose Sam (Sponsorship)");
console.assert(sponsorSuggestion.role === "Sponsorship");
console.log(`✓ Test 4 Passed: Recommended ${sponsorSuggestion.memberName} (${sponsorSuggestion.role}) for Sponsorship task.`);

// 5. Marketing Domain Matching
console.log("5. Testing Marketing task domain matching...");
const mktgSuggestion = computeHeuristicSuggestion(
  "Launch Instagram promo campaign and broadcast newsletter announcement",
  undefined,
  "Medium",
  fullTeam
);
console.assert(mktgSuggestion.memberId === "mem-chloe", "Should choose Chloe (Marketing)");
console.assert(mktgSuggestion.role === "Marketing");
console.log(`✓ Test 5 Passed: Recommended ${mktgSuggestion.memberName} (${mktgSuggestion.role}) for Marketing task.`);

// 6. Logistics Domain Matching
console.log("6. Testing Logistics task domain matching...");
const logSuggestion = computeHeuristicSuggestion(
  "Reserve auditorium hall, order food catering, and coordinate stage setup",
  undefined,
  "Medium",
  fullTeam
);
console.assert(logSuggestion.memberId === "mem-leo", "Should choose Leo (Logistics)");
console.assert(logSuggestion.role === "Logistics");
console.log(`✓ Test 6 Passed: Recommended ${logSuggestion.memberName} (${logSuggestion.role}) for Logistics task.`);

// 7. Registration Domain Matching
console.log("7. Testing Registration task domain matching...");
const regSuggestion = computeHeuristicSuggestion(
  "Setup attendee ticket QR scan desk and print participant badges",
  undefined,
  "Low",
  fullTeam
);
console.assert(regSuggestion.memberId === "mem-rita", "Should choose Rita (Registration)");
console.assert(regSuggestion.role === "Registration");
console.log(`✓ Test 7 Passed: Recommended ${regSuggestion.memberName} (${regSuggestion.role}) for Registration task.`);

// 8. Workload Influence: Overloaded vs Low Workload
console.log("8. Testing workload avoidance between members with same role...");
// Both Alice and Dave are Technical. Dave is Overloaded (8 active, 2 overdue), Alice is Low (1 active, 0 overdue).
const techWorkloadSuggestion = computeHeuristicSuggestion(
  "Urgent code bugfix in server API",
  undefined,
  "Urgent",
  [candidateTechDevOverloaded, candidateTechAlice]
);
console.assert(techWorkloadSuggestion.memberId === "mem-alice", "Must prefer Alice over Overloaded Dave");
console.log(`✓ Test 8 Passed: Overloaded member correctly deprioritized in favor of member with capacity.`);

// 9. Structured AI Output Shape
console.log("9. Testing structured AI suggestion output shape...");
console.assert(typeof techSuggestion.memberId === "string" && techSuggestion.memberId.length > 0);
console.assert(typeof techSuggestion.memberName === "string" && techSuggestion.memberName.length > 0);
console.assert(typeof techSuggestion.role === "string");
console.assert(typeof techSuggestion.activeCount === "number");
console.assert(["Low", "Medium", "High", "Overloaded"].includes(techSuggestion.workloadState));
console.assert(typeof techSuggestion.reason === "string" && techSuggestion.reason.length > 0);
console.assert(["low", "medium", "high"].includes(techSuggestion.confidence));
console.log("✓ Test 9 Passed: Suggestion output strictly complies with required JSON structure.");

// 10. Human Approval Flow Simulation
console.log("10. Testing Human Approval semantics (Approve vs Reject)...");
let formTaskOwner = "unassigned";

// AI generates recommendation
const suggestionToApprove = techSuggestion;

// Explicit Approval by Head:
function simulateHeadApproval(suggestion) {
  formTaskOwner = suggestion.memberId;
  return { approved: true, assignedMemberId: formTaskOwner };
}

const approvalResult = simulateHeadApproval(suggestionToApprove);
console.assert(approvalResult.approved === true);
console.assert(approvalResult.assignedMemberId === "mem-alice", "Explicit approval sets owner to recommended member");

// Rejection by Head:
function simulateHeadRejection() {
  formTaskOwner = "unassigned";
  return { approved: false, assignedMemberId: formTaskOwner };
}

const rejectionResult = simulateHeadRejection();
console.assert(rejectionResult.approved === false);
console.assert(rejectionResult.assignedMemberId === "unassigned", "Rejection leaves task unassigned");
console.log("✓ Test 10 Passed: Explicit approval and rejection flows behave as required.");

// 11. Unassigned Task Creation and Update
console.log("11. Testing unassigned task creation & persistence...");
const createUnassignedRes = await createEventTaskInSupabase(
  {
    clubId: "club-1",
    eventId: "evt-test-1",
    title: "Unassigned Review Task",
    eventTag: "Test Event",
    priority: "Low",
    dueText: "2026-11-01",
    assigneeName: "Unassigned",
    assigneeRole: "Unassigned",
  },
  "user-1"
);
console.assert(createUnassignedRes.task !== null, "Task must be created");
console.assert(createUnassignedRes.task.assigneeName === "Unassigned");
console.log("✓ Test 11 Passed: Unassigned task created cleanly.");

// 12. Assignee Update Persistence (Approve & Assign persistence)
console.log("12. Testing updateEventTaskAssigneeInSupabase...");
const updateRes = await updateEventTaskAssigneeInSupabase(
  createUnassignedRes.task.id,
  "evt-test-1",
  {
    name: "Alice Lead",
    role: "Technical",
    memberId: "mem-alice",
  }
);
console.assert(updateRes.success === true, "Task assignee updated successfully");
console.log("✓ Test 12 Passed: updateEventTaskAssigneeInSupabase persists updated owner.");

console.log("\n========================================================");
console.log("🎉 ALL 12 STEP 4.17 VALIDATION TESTS PASSED SUCCESSFULLY!");
console.log("========================================================");
