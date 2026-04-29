# Ultraplan Session Orchestration RFC

## Summary

Ultraplan is a session-group orchestration mode for turning a large goal into a ticket graph, running worker sessions against ticket-specific branches, and integrating approved work into one final session-group branch.

The core idea is:

- A session group owns the shared integration branch and final testable worktree.
- A special controller session lives inside that same session group.
- The controller wakes on meaningful worker events, especially worker `agentStatus` transitions to `done` or `failed`.
- The controller creates and manages tickets through Trace services.
- Worker sessions execute tickets on their own branches/worktrees.
- Human decisions happen through inbox items.
- Approved ticket branches are integrated into the group branch by the service layer.

The final product should feel like a staff engineer coordinating a feature branch: decomposing the work, launching agents, reviewing their output, asking the human at the right gates, and producing one branch the user can test and merge.

## Product Thesis

Trace should not treat chat, tickets, coding sessions, reviews, and human approvals as separate systems. They are events in one workspace.

Ultraplan applies that thesis to multi-step development:

- the user states a broad goal once
- the controller session turns it into tickets
- worker sessions execute those tickets autonomously
- the controller observes all worker outcomes
- the service layer integrates approved work into one branch
- the user is pulled in through inbox gates when judgment or QA is needed

This is not a generic workflow engine in v1. It is an AI-native development workflow centered on a session group.

## Goals

- Let a user start Ultraplan from a session group.
- Make tickets first-class units of planned work, not markdown-only artifacts.
- Keep the controller as a real Trace session with a special role.
- Let worker sessions in one group use different ticket branches.
- Keep the session group branch as the integration branch and final test target.
- Wake the controller on coarse worker lifecycle events, not token streams.
- Route human gates through inbox.
- Keep all mutations in the service layer.
- Emit events for every durable transition.
- Preserve GraphQL as a thin interface over services.

## Non-Goals

- Autonomous production deploys.
- Autonomous merge to the repository default branch.
- A general-purpose no-code workflow engine.
- Direct agent writes to the database or event store.
- Direct privileged git integration from a model process without service authorization.
- Mobile parity in v1 if mobile lacks the needed inbox/session-group surfaces.

## Core Product Model

### Session Group

The session group is the Ultraplan workspace.

It owns:

- the integration branch
- the integration worktree
- the controller session
- the worker sessions
- the ticket graph association
- the final PR/test target

The group branch is not the repository default branch. It is the final branch the user will test and merge when ready.

Example:

```text
SessionGroup
  branch: ultraplan/auth-redesign
  worktree: /trace/worktrees/ultraplan-auth-redesign

  Session(role: ultraplan_controller)
    observes group events
    uses orchestration tools

  Session(role: ticket_worker)
    ticket: login validation
    branch: ultraplan/auth-redesign/login-validation

  Session(role: ticket_worker)
    ticket: recovery flow
    branch: ultraplan/auth-redesign/recovery-flow
```

### Controller Session

The controller is a normal Trace session with a special role.

Recommended role:

```prisma
enum SessionRole {
  primary
  ticket_worker
  ultraplan_controller
}
```

The controller should:

- observe worker completion/failure
- inspect ticket state, diffs, checkpoints, and inbox gates
- decide what should happen next
- call service-backed tools
- create human gates when needed
- request branch integration when work is approved

The controller should not:

- write events directly
- write database rows directly
- run privileged git operations outside the service layer
- wake on every token or `session_output`

### Worker Sessions

Worker sessions are normal coding sessions with `role = ticket_worker`.

Each worker session should normally map to:

- one active ticket
- one ticket branch
- one isolated worktree
- one execution record

Workers can run in parallel when their tickets are independent. Parallel workers must not mutate the group integration branch directly.

### Tickets

Tickets already exist in Trace, but Ultraplan requires them to be strong planning primitives.

Tickets need enough durable structure to drive execution:

- title
- description
- status
- priority
- labels
- acceptance criteria
- dependency/order metadata
- generated-by Ultraplan metadata
- links to worker sessions and executions

Tickets should be created and updated through `ticketService`.

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

### Inbox Gates

Inbox remains the human handoff primitive.

