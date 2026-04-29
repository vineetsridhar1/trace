# 10 — Ultraplan Event Router

## Summary

Add the event router/worker that wakes the controller session when meaningful session-group events happen.

## What needs to happen

- Add a dedicated Ultraplan event router/worker module.
- Subscribe to the relevant event stream.
- Trigger controller wakeups on:
  - worker session `agentStatus` transitioning to `done`
  - worker session `agentStatus` transitioning to `failed`
  - worker session `agentStatus` transitioning to `stopped` when it has an active ticket execution
  - Ultraplan inbox gate resolution/dismissal
  - manual `run controller now`
- Ignore:
  - controller session status events unless explicitly needed
  - ordinary `session_output`
  - token/tool-call noise
- Serialize controller runs per session group.
- Skip duplicate or stale wakeups.
- Emit wakeup/run events.

## Dependencies

- [04 — Ultraplan Service CRUD and State](04-autopilot-service-crud-and-state.md)
- [08 — Ultraplan Context Packet Builder](08-autopilot-context-packet-builder.md)
- [09 — Controller Prompt and Tool Contract](09-controller-prompt-and-decision-parser.md)

## Completion requirements

- [ ] Controller wakes when a worker reaches `done`.
- [ ] Controller wakes when a worker reaches `failed`.
- [ ] Controller does not wake on every `session_output`.
- [ ] Only one controller run per session group can be in flight.
- [ ] Manual run-now uses the same wakeup pipeline.
- [ ] Wakeup events carry enough payload for debugging and client state.

## Implementation notes

- The v1 backbone is worker `agentStatus`, not checkpoint or token events.
- Keep dedupe in the worker/router layer and state transitions in services.
- The controller itself is a session; this router only decides when to wake it.

## How to test

1. Emit a worker active-to-done event and verify one wakeup.
2. Emit duplicate done events and verify dedupe.
3. Emit session output and verify no wakeup.
4. Resolve an Ultraplan inbox gate and verify a wakeup.
5. Verify two simultaneous worker completions serialize controller runs per group.
