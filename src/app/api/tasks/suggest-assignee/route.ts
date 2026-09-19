import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type ClubRole =
  | "Marketing"
  | "Design"
  | "Technical"
  | "Sponsorship"
  | "Logistics"
  | "Registration";

export const SUPPORTED_ROLES: ClubRole[] = [
  "Marketing",
  "Design",
  "Technical",
  "Sponsorship",
  "Logistics",
  "Registration",
];

export interface CandidateMember {
  id: string; // event_team_member id
  clubMemberId: string;
  name: string;
  role: ClubRole;
  workload: {
    activeCount: number;
    completedCount: number;
    overdueCount: number;
    workloadState: "Low" | "Medium" | "High" | "Overloaded";
    highUrgentActiveCount?: number;
  };
}

export interface SuggestAssigneeRequestBody {
  taskTitle: string;
  taskDescription?: string;
  taskPriority?: "Low" | "Medium" | "High" | "Urgent";
  teamMembers: CandidateMember[];
}

export interface AssigneeSuggestion {
  memberId: string; // clubMemberId
  memberName: string;
  role: ClubRole;
  activeCount: number;
  workloadState: "Low" | "Medium" | "High" | "Overloaded";
  reason: string;
  confidence: "low" | "medium" | "high";
}

const ROLE_KEYWORDS: Record<ClubRole, string[]> = {
  Technical: [
    "tech",
    "code",
    "dev",
    "github",
    "script",
    "bot",
    "server",
    "deploy",
    "api",
    "database",
    "software",
    "bug",
    "test",
    "backend",
    "frontend",
    "cloud",
    "audio",
    "av",
    "hardware",
    "wifi",
    "network",
  ],
  Design: [
    "design",
    "banner",
    "poster",
    "logo",
    "flyer",
    "graphic",
    "visual",
    "ui",
    "ux",
    "figma",
    "slide",
    "deck",
    "branding",
    "merch",
    "badge",
    "asset",
    "layout",
    "mockup",
  ],
  Marketing: [
    "market",
    "promo",
    "social",
    "instagram",
    "insta",
    "linkedin",
    "campaign",
    "outreach",
    "email",
    "newsletter",
    "reel",
    "post",
    "broadcast",
    "announcement",
    "photography",
    "video",
  ],
  Sponsorship: [
    "sponsor",
    "sponsorship",
    "funding",
    "grant",
    "budget",
    "partner",
    "proposal",
    "pitch",
    "company",
    "contract",
    "tier",
    "finance",
    "donor",
  ],
  Logistics: [
    "logistics",
    "venue",
    "room",
    "hall",
    "catering",
    "food",
    "beverage",
    "chair",
    "table",
    "permit",
    "permission",
    "equipment",
    "transport",
    "setup",
    "stage",
    "teardown",
    "security",
    "parking",
    "supplies",
  ],
  Registration: [
    "registration",
    "ticket",
    "rsvp",
    "checkin",
    "check-in",
    "badge",
    "attendance",
    "scan",
    "desk",
    "attendee",
    "participant",
    "form",
    "sign-up",
    "guest",
  ],
};

/**
 * Intelligent deterministic heuristic assigner when Gemini API is unavailable or unconfigured.
 */
