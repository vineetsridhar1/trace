# 01 — Database Schema and Event Types

## Summary

Add the durable database shape for Ultraplan: session roles, the `Ultraplan` entity, `UltraplanTicket` plan membership, episodic controller runs, ticket execution state, ticket dependency edges, event scope/types, inbox gate types, and ticket fields needed for AI-generated work plans.

## What needs to happen

- Add Prisma enums:
  - `SessionRole`: `primary`, `ticket_worker`, `ultraplan_controller_run`
  - `UltraplanStatus`
  - `ControllerRunStatus`
  - `TicketExecutionStatus`
  - `UltraplanTicketStatus`
  - `IntegrationStatus`
- Add `role SessionRole @default(primary)` to `Session`.
- Add `ScopeType.ultraplan` for canonical Ultraplan activity/timeline events.
- Add `Ultraplan` with a unique `sessionGroupId` association for v1.
- Add explicit group integration workspace fields on `Ultraplan`.
- Add `UltraplanTicket` with `ultraplanId`, `ticketId`, `position`, typed status, generated metadata, and unique plan membership.
- Add `UltraplanControllerRun` linked to organization, Ultraplan, session group, trigger event, and optional controller-run session.
- Add `TicketExecution` linked to organization, Ultraplan, ticket, session group, and optional worker session.
- Add ticket planning fields:
  - acceptance criteria
  - test plan
  - dependency relation or equivalent durable dependency table
  - v1 linear dependencies, represented with general edges
- Extend Prisma `EventType` with the Ultraplan and controller-run event family.
- Extend Prisma `InboxItemType` with Ultraplan gate types:
  - `ultraplan_plan_approval`
  - `ultraplan_validation_request`
  - `ultraplan_conflict_resolution`
  - `ultraplan_final_review`
- Run migration and Prisma generate.

## Dependencies

- None

## Completion requirements

- [x] Schema compiles with the new enums and models.
- [x] Existing sessions default to `role = primary`.
- [x] `ScopeType.ultraplan` exists and can be used by events.
- [x] `Ultraplan` is linked to a `SessionGroup` with v1 uniqueness enforced.
- [x] `Ultraplan` distinguishes integration branch/workdir from worker execution branch/workdir.
- [x] `UltraplanTicket` links planned tickets before execution exists.
- [x] `UltraplanTicket.status` uses `UltraplanTicketStatus`, not a stringly workflow field.
- [x] `UltraplanControllerRun` can link to a fresh controller-run session and structured summary.
- [x] `TicketExecution` can represent a ticket branch and worker session.
- [x] Ticket dependencies, acceptance criteria, and test plans are durable.
- [x] V1 can represent an ordered chain without blocking future DAG scheduling.
- [x] New event types exist in Prisma.
- [x] New inbox item types exist in Prisma.
- [x] Migration runs cleanly on an existing local database.

## Implementation notes

- Keep Ultraplan first-class rather than hiding JSON inside `SessionGroup`.
- Use a simple unique `sessionGroupId` for v1 active plans. Move to a partial unique index only if historical plans become near-term scope.
- Use `UltraplanTicket` for plan membership; do not infer planned tickets only from `TicketExecution`.
- Do not store a single persistent controller session id on Ultraplan.
- Do not let ticket worker workspace state overwrite session-group integration workspace state.
- Keep execution state out of `Ticket`; use `TicketExecution` for runtime attempts.
- Store controller memory as summaries and Trace primitives, not as one resumed chat.
- Store dependency edges generally; do not hardcode `previousTicketId` as the only sequencing primitive.

## How to test

1. Run the Prisma migration locally.
2. Run Prisma generate.
3. Confirm existing sessions read back with `role = primary`.
4. Create sample Ultraplan, UltraplanTicket, ControllerRun, and TicketExecution rows in a test transaction.
5. Verify planned tickets can exist before executions.
6. Create a linear dependency chain and verify it can also represent a non-linear graph.
7. Verify event, scope, and inbox enum values are usable.
