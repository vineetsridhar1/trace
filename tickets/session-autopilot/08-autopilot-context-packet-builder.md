# 08 — Autopilot Context Packet Builder

## Summary

Build the context packet the controller reviews. This is where transcript, checkpoint, commit diff, queue state, and PR state are assembled into one bounded packet.

## What needs to happen

- Add a context builder for Autopilot review runs.
- Reuse existing transcript helpers for session history.
- Include:
  - latest user message
  - transcript
  - latest checkpoint sha and subject
  - latest commit diff
  - branch diff summary
  - worker session status
  - queued messages
  - PR url
  - linked ticket ids and project ids
  - playbook and custom instructions
- Add truncation and prioritization rules for large diffs and long transcripts.

## Dependencies

- [04 — Autopilot Service CRUD and State](04-autopilot-service-crud-and-state.md)
- [07 — Commit Diff Bridge Command](07-commit-diff-bridge-command.md)

## Completion requirements

- [ ] Context packet always includes the latest user message when present.
- [ ] Latest checkpoint and diff are included when available.
- [ ] Large packets are truncated predictably.
- [ ] No cross-org or unauthorized data is included.

## Implementation notes

- Keep the packet session-group-scoped but worker-session-centered.
- Favor server-built context over asking the controller to rediscover state through tool calls.

## How to test

1. Build context for a session with a checkpoint and PR url.
2. Build context for a session with no checkpoint and verify branch-diff fallback.
3. Build context for a large transcript and verify truncation behavior.
