# Ultraplan Session Orchestration RFC

## Summary

Ultraplan is a session-group orchestration mode for turning a large development goal into an ordered ticket plan, running ticket workers on isolated branches, and integrating approved work into one final session-group branch.

The core idea is:

- A session group owns the integration branch and final testable worktree.
- Ultraplan has a controller identity, but not one persistent controller chat.
- Every controller wakeup creates a fresh controller run/session.
- Each controller run receives a compact context packet, calls service-backed runtime executables, emits a structured summary, and ends.
- Worker sessions execute tickets on their own branches/worktrees.
- V1 runs one worker ticket at a time.
- Ticket dependencies are still stored as edges so v2 can become a real DAG scheduler.
- Human decisions happen through inbox gates.
- Approved ticket branches are integrated into the group branch by the service layer.

The final product should feel like a staff engineer coordinating a feature branch: decomposing work, launching workers, reviewing outcomes, asking the human at the right gates, and producing one branch the user can test and merge.

## Product Thesis

Trace should not treat chat, tickets, coding sessions, reviews, and human approvals as separate systems. They are events in one workspace.

Ultraplan applies that thesis to multi-step development:

- the user states a broad goal once
- episodic controller runs turn the goal into tickets and manage the workflow
- worker sessions execute tickets one at a time in v1
- controller runs review worker outcomes and update future tickets
- the service layer integrates approved work into one branch
- the user is pulled in through inbox gates when judgment or QA is needed

The controller's durable memory is not one forever-growing chat. The durable memory is Trace state:

- Ultraplan state
- tickets
- ticket dependencies
- ticket executions
- inbox gates
- controller run summaries
- event log
- linked controller run transcripts

## Goals

- Let a user start Ultraplan from a session group or as a session-start mode.
- Make tickets first-class units of planned work, not markdown-only artifacts.
- Use fresh controller runs instead of a persistent god session.
- Require each controller run to emit a structured summary.
- Let the UI show controller run summaries and link to full run chats.
- Let worker sessions in one group use different ticket branches.
- Generate an ordered ticket plan with dependency metadata, even though v1 execution is sequential.
- Keep the session group branch as the integration branch and final test target.
- Wake the controller on coarse lifecycle events, not token streams.
- Route human gates through inbox.
- Keep all mutations in the service layer.
- Let controller-run sessions perform actions through scoped executables that call the server.
- Emit events for every durable transition.
- Preserve GraphQL as a thin interface over services.

## Non-Goals

- Autonomous production deploys.
- Autonomous merge to the repository default branch.
- True parallel worker execution in v1.
- A general-purpose no-code workflow engine.
- A permanent controller chat that is resumed forever.
- Direct agent writes to the database or event store.
- Direct privileged git integration from a model process without service authorization.
- Mobile parity in v1 if mobile lacks the needed inbox/session-group surfaces.

## Core Product Model

### Session Group

The session group is the Ultraplan workspace.

It owns:

- the integration branch
- the integration worktree
- the worker sessions
- the ordered ticket plan association through `UltraplanTicket`
- the controller run history
- the final PR/test target

The group branch is not the repository default branch. It is the final branch the user will test and merge when ready.

Example:

```text
SessionGroup
  branch: ultraplan/auth-redesign
  worktree: /trace/worktrees/ultraplan-auth-redesign

  Ultraplan
    ordered tickets
    controller runs
    active inbox gate

  Session(role: ticket_worker)
    ticket: login validation
    branch: ultraplan/auth-redesign/login-validation

  Session(role: ultraplan_controller_run)
    run: reviewed login validation
    summary: tests passed, ready for integration
```

### Controller Runs

The controller is episodic.

There is not one controller session that keeps accumulating context forever. Instead:

1. A meaningful event happens.
2. The Ultraplan event router creates a controller run.
3. The run creates a fresh controller session/chat.
4. The run receives the current context packet.
5. The controller calls service-backed runtime executables.
6. The controller emits a required structured summary.
7. The run completes.

Each run should be inspectable:

