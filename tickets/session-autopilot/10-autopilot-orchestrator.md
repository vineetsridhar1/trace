# 10 — Ultraplan Event Router

## Summary

Add the event router/worker that creates fresh controller runs when meaningful session-group events happen.

## What needs to happen

- Add a dedicated Ultraplan event router/worker module.
- Subscribe to the relevant event stream.
- Create controller runs on:
  - initial Ultraplan start
  - worker session `agentStatus` transitioning to `done`
  - worker session `agentStatus` transitioning to `failed`
  - worker session `agentStatus` transitioning to `stopped` when it has an active ticket execution
  - Ultraplan inbox gate resolution/dismissal
  - manual `run controller now`
- Ignore:
  - controller-run session status events unless explicitly needed
  - ordinary `session_output`
  - token/tool-call noise
- Serialize controller runs per session group.
- Skip duplicate or stale wakeups.
- Emit controller-run created/started/completed/failed events.
- Emit events with `ScopeType.ultraplan` and snapshots sufficient for client upserts.

## Dependencies

- [04 — Ultraplan Service CRUD and Controller Runs](04-autopilot-service-crud-and-state.md)
- [08 — Controller Run Context Packet Builder](08-autopilot-context-packet-builder.md)
- [09 — Controller Tool and Summary Contract](09-controller-prompt-and-decision-parser.md)
- [17 — Runtime Action Wrapper and Auth Plumbing](17-runtime-action-wrapper-and-auth-plumbing.md)

## Completion requirements

- [x] Initial Ultraplan start creates a controller run.
- [x] Worker `done` creates one fresh controller run.
- [x] Worker `failed` creates one fresh controller run.
- [x] Controller does not wake on every `session_output`.
- [x] Only one controller run per session group can be in flight.
- [x] Manual run-now uses the same run pipeline.
- [x] Run events carry enough payload for debugging and client state.
- [x] Run events are scoped to the Ultraplan.
- [x] Controller-run sessions launch with scoped runtime action env.

## Implementation notes

- The v1 backbone is worker `agentStatus`, inbox resolution, and manual run-now.
- Keep dedupe in the worker/router layer and state transitions in services.
- The router creates controller runs; it does not resume one persistent controller session.

## How to test

1. Start Ultraplan and verify the initial controller run.
2. Emit a worker active-to-done event and verify one controller run.
3. Emit duplicate done events and verify dedupe.
4. Emit session output and verify no controller run.
5. Resolve an Ultraplan inbox gate and verify a controller run.
6. Verify simultaneous triggers serialize controller runs per group.
