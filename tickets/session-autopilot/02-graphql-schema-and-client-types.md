# 02 — GraphQL Schema and Client Types

## Summary

Expose Ultraplan, ticket executions, session roles, and gate event types through the single GraphQL schema source of truth.

## What needs to happen

- Add GraphQL enums mirroring the new Prisma enums.
- Add `Ultraplan` GraphQL type.
- Add `TicketExecution` GraphQL type.
- Add `Session.role`.
- Add ticket acceptance criteria and dependency fields.
- Add a `SessionGroup.ultraplan` field for the active group plan.
- Add queries as needed:
  - `ultraplan(id: ID!)`
  - `ultraplanForSessionGroup(sessionGroupId: ID!)`
- Add mutations:
  - `startUltraplan`
  - `pauseUltraplan`
  - `resumeUltraplan`
  - `runUltraplanControllerNow`
  - `cancelUltraplan`
- Extend GraphQL `EventType` with Ultraplan events.
- Extend GraphQL `InboxItemType` with Ultraplan gate values.
- Run `pnpm gql:codegen`.

## Dependencies

- [01 — Database Schema and Event Types](01-database-schema-and-event-types.md)

## Completion requirements

- [ ] GraphQL schema contains all Ultraplan types and enums.
- [ ] Generated client and resolver types compile.
- [ ] Session group detail can hydrate the active Ultraplan.
- [ ] The schema can represent a v1 ordered plan and future DAG dependencies.
- [ ] The schema shape supports the group UI and inbox UI without local-only types.
- [ ] No duplicate type definitions are added outside `schema.graphql`.

## Implementation notes

- Keep GraphQL thin. This ticket defines schema and generated types, not business logic.
- Prefer surfacing Ultraplan off `SessionGroup` because the product surface is group-level.
- Do not expose mutations that let clients directly create events or ticket execution state without services.

## How to test

1. Run `pnpm gql:codegen`.
2. Run package typechecking.
3. Confirm generated types include the new enums, fields, and mutations.
4. Confirm server resolver type generation requires thin resolver additions only.
