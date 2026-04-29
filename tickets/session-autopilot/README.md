# Ultraplan — Ticket Index

Tickets for building Ultraplan in Trace. The folder name is still `session-autopilot` for continuity with the original plan, but the product scope is now session-group orchestration: episodic controller runs, sequential per-ticket worker branches in v1, and one final integration branch.

See [session-autopilot-plan.md](session-autopilot-plan.md) for the full product and engineering spec. The root-level [SESSION_AUTOPILOT_PLAN.md](../../SESSION_AUTOPILOT_PLAN.md) is the mirrored copy outside this folder.

## M0 — Contracts and Durable State

Define the durable primitives before adding orchestration behavior.

| #   | Ticket                                                                           | What it does                                                                 |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 01  | [Database Schema and Event Types](01-database-schema-and-event-types.md)         | Adds roles, Ultraplan, UltraplanTicket, ControllerRun, TicketExecution, scopes, events, and gates |
| 02  | [GraphQL Schema and Client Types](02-graphql-schema-and-client-types.md)         | Adds the GraphQL contract and generated types                                 |
| 03  | [Session Roles and Visibility](03-session-role-and-visible-filtering.md)         | Hides controller-run sessions by default and labels worker sessions correctly |

## M1 — Product Surface and Service Layer

Start, pause, resume, and observe Ultraplan from the session-group surface.

| #   | Ticket                                                                           | What it does                                                                 |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 04  | [Ultraplan Service CRUD and Controller Runs](04-autopilot-service-crud-and-state.md) | Adds `ultraplanService`, initial controller-run creation, and state transitions |
| 05  | [Group Controls and Ultraplan UI](05-header-controls-and-settings-ui.md)         | Adds session-group controls, the Ultraplan panel, and controller run timeline |
| 06  | [Client Store and Event Handling](06-client-store-and-event-handling.md)         | Adds Zustand/client-core support for Ultraplan, controller runs, and ticket executions |

## M2 — Worker Branches and Review Context

Create ticket work, run workers on isolated branches, and collect controller-run context.

| #   | Ticket                                                                             | What it does                                                               |
| --- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 07  | [Branch and Diff Runtime Commands](07-commit-diff-bridge-command.md)               | Adds read-only diff and service-owned branch integration runtime plumbing  |
| 08  | [Controller Run Context Packet Builder](08-autopilot-context-packet-builder.md)    | Builds per-run context across tickets, prior summaries, workers, checkpoints, and gates |
| 09  | [Controller Tool and Summary Contract](09-controller-prompt-and-decision-parser.md) | Defines the controller prompt, runtime actions, and required structured summary |
| 17  | [Runtime Action Wrapper and Auth Plumbing](17-runtime-action-wrapper-and-auth-plumbing.md) | Adds scoped executables and controller-run skill/instructions for actions |

## M3 — Controller Loop

Create fresh controller runs from worker lifecycle events and let them coordinate work.

| #   | Ticket                                                                     | What it does                                                              |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 10  | [Ultraplan Event Router](10-autopilot-orchestrator.md)                     | Creates controller runs on worker `done`/`failed` and gate resolution events |
| 11  | [Worker Execution Actions](11-continue-worker-execution.md)                | Lets controller runs create, start, and message ticket worker sessions    |
| 12  | [Human Gates Server Flow](12-human-validation-handoff-server.md)           | Creates and resolves Ultraplan inbox gates                                |
| 14  | [Guardrails, Pause, and Sequencing](14-guardrails-pause-and-cooldowns.md)  | Adds loop protection, dedupe, sequential scheduling, and pause semantics  |

## M4 — Human UX and Integration

Make the workflow understandable and produce one final branch.

| #   | Ticket                                                                     | What it does                                                              |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 13  | [Human Gate Inbox UI](13-human-validation-inbox-web-ui.md)                 | Renders Ultraplan gates in the inbox                                      |
| 15  | [Integration, Telemetry, and Polish](15-telemetry-error-states-and-polish.md) | Integrates approved branches, surfaces errors, and adds metrics         |

## Post-V1 Follow-ups

Useful once the core loop is stable.

| #   | Ticket                                                                                     | What it does                                                                 |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 16  | [Controller Debugging and Playbook Expansion](16-playbook-expansion-and-debug-followups.md) | Adds richer playbooks, controller-run inspection, and future DAG scheduling   |

## Dependency Graph

