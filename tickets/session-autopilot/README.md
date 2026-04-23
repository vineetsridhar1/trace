# Session Autopilot — Ticket Index

Tickets for building Session Autopilot in Trace. Work through milestones in order. See [SESSION_AUTOPILOT_PLAN.md](../../SESSION_AUTOPILOT_PLAN.md) for the full product and engineering spec.

## M0 — Contracts and Durable State

Define the schema, events, and visibility boundaries before wiring any orchestration.

| # | Ticket | What it does |
|---|--------|-------------|
| 01 | [Database Schema and Event Types](01-database-schema-and-event-types.md) | Adds Prisma enums/models for Autopilot, inbox type, and event types |
| 02 | [GraphQL Schema and Client Types](02-graphql-schema-and-client-types.md) | Adds GraphQL types, queries, mutations, and codegen output |
| 03 | [Session Role and Visible Filtering](03-session-role-and-visible-filtering.md) | Adds `Session.role` behavior so controller sessions stay out of normal product surfaces |

## M1 — Product Surface and Persistence

Get Autopilot into the UI and service layer as a first-class product capability.

| # | Ticket | What it does |
|---|--------|-------------|
| 04 | [Autopilot Service CRUD and State](04-autopilot-service-crud-and-state.md) | New `sessionAutopilotService` for enable/update/disable/get plus state transitions |
| 05 | [Header Controls and Settings UI](05-header-controls-and-settings-ui.md) | Session header button, status chip, and settings popover |
| 06 | [Client Store and Event Handling](06-client-store-and-event-handling.md) | Zustand/client-core support for Autopilot entities and events |

## M2 — Review Context

Build the input packet the controller needs to make good decisions.

| # | Ticket | What it does |
|---|--------|-------------|
| 07 | [Commit Diff Bridge Command](07-commit-diff-bridge-command.md) | Adds runtime support for latest commit patch retrieval |
| 08 | [Autopilot Context Packet Builder](08-autopilot-context-packet-builder.md) | Builds transcript, checkpoint, diff, PR, and queue context for reviews |
| 09 | [Controller Prompt and Decision Parser](09-controller-prompt-and-decision-parser.md) | Stable controller contract plus XML parser and validation |

## M3 — Review Loop

Wake the controller, apply decisions, and keep the loop safe.

| # | Ticket | What it does |
|---|--------|-------------|
| 10 | [Autopilot Orchestrator](10-autopilot-orchestrator.md) | Background worker/subscriber that triggers review runs at the right times |
| 11 | [Continue-Worker Execution](11-continue-worker-execution.md) | Applies `continue_worker` decisions back onto the primary session |
| 12 | [Human Validation Handoff (Server)](12-human-validation-handoff-server.md) | Creates and resolves Autopilot validation inbox items |
| 14 | [Guardrails, Pause, and Cooldowns](14-guardrails-pause-and-cooldowns.md) | Loop protection, pause/resume semantics, dismissal cooldowns |

## M4 — Human UX

Make the handoff understandable and actionable for real users.

| # | Ticket | What it does |
|---|--------|-------------|
| 13 | [Human Validation Inbox UI](13-human-validation-inbox-web-ui.md) | Dedicated inbox card/body for Autopilot review requests |
| 15 | [Telemetry, Error States, and Polish](15-telemetry-error-states-and-polish.md) | Error surfacing, timeline entries, metrics, and rollout polish |

## Post-V1 Follow-ups

Explicitly useful, but intentionally outside the smallest coherent v1.

| # | Ticket | What it does |
|---|--------|-------------|
| 16 | [Playbook Expansion and Debug Follow-ups](16-playbook-expansion-and-debug-followups.md) | Additional playbooks, debug panel, and mobile follow-on surfaces |

## Dependency graph

