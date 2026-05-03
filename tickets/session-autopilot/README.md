# Project Orchestration — Ticket Index

This ticket set replaces the old session-group Ultraplan implementation plan with a project-first roadmap.

The folder name remains `session-autopilot` for continuity with existing references. The product scope is now Project Orchestration: prompt-first project creation, AI interviewing, durable ticket planning, and later service-owned execution through sessions and session groups.

See [session-autopilot-plan.md](session-autopilot-plan.md) for the full RFC. The root-level [SESSION_AUTOPILOT_PLAN.md](../../SESSION_AUTOPILOT_PLAN.md) mirrors the same plan.

## Delivery Principles

- Every milestone should be independently useful.
- Planning and ticket generation must ship before autonomous execution.
- Project/run/ticket state must be durable service-layer state, not transcript parsing.
- Session groups are execution workspaces, not the orchestration anchor.
- Agents and humans use the same services.
- Events carry enough payload for client hydration without refetching.

## D0 — Project Foundation

Users can create, view, update, and join projects. Projects become a first-class navigation surface with project-scoped events.

| # | Ticket | What it ships |
| --- | --- | --- |
| 01 | [Project Contracts and Event Types](01-database-schema-and-event-types.md) | Project members, project scope/events, ticket planning fields, and durable project-run contracts that can be added incrementally |
| 02 | [GraphQL Schema and Client Types](02-graphql-schema-and-client-types.md) | Project/run/ticket planning GraphQL contract and generated types |
| 03 | [Project Navigation and Membership UI](03-session-role-and-visible-filtering.md) | First-class project list/detail shell and member affordances |
| 04 | [Project Service CRUD and Events](04-autopilot-service-crud-and-state.md) | Service-layer create/update/member operations that emit project events |
| 06 | [Client Store and Project Event Hydration](06-client-store-and-event-handling.md) | Zustand support for project-scoped events and project entities |

## D1 — Prompt-First Project Creation

Users can start a project by typing a goal into a focused prompt-first surface.

| # | Ticket | What it ships |
| --- | --- | --- |
| 05 | [Prompt-First Project Creation UI](05-header-controls-and-settings-ui.md) | New project prompt screen, initial goal capture, and project planning shell |

## D2 — AI Interview and Planning

The project AI interviews the user, records answers and decisions, and maintains a plan summary. This is useful before execution exists.

| # | Ticket | What it ships |
| --- | --- | --- |
| 07 | [Project Planning Conversation Service](07-commit-diff-bridge-command.md) | Service-backed planning turns, questions, answers, decisions, and summaries |
| 08 | [Planning Context Packet Builder](08-autopilot-context-packet-builder.md) | Compact context for planning/controller runs from project state and prior summaries |
| 17 | [Runtime Action Wrapper and Auth Plumbing](17-runtime-action-wrapper-and-auth-plumbing.md) | Scoped service-backed project/ticket actions for controller sessions |

## D3 — Durable Ticket Generation

The AI can create real tickets from the plan. Users can review and edit them in a project ticket table.

| # | Ticket | What it ships |
| --- | --- | --- |
| 09 | [Ticket Generation Contract](09-controller-prompt-and-decision-parser.md) | Prompt, action, and structured output contract for converting plans into tickets |
| 10 | [Project Ticket Table](10-autopilot-orchestrator.md) | Project-scoped ticket table with dependency and planning metadata |

## D4 — Manual Project Execution Links

Users can manually start sessions or session groups from project tickets and keep everything linked back to the project.

| # | Ticket | What it ships |
| --- | --- | --- |
| 11 | [Manual Execution Links](11-continue-worker-execution.md) | Ticket-to-session/session-group links before autonomous orchestration exists |

## D5 — Sequential Project Orchestration

The project run can launch one worker at a time, observe lifecycle events, create controller runs, and request human review.

| # | Ticket | What it ships |
| --- | --- | --- |
| 12 | [Project Run Controller Contracts](12-human-validation-handoff-server.md) | Durable controller runs, session roles, summaries, and lifecycle events |
| 13 | [Sequential Project Orchestrator](13-human-validation-inbox-web-ui.md) | One-worker-at-a-time scheduler for ready project tickets |
| 14 | [Human Gates, Pause, and Guardrails](14-guardrails-pause-and-cooldowns.md) | Inbox-backed approvals, dedupe, cooldowns, pause/resume, and loop protection |

## D6 — Integration and Final QA

Approved ticket branches integrate into a project run integration branch/session group. Conflicts route through human gates.

| # | Ticket | What it ships |
| --- | --- | --- |
| 15 | [Integration, Telemetry, and Polish](15-telemetry-error-states-and-polish.md) | Branch integration, conflict reporting, final QA, metrics, and error surfaces |

## D7 — Parallel DAG Scheduler

The scheduler can run independent ready tickets in parallel while keeping integration serialized.

| # | Ticket | What it ships |
| --- | --- | --- |
| 16 | [Parallel DAG Scheduler](16-playbook-expansion-and-debug-followups.md) | Dependency-aware parallel worker admission and debug surfaces |

## Dependency Graph

```text
D0 Project Foundation
01 Project Contracts and Event Types
├─ 02 GraphQL Schema and Client Types
├─ 04 Project Service CRUD and Events
├─ 06 Client Store and Project Event Hydration
└─ 03 Project Navigation and Membership UI

D1 Prompt-First Creation
05 Prompt-First Project Creation UI  (needs 02, 03, 04, 06)

D2 AI Interview and Planning
07 Project Planning Conversation Service  (needs 01, 04)
├─ 08 Planning Context Packet Builder  (needs 07)
└─ 17 Runtime Action Wrapper and Auth Plumbing  (needs 07)

D3 Durable Ticket Generation
09 Ticket Generation Contract  (needs 08, 17)
└─ 10 Project Ticket Table  (needs 02, 06, 09)

D4 Manual Execution Links
11 Manual Execution Links  (needs 10)

D5 Sequential Orchestration
12 Project Run Controller Contracts  (needs 01, 08, 17)
├─ 13 Sequential Project Orchestrator  (needs 11, 12)
└─ 14 Human Gates, Pause, and Guardrails  (needs 12, 13)

D6 Integration
15 Integration, Telemetry, and Polish  (needs 13, 14)

D7 Parallel DAG
16 Parallel DAG Scheduler  (needs 15)
```

## Scope Guardrails

The first useful release is project foundation plus prompt-first planning. Do not block those deliverables on worker orchestration.

V1 should ship:

- project as first-class navigation/product entity
- project members
- project event scope
- prompt-first creation
- planning/interview flow
- durable plan summary
- ticket generation
- project ticket table

Later releases add:

- manual execution links
- controller runs
- sequential workers
- human gates
- branch integration
- parallel DAG scheduling

If the plan changes, update the root plan, mirrored plan, index, and impacted tickets in the same change.