- summary in the Ultraplan activity timeline
- link to full controller run chat
- actions and decisions in event payloads

Recommended session role:

```prisma
enum SessionRole {
  primary
  ticket_worker
  ultraplan_controller_run
}
```

The controller run should:

- inspect ticket state, worker outcomes, diffs, checkpoints, and inbox gates
- update current and future tickets through services
- decide the next action
- create human gates when needed
- request branch integration when work is approved
- summarize what it did before ending

The controller run should not:

- write events directly
- write database rows directly
- run privileged git operations outside the service layer
- wake on every token or `session_output`
- rely on an unbounded prior chat transcript as its memory

### Controller Run Summary

Every controller run must produce a structured summary.

Suggested shape:

```ts
type ControllerRunSummary = {
  title: string;
  summary: string;
  actions: Array<{
    type: string;
    targetType: "ultraplan" | "ticket" | "execution" | "inbox" | "integration";
    targetId: string;
    label: string;
  }>;
  decisions: string[];
  risks: string[];
  ticketUpdates: Array<{
    ticketId: string;
    summary: string;
  }>;
  nextStep: string | null;
};
```

The summary is used for:

- UI activity timeline
- future controller context
- auditability
- quick human scanning

The full controller chat remains available for deeper inspection.

### Worker Sessions

Worker sessions are normal coding sessions with `role = ticket_worker`.

Each worker session should normally map to:

- one active ticket
- one ticket branch
- one isolated worktree
- one execution record

V1 runs one worker session at a time. After a ticket is approved and integrated into the group branch, the next ready ticket starts from the updated group branch.

The model should still be DAG-ready:

- every ticket can have dependencies
- every execution records its base checkpoint
- the scheduler asks for the next ready ticket instead of hardcoding array position
- v1 playbooks set `executionMode = sequential` and `maxParallelWorkers = 1`

Parallel worker execution is a v2 behavior.

### Tickets

Tickets already exist in Trace, but Ultraplan requires them to be strong planning primitives.

Tickets need enough durable structure to drive execution:

- title
- description
- status
- priority
- labels
- acceptance criteria
- test or QA plan
- dependency/order metadata
- generated-by Ultraplan metadata
- links to worker sessions and executions

Controller runs must be able to update:

- the current ticket
- future tickets
- acceptance criteria
- test plans
- dependencies
- ticket comments/summaries

All ticket writes go through `ticketService`.

### Ordered Plan and Future DAG

The controller should generate a plan as dependency-aware tickets, not as freeform prose.

For v1, the dependency graph is normally a simple chain:

```text
Ticket A -> Ticket B -> Ticket C -> Ticket D
```

That gives the product a simple execution model:

```text
start worker for A
  -> review A
  -> integrate A into group branch
  -> start worker for B from updated group branch
```

The service should still store dependencies as edges so v2 can support real DAG scheduling:

```text
Ticket A
  -> Ticket B
  -> Ticket C
Ticket D depends on B and C
```

The v1 scheduler rule is:

- max active workers is `1`
- the next runnable ticket is the first unstarted ticket whose dependencies are integrated
- the group branch is updated after each integrated ticket

### Ticket Execution

`TicketExecution` is the concrete attempt to implement one ticket.

It links:

- Ultraplan
- ticket
- worker session
- session group
- ticket branch/worktree
- base checkpoint
- head checkpoint
- integration checkpoint
- review/inbox state
- artifacts

This avoids overloading `Ticket` with runtime details and avoids hiding execution state in session JSON.

### Workspace Identity

Ultraplan has two workspace identities that must not be conflated:

- group integration workspace
- ticket execution workspace

The group integration workspace belongs to the session group and final branch:

- `Ultraplan.integrationBranch`
- `Ultraplan.integrationWorkdir`
- `SessionGroup.branch`
- `SessionGroup.workdir`

Ticket execution workspaces belong to individual worker sessions and executions:

- `TicketExecution.branch`
- `TicketExecution.workdir`
- `TicketExecution.baseCheckpointSha`
- `Session.branch`
- `Session.workdir`

