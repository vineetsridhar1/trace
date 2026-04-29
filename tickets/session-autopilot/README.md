# Ultraplan — Ticket Index

Tickets for building Ultraplan in Trace. The folder name is still `session-autopilot` for continuity with the original plan, but the product scope is now session-group orchestration: one controller session, sequential per-ticket worker branches in v1, and one final integration branch.

See [session-autopilot-plan.md](session-autopilot-plan.md) for the full product and engineering spec. The root-level [SESSION_AUTOPILOT_PLAN.md](../../SESSION_AUTOPILOT_PLAN.md) is the mirrored copy outside this folder.

## M0 — Contracts and Durable State

Define the durable primitives before adding orchestration behavior.

| #   | Ticket                                                                           | What it does                                                                 |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 01  | [Database Schema and Event Types](01-database-schema-and-event-types.md)         | Adds roles, Ultraplan, TicketExecution, dependency edges, events, and gates   |
| 02  | [GraphQL Schema and Client Types](02-graphql-schema-and-client-types.md)         | Adds the GraphQL contract and generated types                                 |
| 03  | [Session Roles and Visibility](03-session-role-and-visible-filtering.md)         | Hides controller sessions by default and labels worker sessions correctly     |

## M1 — Product Surface and Service Layer

Start, pause, resume, and observe Ultraplan from the session-group surface.

| #   | Ticket                                                                           | What it does                                                                 |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 04  | [Ultraplan Service CRUD and State](04-autopilot-service-crud-and-state.md)       | Adds `ultraplanService`, controller session creation, and state transitions   |
| 05  | [Group Controls and Ultraplan UI](05-header-controls-and-settings-ui.md)         | Adds session-group controls and the initial Ultraplan panel                   |
| 06  | [Client Store and Event Handling](06-client-store-and-event-handling.md)         | Adds Zustand/client-core support for Ultraplan and ticket executions          |

## M2 — Worker Branches and Review Context

Create ticket work, run workers on isolated branches, and collect review context.

| #   | Ticket                                                                             | What it does                                                               |
| --- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 07  | [Branch and Diff Runtime Commands](07-commit-diff-bridge-command.md)               | Adds read-only diff and service-owned branch integration runtime plumbing  |
| 08  | [Ultraplan Context Packet Builder](08-autopilot-context-packet-builder.md)         | Builds controller context across ordered tickets, workers, checkpoints, and gates |
| 09  | [Controller Prompt and Tool Contract](09-controller-prompt-and-decision-parser.md) | Defines the controller prompt and service-backed tool contract             |

## M3 — Controller Loop

Wake the controller from worker lifecycle events and let it coordinate work.

| #   | Ticket                                                                     | What it does                                                              |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 10  | [Ultraplan Event Router](10-autopilot-orchestrator.md)                     | Wakes the controller on worker `done`/`failed` and gate resolution events |
| 11  | [Worker Execution Actions](11-continue-worker-execution.md)                | Lets the controller create, start, and message ticket worker sessions     |
| 12  | [Human Gates Server Flow](12-human-validation-handoff-server.md)           | Creates and resolves Ultraplan inbox gates                                |
| 14  | [Guardrails, Pause, and Sequencing](14-guardrails-pause-and-cooldowns.md) | Adds loop protection, dedupe, sequential scheduling, and pause semantics  |

## M4 — Human UX and Integration

Make the workflow understandable and produce one final branch.

| #   | Ticket                                                                     | What it does                                                              |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 13  | [Human Gate Inbox UI](13-human-validation-inbox-web-ui.md)                 | Renders Ultraplan gates in the inbox                                      |
| 15  | [Integration, Telemetry, and Polish](15-telemetry-error-states-and-polish.md) | Integrates approved branches, surfaces errors, and adds metrics        |

## Post-V1 Follow-ups

Useful once the core loop is stable.

| #   | Ticket                                                                                     | What it does                                                                 |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 16  | [Controller Debugging and Playbook Expansion](16-playbook-expansion-and-debug-followups.md) | Adds richer playbooks and controller inspection surfaces                      |
| 17  | [Runtime Action Wrapper and Auth Plumbing](17-runtime-action-wrapper-and-auth-plumbing.md) | Adds scoped runtime-issued service actions for more direct controller tooling |

## Dependency Graph

```text
M0 — Contracts and Durable State
01 Database Schema and Event Types
├─ 02 GraphQL Schema and Client Types
└─ 03 Session Roles and Visibility

M1 — Product Surface and Service Layer
04 Ultraplan Service CRUD and State  (needs 01, 02, 03)
├─ 05 Group Controls and Ultraplan UI  (needs 02, 04)
└─ 06 Client Store and Event Handling  (needs 02, 04)

M2 — Worker Branches and Review Context
07 Branch and Diff Runtime Commands
├─ 08 Ultraplan Context Packet Builder  (needs 04, 07)
└─ 09 Controller Prompt and Tool Contract  (needs 08)

M3 — Controller Loop
10 Ultraplan Event Router  (needs 04, 08, 09)
├─ 11 Worker Execution Actions  (needs 10)
├─ 12 Human Gates Server Flow  (needs 10)
└─ 14 Guardrails, Pause, and Sequencing  (needs 11, 12)

M4 — Human UX and Integration
13 Human Gate Inbox UI  (needs 06, 12)
└─ 15 Integration, Telemetry, and Polish  (needs 07, 11, 12, 13, 14)

Post-V1
16 Controller Debugging and Playbook Expansion  (needs 15)
└─ 17 Runtime Action Wrapper and Auth Plumbing  (needs 15, 16)
```

## Implementation Parallelization Notes

- `07 Branch and Diff Runtime Commands` can run in parallel with M1 once the high-level contracts are settled.
- `05 Group Controls and Ultraplan UI` and `06 Client Store and Event Handling` can run in parallel after ticket 04 lands.
- `11 Worker Execution Actions` and `12 Human Gates Server Flow` can run in parallel after ticket 10 lands.
- Ticket 13 should wait for the server-side gate payload in ticket 12.
- Ticket 15 should wait until branch integration behavior and gate UX are both defined.

## Scope Guardrails

The intended v1 is:

- one active Ultraplan per session group
- one special controller session in the group
- worker sessions on per-ticket branches/worktrees
- v1 runs one worker ticket at a time
- ticket dependencies are stored as edges so v2 can support DAG scheduling
- controller wakeups on worker `agentStatus` transitions to `done` or `failed`
- inbox-backed human gates
- service-owned branch integration into the group branch
- one final group branch for user QA and merge
- no autonomous merge into the repository default branch
- no direct DB/event writes from agents
- no wakeups on every token or `session_output`
- no v1 parallel worker execution

If the plan changes, update the relevant ticket and this index in the same change.
