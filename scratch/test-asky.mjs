async function testAskyAPI() {
  const context = {
    event: {
      id: "ev-hackathon-2026",
      title: "36h AI Campus Hackathon",
      category: "Hackathon",
      date: "2026-10-15",
      time: "09:00 AM",
      location: "Student Innovation Center, Hall A",
      status: "Planning",
      rsvpCount: 142,
      capacity: 200,
      leadName: "Alex Rivera",
      leadRole: "Lead Organizer",
      budgetAllocated: 5000,
      budgetSpent: 1850,
    },
    tasks: [
      {
        id: "t-1",
        title: "Submit sound permit appeal to Student Life",
        priority: "Urgent",
        dueText: "2026-09-10",
        deadline: "2026-09-10",
        assigneeName: "Priya Sharma",
        assigneeRole: "Logistics",
        status: "Todo",
        completed: false,
      },
      {
        id: "t-2",
        title: "Finalize Hackathon Catering Contract",
        priority: "High",
        dueText: "2026-09-25",
        deadline: "2026-09-25",
        assigneeName: "David Kim",
        assigneeRole: "Logistics",
        status: "In Progress",
        completed: false,
      },
      {
        id: "t-3",
        title: "Publish Instagram teaser reel",
        priority: "Medium",
        dueText: "2026-09-22",
        deadline: "2026-09-22",
        assigneeName: "David Kim",
        assigneeRole: "Marketing",
        status: "In Progress",
        completed: false,
      },
      {
        id: "t-4",
        title: "Deploy registration portal check-in app",
        priority: "High",
        dueText: "2026-09-28",
        deadline: "2026-09-28",
        assigneeName: "David Kim",
        assigneeRole: "Technical",
        status: "In Progress",
        completed: false,
      }
    ],
    teamMembers: [
      { id: "m-1", name: "Priya Sharma", role: "Logistics", email: "priya@campus.edu" },
      { id: "m-2", name: "David Kim", role: "Technical", email: "david@campus.edu" },
      { id: "m-3", name: "Alex Rivera", role: "Lead", email: "alex@campus.edu" }
    ],
    workloads: [
      { memberName: "David Kim", activeCount: 3, completedCount: 1, overdueCount: 0, workloadState: "High" },
      { memberName: "Priya Sharma", activeCount: 1, completedCount: 2, overdueCount: 1, workloadState: "Medium" },
      { memberName: "Alex Rivera", activeCount: 0, completedCount: 4, overdueCount: 0, workloadState: "Low" }
    ],
    risks: [
      {
        id: "risk-1",
        type: "OVERDUE_TASK",
        title: 'Overdue Task: "Submit sound permit appeal to Student Life"',
        severity: "High",
        description: "This task was scheduled for 2026-09-10 and has expired.",
        evidence: "Assigned to Priya Sharma. Priority: Urgent."
      },
      {
        id: "risk-2",
        type: "OVERLOADED_MEMBER",
        title: "High Workload: David Kim",
        severity: "Medium",
        description: "David has 3 active tasks across logistics, marketing, and tech.",
        evidence: "3 active tasks."
      }
    ]
  };

  const testQuestions = [
    "What tasks are currently overdue?",
    "Who has the highest workload?",
    "What risks should I be aware of?"
  ];

  for (const q of testQuestions) {
    console.log("==================================================");
    console.log(`TEST QUESTION: "${q}"`);
    console.log("==================================================");

    const res = await fetch("http://localhost:3000/api/asky/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: q, context }),
    });

    const data = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(`Used Fallback: ${data.usedFallback}`);
    console.log("Answer:\n" + data.answer);
    console.log("\n");
  }

  // Also test empty prompt validation
  console.log("==================================================");
  console.log('TEST EMPTY PROMPT VALIDATION: ""');
  console.log("==================================================");
  const emptyRes = await fetch("http://localhost:3000/api/asky/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "   ", context }),
  });
  const emptyData = await emptyRes.json();
  console.log(`Status: ${emptyRes.status} (Expected: 400)`);
  console.log(`Response Error: ${emptyData.error}`);
}

testAskyAPI().catch(console.error);