```text
M0 — Contracts and Durable State
01 Database Schema and Event Types
├─ 02 GraphQL Schema and Client Types
└─ 03 Session Role and Visible Filtering

M1 — Product Surface and Persistence
04 Autopilot Service CRUD and State  (needs 01, 02, 03)
├─ 05 Header Controls and Settings UI  (needs 02, 04)
└─ 06 Client Store and Event Handling  (needs 02, 04)

M2 — Review Context
07 Commit Diff Bridge Command
├─ 08 Autopilot Context Packet Builder  (needs 04, 07)
└─ 09 Controller Prompt and Decision Parser  (needs 08)

M3 — Review Loop
10 Autopilot Orchestrator  (needs 04, 08, 09)
├─ 11 Continue-Worker Execution  (needs 10)
├─ 12 Human Validation Handoff (Server)  (needs 10)
└─ 14 Guardrails, Pause, and Cooldowns  (needs 11, 12)

M4 — Human UX
13 Human Validation Inbox UI  (needs 06, 12)
└─ 15 Telemetry, Error States, and Polish  (needs 05, 11, 12, 13, 14)

Post-V1
16 Playbook Expansion and Debug Follow-ups  (needs 15)
```

## Parallelization notes

- `07 Commit Diff Bridge Command` can run in parallel with M1 once the high-level contracts are settled.
- `05 Header Controls and Settings UI` and `06 Client Store and Event Handling` can run in parallel after ticket 04 lands.
- `11 Continue-Worker Execution` and `12 Human Validation Handoff (Server)` can run in parallel after ticket 10 lands.
- Ticket 13 should wait for the server-side inbox payload in ticket 12.

## Plan coverage map

- `## Summary`, `## Product Thesis`, `## Goals`, and `## Non-Goals` are expressed across tickets 01-15, with the v1 boundaries enforced again in the scope guardrails below.
- `## Product Experience` and its sub-sections (`Entry Point`, `Enable Flow`, `Runtime Behavior`, `What the Controller Sees`, `Human Handoff`, `Example Journey`, `Edge Cases`) are primarily covered by tickets 05, 08, 10, 11, 12, 13, and 15.
- `## Recommended Technical Design` section `1. Scope: Session Group, Not Raw Session` and `2. Controller Model: Hidden Controller Session` are owned by tickets 03, 04, and 10.
- `## Recommended Technical Design` sections `3. Architecture Overview`, `4. Data Model`, `5. GraphQL Contract`, and `6. Event Model` are covered by tickets 01-04 and 06.
- `## Recommended Technical Design` sections `7. Service Layer`, `8. Context Assembly`, `9. Controller Prompt Contract`, and `10. Execution Rules` are covered by tickets 04 and 07-14.
- `## Recommended Technical Design` sections `11. Inbox Design`, `12. UI Design`, and `13. Playbooks` are covered by tickets 05, 12, 13, 15, and 16.
- `## Recommended Technical Design` sections `14. Rollout Plan`, `15. Testing Strategy`, `16. Risks`, `17. Open Questions`, and `18. Recommended Decisions` are realized across the milestone ordering in this README, with ticket-level test plans in every ticket and ticket 15 owning most rollout/polish work.
- `## 19. Screen-Level Product Experience` and `## 20. Session Autopilot State Machine` are covered by tickets 04, 05, 10, 12, 13, and 14.
- `## 21. File-Level Implementation Map`, `## 22. Migration and Compatibility Plan`, and `## 23. Permissions and Security` are covered by tickets 01-15, with tickets 01, 03, 04, and 07 carrying most of the compatibility and security constraints.
- `## 24. Performance and Token Budgeting` and `## 25. Telemetry and Success Metrics` are covered by tickets 08, 10, 14, and 15.
- `## 26. Future Extensions` is intentionally deferred into ticket 16.
- `## 27. Suggested Build Order` maps directly to the milestone structure in this README.
- `## 28. Example GraphQL Operations`, `## 29. Example Event Payloads`, `## 30. Controller Prompt Draft`, and `## 31. Example Worker Follow-Up Messages` are executable reference material for tickets 02, 09, 11, and 12.
- `## 32. Acceptance Criteria By Milestone` is split across the `Completion requirements` and `How to test` sections in tickets 01-16.

If the plan gains a new actionable requirement, add or update its owning ticket in the same change and keep this coverage map in sync.

## Scope guardrails

If you are unsure whether something belongs in v1, check [SESSION_AUTOPILOT_PLAN.md](../../SESSION_AUTOPILOT_PLAN.md). The intended v1 is:

- session-group scoped
- hidden controller session
- QA-first default playbook
- web and desktop only
- no autonomous merge or deploy
- no generic workflow engine

If the plan changes, update the relevant ticket and this index in the same change.
