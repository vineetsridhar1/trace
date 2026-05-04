# Project Autopilot — Ticket Index

This ticket set replaces the older Project Orchestration/Ultraplan roadmap with the current Project Autopilot design.

The folder name remains `session-autopilot` for continuity. The product direction is now:

- Deliverable 0: prompt to plan to durable tickets.
- Orchestration phase: sequential ticket execution driven by explicit normal coding-tool orchestrator episodes and playbooks.
- No ambient agent involvement.

See [session-autopilot-plan.md](session-autopilot-plan.md) for the full plan. The root-level [SESSION_AUTOPILOT_PLAN.md](../../SESSION_AUTOPILOT_PLAN.md) mirrors the same plan.

## Delivery Principles

- D0 must ship the complete planning-to-ticket flow.
- Planning chat uses a normal project-linked session.
- Ticket generation happens after the user confirms the plan.
- Generated tickets are DB records created through services/CLI.
- Orchestration is episodic: lifecycle event in, normal coding-tool session out.
- Playbooks guide orchestrator behavior; they are not hardcoded workflow branches.
- Start sequentially. Do not add parallel scheduling until the default loop works well.
- Services own state changes and event creation. GraphQL, CLI, and agent tools stay thin.
- Events must carry enough full entity state for Zustand to update without mutation-result-driven state.
- Ticket generation, execution startup, and orchestrator episode creation must be idempotent.
- Core orchestration must stay adapter-neutral; Claude Code can be an initial coding-tool adapter, not a core dependency.

## Deliverable 0 — Planning To Tickets

| # | Ticket | What it ships |
| --- | --- | --- |
| 01 | [Planning Workspace](01-planning-workspace.md) | Prompt-first project creation, normal planning session, split plan/chat UI |
| 02 | [Plan Approval And Ticket Generation](02-plan-approval-ticket-generation.md) | Next action, plan persistence, structured AI ticket drafts, linked tickets |
| 03 | [Project Ticket List](03-project-ticket-list.md) | Project detail ticket list from durable project-linked tickets |

## Orchestration Foundation

| # | Ticket | What it ships |
| --- | --- | --- |
| 04 | [Ticket Execution Lifecycle](04-ticket-execution-lifecycle.md) | One-ticket-at-a-time execution sessions and lifecycle events |
| 05 | [Playbook Model](05-playbook-model.md) | Durable playbooks and default review/QA/PR playbook |
| 06 | [Orchestrator Episode Runtime](06-orchestrator-episode-runtime.md) | New normal coding-tool session per lifecycle event |
| 07 | [Orchestrator Context Packet](07-orchestrator-context-packet.md) | Project, ticket, session, diff, history, event, and playbook context |
| 08 | [Orchestrator Action Surface](08-orchestrator-action-surface.md) | Explicit service/CLI actions for messages, inbox, sessions, tickets, PRs, merges |
| 09 | [Default Playbook Loop](09-default-playbook-loop.md) | Sequential implement/review/fix/QA/PR/merge loop |
| 10 | [Orchestration UI And Inbox](10-orchestration-ui-inbox.md) | Progress, decisions, linked sessions, inbox gates, pause/resume/cancel |

## Dependency Order

```text
D0 Planning To Tickets
01 Planning Workspace
└─ 02 Plan Approval And Ticket Generation
   └─ 03 Project Ticket List

Orchestration Foundation
04 Ticket Execution Lifecycle  (needs 03)
├─ 05 Playbook Model
├─ 06 Orchestrator Episode Runtime  (needs 04, 05)
│  └─ 07 Orchestrator Context Packet  (needs 06)
│     └─ 08 Orchestrator Action Surface  (needs 06, 07)
│        └─ 09 Default Playbook Loop  (needs 04-08)
└─ 10 Orchestration UI And Inbox  (needs 04, 06, 09)
```

## Not In This Ticket Set

- Parallel ticket execution.
- Generic workflow builder.
- Ambient agent routing for project planning or orchestration.
- Direct DB writes by agents or clients.
- Vendor-specific orchestration logic outside adapters.
- Final orchestrator prompt template. The user will provide that later.
