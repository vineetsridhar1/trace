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
- Expose an explicit allowlist of actions to orchestrator episodes. The service should reject actions outside the episode's project run, ticket, session, and permission scope.
- Make mutating actions idempotent with operation keys where repeated tool calls could duplicate side effects.
- Record action attempts and results on the orchestrator episode or a linked action log.
- Validate state transitions in services; do not rely on the LLM or playbook text to decide whether an action is legal.

## Completion requirements

- [ ] Actions call services or approved CLI commands.
- [ ] Actions never write DB rows directly.
- [ ] Actions validate scope and permissions.
- [ ] Actions produce machine-readable success/failure output.
- [ ] Inbox and message actions are available.
- [ ] PR/merge actions are permissioned and can be disabled.
- [ ] Repeated action calls with the same operation key are safe.
- [ ] Action results are durable enough for the next episode's context packet.
- [ ] Services reject actions when the project run is paused, cancelled, completed, or outside the episode scope.
- [ ] Tests reject out-of-scope project/ticket/session actions.

## Notes

- This is not the ambient agent action surface. It is scoped to explicit orchestrator episode sessions.
- Keep GraphQL resolvers thin if new external mutations are needed. Agent runtime paths should call the service layer directly.
