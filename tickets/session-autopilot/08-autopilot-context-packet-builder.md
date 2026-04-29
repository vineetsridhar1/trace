# 08 — Controller Run Context Packet Builder

## Summary

Build the compact context packet each fresh controller run receives when it starts.

## What needs to happen

- Add a context builder for Ultraplan controller runs.
- Include:
  - wakeup trigger and trigger event
  - Ultraplan summary and status
  - playbook and playbook config
  - session group branch and PR state
  - ordered ticket plan and dependency state
  - current and future ticket context
  - active ticket executions
  - worker session statuses
  - latest worker checkpoint metadata
  - worker final message or failure summary, when relevant
  - active inbox gates
  - prior controller run summaries
  - selected prior controller messages when useful
  - relevant user instructions
- Include diff summary or patch only when the run is reviewing implementation or integration.
- Reuse existing transcript/session helpers where useful.
- Add truncation and prioritization rules for long transcripts, prior summaries, and large diffs.
- Ensure context is scoped to one organization and one session group.

## Dependencies

- [04 — Ultraplan Service CRUD and Controller Runs](04-autopilot-service-crud-and-state.md)
- [07 — Branch and Diff Runtime Commands](07-commit-diff-bridge-command.md)

## Completion requirements

- [ ] Context packet includes the event that triggered the controller run.
- [ ] Ordered ticket plan and execution state are included.
- [ ] Dependency edges and the next runnable ticket are included.
- [ ] Prior controller run summaries are included.
- [ ] Latest checkpoint and branch diff are included when useful.
- [ ] Active inbox gates are included.
- [ ] Large packets are truncated predictably.
- [ ] No cross-org or unauthorized data is included.

## Implementation notes

- Favor server-built context over asking the controller to rediscover state through broad tool calls.
- Keep the packet session-group-scoped and event-centered.
- Prior controller summaries are the main memory layer; full old chats should be linked, not blindly pasted.

## How to test

1. Build context for the initial planning run.
2. Build context for a worker `done` event.
3. Build context for a worker `failed` event.
4. Build context for an inbox gate resolution.
5. Verify diff inclusion is conditional on review/integration triggers.
6. Verify truncation behavior with large diffs, prior summaries, and transcripts.
7. Verify unauthorized/cross-org data is excluded.
