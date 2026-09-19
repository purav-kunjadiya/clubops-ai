export interface Club {
  id: string;
  name: string;
  code: string;
  description?: string;
  createdAt: string;
  ownerId?: string;
}

export type ClubRole =
  | "Marketing"
  | "Design"
  | "Technical"
  | "Sponsorship"
  | "Logistics"
  | "Registration";

export const CLUB_ROLES: readonly ClubRole[] = [
  "Marketing",
  "Design",
  "Technical",
  "Sponsorship",
  "Logistics",
  "Registration",
] as const;

export interface ClubMember {
  id: string;
  name: string;
  email: string;
  clubId: string;
  role: ClubRole;
  joinedAt: string;
  userId?: string;
}

export interface EventTeamMember {
  id: string;
  eventId: string;
  clubMemberId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string;
  userId?: string;
}


export interface ClubEvent {
  id: string;
  clubId?: string;
  title: string;
  category: "Hackathon" | "Workshop" | "Social" | "Speaker" | "Competition";
  date: string;
  time: string;
  location: string;
  status: "On Track" | "Action Needed" | "Pending Review" | "Planning";
  rsvpCount: number;
  capacity: number;
  leadName: string;
  leadRole: string;
  leadMemberId?: string;
  budgetAllocated: number;
  budgetSpent: number;
  bannerGradient: string;
  description?: string;
  createdAt?: string;
}

export type TaskStatus = "Todo" | "In Progress" | "Done" | "Blocked";
export const TASK_STATUSES: readonly TaskStatus[] = [
  "Todo",
  "In Progress",
  "Done",
  "Blocked",
] as const;

export type TaskPriority = "Low" | "Medium" | "High" | "Urgent";
export const TASK_PRIORITIES: readonly TaskPriority[] = [
  "Low",
  "Medium",
  "High",
  "Urgent",
] as const;

export interface TaskItem {
  id: string;
  clubId?: string;
  eventId?: string;
  title: string;
  eventTag: string;
  priority: TaskPriority;
  dueText: string;
  deadline?: string;
  assigneeName: string;
  assigneeRole: string;
  assigneeMemberId?: string;
  status?: TaskStatus;
  completed: boolean;
  dependencies?: string[];
}

export type RiskType =
  | "OVERDUE_TASK"
  | "UNASSIGNED_IMPORTANT_TASK"
  | "APPROACHING_DEADLINE"
  | "BLOCKED_DEPENDENCY"
  | "OVERLOADED_MEMBER";

export type RiskSeverity = "Low" | "Medium" | "High" | "Critical";

export type RiskStatus = "Open" | "Resolved" | "Dismissed";

export interface DerivedRisk {
  id: string;
  eventId: string;
  type: RiskType;
  title: string;
  description: string;
  severity: RiskSeverity;
  evidence: string;
  status: RiskStatus;
}

export interface RiskAlert {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  impact: string;
  suggestedAction: string;
  relatedEvent: string;
  detectedTime: string;
}

export interface MetricCardData {
  title: string;
  value: string;
  change: string;
  isPositive: boolean;
  subtitle: string;
  metricType: "events" | "tasks" | "budget" | "engagement";
}

export interface InboxItem {
  id: string;
  title: string;
  sender: string;
  time: string;
  unread: boolean;
  type: "approval" | "sponsor" | "compliance" | "ai_flag";
  summary: string;
}