Worker sessions must not mirror their ticket branch/workdir back onto the session group. The session group branch/workdir is the integration target and final QA workspace.

### Inbox Gates

Inbox remains the human handoff primitive.

Ultraplan should create inbox items for:

- plan approval
- ticket QA
- product judgment
- failed worker triage
- integration conflict decisions
- final branch QA

Resolving an inbox item should trigger a fresh controller run or advance service state.

## Architecture Overview

```text
User
  -> Session Group UI
    -> ultraplanService.start(...)
      -> create/update Ultraplan
      -> create first controller run
      -> controller run creates ordered ticket plan
      -> emit events

Worker session lifecycle events
  -> event store
    -> ultraplan event router
      -> on worker agentStatus done/failed/stopped
      -> enqueue controller run

Controller run
  -> create fresh controller session
  -> receive context packet
  -> call service-backed runtime executables
     - ticket.create/update/link
     - worker.start
     - worker.sendMessage
     - inbox.createGate
     - integration.mergeBranch
     - integration.rebaseBranch
     - ultraplan.markExecutionReady/done/blocked
  -> emit structured run summary
  -> complete

Service layer
  -> validates
  -> authorizes
  -> executes
  -> writes DB
  -> appends events
  -> broadcasts updates
```

Everything important remains service-owned.

## Data Model

### SessionRole

```prisma
enum SessionRole {
  primary
  ticket_worker
  ultraplan_controller_run
}
```

### UltraplanStatus

```prisma
enum UltraplanStatus {
  draft
  waiting
  planning
  running
  needs_human
  integrating
  paused
  completed
  failed
  cancelled
}
```

### ControllerRunStatus

```prisma
enum ControllerRunStatus {
  queued
  running
  completed
  failed
  cancelled
}
```

### TicketExecutionStatus

```prisma
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

### UltraplanTicketStatus

```prisma
enum UltraplanTicketStatus {
  planned
  ready
  running
  blocked
  completed
  skipped
  cancelled
}
```

### IntegrationStatus

```prisma
enum IntegrationStatus {
  not_started
  running
  conflicted
  completed
  failed
}
```

### Ultraplan

```prisma
model Ultraplan {
  id                    String           @id @default(uuid())
  organizationId        String
  sessionGroupId        String
  ownerUserId           String
  status                UltraplanStatus  @default(draft)
  integrationBranch     String
  integrationWorkdir    String?
  playbookId            String?
  playbookConfig        Json?
  planSummary           String?
  customInstructions    String?
  activeInboxItemId     String?
  lastControllerRunId   String?
  lastControllerSummary String?
  createdAt             DateTime         @default(now())
  updatedAt             DateTime         @updatedAt

  @@unique([sessionGroupId])
}
```

`sessionGroupId` is unique in v1 because historical Ultraplans are out of scope. If history becomes a near-term requirement, replace this with a partial unique index for active plans in a migration.

### UltraplanTicket

```prisma
model UltraplanTicket {
  id             String   @id @default(uuid())
  organizationId String
  ultraplanId    String
  ticketId       String
  position       Int
  status         UltraplanTicketStatus @default(planned)
  generatedByRunId String?
  rationale      String?
  metadata       Json?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([ultraplanId, ticketId])
  @@unique([ultraplanId, position])
}
```

`UltraplanTicket` is the durable association between a plan and its planned tickets before execution. `TicketExecution` should reference tickets that are already part of the plan.

### UltraplanControllerRun

```prisma
model UltraplanControllerRun {
  id             String              @id @default(uuid())
  organizationId String
  ultraplanId    String
  sessionGroupId String
  sessionId      String?
  triggerEventId String?
  triggerType    String
  status         ControllerRunStatus @default(queued)
  inputSummary   String?
  summaryTitle   String?
  summary        String?
  summaryPayload Json?
  error          String?
  createdAt      DateTime            @default(now())
  startedAt      DateTime?
  completedAt    DateTime?
}
```

`sessionId` links to the full controller run chat. `summaryPayload` carries the structured summary shown in the UI and fed into later context packets.

### TicketExecution

```prisma
model TicketExecution {
  id                       String                @id @default(uuid())
  organizationId           String
  ultraplanId              String
  ticketId                 String
  sessionGroupId           String
  workerSessionId          String?
  branch                   String
  workdir                  String?
  status                   TicketExecutionStatus @default(queued)
  integrationStatus         IntegrationStatus     @default(not_started)
  baseCheckpointSha        String?
  headCheckpointSha        String?
  integrationCheckpointSha String?
  activeInboxItemId        String?
  lastReviewSummary        String?
  attempt                  Int                   @default(1)
  createdAt                DateTime              @default(now())
  updatedAt                DateTime              @updatedAt
}
```

### Ticket Additions

Recommended additions:

```prisma
model Ticket {
  ...
  acceptanceCriteria String[] @default([])
  testPlan           String?
}
```

Dependencies should be represented with a dedicated relation:

```prisma
model TicketDependency {
  ticketId           String
  dependsOnTicketId  String
  reason             String?
  createdAt          DateTime @default(now())

  @@id([ticketId, dependsOnTicketId])
}
```

V1 can create a linear dependency chain by making each generated ticket depend on the previous ticket. The model should not require linearity.

## GraphQL Contract

GraphQL should expose the durable objects, but resolvers must stay thin.

Recommended additions:

```graphql
enum SessionRole {
  primary
  ticket_worker
  ultraplan_controller_run
}

