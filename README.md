# ClubOps AI

**The AI-Powered Operating System for College Clubs & Student Organizations**

---

## 1. Project Introduction

**ClubOps AI** is a web-based, AI-assisted operating system purpose-built for college clubs, technical societies, cultural associations, and student event committees. 

College clubs are dynamic micro-organizations that run major hackathons, cultural festivals, recruitment drives, and technical workshops. However, they frequently suffer from disorganized communication channels, manual task delegation, lack of accountability, uneven workloads, and fragmented information across spreadsheets and chat apps.

ClubOps AI addresses this operational friction by providing a unified, real-time command center where club leaders and team members can manage:
- **Clubs & Workspaces:** Multi-tenant club spaces with unique join codes.
- **Members & Roles:** Clear capability-based role assignments.
- **Events:** Dedicated workspaces for planning, operations, and logistics.
- **Teams:** Event-specific rosters selected from club members.
- **Tasks & Dependencies:** Real-time task tracking with blocking dependency graphs.
- **Workload Balancing:** Live capacity monitoring to prevent burnout.
- **Operational Risks:** Rule-driven detection of bottlenecks, overdue tasks, and blocked work.
- **Meetings & Minutes:** Structured tracking of action items and decisions *(Upcoming)*.
- **Event Knowledge & Documents:** Centralized repository for guidelines and assets *(Upcoming)*.
- **AI-Assisted Operations:** Intelligent task matching and decision assistance through an AI + Human Approval workflow.

ClubOps AI is not merely a kanban board—it is an intelligent operational backbone designed to empower student leaders to execute ambitious initiatives smoothly and transparently.

---

## 2. Problem Statement

Student leaders face unique operational hurdles that standard corporate project management software fails to resolve:

1. **Manual & Inefficient Task Assignment:** Club heads spend hours figuring out who should do what, often relying on arbitrary memory or whoever responds first on WhatsApp.
2. **Unclear Responsibilities & Domain Mismatch:** Tasks are assigned without aligning to specific member specializations (e.g., assigning sponsorship outreach to a design lead).
3. **Deadlines Slip Unnoticed:** Without automated tracking, deadlines are discovered after they have already passed.
4. **Member Overload & Burnout:** A small handful of active members end up handling 80% of the tasks, while other eager members remain idle.
5. **Unassigned Critical Tasks:** High-priority items (e.g., booking an auditorium, submitting financial requisitions) fall through the cracks because nobody was designated as the owner.
6. **Hidden Dependency Blockers:** Marketing cannot launch registrations because the design banner is delayed, but nobody realizes this until event week.
7. **Reactive Risk Discovery:** Operational risks (delays, blocked pipelines) are discovered at the eleventh hour when recovery is costly or impossible.
8. **Lost Meeting Action Items:** Discussions during late-night Google Meets or Discord calls evaporate into unrecorded promises.
9. **Scattered Event Information:** Permissions letters, sponsor decks, and guidelines are scattered across personal Google Drives, lost when seniors graduate.
10. **Loss of Human Agency & Accountability:** Fully autonomous tools lack context, while manual workflows lack intelligence. Club heads need structured AI assistance with full supervisory veto power.

**How ClubOps AI Solves This:**
ClubOps AI integrates structured operational models (role classification, dependency graph validation, real-time workload scoring) with intelligent AI assistance. It brings visibility to bottlenecks early and guarantees that club heads retain full approval authority over automated recommendations.

---

## 3. Complete ClubOps AI Workflow

The complete intended operational lifecycle of ClubOps AI is structured into an end-to-end pipeline:

```text
Login / Signup
      ↓
Create Club / Join Club
      ↓
Club Members + Roles
      ↓
Create Event
      ↓
Event Workspace
      ↓
Team
      ↓
Tasks
      ↓
Dependencies + Workload
      ↓
AI Task Assignment
      ↓
Head Approval
      ↓
Risk Detection
      ↓
Risk → Action
      ↓
Meetings
      ↓
Documents / Event Knowledge
      ↓
Asky (AI Assistant)
      ↓
Inbox / Notifications
```

### Stage Breakdown

#### 1. Login / Signup
- **User Action:** The student signs up or logs in using their email and password.
- **ClubOps AI Action:** Authenticates credentials, generates a secure JWT session, and hydrates user state.
- **Technology Used:** Next.js Client Components, Supabase Auth (`@supabase/supabase-js`).

