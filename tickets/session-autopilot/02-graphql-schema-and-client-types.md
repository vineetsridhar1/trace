# 02 — GraphQL Schema and Client Types

## Summary

Expose Ultraplan, planned tickets, controller runs, ticket executions, session roles, dependency fields, event scope, and gate event types through the single GraphQL schema source of truth.

## What needs to happen

- Add GraphQL enums mirroring the new Prisma enums.
- Add `Ultraplan` GraphQL type.
- Add `UltraplanTicket` GraphQL type.
- Add `UltraplanTicketStatus` GraphQL enum.
- Add `UltraplanControllerRun` GraphQL type.
- Add `TicketExecution` GraphQL type.
- Add `Session.role`.
- Add ticket acceptance criteria, test plan, and dependency fields.
- Add a `SessionGroup.ultraplan` field for the active group plan.
- Add fields for controller run summaries and linked controller-run sessions.
- Add `ScopeType.ultraplan`.
- Add queries as needed:
  - `ultraplan(id: ID!)`
  - `ultraplanForSessionGroup(sessionGroupId: ID!)`
  - `ultraplanControllerRun(id: ID!)`
- Add mutations:
  - `startUltraplan`
  - `pauseUltraplan`
  - `resumeUltraplan`
  - `runUltraplanControllerNow`
  - `cancelUltraplan`
- Extend GraphQL `EventType` with Ultraplan and controller-run events.
- Extend GraphQL `InboxItemType` with Ultraplan gate values.
- Run `pnpm gql:codegen`.

## Dependencies

- [01 — Database Schema and Event Types](01-database-schema-and-event-types.md)

## Completion requirements

- [x] GraphQL schema contains all Ultraplan, ControllerRun, and TicketExecution types and enums.
- [x] GraphQL schema exposes planned tickets independently from executions.
- [x] `UltraplanTicket.status` is exposed as `UltraplanTicketStatus`.
- [x] GraphQL schema includes `ScopeType.ultraplan`.
- [x] Generated client and resolver types compile.
- [x] Session group detail can hydrate the active Ultraplan.
- [x] The schema can represent controller run summaries and full-chat links.
- [x] The schema can represent a v1 ordered plan and future DAG dependencies.
- [x] No duplicate type definitions are added outside `schema.graphql`.

## Implementation notes

- Keep GraphQL thin. This ticket defines schema and generated types, not business logic.
- Prefer surfacing Ultraplan off `SessionGroup` because the product surface is group-level.
- `StartUltraplanInput` should use controller provider/model/runtime policy language, not worker-only `CodingTool`/`HostingMode` coupling.
- Do not expose mutations that let clients directly create events or ticket execution state without services.

## How to test

1. Run `pnpm gql:codegen`.
2. Run package typechecking.
3. Confirm generated types include the new enums, fields, and mutations.
4. Confirm server resolver type generation requires thin resolver additions only.