enum UltraplanStatus {
  draft
  waiting
  planning
  running
  needs_human
  integrating
  paused
  completed
  failed
  cancelled
}

enum ControllerRunStatus {
  queued
  running
  completed
  failed
  cancelled
}

enum UltraplanTicketStatus {
  planned
  ready
  running
  blocked
  completed
  skipped
  cancelled
}

type Ultraplan {
  id: ID!
  sessionGroupId: ID!
  status: UltraplanStatus!
  integrationBranch: String!
  integrationWorkdir: String
  playbookId: ID
  playbookConfig: JSON
  planSummary: String
  customInstructions: String
  activeInboxItemId: ID
  lastControllerRun: UltraplanControllerRun
  lastControllerSummary: String
  tickets: [UltraplanTicket!]!
  ticketExecutions: [TicketExecution!]!
  controllerRuns: [UltraplanControllerRun!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type UltraplanTicket {
  id: ID!
  ultraplanId: ID!
  ticket: Ticket!
  position: Int!
  status: UltraplanTicketStatus!
  generatedByRun: UltraplanControllerRun
  rationale: String
  metadata: JSON
  createdAt: DateTime!
  updatedAt: DateTime!
}

type UltraplanControllerRun {
  id: ID!
  ultraplanId: ID!
  sessionGroupId: ID!
  session: Session
  triggerType: String!
  status: ControllerRunStatus!
  summaryTitle: String
  summary: String
  summaryPayload: JSON
  error: String
  createdAt: DateTime!
  startedAt: DateTime
  completedAt: DateTime
}

type TicketExecution {
  id: ID!
  ultraplanId: ID!
  ticket: Ticket!
  workerSession: Session
  sessionGroupId: ID!
  branch: String!
  status: TicketExecutionStatus!
  integrationStatus: IntegrationStatus!
  baseCheckpointSha: String
  headCheckpointSha: String
  integrationCheckpointSha: String
  activeInboxItemId: ID
  lastReviewSummary: String
  attempt: Int!
  createdAt: DateTime!
  updatedAt: DateTime!
}

input StartUltraplanInput {
  sessionGroupId: ID!
  goal: String!
  controllerProvider: String!
  controllerModel: String
  controllerRuntimePolicy: JSON
  playbookId: ID
  playbookConfig: JSON
  customInstructions: String
}

type Mutation {
  startUltraplan(input: StartUltraplanInput!): Ultraplan!
  pauseUltraplan(id: ID!): Ultraplan!
  resumeUltraplan(id: ID!): Ultraplan!
  runUltraplanControllerNow(id: ID!): UltraplanControllerRun!
  cancelUltraplan(id: ID!): Ultraplan!
}
```

## Event Model

Ultraplan needs its own event scope. Add `ScopeType.ultraplan` and use it as the canonical scope for Ultraplan activity, controller runs, ticket planning, ticket executions, and human gates.

Use `session_group` only if Trace later introduces a broader group-level event history product. For v1, `ultraplan` keeps orchestration events scoped to the workflow entity.

```graphql
enum ScopeType {
  channel
  chat
  session
  ticket
  system
  ultraplan
}
```

Recommended new event types:

```graphql
enum EventType {
  ...
  ultraplan_created
  ultraplan_updated
  ultraplan_paused
  ultraplan_resumed
  ultraplan_completed
  ultraplan_failed
  ultraplan_controller_run_created
  ultraplan_controller_run_started
  ultraplan_controller_run_completed
  ultraplan_controller_run_failed
  ultraplan_ticket_created
  ultraplan_ticket_updated
  ultraplan_ticket_reordered
  ticket_execution_created
  ticket_execution_updated
  ticket_execution_ready_for_review
  ticket_execution_integration_requested
  ticket_execution_integrated
  ticket_execution_blocked
  ultraplan_human_gate_requested
}
```

All Ultraplan-related events should carry enough snapshots for Zustand upserts without refetching. That includes Ultraplan, UltraplanTicket, UltraplanControllerRun, TicketExecution, and inbox gate events.

## Controller Wakeup Rules

The v1 wakeup backbone should be worker `agentStatus` transitions and inbox gate resolution.

Create a fresh controller run when:

- a worker session in the group transitions to `done`
- a worker session in the group transitions to `failed`
- a worker session in the group transitions to `stopped` and has an active ticket execution
- an inbox item created by Ultraplan is resolved or dismissed
- the user manually requests `run now`
- Ultraplan is first started and needs an initial plan

Do not create controller runs on:

- every `session_output`
- every tool call
- every token
- every checkpoint, unless there is no reliable completion event

The run input should include:

- session group id
- Ultraplan state
- playbook and config
- ordered ticket plan
- `UltraplanTicket` metadata and positions
- current and future ticket context
- prior controller run summaries
- selected prior controller messages when useful
- worker session id, when relevant
- linked ticket execution id, when relevant
- latest checkpoint metadata
- branch name
- relevant inbox item id, when relevant
- worker final message or failure summary, when relevant
- diff summary or patch only when the run is reviewing implementation or integration

## Controller Runtime Actions

The controller run should perform actions through service-backed runtime executables, not by returning a fragile action batch and not through direct DB access.

The controller-run session should launch with scoped environment variables:

```text
TRACE_API_URL
TRACE_RUNTIME_TOKEN
TRACE_ULTRAPLAN_ID
TRACE_CONTROLLER_RUN_ID
```

The runtime should provide a narrow executable on `PATH`, such as `trace-agent`:

```bash
trace-agent ticket.create --json '{...}'
trace-agent ultraplan.addPlannedTicket --json '{...}'
trace-agent ultraplan.startWorker --json '{...}'
trace-agent integration.mergeTicketBranch --json '{...}'
```

The executable should:

- read auth and scope from the environment
- call a server endpoint
- receive machine-readable results
- print concise structured output for the model
- never write directly to the database or event store

Controller-run prompts should include a small skill/instructions file that teaches the agent how to use these executables and when to call each action.

The final structured controller response is still required for the run summary. Action execution should happen through the runtime executable surface.

Initial tool surface:

- `ticket.create`
- `ticket.update`
- `ticket.addComment`
- `ticket.updateAcceptanceCriteria`
- `ticket.updateTestPlan`
- `ticket.addDependency`
- `ticket.reorder`
- `ultraplan.addPlannedTicket`
- `ultraplan.updatePlannedTicket`
- `ultraplan.reorderPlannedTickets`
- `ultraplan.createTicketExecution`
- `ultraplan.startWorker`
- `ultraplan.sendWorkerMessage`
- `ultraplan.requestHumanGate`
- `ultraplan.markExecutionReady`
- `ultraplan.markExecutionBlocked`
- `ultraplan.completeControllerRun`
- `integration.mergeTicketBranch`
- `integration.rebaseTicketBranch`
- `integration.reportConflict`

Each tool call must:

- validate organization and actor access
- enforce controller-run permissions
- emit events
- return machine-readable results

## Branch and Worktree Model

The group branch is the integration branch.

Worker branches are ticket branches.

```text
origin/main
  -> ultraplan/my-feature                  # group branch
      -> ultraplan/my-feature/ticket-a     # worker branch
      -> ultraplan/my-feature/ticket-b     # worker branch
      -> ultraplan/my-feature/ticket-c     # worker branch
```

Rules:

- workers never directly mutate the group branch
- integration happens through service-layer merge/cherry-pick/rebase actions
- the group branch remains the final test target
- group integration workspace state must never be overwritten by ticket worker workspace state
- every v1 ticket worker should start from the latest integrated group branch
- only one worker branch should be active by default in v1
- future DAG playbooks can allow independent tickets to run in parallel from the current group branch
- conflicts create inbox gates or controller follow-up tasks

## Human Handoff

Recommended inbox item types:

- `ultraplan_plan_approval`
- `ultraplan_validation_request`
- `ultraplan_conflict_resolution`
- `ultraplan_final_review`

Inbox payloads should include:

- Ultraplan id
- controller run id, when applicable
- ticket id, when applicable
- ticket execution id, when applicable
- session group id
- worker session id, when applicable
- branch name
- checkpoint sha
- summary
- recommended action
- QA checklist
- links to session, controller run chat, diff, and PR

## Screen-Level Product Experience

### Session Group Header

Add:

- `Ultraplan` button
- status chip
- run/pause/resume actions
- controller activity/debug entry point

The product surface belongs at the session-group level.

### Ultraplan Panel

Show:

- plan summary
- ordered ticket plan/list
- execution status per ticket
- worker session links
- branch names
- integration status
- active human gate
- final branch/PR link
- controller activity timeline

### Controller Activity Timeline

Show controller run summaries as the default surface.

Example:

```text
10:12 Planned work
Created 6 tickets, ordered them sequentially, and requested plan approval.
Open chat

10:34 Reviewed Ticket 1
Worker completed schema changes. Tests passed. Marked ready for integration.
Open chat

10:48 Updated future tickets
Added auth middleware migration criteria to Ticket 3 based on Ticket 1 findings.
Open chat
```

The user should be able to click each controller run to open the full run chat.

### Worker Sessions

Worker sessions should appear as normal sessions, but with clear ticket/branch metadata.

Controller-run sessions should be hidden from normal tab strips by default, but available from controller activity/debug surfaces.

## State Machine

High-level Ultraplan state:

```text
draft
  -> planning
  -> waiting

waiting
  -> running          when the next ticket worker starts
  -> needs_human      when a gate is open
  -> paused
  -> completed

running
  -> waiting          when no worker is running
  -> needs_human      when user input is needed
  -> integrating      when approved branches are being integrated
  -> failed

integrating
  -> waiting          after integration succeeds
  -> needs_human      on conflict or QA gate
  -> failed

needs_human
  -> waiting          after gate resolution
  -> paused
  -> cancelled

paused
  -> waiting
  -> cancelled
```

Controller run state:

```text
queued
  -> running
  -> completed
  -> failed
  -> cancelled
```

Ticket execution state:

```text
queued
  -> running
  -> reviewing
  -> needs_human
  -> ready_to_integrate
  -> integrating
  -> integrated

running
  -> reviewing        on worker done
  -> failed           on worker failed
  -> blocked          on worker stopped/needs input

reviewing
  -> running          if a controller run sends follow-up
  -> needs_human
  -> ready_to_integrate
  -> blocked
```

## File-Level Implementation Map

### Prisma and Migrations

- `apps/server/prisma/schema.prisma`

Add:

- `SessionRole`
- `UltraplanStatus`
- `ControllerRunStatus`
- `TicketExecutionStatus`
- `UltraplanTicketStatus`
- `IntegrationStatus`
- `Ultraplan`
- `UltraplanTicket`
- `UltraplanControllerRun`
- `TicketExecution`
- optional `TicketDependency`
- `Session.role`
- ticket acceptance criteria
- ticket test plan
- `ScopeType.ultraplan`
- Ultraplan inbox item types
- Ultraplan event types

### GraphQL

- `packages/gql/src/schema.graphql`
- generated files via `pnpm gql:codegen`

Add:

- Ultraplan types
- UltraplanTicket types
- UltraplanControllerRun types
- TicketExecution types
- role/status enums
- session group `ultraplan` field
- mutations for start/pause/resume/run/cancel
- event and inbox enum values

### Server Services

Add:

- `apps/server/src/services/ultraplan.ts`
- `apps/server/src/services/ultraplan-controller-run.ts`
- `apps/server/src/services/ticket-execution.ts`
- `apps/server/src/services/integration.ts`
- `apps/server/src/services/runtime-action.ts`

Update:

- `apps/server/src/services/session.ts`
- `apps/server/src/services/ticket.ts`
- `apps/server/src/services/inbox.ts`
- `apps/server/src/services/event.ts`

### Event Router / Worker

Add:

- `apps/server/src/ultraplan-worker.ts`

Responsibilities:

- subscribe to org events
- filter worker `agentStatus` transitions
- create controller runs
- dedupe controller run triggers
- serialize controller runs per session group
- route inbox gate resolutions back into Ultraplan

### Runtime and Bridge

Update bridge/session-router paths for:

- creating controller-run sessions
- injecting scoped runtime action env into controller-run sessions
- making `trace-agent` or equivalent available in controller-run runtimes
- creating per-session ticket worktrees
- preserving separate group integration and ticket execution workspace identities
- requesting commit diffs for worker branches
- integrating worker branches into the group branch
- reporting conflicts safely

## Rollout Plan

Recommended milestones:

1. Durable contracts: roles, Ultraplan, ControllerRun, TicketExecution, events, inbox types.
2. Service CRUD and initial controller run creation.
3. Client store and group-level UI with controller run summaries.
4. Ordered ticket plan and worker session launch.
5. Controller run wakeup on worker `done`/`failed`.
6. Runtime action wrapper and controller skill/instructions.
7. Context packet and controller tool/summary contract.
8. Human gates through inbox.
9. Integration branch operations.
10. Guardrails, telemetry, and polish.

## Testing Strategy

Test at four levels:

- service tests for state transitions and authorization
- event-router tests for wakeup filtering and dedupe
- integration tests for branch/worktree operations
- UI tests for group panel, controller run timeline, inbox gates, and event hydration

Critical scenarios:

- start Ultraplan creates an initial controller run
- controller run creates durable tickets with acceptance criteria and test plans
- controller run completion emits a structured summary
- UI shows controller run summaries and links to full chats
- worker completion creates a new controller run once
- worker failure creates a new controller run once
- controller run can update current and future tickets
- controller run can call `trace-agent` actions with scoped runtime auth
- controller run can launch one worker for the next ready ticket
- inbox gate halts execution until resolved
- approved ticket branch integrates into group branch
- conflict creates a gate instead of corrupting the integration branch
- final group branch contains integrated ticket work

## Recommended Decision

Build Ultraplan as a Trace-native orchestration layer, not as a wrapper around sessions.

The clean v1 is:

- one Ultraplan per active session group
- episodic controller runs instead of one persistent god session
- each controller run creates a fresh session/chat
- controller runs use scoped runtime executables for actions in v1
- each controller run emits a structured summary
- UI shows controller run summaries and links to full run chats
- sequential ticket-worker sessions with per-ticket branches in v1
- controller wakeups on worker `agentStatus` completion/failure and inbox resolution
- service-backed controller tools
- inbox-backed human gates
- one group integration branch as the final test/merge target
- dependency metadata that can become a true DAG scheduler in v2