#### 2. Create Club / Join Club
- **User Action:** Club leaders create a new club (generating a unique 6-character code), or members enter an existing Club Code to join.
- **ClubOps AI Action:** Validates unique club codes, checks for duplicate memberships, creates club/member records, and sets default roles.
- **Technology Used:** Supabase PostgreSQL (`clubs`, `club_members`), Next.js App Router, TypeScript.

#### 3. Club Members + Roles
- **User Action:** Club Heads review the member roster and configure specialized member roles.
- **ClubOps AI Action:** Enforces role taxonomy (`Marketing`, `Design`, `Technical`, `Sponsorship`, `Logistics`, `Registration`) and persists permission levels.
- **Technology Used:** Supabase Database (PostgreSQL RLS), React state hooks.

#### 4. Create Event
- **User Action:** Club heads create a new event with title, description, and target date.
- **ClubOps AI Action:** Initializes an isolated event record linked to the active club in Supabase.
- **Technology Used:** Supabase Database (`events`), Next.js dynamic state.

#### 5. Event Workspace
- **User Action:** The user selects and opens a specific event.
- **ClubOps AI Action:** Renders a focused multi-tab command center (Overview, Tasks, Team, Meetings, Documents, Risks, Asky) scoped specifically to that event.
- **Technology Used:** Next.js, React, Tailwind CSS UI components.

#### 6. Team (Event Roster)
- **User Action:** Event managers add existing club members to the event-specific execution squad or remove them as needed.
- **ClubOps AI Action:** Maintains the `event_team_members` relationship table and verifies club membership boundaries.
- **Technology Used:** Supabase Database (`event_team_members`), TypeScript validation.

#### 7. Tasks
- **User Action:** Organizers create tasks with title, description, deadline, priority, status, and optional owner.
- **ClubOps AI Action:** Persists tasks in `tasks`, tracks real-time progress (`Todo`, `In Progress`, `Done`), and handles unassigned state.
- **Technology Used:** Supabase Database (`tasks`), Next.js.

#### 8. Dependencies + Workload
- **User Action:** Users assign dependencies between tasks and monitor team capacity.
- **ClubOps AI Action:** Runs graph validation algorithms to prevent self-dependencies and circular loops; automatically flags tasks as `Blocked` if prerequisites are unfinished; calculates live workload categories (`Low`, `Medium`, `High`, `Overloaded`).
- **Technology Used:** Client-side graph traversal (BFS / Cycle Detection), `src/lib/workload.ts`, `src/lib/tasks.ts`.

#### 9. AI Task Assignment
- **User Action:** The user clicks "AI Assign" on an unassigned or existing task.
- **ClubOps AI Action:** Evaluates task requirements against team member roles, active task counts, and workload capacity; queries Google Gemini 2.5 Flash (with deterministic heuristic fallback) to generate an optimal assignee recommendation and reasoning.
- **Technology Used:** Next.js Route Handler (`/api/tasks/suggest-assignee`), Google Gemini API (`@google/genai`).

#### 10. Head Approval
- **User Action:** The Club/Event Head inspects the AI's recommendation, role fit, workload status, and rationale, then clicks **"Approve & Assign"** or **"Reject"**.
- **ClubOps AI Action:** AI recommendation is **never** applied autonomously. Only upon explicit approval is the assignee persisted to the database.
- **Technology Used:** Next.js API client, Supabase PostgreSQL update transaction.

#### 11. Risk Detection
- **User Action:** Organizers open the Risks view or monitor dashboard alerts.
- **ClubOps AI Action:** The operational risk engine scans real event data to detect overdue tasks, unassigned high-priority tasks, approaching deadlines (<48h), blocked dependencies, and overloaded members.
- **Technology Used:** `src/lib/risks.ts` deterministic operational evaluation engine.

#### 12. Risk → Action *(Planned / Upcoming)*
- **User Action:** Organizers review flagged risks and choose immediate mitigation actions (e.g., "Reassign Task", "Split Workload", "Extend Deadline").
- **ClubOps AI Action:** Generates corrective actions directly converting risks into manageable tasks or state updates.
- **Technology Used:** Next.js Server Actions, Supabase Database.

#### 13. Meetings *(Planned / Upcoming)*
- **User Action:** Teams upload meeting notes or paste transcripts.
- **ClubOps AI Action:** AI parses transcripts to extract decisions, action items, assignees, and deadlines, automatically queuing them as draft tasks.
- **Technology Used:** Google Gemini API, Supabase Database.

