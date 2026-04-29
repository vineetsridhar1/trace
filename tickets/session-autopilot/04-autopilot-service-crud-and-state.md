# 04 — Ultraplan Service CRUD and Controller Runs

## Summary

Add `ultraplanService` as the service-layer owner for starting, pausing, resuming, cancelling, and inspecting Ultraplan state, plus the initial path for creating episodic controller runs.

## What needs to happen

- Add `ultraplanService` with methods like:
  - `start`
  - `get`
  - `getForSessionGroup`
  - `pause`
  - `resume`
  - `cancel`
  - `runControllerNow`
- Add `ultraplanControllerRunService` with methods like:
  - `createRun`
  - `markStarted`
  - `completeRun`
  - `failRun`
  - `listForUltraplan`
- Starting Ultraplan should create an initial controller run, not a permanent controller session.
- Each controller run should create or link to a fresh session with `role = ultraplan_controller_run`.
- Store the session group branch as the Ultraplan base/integration branch.
- Emit Ultraplan and controller-run lifecycle events through the event service.
- Enforce service-layer authorization for read/write actions on the target session group.
- Validate requested controller tool/model/runtime before creating a run.
- Add GraphQL resolvers that delegate to the services.

## Dependencies

- [01 — Database Schema and Event Types](01-database-schema-and-event-types.md)
- [02 — GraphQL Schema and Client Types](02-graphql-schema-and-client-types.md)
- [03 — Session Roles and Visibility](03-session-role-and-visible-filtering.md)

## Completion requirements

- [ ] `startUltraplan` creates or reuses the active Ultraplan for a session group.
- [ ] Starting Ultraplan creates an initial controller run.
- [ ] Controller runs create fresh sessions with `role = ultraplan_controller_run`.
- [ ] Pause, resume, cancel, and run-now are idempotent enough for repeated UI calls.
- [ ] Unauthorized callers cannot read or mutate Ultraplan or controller-run state.
- [ ] Invalid or unavailable controller config is rejected before persistence.
- [ ] All durable state changes emit events.

## Implementation notes

- Keep this ticket limited to service CRUD, initial controller-run creation, and core state transitions.
- Ordered ticket generation and worker launch can be added in later tickets.
- The service layer owns state transitions; GraphQL resolvers should parse input and delegate.

## How to test

1. Start Ultraplan for a session group and verify the Ultraplan row, initial controller run, and emitted events.
2. Start again and verify it reuses or updates the active plan instead of duplicating it unexpectedly.
3. Pause, resume, cancel, and run now through service tests.
4. Verify authorization failures do not create controller runs, sessions, or events.
