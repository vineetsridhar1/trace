# 08 — Orchestrator Action Surface

## Summary

Give Claude Code/Codex sessions and orchestrator episodes an explicit Trace CLI/action surface for moving the project forward through service-backed, authenticated calls.

## Scope

- Build a Trace CLI command surface that Claude Code and Codex can call from normal sessions.
- Dynamically inject short-lived, scoped Trace credentials when starting each Claude Code/Codex process so CLI calls are authenticated without exposing user secrets or model-provider API keys.
- Scope injected credentials to the organization, project, project run, session, ticket, and orchestrator episode that the process is allowed to touch.
- Allow planning sessions and orchestrator episodes to:
  - read project/session/ticket context
  - send messages to sessions/chats
  - create inbox items
  - submit structured ticket drafts for an approved project plan
  - start implementation/review/fix sessions
  - update ticket execution state
  - request QA
  - create PRs when available
  - merge PRs when allowed
- Validate actor/org/project/ticket permissions.
- Return machine-readable action results.
- Emit durable events for state changes.
- Ensure CLI calls go through server authorization and service-layer methods. The CLI must not write database rows or events directly.
- Expose an explicit allowlist of actions to orchestrator episodes. The service should reject actions outside the episode's project run, ticket, session, and permission scope.
- Make mutating actions idempotent with operation keys where repeated tool calls could duplicate side effects.
- Record action attempts and results on the orchestrator episode or a linked action log.
- Validate state transitions in services; do not rely on the LLM or playbook text to decide whether an action is legal.

## Completion requirements

- [ ] A Trace CLI is available inside Claude Code/Codex sessions.
- [ ] Session startup injects scoped, revocable credentials for the CLI.
- [ ] Actions call services through the CLI/API or direct service runtime path.
- [ ] Actions never write DB rows directly.
- [ ] Actions validate scope and permissions.
- [ ] Actions produce machine-readable success/failure output.
- [ ] Inbox and message actions are available.
- [ ] Ticket draft submission is available for D0 plan approval.
- [ ] PR/merge actions are permissioned and can be disabled.
- [ ] Repeated action calls with the same operation key are safe.
- [ ] Action results are durable enough for the next episode's context packet.
- [ ] Services reject actions when the project run is paused, cancelled, completed, or outside the episode scope.
- [ ] Tests reject out-of-scope project/ticket/session actions.

## Notes

- This is not the ambient agent action surface. It is scoped to explicit orchestrator episode sessions.
- Keep GraphQL resolvers thin if new external mutations are needed. Agent runtime paths should call the service layer directly.
- The same CLI/action surface should work for both Claude Code and Codex. Vendor-specific process setup belongs in coding-tool adapters; action semantics belong in Trace services.
- Injected credentials must not be printed into chat, stored in prompts, or persisted in event payloads.
