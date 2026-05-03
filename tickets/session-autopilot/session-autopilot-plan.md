# Project Orchestration RFC

## Summary

Project Orchestration replaces the old session-group-centered Ultraplan model with a project-first workflow for turning a broad user goal into an interview, a durable ticket plan, and eventually coordinated implementation.

The product starts from a new primitive the user understands: a project.

- A user creates a project by typing a goal into a prompt-first screen.
- Trace creates project-scoped events and starts an AI planning/interview flow.
- The AI asks clarifying questions, captures decisions, and produces durable tickets.
- Tickets are linked to the project and can be viewed in a project ticket table.
- A project run can later execute ready tickets through worker sessions and session groups.
- The orchestrator is durable service-layer state, not a magic long-lived chat.
- Controller runs and worker runs use normal Trace sessions as runtimes.

The feature must be shippable in layers. The first useful deliverable is not autonomous implementation; it is a project workspace that can interview a user and create structured tickets. Execution, DAG scheduling, parallel workers, branch integration, and advanced guardrails can ship later without invalidating the early work.

## Product Thesis

Trace should make projects the place where planning, tickets, communication, and AI-assisted development converge.

The user should not need to understand session groups, controller runs, worktrees, or DAG schedulers before getting value. They should be able to say what they want to build, refine the plan with an AI teammate, and get a clear ticket plan that humans and agents can both act on.

The architecture still follows Trace's core model:

- everything meaningful is an event
- service methods own validation, authorization, state transitions, and event creation
- agents and humans use the same service layer
- GraphQL remains a thin external interface
- sessions are runtimes and transcripts, not the source of truth
- relationships are links between peer entities, not hidden containment

## Key Decision

The orchestration anchor is `ProjectRun`, not `SessionGroup`.

```text
Project
  ProjectRun
    interview state
    ticket DAG
    controller runs
    ticket executions
    human gates
    integration policy

    SessionGroup
      integration branch/worktree
      worker sessions
      runtime terminals/checkpoints
```

The project is the durable workspace. The project run is the orchestration instance. Session groups are execution workspaces created by project runs when code needs to be run.

## Hard Decisions

These decisions are intentionally fixed for v1 so implementation tickets do not make incompatible choices.

- Project planning turns are project-scoped events. Controller or AI sessions may exist as inspectable transcripts, but they are never the canonical planning store.
- `ProjectRun` stores compact current state only: status, initial goal, plan summary, active gate pointer, latest controller summary, and execution config. Detailed planning history lives in events. Ticket ordering and dependencies live in ticket planning tables. Execution attempts live in execution tables.
- Tickets remain org-scoped peer entities. A ticket can be linked to a project, and `ProjectPlanTicket` can associate that ticket with a project run, but the ticket is not owned by the project.
- D0 does not ship prompt-first project creation or AI planning. D0 is only the durable project workspace foundation.
- Existing project actions and events must keep working during migration. New project-scoped events may be added without breaking historical `system` scoped project events.

## Goals

- Make projects a first-class product surface beside channels, sessions, and tickets.
- Let a user start a project from a prompt-first "new project" screen.
- Support project members, project events, project tickets, and project-scoped AI planning.
- Use the AI first as an interviewer and planner before autonomous execution exists.
- Create durable tickets with acceptance criteria, test plans, and dependency metadata.
- Show project tickets in a table similar to the channel session-group table.
- Preserve the ability to run a DAG orchestrator later without redesigning tickets.
- Keep orchestration state in services and durable models.
- Use sessions as runtimes for controller and worker episodes.
- Ship incremental deliverables that are useful on their own.

## Non-Goals

- Shipping full autonomous implementation in the first milestone.
- Replacing channels.
- Making session groups the project container.
- Storing plans only in markdown or chat transcripts.
- Letting agents create events or write database rows directly.
- Running true parallel ticket workers in the first execution milestone.
- Autonomous merge to the repository default branch.
- A generic workflow builder.

## Existing State

Trace already has partial project support:

- `Project` exists with `name`, `repoId`, `aiMode`, and `soulFile`.
- Projects can link channels, sessions, and tickets.
- Agents already have basic `project.create`, `project.linkEntity`, and `project.get` actions.
- Tickets can be linked to projects.

The existing model is not enough for this feature:

- projects do not have members
- project is not a canonical event scope in the schema
- project has no first-class home/detail surface
- ticket filtering is not project-first
- project planning/interview state is not durable
- orchestration is currently described around session groups

This RFC elevates project from a grouping helper into a first-class planning and orchestration workspace.

## Core Product Model

### Project

`Project` is the long-lived workspace.

It owns or links:

- members
- repo association
- project-scoped event stream
- project planning conversations
- tickets
- project runs
- linked channels
- linked sessions and session groups
- summaries and decisions

Projects remain flat org-scoped entities. A project can link to channels, sessions, tickets, and repos, but those entities do not nest inside the project in a way that prevents reuse.

### Project Member

Projects need channel-like membership.

V1 membership can be simple:

- `projectId`
- `userId`
- `role`
- `joinedAt`
- `leftAt`

The first deliverable can use project members only for visibility and UI. Fine-grained permissions can follow later.

### Project Events

Projects need their own event scope.

Add `ScopeType.project` and use project-scoped events for:

- project creation and updates
- project member changes
- planning messages or planning turns
- interview question/answer milestones
- plan summaries
- ticket plan creation and updates
- project run lifecycle
- controller run lifecycle
- human gates

Project event payloads must carry enough snapshots for client upserts without refetching.

Minimum v1 event payloads:

- `project_created`: `{ project }`
- `project_updated`: `{ project }`
- `project_member_added`: `{ projectId, member }`
- `project_member_removed`: `{ projectId, userId, leftAt }`
- `project_run_created`: `{ projectRun }`
- `project_run_updated`: `{ projectRun }`
- `project_goal_submitted`: `{ projectRun, goal }`
- `project_question_asked`: `{ projectRunId, message }`
- `project_answer_recorded`: `{ projectRunId, message }`
- `project_decision_recorded`: `{ projectRunId, decision }`
- `project_plan_summary_updated`: `{ projectRun }`
- `project_plan_ticket_created`: `{ projectPlanTicket, ticket }`
- `project_plan_ticket_updated`: `{ projectPlanTicket, ticket }`
- `ticket_dependency_created`: `{ dependency }`
- `project_controller_run_created`: `{ controllerRun }`
- `project_controller_run_started`: `{ controllerRun }`
- `project_controller_run_completed`: `{ controllerRun, projectRun }`
- `project_controller_run_failed`: `{ controllerRun, projectRun }`
- `ticket_execution_created`: `{ ticketExecution, projectRun, ticket }`
- `ticket_execution_updated`: `{ ticketExecution, projectRun, ticket }`
- `ticket_execution_integrated`: `{ ticketExecution, projectRun, ticket }`
- `project_human_gate_requested`: `{ gate, projectRun }`

Snapshots should use the same field names as generated GraphQL/client types. If a new client store slice is needed, define the event payload and Zustand upsert path in the same ticket.

### Project Planning Conversation

The prompt-first project screen should feel like a focused planning surface.

The AI's first job is not to code. Its job is to interview the user and produce a plan.

The planning flow is event-backed and should:

- accept the user's raw project goal
- ask clarifying questions
- record answers as project events
- maintain a planning summary
- identify risks and unknowns
- produce ticket drafts
- request human approval before converting or executing large plans

The durable state must not be only a transcript. If a planning session exists, it is a linked transcript and runtime context, not the source of truth. Reconstructing the planning surface from project-scoped events plus `ProjectRun` state must be possible after refresh.

### ProjectRun

`ProjectRun` is the durable orchestration instance.

It owns:

- status
- initial goal
- plan summary
- active planning gate
- links to planned tickets
- links to controller runs
- execution policy
- linked session groups
- final completion state

Recommended statuses:

```text
draft
interviewing
planning
ready
running
needs_human
paused
completed
failed
cancelled
```

V1 should allow one active project run per project. Historical runs can remain attached for auditability and retries.

The active-run invariant should be enforced in the service layer first. Add a partial unique database constraint only if the migration can represent the desired statuses cleanly.

### ProjectPlanTicket

Tickets are normal Trace tickets. `ProjectPlanTicket` is the durable association between a project run and planned tickets.

It records:

- projectRunId
- ticketId
- position
- status
- generatedByControllerRunId
- rationale
- metadata

Do not infer planned tickets only from executions. Planning and execution are separate deliverables.