Ultraplan should create inbox items for:

- plan approval
- ticket QA
- product judgment
- failed worker triage
- integration conflict decisions
- final branch QA

Resolving an inbox item should wake the controller or advance the relevant service state.

## Architecture Overview

```text
User
  -> Session Group UI
    -> ultraplanService.start(...)
      -> create/update Ultraplan
      -> create/reuse controller session
      -> create ticket graph
      -> emit events

Worker session lifecycle events
  -> event store
    -> ultraplan event router
      -> on worker agentStatus done/failed/stopped
      -> enqueue controller wakeup

Controller session
  -> receives compact event/context packet
  -> calls service-backed tools
     - ticket.create/update/link
     - worker.start
     - worker.sendMessage
     - inbox.createGate
     - integration.mergeBranch
     - integration.rebaseBranch
     - ultraplan.markTicketReady/done/blocked

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
  ultraplan_controller
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
  id                  String           @id @default(uuid())
  organizationId      String
  sessionGroupId      String
  controllerSessionId String?
  ownerUserId         String
  status              UltraplanStatus  @default(draft)
  baseBranch          String
  planSummary         String?
  customInstructions  String?
  activeInboxItemId   String?
  lastControllerRunAt DateTime?
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt
}
```

`sessionGroupId` should be unique for the active Ultraplan v1. Historical completed plans can be handled later if needed.

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
}
```

Dependencies can be represented with a dedicated relation:

```prisma
model TicketDependency {
  ticketId           String
  dependsOnTicketId  String
  createdAt          DateTime @default(now())

  @@id([ticketId, dependsOnTicketId])
}
```

## GraphQL Contract

GraphQL should expose the durable objects, but resolvers must stay thin.

Recommended additions:

```graphql
enum SessionRole {
  primary
  ticket_worker
  ultraplan_controller
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

type Ultraplan {
  id: ID!
  sessionGroupId: ID!
  controllerSessionId: ID
  status: UltraplanStatus!
  baseBranch: String!
  planSummary: String
  customInstructions: String
  activeInboxItemId: ID
  ticketExecutions: [TicketExecution!]!
  createdAt: DateTime!
  updatedAt: DateTime!
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
  controllerTool: CodingTool!
  controllerModel: String
  controllerHosting: HostingMode!
  customInstructions: String
}

type Mutation {
  startUltraplan(input: StartUltraplanInput!): Ultraplan!
  pauseUltraplan(id: ID!): Ultraplan!
  resumeUltraplan(id: ID!): Ultraplan!
  runUltraplanControllerNow(id: ID!): Ultraplan!
  cancelUltraplan(id: ID!): Ultraplan!
}
```

## Event Model

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
  ultraplan_controller_wakeup_requested
  ultraplan_controller_ran
  ticket_execution_created
  ticket_execution_updated
  ticket_execution_ready_for_review
  ticket_execution_integration_requested
  ticket_execution_integrated
  ticket_execution_blocked
  ultraplan_human_gate_requested
}
```

Events should carry full enough snapshots for Zustand upserts without refetching.

## Controller Wakeup Rules

The v1 wakeup backbone should be worker `agentStatus` transitions.

Wake the controller when:

- a non-controller session in the group transitions to `done`
- a non-controller session in the group transitions to `failed`
- a non-controller session in the group transitions to `stopped` and has an active ticket execution
- an inbox item created by Ultraplan is resolved or dismissed
- the user manually requests `run now`

Do not wake the controller on:

- every `session_output`
- every tool call
- every token
- every checkpoint, unless there is no reliable completion event

The wakeup payload should include:

- session group id
- worker session id
- linked ticket execution id
- previous and next agent status
- latest checkpoint metadata
- branch name
- relevant inbox item id, if any

## Controller Tools

The controller should have service-backed tools, not direct DB access.

Initial tool surface:

- `ticket.create`
- `ticket.update`
- `ticket.link`
- `ultraplan.createTicketExecution`
- `ultraplan.startWorker`
- `ultraplan.sendWorkerMessage`
- `ultraplan.requestHumanGate`
- `ultraplan.markExecutionReady`
- `ultraplan.markExecutionBlocked`
- `integration.mergeTicketBranch`
- `integration.rebaseTicketBranch`
- `integration.reportConflict`

Each tool call must:

- validate organization and actor access
- enforce controller permissions
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
- dependent tickets should be based on the latest integrated group branch
- independent tickets can run in parallel from the current group branch
- conflicts create inbox gates or controller follow-up tasks

## Human Handoff

Recommended inbox item types:

- `ultraplan_plan_approval`
- `ultraplan_validation_request`
- `ultraplan_conflict_resolution`
- `ultraplan_final_review`

Inbox payloads should include:

- ultraplan id
- ticket id, when applicable
- ticket execution id, when applicable
- session group id
- worker session id, when applicable
- branch name
- checkpoint sha
- summary
- recommended action
- QA checklist
- links to session, diff, and PR

## Screen-Level Product Experience

### Session Group Header

Add:

- `Ultraplan` button
- status chip
- run/pause/resume actions
- controller visibility/debug entry point

The product surface belongs at the session-group level, not only the active session header.

### Ultraplan Panel

Show:

- plan summary
- ticket graph/list
- execution status per ticket
- worker session links
- branch names
- integration status
- active human gate
- final branch/PR link

### Worker Sessions

Worker sessions should appear as normal sessions, but with clear ticket/branch metadata.

Controller sessions should be hidden from normal tab strips by default, but available from Ultraplan debug/inspector surfaces.

## State Machine

High-level Ultraplan state:

```text
draft
  -> planning
  -> waiting

waiting
  -> running          when ready executions exist
  -> needs_human      when a gate is open
  -> paused
  -> completed

running
  -> waiting          when no active worker is running
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
  -> running          if controller sends follow-up
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
- `TicketExecutionStatus`
- `IntegrationStatus`
- `Ultraplan`
- `TicketExecution`
- optional `TicketDependency`
- `Session.role`
- ticket acceptance criteria
- Ultraplan inbox item types
- Ultraplan event types

### GraphQL

- `packages/gql/src/schema.graphql`
- generated files via `pnpm gql:codegen`

Add:

- Ultraplan types
- TicketExecution types
- role/status enums
- session group `ultraplan` field
- mutations for start/pause/resume/run/cancel
- event and inbox enum values

### Server Services

Add:

- `apps/server/src/services/ultraplan.ts`
- `apps/server/src/services/ticket-execution.ts`
- `apps/server/src/services/integration.ts`

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
- dedupe controller wakeups
- serialize controller runs per session group
- route inbox gate resolutions back into Ultraplan

### Runtime and Bridge

Update bridge/session-router paths for:

- creating per-session ticket worktrees
- requesting commit diffs for worker branches
- integrating worker branches into the group branch
- reporting conflicts safely

## Rollout Plan

Recommended milestones:

1. Durable contracts: roles, Ultraplan, TicketExecution, events, inbox types.
2. Service CRUD and controller session creation.
3. Client store and group-level UI.
4. Ticket graph and worker session launch.
5. Controller wakeup on worker `done`/`failed`.
6. Context packet and controller tool contract.
7. Human gates through inbox.
8. Integration branch operations.
9. Guardrails, telemetry, and polish.

## Testing Strategy

Test at four levels:

- service tests for state transitions and authorization
- event-router tests for wakeup filtering and dedupe
- integration tests for branch/worktree operations
- UI tests for group panel, inbox gates, and event hydration

Critical scenarios:

- start Ultraplan creates/reuses controller session
- generated tickets become durable Trace tickets
- worker completion wakes controller once
- worker failure wakes controller once
- controller can launch a worker for a ticket
- inbox gate halts execution until resolved
- approved ticket branch integrates into group branch
- conflict creates a gate instead of corrupting the integration branch
- final group branch contains integrated ticket work

## Recommended Decision

Build Ultraplan as a Trace-native orchestration layer, not as a wrapper around sessions.

The clean v1 is:

- one Ultraplan per active session group
- one special controller session inside the group
- ticket-worker sessions with per-ticket branches
- controller wakeups on worker `agentStatus` completion/failure
- service-backed controller tools
- inbox-backed human gates
- one group integration branch as the final test/merge target