```text
M0 — Contracts and Durable State
01 Database Schema and Event Types
├─ 02 GraphQL Schema and Client Types
└─ 03 Session Roles and Visibility

M1 — Product Surface and Service Layer
04 Ultraplan Service CRUD and Controller Runs  (needs 01, 02, 03)
├─ 06 Client Store and Event Handling  (needs 02, 04)
└─ 05 Group Controls and Ultraplan UI  (needs 02, 04, 06 for event-driven status/timeline hydration)

M2 — Worker Branches and Review Context
07 Branch and Diff Runtime Commands  (needs 01, 04)
├─ 08 Controller Run Context Packet Builder  (needs 04, 07)
├─ 17 Runtime Action Wrapper and Auth Plumbing  (needs 04)
└─ 09 Controller Tool and Summary Contract  (needs 08, 17)

M3 — Controller Loop
10 Ultraplan Event Router  (needs 04, 08, 09, 17)
├─ 11 Worker Execution Actions  (needs 10)
├─ 12 Human Gates Server Flow  (needs 10)
└─ 14 Guardrails, Pause, and Sequencing  (needs 11, 12)

M4 — Human UX and Integration
13 Human Gate Inbox UI  (needs 06, 12)
└─ 15 Integration, Telemetry, and Polish  (needs 07, 11, 12, 13, 14)

Post-V1
16 Controller Debugging and Playbook Expansion  (needs 15)
```

## Implementation Parallelization Notes

- Diff-only parts of `07 Branch and Diff Runtime Commands` can start once contracts are settled, but service-owned integration commands should wait for ticket 04.
- The composer-start portion of `05 Group Controls and Ultraplan UI` can run after ticket 04 lands, but its visible event-driven status/timeline surface depends on `06 Client Store and Event Handling`.
- `11 Worker Execution Actions` and `12 Human Gates Server Flow` can run in parallel after ticket 10 lands.
- Ticket 13 should wait for the server-side gate payload in ticket 12.
- Ticket 15 should wait until branch integration behavior and gate UX are both defined.

## Plan Coverage Matrix

Every actionable requirement in [session-autopilot-plan.md](session-autopilot-plan.md) has an owning ticket. If the plan changes, update this matrix and the relevant ticket in the same change.

| Plan area | Owning tickets |
| --- | --- |
| Summary, goals, non-goals, Trace-native service/event boundaries | 01, 02, 04, 10, 14 |
| Session group as Ultraplan workspace and final integration target | 01, 04, 05, 07, 11, 15 |
| Episodic controller runs, fresh controller-run sessions, summaries, and transcript links | 01, 02, 03, 04, 05, 08, 09, 10 |
| Controller runtime actions, scoped executable auth, and controller skill/instructions | 04, 09, 10, 14, 17 |
| Worker sessions, ticket branches/worktrees, sequential v1 execution | 01, 03, 07, 10, 11, 14 |
| Tickets as planning primitives, acceptance criteria, test plans, dependencies, and `UltraplanTicket` membership | 01, 02, 06, 08, 09, 11 |
| Ticket execution runtime state and review/integration lifecycle | 01, 02, 06, 08, 10, 11, 12, 14, 15 |
| Workspace identity separation between group integration workspace and ticket execution workspaces | 01, 04, 07, 11, 14 |
| Inbox gates and human handoff payloads | 01, 02, 06, 12, 13, 14, 15 |
| GraphQL contract and generated client/server types | 02 |
| Event scope, event types, event snapshots, and Zustand/client hydration | 01, 02, 06, 10, 12, 15 |
| Wakeup rules, dedupe, serialization, pause/resume, and cooldown guardrails | 10, 14 |
| Branch diff, merge/rebase/cherry-pick integration, conflict reporting | 07, 12, 15 |
| Session-group UI, Ultraplan panel, controller timeline, worker metadata | 03, 05, 06, 13 |
| Runtime/bridge updates for controller env, worker worktrees, diffs, and integration | 07, 11, 17 |
| Rollout and testing strategy | 01 through 17 |
| Post-v1 playbooks, debugging, native tool-calling revisit, mobile/future DAG surfaces | 16 |

## Scope Guardrails

The intended v1 is:

- one active Ultraplan per session group
- planned tickets are linked through `UltraplanTicket` before execution
- Ultraplan activity uses canonical `ScopeType.ultraplan`
- episodic controller runs, not a persistent god session
- each controller run creates a fresh session/chat
- controller-run sessions perform actions through scoped runtime executables
- controller-run prompts include a skill/instructions file for those executables
- every controller run emits a structured summary event
- controller run summaries are visible in the Ultraplan UI
- full controller run chats are available by click-through
- worker sessions on per-ticket branches/worktrees
- group integration workspace and ticket execution workspaces are separate
- v1 runs one worker ticket at a time
- ticket dependencies are stored as edges so v2 can support DAG scheduling
- inbox-backed human gates
- service-owned branch integration into the group branch
- one final group branch for user QA and merge
- no autonomous merge into the repository default branch
- no direct DB/event writes from agents
- no wakeups on every token or `session_output`
- no v1 parallel worker execution

If the plan changes, update the relevant ticket and this index in the same change.