### Ticket Planning Fields

Tickets need stronger planning structure:

- acceptance criteria
- test plan
- optional estimate/size
- dependency edges
- generated-by metadata

Dependencies should be general edges, not a hardcoded sequence.

```text
Ticket A
  -> Ticket B
  -> Ticket C
Ticket D depends on B and C
```

V1 can create linear dependencies. The schema should not require linearity.

Dependency rules:

- A dependency edge can only connect tickets in the same organization.
- When used inside a project run, both tickets must be linked to that run through `ProjectPlanTicket`.
- Services must reject cycles before persisting an edge.
- Readiness means every dependency is completed or integrated according to the current execution milestone.
- Cross-project dependencies are out of scope for v1.

### ProjectControllerRun

The orchestrator uses sessions but is not itself a session.

Each controller run is one thinking/action episode:

1. A project event, manual action, inbox resolution, or worker lifecycle event triggers the run.
2. The service creates a `ProjectControllerRun`.
3. The runtime creates a normal Trace session with role `project_controller_run`.
4. The controller receives a compact context packet.
5. The controller calls scoped service-backed actions.
6. The controller emits a required structured summary.
7. The run completes and the service appends events.

Durable memory lives in project state, tickets, events, summaries, gates, and executions, not in one forever-growing controller chat.

### TicketExecution

`TicketExecution` is the concrete attempt to implement one ticket.

It links:

- projectRun
- ticket
- worker session
- session group
- ticket branch/worktree
- base checkpoint
- head checkpoint
- integration checkpoint
- review state
- artifacts

Execution state must not be hidden in ticket JSON or session JSON.

### SessionGroup

A project can have multiple session groups over time.

For v1 execution:

- one active project run
- one integration session group for that run
- many worker sessions inside that group

Later, multiple session groups can support:

- multiple execution attempts
- alternate plans
- multiple repos
- parallel workstreams
- maintenance sessions linked to the project

Session groups own execution workspace details. They do not own the plan.

## UX Shape

### Project Entry Point

Add a Projects entry beside channels/tickets.

The project list should show:

- project name
- repo
- status of active run
- ticket counts
- latest activity
- members

### New Project Screen

The initial screen should be prompt-first.

The first viewport should let the user type a project goal immediately. Avoid making the user fill out a form before they can describe the project.

After submit:

- create the project
- create the first project run
- record the initial goal
- start the planning/interview flow
- navigate to the project planning surface

### Project Planning Surface

The planning surface should show:

- project prompt/interview thread
- AI clarifying questions
- captured decisions
- plan summary
- draft tickets
- approval controls

This surface can ship before execution exists.

### Project Tickets View

Project tickets should be visible in a table, reusing the existing ticket table patterns.

The table should include:

- title
- status
- priority
- assignees
- labels
- dependency readiness
- plan position
- execution state when available

Clicking a ticket should open the ticket detail panel.

### Project Run View

Once execution exists, the project run view should show:

- ticket DAG/list
- ready/running/blocked/completed tickets
- controller activity timeline
- worker sessions
- session group integration branch
- active human gates
- final QA state

## Architecture

```text
Web / Mobile / Electron
  -> GraphQL
    -> projectService
    -> projectRunService
    -> projectPlanningService
    -> ticketService
    -> ticketExecutionService
    -> projectControllerService
      -> Event Store
      -> Broker

Agent Runtime
  -> scoped runtime actions
    -> same services
```

GraphQL resolvers stay thin. Services own all business logic.

## Runtime Actions

Controller runs should act through scoped service-backed runtime actions.

Initial action surface:

- `project.get`
- `project.update`
- `project.askQuestion`
- `project.recordDecision`
- `project.summarizePlan`
- `ticket.create`
- `ticket.update`
- `ticket.addDependency`
- `projectRun.addPlannedTicket`
- `projectRun.updatePlannedTicket`
- `projectRun.requestApproval`

Execution actions can ship later:

- `projectRun.createTicketExecution`
- `projectRun.startWorker`
- `projectRun.sendWorkerMessage`
- `projectRun.markExecutionReady`
- `projectRun.markExecutionBlocked`
- `integration.mergeTicketBranch`
- `integration.reportConflict`

Each action must validate organization and actor access, mutate state through services, emit events, and return machine-readable output.

