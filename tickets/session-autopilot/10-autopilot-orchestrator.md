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
- Capture or receive the controller run's final structured summary and route it through `ultraplanControllerRunService.completeRun`; route missing or malformed summaries through `failRun` so they are visible as failed controller runs.

## Dependencies

- [04 — Ultraplan Service CRUD and Controller Runs](04-autopilot-service-crud-and-state.md)
- [08 — Controller Run Context Packet Builder](08-autopilot-context-packet-builder.md)
- [09 — Controller Tool and Summary Contract](09-controller-prompt-and-decision-parser.md)
- [17 — Runtime Action Wrapper and Auth Plumbing](17-runtime-action-wrapper-and-auth-plumbing.md)

## Completion requirements

- [ ] Initial Ultraplan start creates a controller run.
- [ ] Worker `done` creates one fresh controller run.
- [ ] Worker `failed` creates one fresh controller run.
- [ ] Controller does not wake on every `session_output`.
- [ ] Only one controller run per session group can be in flight.
- [ ] Manual run-now uses the same run pipeline.
- [ ] Run events carry enough payload for debugging and client state.
- [ ] Run events are scoped to the Ultraplan.
- [ ] Controller-run sessions launch with scoped runtime action env.
- [ ] Controller terminal completion is parsed or received as structured summary input before `completeRun`.
- [ ] Missing or malformed controller summaries create failed controller-run state, not stuck running sessions.

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
7. Complete a controller run with valid summary JSON and verify `ultraplan_controller_run_completed`.
8. Complete a controller run with missing or malformed summary JSON and verify `ultraplan_controller_run_failed`.
