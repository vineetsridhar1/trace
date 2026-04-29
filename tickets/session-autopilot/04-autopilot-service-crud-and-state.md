# 04 — Ultraplan Service CRUD and State

## Summary

Add `ultraplanService` as the service-layer owner for starting, pausing, resuming, cancelling, and inspecting Ultraplan state.

## What needs to happen

- Add `ultraplanService` with methods like:
  - `start`
  - `get`
  - `getForSessionGroup`
  - `pause`
  - `resume`
  - `cancel`
  - `runControllerNow`
- Create or reuse the special controller session when starting Ultraplan.
- Ensure the controller session has `role = ultraplan_controller`.
- Store the session group branch as the Ultraplan base/integration branch.
- Emit Ultraplan lifecycle events through the event service.
- Enforce service-layer authorization for read/write actions on the target session group.
- Validate requested controller tool/model/runtime before persistence.
- Add GraphQL resolvers that delegate to the service.

## Dependencies

- [01 — Database Schema and Event Types](01-database-schema-and-event-types.md)
- [02 — GraphQL Schema and Client Types](02-graphql-schema-and-client-types.md)
- [03 — Session Roles and Visibility](03-session-role-and-visible-filtering.md)

## Completion requirements

- [ ] `startUltraplan` creates or reuses the active Ultraplan for a session group.
- [ ] Starting Ultraplan creates or reuses a controller session with `role = ultraplan_controller`.
- [ ] Pause, resume, cancel, and run-now are idempotent enough for repeated UI calls.
- [ ] Unauthorized callers cannot read or mutate Ultraplan state.
- [ ] Invalid or unavailable controller config is rejected before persistence.
- [ ] All durable state changes emit events.

## Implementation notes

- Keep this ticket limited to service CRUD and core state transitions.
- Ordered ticket generation and worker launch can be added in later tickets.
- The service layer owns state transitions; GraphQL resolvers should parse input and delegate.

## How to test

1. Start Ultraplan for a session group and verify the DB rows and emitted events.
2. Start again and verify it reuses or updates the active plan instead of duplicating it.
3. Pause, resume, cancel, and run now through service tests.
4. Verify authorization failures do not create controller sessions or events.
