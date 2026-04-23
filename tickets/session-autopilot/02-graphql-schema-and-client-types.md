# 02 — GraphQL Schema and Client Types

## Summary

Expose Session Autopilot through GraphQL so web clients and services have a typed contract for reading and mutating Autopilot state.

## What needs to happen

- Add GraphQL enums mirroring the new Prisma enums:
  - `SessionRole`
  - `SessionAutopilotStatus`
- Add `SessionAutopilot` GraphQL type.
- Add an Autopilot field on the relevant visible entity:
  - recommended: `SessionGroup.autopilot`
- Add mutations:
  - `upsertSessionAutopilot`
  - `disableSessionAutopilot`
  - `runSessionAutopilotNow`
- Extend GraphQL `EventType` with the Autopilot event family.
- Extend GraphQL `InboxItemType` with `autopilot_validation_request`.
- Run `pnpm gql:codegen`.

## Dependencies

- [01 — Database Schema and Event Types](01-database-schema-and-event-types.md)

## Completion requirements

- [ ] GraphQL schema contains all new Autopilot types and enums.
- [ ] Generated client and resolver types compile.
- [ ] The schema shape is enough for the header UI and inbox UI to work without local-only types.
- [ ] No duplicate type definitions are added outside `schema.graphql`.

## Implementation notes

- Keep GraphQL thin. This ticket defines schema and generated types, not the business logic.
- Prefer surfacing Autopilot off `SessionGroup` so the client can fetch one coherent object from the group detail flow.

## How to test

1. Run `pnpm gql:codegen`.
2. Verify generated types include `SessionAutopilot`.
3. Typecheck the repo and confirm no GraphQL-generated type errors remain.

