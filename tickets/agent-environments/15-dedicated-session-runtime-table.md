# 15 - Dedicated SessionRuntime Table

## Summary

Move runtime lifecycle state out of `Session.connection` once the environment model is stable.

## What needs to happen

- Add a `SessionRuntime` model with:
  - `sessionId`
  - `environmentId`
  - `adapterType`
  - `runtimeInstanceId`
  - `providerRuntimeId`
  - `status`
  - timestamps
  - heartbeat timestamp
  - metadata
- Migrate runtime lifecycle writes from `Session.connection` to `SessionRuntime`.
- Keep compatibility reads for older session connection payloads.
- Update event payloads and selectors if needed.
- Remove duplicated runtime state from session connection once migration is complete.

## Dependencies

- [13 - Testing, Telemetry, and Rollout](13-testing-telemetry-and-rollout.md)

## Completion requirements

- [ ] Runtime lifecycle state has a first-class table.
- [ ] Existing sessions migrate or read through compatibility code.
- [ ] Session detail and runtime recovery still work.
- [ ] No runtime lifecycle data is lost during migration.

## Implementation notes

- This is intentionally deferred to avoid blocking V1.
- Only do this when `Session.connection` becomes a meaningful maintenance risk.
- Keep the event log as the source of truth for history; the table is current state.

## How to test

1. Run migration on a database with old and new session connection shapes.
2. Verify active sessions recover runtime state.
3. Verify startup/deprovision transitions update `SessionRuntime`.
4. Verify old connection payloads remain readable during rollout.
