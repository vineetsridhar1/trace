# 01 — Database Schema and Event Types

## Summary

Add the durable database shape for Ultraplan: session roles, the `Ultraplan` entity, ticket execution state, ticket dependency edges, event types, inbox gate types, and ticket fields needed for AI-generated work plans.

## What needs to happen

- Add Prisma enums:
  - `SessionRole`: `primary`, `ticket_worker`, `ultraplan_controller`
  - `UltraplanStatus`
  - `TicketExecutionStatus`
  - `IntegrationStatus`
- Add `role SessionRole @default(primary)` to `Session`.
- Add `Ultraplan` with a unique active association to `SessionGroup` for v1.
- Add `TicketExecution` linked to organization, Ultraplan, ticket, session group, and optional worker session.
- Add ticket planning fields:
  - acceptance criteria
  - dependency relation or equivalent durable dependency table
  - v1 linear dependencies, represented with general edges
- Extend Prisma `EventType` with the Ultraplan event family.
- Extend Prisma `InboxItemType` with Ultraplan gate types:
  - `ultraplan_plan_approval`
  - `ultraplan_validation_request`
  - `ultraplan_conflict_resolution`
  - `ultraplan_final_review`
- Run migration and Prisma generate.

## Dependencies

- None

## Completion requirements

- [ ] Schema compiles with the new enums and models.
- [ ] Existing sessions default to `role = primary`.
- [ ] `Ultraplan` is linked to a `SessionGroup`.
- [ ] `TicketExecution` can represent a ticket branch and worker session.
- [ ] Ticket dependencies and acceptance criteria are durable.
- [ ] V1 can represent an ordered chain without blocking future DAG scheduling.
- [ ] New event types exist in Prisma.
- [ ] New inbox item types exist in Prisma.
- [ ] Migration runs cleanly on an existing local database.

## Implementation notes

- Keep Ultraplan first-class rather than hiding JSON inside `SessionGroup`.
- Keep execution state out of `Ticket`; use `TicketExecution` for runtime attempts.
- Do not add direct relations that force containment where Trace wants links and peers.
- Store dependency edges generally; do not hardcode `previousTicketId` as the only sequencing primitive.
- Use nullable session ids for controller/worker references in v1 if stronger relational wiring creates migration risk.

## How to test

1. Run the Prisma migration locally.
2. Run Prisma generate.
3. Confirm existing sessions read back with `role = primary`.
4. Create sample Ultraplan and TicketExecution rows in a test transaction.
5. Create a linear dependency chain and verify it can also represent a non-linear graph.
6. Verify event and inbox enum values are usable.