export function computeHeuristicSuggestion(
  taskTitle: string,
  taskDescription: string | undefined,
  priority: "Low" | "Medium" | "High" | "Urgent" = "Medium",
  candidates: CandidateMember[]
): AssigneeSuggestion {
  const combinedText = `${taskTitle} ${taskDescription || ""}`.toLowerCase();

  let bestCandidate = candidates[0];
  let highestScore = -Infinity;
  let bestRoleMatches = 0;

  for (const candidate of candidates) {
    let score = 100;
    const keywords = ROLE_KEYWORDS[candidate.role] || [];
    let roleMatches = 0;

    for (const kw of keywords) {
      if (combinedText.includes(kw)) {
        roleMatches++;
      }
    }

    score += roleMatches * 40;

    // Workload penalties
    score -= candidate.workload.activeCount * 8;
    score -= candidate.workload.overdueCount * 15;

    switch (candidate.workload.workloadState) {
      case "Low":
        score += 15;
        break;
      case "Medium":
        score -= 5;
        break;
      case "High":
        score -= 30;
        break;
      case "Overloaded":
        score -= 60;
        break;
    }

    // High or Urgent tasks penalize overloaded members more heavily
    if (priority === "High" || priority === "Urgent") {
      if (candidate.workload.workloadState === "Overloaded") {
        score -= 50;
      }
      if (candidate.workload.overdueCount > 0) {
        score -= 25;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestCandidate = candidate;
      bestRoleMatches = roleMatches;
    }
  }

  // Determine confidence
  let confidence: "low" | "medium" | "high" = "medium";
  if (bestRoleMatches > 0 && (bestCandidate.workload.workloadState === "Low" || bestCandidate.workload.workloadState === "Medium")) {
    confidence = "high";
  } else if (bestCandidate.workload.workloadState === "Overloaded" || (bestRoleMatches === 0 && bestCandidate.workload.activeCount > 3)) {
    confidence = "low";
  }

  // Generate concise explanation
  let reason = "";
  if (bestRoleMatches > 0) {
    reason = `${bestCandidate.name} has relevant ${bestCandidate.role} capability with a ${bestCandidate.workload.workloadState} workload (${bestCandidate.workload.activeCount} active tasks).`;
  } else {
    reason = `${bestCandidate.name} has the lowest current workload (${bestCandidate.workload.activeCount} active tasks, ${bestCandidate.workload.workloadState} state) to take on this ${priority} task.`;
  }

  return {
    memberId: bestCandidate.clubMemberId,
    memberName: bestCandidate.name,
    role: bestCandidate.role,
    activeCount: bestCandidate.workload.activeCount,
    workloadState: bestCandidate.workload.workloadState,
    reason,
    confidence,
  };
}

export async function POST(req: Request) {
  try {
    const body: SuggestAssigneeRequestBody = await req.json();
    const { taskTitle, taskDescription, taskPriority = "Medium", teamMembers } = body;

    if (!taskTitle || !taskTitle.trim()) {
      return NextResponse.json(
        { error: "Task title is required to suggest an assignee." },
        { status: 400 }
      );
    }

    if (!Array.isArray(teamMembers) || teamMembers.length === 0) {
      return NextResponse.json(
        { error: "At least one event team member is required to suggest an assignee." },
        { status: 400 }
      );
    }

    // Validate that all candidates have supported roles
    const validCandidates = teamMembers.filter((m) =>
      SUPPORTED_ROLES.includes(m.role)
    );

    if (validCandidates.length === 0) {
      return NextResponse.json(
        { error: "No event team members found with supported roles." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    // If no Gemini API key configured, use deterministic heuristic engine directly
    if (!apiKey) {
      const suggestion = computeHeuristicSuggestion(
        taskTitle.trim(),
        taskDescription?.trim(),
        taskPriority,
        validCandidates
      );
      return NextResponse.json({
        suggestion,
        usedFallback: true,
        error: null,
      });
    }

    // Attempt calling Gemini API with server-side key
    try {
      const prompt = `You are ClubOps AI, an intelligent event team task dispatcher.
Select exactly ONE best-suited member from the candidate list below for the following task.

Task Details:
- Title: "${taskTitle.trim()}"
- Description: "${taskDescription?.trim() || "None"}"
- Priority: ${taskPriority}

Evaluation Criteria:
1. Role Capability: Match task requirements to the member's specific role (Marketing, Design, Technical, Sponsorship, Logistics, Registration).
2. Workload: Prefer members with fewer active tasks and Low/Medium workload states. Avoid Overloaded members whenever possible.
3. Overdue tasks: Deprioritize members with overdue tasks.
4. Priority: For Urgent or High priority tasks, prioritize members with capacity to deliver quickly.

Candidate Event Team Members:
${validCandidates
  .map(
    (c) =>
      `- MemberId: "${c.clubMemberId}", Name: "${c.name}", Role: "${c.role}", ActiveTasks: ${c.workload.activeCount}, OverdueTasks: ${c.workload.overdueCount}, WorkloadState: "${c.workload.workloadState}"`
  )
  .join("\n")}

Respond strictly in valid JSON format with no markdown wrappers or other text:
{
  "memberId": "<exact MemberId of selected candidate>",
  "reason": "<one concise sentence under 25 words explaining why this member was selected>",
  "confidence": "low" | "medium" | "high"
}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!geminiResponse.ok) {
        throw new Error(`Gemini API returned status ${geminiResponse.status}`);
      }

      const geminiData = await geminiResponse.json();
      const rawText =
        geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!rawText) {
        throw new Error("Empty response from Gemini API");
      }

      const parsed = JSON.parse(rawText);

      // Validate that returned memberId strictly belongs to the candidate list
      const matchedCandidate = validCandidates.find(
        (c) => c.clubMemberId === parsed.memberId
      );

      if (!matchedCandidate) {
        throw new Error(`Gemini returned invalid or unknown memberId: ${parsed.memberId}`);
      }

      const validConfidence =
        parsed.confidence === "low" ||
        parsed.confidence === "medium" ||
        parsed.confidence === "high"
          ? parsed.confidence
          : "medium";

      const suggestion: AssigneeSuggestion = {
        memberId: matchedCandidate.clubMemberId,
        memberName: matchedCandidate.name,
        role: matchedCandidate.role,
        activeCount: matchedCandidate.workload.activeCount,
        workloadState: matchedCandidate.workload.workloadState,
        reason: parsed.reason || `${matchedCandidate.name} has the best capability and workload for this task.`,
        confidence: validConfidence,
      };

      return NextResponse.json({
        suggestion,
        usedFallback: false,
        error: null,
      });
    } catch (aiError) {
      console.warn("Gemini API call failed or timed out, falling back to heuristic engine:", aiError);
      // Fallback gracefully without breaking task creation
      const fallbackSuggestion = computeHeuristicSuggestion(
        taskTitle.trim(),
        taskDescription?.trim(),
        taskPriority,
        validCandidates
      );

      return NextResponse.json({
        suggestion: fallbackSuggestion,
        usedFallback: true,
        error: null,
      });
    }
  } catch (error) {
    console.error("Error in /api/tasks/suggest-assignee:", error);
    return NextResponse.json(
      { error: "Internal server error while evaluating task assignment." },
      { status: 500 }
    );
  }
}