#### 14. Documents / Event Knowledge *(Planned / Upcoming)*
- **User Action:** Teams upload event guidelines, sponsorship decks, permission letters, and budgets.
- **ClubOps AI Action:** Securely stores files and indexes their content for context-aware queries.
- **Technology Used:** Supabase Storage, Vector Embeddings.

#### 15. Asky (ClubOps AI Assistant) *(Planned / Upcoming)*
- **User Action:** Club leaders ask "Asky" natural language questions regarding event health, logistics bottlenecks, or budget status.
- **ClubOps AI Action:** Contextual assistant synthesizes tasks, risks, and event documents to provide immediate operational answers.
- **Technology Used:** Google Gemini API, Function Calling / RAG.

#### 16. Inbox / Notifications *(Planned / Upcoming)*
- **User Action:** Members and heads review pending approvals, task assignments, and urgent risk alerts.
- **ClubOps AI Action:** Aggregates real-time event updates and requests into a centralized notification feed.
- **Technology Used:** Supabase Realtime, Next.js UI.

---

## 4. Technology Mapping

| Layer / Technology | Tool / Framework | Purpose in ClubOps AI |
| :--- | :--- | :--- |
| **Frontend Framework** | **Next.js (App Router)** | Powers the modern, responsive single-page web application, dynamic layouts, and server API routes. |
| **UI Library** | **React** | Component-based interactive UI with localized state management for real-time reactivity. |
| **Language** | **TypeScript** | Strict end-to-end type safety across domain models (`Club`, `Member`, `ClubEvent`, `TaskItem`, `WorkloadSummary`, `OperationalRisk`). |
| **Styling & Design** | **Tailwind CSS** | Custom responsive styling, dark theme aesthetic, glassmorphism cards, and interactive status badges. |
| **Authentication** | **Supabase Auth** | Secure email/password authentication, persistent browser sessions, token refresh, and user credential management. |
| **Primary Database** | **Supabase PostgreSQL** | Relational cloud database hosting tables for `clubs`, `club_members`, `events`, `event_team_members`, `tasks`, and `task_dependencies`. |
| **Security & Isolation** | **PostgreSQL RLS (Row Level Security)** | Enforces strict multi-tenant data boundaries so users only access data within clubs they belong to. |
| **Artificial Intelligence** | **Google Gemini API** (`gemini-2.5-flash`) | Server-side LLM inference for evaluating task context, matching member role profiles, and generating assignment explanations. |
| **Fallback Intelligence** | **Deterministic Heuristics Engine** | Built-in zero-dependency scoring engine (`src/app/api/tasks/suggest-assignee/route.ts`) ensuring seamless functionality even without an API key. |
| **Storage (Upcoming)** | **Supabase Storage** | Object storage for event documents, sponsorship brochures, and permission receipts. |
| **Deployment** | **Vercel** | Edge-optimized continuous deployment platform hosting the Next.js web application. |
| **Version Control** | **Git & GitHub** | Distributed source code management, collaborative feature branching, and commit auditing throughout the hackathon. |

---

## 5. Core Features

### A. Authentication
- **Secure Email/Password Authentication:** Dedicated registration and login flows.
- **Session Persistence:** Retains login state across browser reloads via Supabase client session caching.
- **Logout:** Clears active sessions and resets workspace memory.

### B. Club Management
- **Create Club:** Generate a new club workspace with automatic club ownership assigned to the creator.
- **Unique Club Code:** Generates an alphanumeric 6-character code for easy sharing.
- **Join Club via Code:** Validates code, prevents duplicate memberships, and instantly enrolls students.

### C. Members & Roles
- **Roster Management:** View all members enrolled in the club.
- **Role Taxonomy:** Strict adherence to 6 operational roles:
  1. `Marketing`
  2. `Design`
  3. `Technical`
  4. `Sponsorship`
  5. `Logistics`
  6. `Registration`
- **Role Assignment:** Club Heads can reassign member roles with instant Supabase database persistence.

### D. Events
- **Event Creation:** Schedule events with name, description, date, and venue.
- **Club Isolation:** Events strictly belong to the parent club workspace.
- **Dedicated Event Workspaces:** Seamless navigation from the club overview into individual event hubs.

### E. Event Team
- **Dedicated Event Roster:** Select specific club members to form an event-specific execution squad.
- **Add / Remove Members:** Maintain team rosters without affecting overall club membership.

### F. Tasks
- **Task Tracking:** Full task schema including `Title`, `Description`, `Owner`, `Deadline`, `Priority` (`Low`, `Medium`, `High`, `Urgent`), and `Status` (`Todo`, `In Progress`, `Done`).
- **Unassigned Task Handling:** Clear visual distinction and filtering for unassigned action items.
- **Status Toggling:** Real-time updates saved directly to Supabase.

