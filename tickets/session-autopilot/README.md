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

## Ticket Set

The implementation is split into 15 tickets. The count is intentionally sized around coherent implementation slices, not preserved from the old Ultraplan plan.

## D0 — Project Workspace Foundation

Users can create, view, update, and join projects. Projects become a first-class navigation surface with project-scoped events. Project runs, AI planning, ticket generation, and execution are not part of D0.

| # | Ticket | What it ships |
| --- | --- | --- |
| 01 | [Project Schema and Events](01-project-schema-events.md) | Project members, project scope/events, event payload contracts, and compatibility |
| 02 | [Project Services and GraphQL](02-project-service-graphql.md) | Service-layer project operations and typed GraphQL contract |
| 03 | [Project Client Shell](03-project-client-shell.md) | Zustand hydration, project navigation, project list, and project detail shell |

## D1 — Prompt-First Project Creation

Users can start a project by typing a goal into a focused prompt-first surface.

| # | Ticket | What it ships |
| --- | --- | --- |
| 04 | [Prompt-First Project Creation](04-prompt-first-project-creation.md) | Project-run schema/service, new project prompt screen, initial goal capture, and project planning route |

## D2 — AI Interview and Planning

The project AI interviews the user, records answers and decisions, and maintains a plan summary. This is useful before execution exists.

| # | Ticket | What it ships |
| --- | --- | --- |
| 05 | [Planning Conversation Service](05-planning-conversation-service.md) | Durable planning turns, questions, answers, decisions, risks, and summaries |
| 06 | [Planning AI Runtime](06-planning-ai-runtime.md) | Planning context packets, prompts, scoped runtime actions, and action auth |

## D3 — Durable Ticket Generation

The AI can create real tickets from the plan. Users can review and edit them in a project ticket table.

| # | Ticket | What it ships |
| --- | --- | --- |
| 07 | [Ticket Planning Model](07-ticket-planning-model.md) | Ticket acceptance criteria, test plans, dependencies, and planned-ticket membership |
| 08 | [AI Ticket Generation](08-ai-ticket-generation.md) | Prompt/action contract for turning plans into durable tickets |
| 09 | [Project Ticket Table](09-project-ticket-table.md) | Project-scoped ticket table with dependency and planning metadata |

## D4 — Manual Project Execution Links

Users can manually start sessions or session groups from project tickets and keep everything linked back to the project.

| # | Ticket | What it ships |
| --- | --- | --- |
| 10 | [Manual Execution Links](10-manual-execution-links.md) | Ticket-to-session/session-group links before autonomous orchestration exists |

## D5 — Sequential Project Orchestration

The project run can launch one worker at a time, observe lifecycle events, create controller runs, and request human review.

| # | Ticket | What it ships |
| --- | --- | --- |
| 11 | [Controller Run Foundation](11-controller-run-foundation.md) | Durable controller runs, controller sessions, summaries, and transcript links |
| 12 | [Sequential Orchestrator](12-sequential-orchestrator.md) | One-worker-at-a-time scheduler for ready project tickets |
| 13 | [Human Gates and Guardrails](13-human-gates-guardrails.md) | Inbox-backed approvals, dedupe, cooldowns, pause/resume, and loop protection |

## D6 — Integration and Final QA

Approved ticket branches integrate into a project run integration branch/session group. Conflicts route through human gates.

| # | Ticket | What it ships |
| --- | --- | --- |
| 14 | [Integration and Final QA](14-integration-final-qa.md) | Branch integration, conflict reporting, final QA, metrics, and error surfaces |

## D7 — Parallel DAG Scheduler

The scheduler can run independent ready tickets in parallel while keeping integration serialized.

| # | Ticket | What it ships |
| --- | --- | --- |
| 15 | [Parallel DAG Scheduler](15-parallel-dag-scheduler.md) | Dependency-aware parallel worker admission and debug surfaces |

## Dependency Graph

```text
D0 Project Foundation
01 Project Schema and Events
└─ 02 Project Services and GraphQL
   └─ 03 Project Client Shell

D1 Prompt-First Creation
04 Prompt-First Project Creation  (needs 01, 02, 03)

D2 AI Interview and Planning
05 Planning Conversation Service  (needs 04)
└─ 06 Planning AI Runtime  (needs 05)

D3 Durable Ticket Generation
07 Ticket Planning Model  (needs 04)
├─ 08 AI Ticket Generation  (needs 06, 07)
└─ 09 Project Ticket Table  (needs 03, 07)

D4 Manual Execution Links
10 Manual Execution Links  (needs 09)

D5 Sequential Orchestration
11 Controller Run Foundation  (needs 06)
├─ 12 Sequential Orchestrator  (needs 07, 10, 11)
└─ 13 Human Gates and Guardrails  (needs 11, 12)

D6 Integration
14 Integration and Final QA  (needs 12, 13)

D7 Parallel DAG
15 Parallel DAG Scheduler  (needs 14)
```

## Scope Guardrails

The first useful release is project foundation plus prompt-first planning. Do not block those deliverables on worker orchestration.

V1 should ship:

- project as first-class navigation/product entity
- project members
- project event scope
- prompt-first creation
- project run with initial goal
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