Action contracts must be defined before prompt work ships:

- typed input shape
- typed result shape
- allowed scope types
- actor authorization rule
- event emitted on success
- safe failure behavior
- whether the action can run directly or must create an inbox gate

## Incremental Delivery Strategy

The feature should ship in deliverables that stand alone.

### D0: Project Workspace Foundation

Shippable result:

Users can create, view, update, and join projects through normal services. Projects appear as first-class navigation items. Projects have members and project-scoped events. No prompt-first flow, AI planning, ticket generation, or execution is required in D0.

This provides immediate product value without AI planning.

### D1: Prompt-First Project Creation

Shippable result:

Users can create a project by typing a goal. The project stores the goal and shows a planning surface, even if the AI flow is initially basic.

### D2: AI Interview and Planning

Shippable result:

The project AI can ask clarifying questions, record answers, maintain a summary, and produce a proposed plan. No autonomous execution required.

### D3: Durable Ticket Generation

Shippable result:

The AI can create real tickets from the plan, with acceptance criteria, test plans, and dependencies. Users can view and edit those tickets in a project ticket table.

### D4: Manual Project Execution Links

Shippable result:

Users can start ordinary sessions or session groups from project tickets. Tickets, sessions, and session groups are linked back to the project. This is useful even before autonomous orchestration.

### D5: Sequential Project Orchestration

Shippable result:

A project run can launch one worker ticket at a time, observe completion, create controller runs, and request human review. This replaces the old v1 Ultraplan execution model.

### D6: Integration and Final QA

Shippable result:

Approved ticket branches integrate into a project run's integration branch/session group. Conflicts and final QA flow through inbox gates.

### D7: Parallel DAG Scheduler

Shippable result:

The scheduler can run independent ready tickets in parallel up to a configured limit. Integration remains serialized and service-owned.

## Data Model Additions

Recommended Prisma additions:

```prisma
enum SessionRole {
  primary
  project_controller_run
  ticket_worker
}

enum ProjectRunStatus {
  draft
  interviewing
  planning
  ready
  running
  needs_human
  paused
  completed
  failed
  cancelled
}

enum ProjectPlanTicketStatus {
  planned
  ready
  running
  blocked
  completed
  skipped
  cancelled
}

enum ProjectControllerRunStatus {
  queued
  running
  completed
  failed
  cancelled
}

enum TicketExecutionStatus {
  queued
  running
  reviewing
  needs_human
  ready_to_integrate
  integrating
  integrated
  blocked
  failed
  cancelled
}
```

Recommended models:

```prisma
model ProjectMember {
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  role      String   @default("member")
  joinedAt  DateTime @default(now())
  leftAt    DateTime?

  @@id([projectId, userId])
  @@index([userId])
  @@index([projectId, leftAt])
}

model ProjectRun {
  id                    String @id @default(uuid())
  organizationId        String
  projectId             String
  project               Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  status                ProjectRunStatus @default(draft)
  initialGoal           String
  planSummary           String?
  activeInboxItemId     String?
  lastControllerRunId   String?
  lastControllerSummary String?
  executionConfig       Json?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([organizationId, status])
  @@index([projectId, status])
}

model ProjectPlanTicket {
  id                       String @id @default(uuid())
  organizationId           String
  projectRunId             String
  projectRun               ProjectRun @relation(fields: [projectRunId], references: [id], onDelete: Cascade)
  ticketId                 String
  ticket                   Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  position                 Int
  status                   ProjectPlanTicketStatus @default(planned)
  generatedByControllerRunId String?
  rationale                String?
  metadata                 Json?
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  @@unique([projectRunId, ticketId])
  @@unique([projectRunId, position])
  @@index([organizationId, status])
}

model ProjectControllerRun {
  id             String @id @default(uuid())
  organizationId String
  projectRunId   String
  projectRun      ProjectRun @relation(fields: [projectRunId], references: [id], onDelete: Cascade)
  sessionId      String?
  session        Session? @relation(fields: [sessionId], references: [id], onDelete: SetNull)
  triggerEventId String?
  triggerType    String
  status         ProjectControllerRunStatus @default(queued)
  summaryTitle   String?
  summary        String?
  summaryPayload Json?
  error          String?
  createdAt      DateTime @default(now())
  startedAt      DateTime?
  completedAt    DateTime?

  @@index([organizationId, status])
  @@index([projectRunId, status])
}

model TicketDependency {
  ticketId          String
  ticket            Ticket @relation("TicketDependencyTicket", fields: [ticketId], references: [id], onDelete: Cascade)
  dependsOnTicketId String
  dependsOnTicket   Ticket @relation("TicketDependencyDependsOn", fields: [dependsOnTicketId], references: [id], onDelete: Cascade)
  reason            String?
  createdAt         DateTime @default(now())

  @@id([ticketId, dependsOnTicketId])
  @@index([dependsOnTicketId])
}
```