### G. Workload Calculation
- **Live Metrics Calculation:** Analyzes team members across active task count, completed tasks, overdue tasks, and urgent responsibilities.
- **Standardized Workload Thresholds:**
  - `Low`: 0 – 2 active tasks
  - `Medium`: 3 – 4 active tasks
  - `High`: 5 – 6 active tasks
  - `Overloaded`: 7+ active tasks
- **Burnout Warning:** Visual badges on the Event Team view highlight overloaded members before tasks are assigned to them.

### H. AI Task Assignment (AI + Human-in-the-Loop)
- **Intelligent Evaluation:** Analyzes task title, description, priority, and deadlines against candidate roles and active workloads.
- **Role Relevance Matching:** Intelligently maps domain keywords (e.g., "poster" → Design, "budget" → Sponsorship, "server" → Technical).
- **Workload Awareness:** Penalizes assigning tasks to already overloaded members.
- **Human Approval Gate:** Club heads review the recommendation card (Assignee, Role, Workload, Rationale, Confidence) and must explicitly click **"Approve & Assign"**. The database is **never** modified without human approval.

### I. Risk Detection *(Core Engine Implemented; UI Tab Planned)*
- **Rule-Based Engine (`src/lib/risks.ts`):** Evaluates real event data across 5 operational risk rules:
  1. `OVERDUE_TASK`: Deadline passed, status not `Done`.
  2. `UNASSIGNED_IMPORTANT_TASK`: Priority `High` or `Urgent` without an owner.
  3. `APPROACHING_DEADLINE`: Deadline within 48 hours and not `Done`.
  4. `BLOCKED_DEPENDENCY`: Task has prerequisites that are not yet `Done`.
  5. `OVERLOADED_MEMBER`: Team member has 7+ active tasks.
- **Status:** Computation engine is fully implemented in the codebase; the visual dashboard tab is designated for the next phase.

### J. Risk → Action *(Planned / Upcoming)*
- Interactive mitigation cards providing one-click actions: "Reassign", "Extend Deadline", or "Mark Resolved".

### K. Meetings *(Planned / Upcoming)*
- Structured meeting minutes interface with AI-powered action-item extraction into event tasks.

### L. Documents / Event Knowledge *(Planned / Upcoming)*
- File attachment repository powered by Supabase Storage for permits, decks, and rulebooks.

### M. Asky (ClubOps AI Assistant) *(Planned / Upcoming)*
- "Asky" is the dedicated conversational operational assistant for ClubOps AI (avoiding generic "copilot" terminology). It answers questions about event readiness, schedules, and team assignments.

### N. Inbox / Notifications *(Planned / Upcoming)*
- Real-time notification center delivering task assignments, approaching deadlines, and head approval requests.

---

## 6. AI + Human Approval Model

A core founding principle of ClubOps AI is that **AI should advise, but humans must decide**.

In student organizations, interpersonal dynamics, student availability during exams, and critical campus regulations cannot be completely captured by an algorithm. Fully autonomous bots assigning tasks create confusion and resentment.

```text
+-------------------------------------------------------------+
|                     TASK CREATION FLOW                      |
|                                                             |
|   1. Organizer creates task (Title, Priority, Deadline)     |
|                              ↓                              |
|   2. User clicks "AI Assign"                                |
|                              ↓                              |
|   3. Gemini AI analyzes:                                    |
|      - Task requirements & domain                           |
|      - Member roles & capabilities                          |
|      - Current workload counts & statuses                   |
|                              ↓                              |
|   4. AI presents Recommendation Modal                       |
|      - Recommended Member: Alex Rivera (Design)             |
|      - Workload: Medium (3 active tasks)                    |
|      - AI Reasoning: "Design role matches poster task;      |
|        workload is healthy."                                |
|                              ↓                              |
|   5. CLUB HEAD REVIEW & DECISION                            |
|        [ Approve & Assign ]          [ Reject / Dismiss ]   |
|                 ↓                              ↓            |
|       Persisted to Supabase          No database changes    |
+-------------------------------------------------------------+
```

### Why This Model is Essential:
1. **Transparency:** Every recommendation comes with clear, understandable reasoning rather than a black-box decision.
2. **Accountability:** The club head retains final supervisory responsibility for team execution.
3. **Safety & Stability:** Prevents unintended database overrides or hallucinations from altering the live operational plan.

