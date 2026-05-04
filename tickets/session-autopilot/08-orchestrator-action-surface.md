# 08 — Orchestrator Action Surface

## Summary

Give orchestrator episodes explicit service/CLI actions for moving the project forward.

## Scope

- Allow orchestrator episodes to:
  - send messages to sessions/chats
  - create inbox items
  - start implementation/review/fix sessions
  - update ticket execution state
  - request QA
  - create PRs when available
  - merge PRs when allowed
- Validate actor/org/project/ticket permissions.
- Return machine-readable action results.
- Emit durable events for state changes.

## Completion requirements

- [ ] Actions call services or approved CLI commands.
- [ ] Actions never write DB rows directly.
- [ ] Actions validate scope and permissions.
- [ ] Actions produce machine-readable success/failure output.
- [ ] Inbox and message actions are available.
- [ ] PR/merge actions are permissioned and can be disabled.
- [ ] Tests reject out-of-scope project/ticket/session actions.

## Notes

- This is not the ambient agent action surface. It is scoped to explicit orchestrator episode sessions.