Ticket additions:

```prisma
model Ticket {
  ...
  acceptanceCriteria String[] @default([])
  testPlan           String?
}
```

Execution models can be added in D5/D6 rather than D0.

Schema implementation notes:

- Update `packages/gql/src/schema.graphql` as the GraphQL source of truth, then run `pnpm gql:codegen`.
- Do not duplicate generated GraphQL enums or object types in app code.
- Prisma migrations should preserve existing `Project`, `TicketProject`, `SessionProject`, and `ChannelProject` data.
- Backfill project members conservatively. Existing org admins can see projects until explicit project membership enforcement ships.
- Existing `system` scoped project-created/link events remain readable. New writes should emit project-scoped events once `ScopeType.project` exists.

## Event Model

Add `ScopeType.project`.

Recommended event families:

```text
project_created
project_updated
project_member_added
project_member_removed
project_goal_submitted
project_question_asked
project_answer_recorded
project_decision_recorded
project_plan_summary_updated
project_run_created
project_run_updated
project_run_approved
project_run_paused
project_run_resumed
project_run_completed
project_run_failed
project_plan_ticket_created
project_plan_ticket_updated
project_controller_run_created
project_controller_run_started
project_controller_run_completed
project_controller_run_failed
ticket_dependency_created
ticket_execution_created
ticket_execution_updated
ticket_execution_integrated
project_human_gate_requested
```

Events should include snapshots needed by Zustand to upsert projects, runs, tickets, planned tickets, controller runs, executions, and inbox gates.

Event compatibility:

- Do not remove support for historical `entity_linked` project payloads in the same migration that introduces project-scoped events.
- Client hydration should accept both historical project-link events and new project event families during rollout.
- Every mutating service method added by this plan must have a test asserting the emitted event payload includes enough data for a direct client upsert.

## Rollout Plan

The implementation ticket set is intentionally resized around coherent shipping slices, not preserved from the old Ultraplan ticket count.

1. Project schema, project members, and project-scoped events.
2. Project services, GraphQL, and compatibility with existing project actions.
3. Project client shell and project event hydration.
4. Prompt-first project creation and initial project-run creation.
5. Planning conversation service.
6. Planning AI runtime.
7. Ticket planning model.
8. AI ticket generation.
9. Project ticket table.
10. Manual execution links.
11. Controller run foundation.
12. Sequential orchestrator.
13. Human gates and guardrails.
14. Integration and final QA.
15. Parallel DAG scheduler.

## Testing Strategy

Test each deliverable independently.

Foundation:

- project create/update/member services
- project event hydration
- project navigation and visibility
- compatibility with historical project events

Planning:

- prompt-first project creation records the initial goal
- interview turns append project events
- plan summaries update project run state
- generated tickets have acceptance criteria and test plans
- refresh reconstructs the planning surface without transcript parsing

Tickets:

- project ticket filtering
- dependency creation
- dependency cycle rejection
- project table hydration from events

Execution:

- manual ticket-to-session linking
- controller run creation and summary persistence
- worker completion wakeup dedupe
- sequential scheduler chooses the next ready ticket
- inbox gates pause execution
- integration conflicts create gates instead of corrupting branches

Parallel:

- ready ticket selection respects dependencies
- max parallel worker limit is enforced
- integration remains serialized

## Recommended Decision

Rewrite Ultraplan as Project Orchestration.

The first release should not attempt the full autonomous loop. Ship project foundation, prompt-first creation, AI interview, and durable ticket generation first. Those are user-visible and architecturally durable. Then add manual execution links, sequential orchestration, integration, and finally parallel DAG scheduling.

This keeps the product Trace-native and avoids turning the feature into a bolted-on mega-session.