---

## 7. System Architecture

ClubOps AI is built on a modern, decoupled cloud architecture:

```text
+---------------------------------------------------------------+
|                       CLIENT BROWSER                          |
|  Next.js 14 (React) + TypeScript + Tailwind CSS UI            |
|  - Club Management & Event Workspace                          |
|  - Real-Time Workload & Dependency Graph Logic                |
|  - AI Assignment Recommendation Modal                         |
+-------------------------------+-------------------------------+
                                |
               +----------------+----------------+
               |                                 |
               v                                 v
+-------------------------------+ +-------------------------------+
|     SUPABASE CLOUD SERVICES   | |     NEXT.JS API ROUTE         |
|                               | |  /api/tasks/suggest-assignee  |
|  - Supabase Auth (JWT)        | +---------------+---------------+
|  - PostgreSQL Database        |                 |
|    * clubs, members           |                 v
|    * events, event_teams      | +-------------------------------+
|    * tasks, dependencies      | |       GOOGLE GEMINI API       |
|  - Row Level Security (RLS)   | |       (gemini-2.5-flash)      |
+-------------------------------+ |  Role-to-Workload Analysis    |
                                  +-------------------------------+
```

### Persistence Flow:
1. Client actions trigger direct, authenticated Supabase PostgreSQL operations protected by Row Level Security.
2. AI-assisted queries flow securely through server-side Next.js route handlers (`/api/tasks/suggest-assignee`), keeping the `GEMINI_API_KEY` private.
3. Upon club head approval, the client submits the final update to Supabase.

---

## 8. Data & Security Model

ClubOps AI adheres to practical, defense-in-depth security best practices:

- **Authenticated Access:** All data views require an authenticated Supabase session. Unauthenticated users are redirected to the Auth portal.
- **Club-Level Data Isolation:** Database queries filter strictly by `club_id`. Members cannot access data from clubs they have not joined.
- **Event-Level Isolation:** Tasks, teams, and dependencies are bound by `event_id` foreign keys, preventing cross-event contamination.
- **Supabase Row Level Security (RLS):** Database policies enforce read/write limits based on verified user IDs.
- **API Secret Protection:** The Google Gemini API key is accessed exclusively in server-side Next.js route handlers and is never exposed to the client browser.
- **Supervisory Human Gates:** Critical state transitions (such as task ownership assignments) require explicit human confirmation.

---

## 9. Setup Instructions

Follow these steps to run ClubOps AI locally on your development machine:

### Prerequisites
- Node.js (v18.17.0 or later)
- npm or pnpm
- A Supabase project (free tier works perfectly)
- (Optional) A Google Gemini API key

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/clubops-ai.git
cd clubops-ai
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env.local` file in the root directory:
```bash
cp .env.example .env.local
```
*(Or create `.env.local` manually with the variables documented in Section 10).*

### 4. Run the Development Server
```bash
npm run dev
```

Open your browser and navigate to:
```text
http://localhost:3000
```

### 5. Validate Codebase
Verify strict type-checking and lint standards:
```bash
# Type check
npx tsc --noEmit

