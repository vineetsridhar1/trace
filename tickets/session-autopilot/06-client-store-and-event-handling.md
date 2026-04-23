# 06 — Client Store and Event Handling

## Summary

Extend the shared client store and event-handling pipeline so Autopilot is event-driven like the rest of Trace.

## What needs to happen

- Add `sessionAutopilots` to the client-core entity store.
- Add selectors and helper hooks for reading Autopilot by session group id.
- Handle new Autopilot events in the org-event pipeline.
- Ensure inbox item events still hydrate the new validation request type cleanly.
- Update any session/group detail hydration queries to include Autopilot data.

## Dependencies

- [02 — GraphQL Schema and Client Types](02-graphql-schema-and-client-types.md)
- [04 — Autopilot Service CRUD and State](04-autopilot-service-crud-and-state.md)

## Completion requirements

- [ ] Client store can upsert and patch `SessionAutopilot` entities.
- [ ] Event handlers update Autopilot state without refetches.
- [ ] Session/group detail views can read Autopilot state from the store.
- [ ] No mutation response is required to keep the UI in sync.

## Implementation notes

- Follow the existing entity-store pattern instead of inventing an Autopilot-specific local state system.
- If the client does not need a fully general query for Autopilot, prefer hydrating it through group detail plus events.

## How to test

1. Hydrate a session group with Autopilot enabled.
2. Emit `session_autopilot_updated` and verify the UI updates from the store.
3. Emit a validation inbox item and verify it appears in inbox state.

