# 06 — Client Store and Event Handling

## Summary

Add client-core/Zustand support for Ultraplan and ticket execution entities so the UI updates from events without relying on mutation responses.

## What needs to happen

- Add `ultraplans` to the client-core entity store.
- Add `ticketExecutions` to the client-core entity store.
- Add selectors and helper hooks for:
  - active Ultraplan by session group id
  - ticket executions by Ultraplan id
  - execution fields by id
- Handle new Ultraplan events in the org-event pipeline.
- Handle ticket execution events in the org-event pipeline.
- Ensure inbox item events hydrate the new gate item types cleanly.
- Update session/group detail hydration queries to include active Ultraplan data.

## Dependencies

- [02 — GraphQL Schema and Client Types](02-graphql-schema-and-client-types.md)
- [04 — Ultraplan Service CRUD and State](04-autopilot-service-crud-and-state.md)

## Completion requirements

- [ ] Client store can upsert and patch Ultraplan entities.
- [ ] Client store can upsert and patch TicketExecution entities.
- [ ] Event handlers update UI state without refetches.
- [ ] Session group detail views can read Ultraplan state from the store.
- [ ] Mutation responses are not required to keep the UI in sync.

## Implementation notes

- Follow existing entity-store patterns.
- Do not store events in generic entity tables; keep event storage scoped as already defined by client-core.
- Avoid React context for shared Ultraplan state.

## How to test

1. Unit test event handlers for each new event family.
2. Hydrate a session group with an active Ultraplan and verify selectors return it.
3. Apply ticket execution update events and verify fine-grained selectors update.
4. Verify inbox gate events render from store state without a refetch.
