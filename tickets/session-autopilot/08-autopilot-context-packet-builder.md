# 08 — Ultraplan Context Packet Builder

## Summary

Build the compact context packet the controller session receives when it wakes.

## What needs to happen

- Add a context builder for Ultraplan controller runs.
- Include:
  - Ultraplan summary and status
  - session group branch and PR state
  - ticket graph and dependency state
  - active ticket executions
  - worker session statuses
  - latest worker checkpoint metadata
  - worker branch diff against group branch
  - active inbox gates
  - recent controller decisions
  - relevant user instructions
- Reuse existing transcript/session helpers where useful.
- Add truncation and prioritization rules for long transcripts and large diffs.
- Ensure context is scoped to one organization and one session group.

## Dependencies

- [04 — Ultraplan Service CRUD and State](04-autopilot-service-crud-and-state.md)
- [07 — Branch and Diff Runtime Commands](07-commit-diff-bridge-command.md)

## Completion requirements

- [ ] Context packet includes the event that woke the controller.
- [ ] Ticket graph and execution state are included.
- [ ] Latest checkpoint and branch diff are included when available.
- [ ] Active inbox gates are included.
- [ ] Large packets are truncated predictably.
- [ ] No cross-org or unauthorized data is included.

## Implementation notes

- Favor server-built context over asking the controller to rediscover state through broad tool calls.
- Keep the packet session-group-scoped and event-centered.
- Include enough data for the controller to choose a next action without reading the entire universe.

## How to test

1. Build context for a worker `done` event.
2. Build context for a worker `failed` event.
3. Build context for an inbox gate resolution.
4. Verify truncation behavior with large diffs and transcripts.
5. Verify unauthorized/cross-org data is excluded.
