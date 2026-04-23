# 10 — Autopilot Orchestrator

## Summary

Create the background process that decides when Autopilot should review a worker session. This keeps review work out of the request path and gives the feature one clear execution engine.

## What needs to happen

- Add a dedicated Autopilot orchestrator/worker process or module.
- Subscribe to the relevant event stream.
- Trigger review runs on:
  - worker completion
  - worker rehome/move
  - manual `run now`
- Serialize work per `sessionGroupId`.
- Skip duplicate or stale runs.
- Update Autopilot status as runs begin and end.

## Dependencies

- [04 — Autopilot Service CRUD and State](04-autopilot-service-crud-and-state.md)
- [08 — Autopilot Context Packet Builder](08-autopilot-context-packet-builder.md)
- [09 — Controller Prompt and Decision Parser](09-controller-prompt-and-decision-parser.md)

## Completion requirements

- [ ] Autopilot runs are triggered only from the intended event set.
- [ ] Only one run per session group can be in flight at a time.
- [ ] Status changes are emitted through events.
- [ ] Manual `run now` uses the same review pipeline.

## Implementation notes

- Do not trigger on every `session_output`.
- The orchestrator should be checkpoint-driven and completion-driven, not token-stream-driven.

## How to test

1. Complete a worker session and verify one review run starts.
2. Emit duplicate completion signals and verify no duplicate run starts.
3. Trigger `run now` and verify the same execution path is used.