# Lint check
npm run lint
```

---

## 10. Environment Variables

ClubOps AI requires only the following environment variables in `.env.local`:

```ini
# Supabase Configuration (Required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Google Gemini AI Configuration (Optional - fallback heuristics run automatically if omitted)
GEMINI_API_KEY=your-gemini-api-key
```

> **Note on Security:** Never commit `.env.local` or any production secrets to version control. The repository includes `.env.local` in `.gitignore`.

---

## 11. Project Structure

The project follows the standard Next.js App Router structure:

```text
clubops-ai/
├── public/                     # Static assets and icons
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # Secure server-side API routes
│   │   │   └── tasks/
│   │   │       └── suggest-assignee/ # Gemini AI assignment route
│   │   ├── favicon.ico
│   │   ├── globals.css         # Global styles and Tailwind directives
│   │   ├── layout.tsx          # Root HTML layout & font configuration
│   │   └── page.tsx            # Main application controller & screen router
│   ├── components/             # Reusable UI component modules
│   │   ├── auth-screen.tsx     # Login / Signup interface
│   │   ├── club-dashboard.tsx  # Club Hub, Members roster & Events manager
│   │   ├── create-club-modal.tsx # Create Club modal dialog
│   │   ├── create-event-modal.tsx # Create Event modal dialog
│   │   ├── event-workspace.tsx # Multi-tab Event Command Center
│   │   ├── join-club-modal.tsx # Join Club via code modal dialog
│   │   └── top-nav.tsx         # Universal application navigation bar
│   └── lib/                    # Domain logic, data access, and utilities
│       ├── clubs.ts            # Supabase clubs & members persistence
│       ├── events.ts           # Supabase events & event-team persistence
│       ├── risks.ts            # Operational risk detection engine
│       ├── supabase.ts         # Supabase client initialization
│       ├── tasks.ts            # Tasks persistence & cycle detection logic
│       ├── use-auth.ts         # Authentication state hook
│       ├── utils.ts            # Styling helper utilities
│       └── workload.ts         # Team workload calculation & thresholds
├── .env.example                # Example environment configuration
├── .gitignore                  # Git ignore rules
├── AGENTS.md                   # Agent guidelines and system rules
├── package.json                # Project dependencies and npm scripts
├── postcss.config.mjs          # PostCSS configuration
├── README.md                   # Project documentation
├── tailwind.config.ts          # Tailwind CSS theme configuration
└── tsconfig.json               # TypeScript compiler options
```

---

## 12. Implementation Status

To ensure complete transparency for hackathon evaluation, features are classified strictly by their current codebase status:

### Implemented (Active & Working)
- [x] **Supabase Authentication:** Complete Email/Password login, signup, session persistence, and logout.
- [x] **Club Management:** Creating clubs, generating unique 6-character club codes, and joining clubs via code.
- [x] **Members & Roles:** Roster view with 6 standardized roles (`Marketing`, `Design`, `Technical`, `Sponsorship`, `Logistics`, `Registration`) with live role updates by the Club Head.
- [x] **Event Management:** Creating events and isolating workspaces per club in Supabase.
- [x] **Event Team Rosters:** Adding/removing existing club members into an event-specific team.
- [x] **Event Tasks:** Real-time task creation, title, deadline, priority, status toggles, and unassigned state tracking in Supabase.
- [x] **Task Dependencies:** Multi-dependency mapping with bidirectional cycle detection (preventing circular blocking chains) and automatic blocked status calculation.
- [x] **Live Workload Tracking:** Dynamic calculation of active, completed, and overdue tasks categorized into `Low`, `Medium`, `High`, and `Overloaded` tiers.
- [x] **AI Task Assignment:** Gemini 2.5 Flash route handler analyzing task requirements, member roles, and workload with deterministic heuristic fallback.
- [x] **Mandatory Human Approval Gate:** Explicit review modal where heads must approve or reject recommendations before any database assignment is persisted.
- [x] **Operational Risk Computation Engine:** Pure-function calculation engine (`src/lib/risks.ts`) supporting overdue tasks, unassigned critical tasks, upcoming deadlines, blocked dependencies, and overloaded members.

### Planned / Upcoming (Roadmap)
- [ ] **Risk Dashboard UI & Risk → Action:** Connecting `src/lib/risks.ts` directly to the Event Workspace Risks tab with one-click resolution buttons.
- [ ] **Asky (ClubOps AI Assistant):** Interactive chat interface for contextual event queries.
- [ ] **Meeting Notes & Action Item Extraction:** Parsing meeting transcripts to auto-generate draft tasks.
- [ ] **Event Knowledge & Documents:** File uploads and resource indexing via Supabase Storage.
- [ ] **Inbox & Notification Center:** Live notification drawer for pending approvals, approaching deadlines, and member alerts.
- [ ] **Contextual AI Risk Auditing:** Advanced LLM evaluation of schedule feasibility and campus policy compliance.

---

## 13. Hackathon Development

ClubOps AI is actively developed for the college hackathon submission. 

- **Repository:** Developed and maintained transparently on GitHub.
- **Engineering Philosophy:** Clean modular components, strict TypeScript typing, realistic operational workflows, and verified real-database persistence over artificial mockups.
- **Continuous Validation:** Every feature is verified through automated type-checks (`tsc`), linting (`eslint`), and live development testing.

---

## 14. Future Vision

ClubOps AI aims to become the definitive operating system for campus organizations nationwide. 

As student clubs grow in ambition—managing multi-day hackathons with thousands of attendees and six-figure budgets—the administrative overhead should not cause student burnout. In the future, ClubOps AI will:
- Automatically predict logistical bottlenecks days before they manifest.
- Provide student leaders with "Asky", a copilot that understands campus guidelines, university approval cycles, and vendor histories.
- Seamlessly transition operational knowledge from graduating seniors to incoming juniors, ensuring that no club has to reinvent the wheel each academic year.
