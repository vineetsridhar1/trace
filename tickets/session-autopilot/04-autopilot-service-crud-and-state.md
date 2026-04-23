# 04 — Autopilot Service CRUD and State

## Summary

Create the service-layer entry point for Session Autopilot. This service owns enabling, updating, disabling, loading, and emitting state changes for Autopilot.

## What needs to happen

- Add `sessionAutopilotService` with methods like:
  - `getBySessionGroupId`
  - `upsert`
  - `disable`
  - `pause`
  - `resume`
  - `runNow`
- Emit Autopilot lifecycle events through the event service.
- Create or reuse the hidden controller session when enabling Autopilot.
- Resolve the current active worker session in the group.
- Add GraphQL resolvers that delegate to the service.

## Dependencies

- [01 — Database Schema and Event Types](01-database-schema-and-event-types.md)
- [02 — GraphQL Schema and Client Types](02-graphql-schema-and-client-types.md)
- [03 — Session Role and Visible Filtering](03-session-role-and-visible-filtering.md)

## Completion requirements

- [ ] Upsert mutation creates or updates Autopilot state.
- [ ] Disable mutation turns Autopilot off without touching the worker session.
- [ ] `runNow` marks a run as requested and is safe to call repeatedly.
- [ ] Enabling Autopilot creates or reuses a controller session with `role = autopilot_controller`.
- [ ] All state changes emit events.

## Implementation notes

- Keep this ticket limited to service CRUD and state transitions. The controller review loop comes later.
- Default enabled state should land in `waiting` unless there is an immediate run requested.

## How to test

1. Call the upsert mutation on a group with no Autopilot record.
2. Verify a `SessionAutopilot` row is created.
3. Verify a controller session is created once.
4. Update the config and confirm it reuses the same controller session.
5. Disable Autopilot and verify status and event emission.

