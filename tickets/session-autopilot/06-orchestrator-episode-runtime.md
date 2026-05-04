# 06 — Orchestrator Episode Runtime

## Summary

Create a new normal coding-tool session for each lifecycle event that needs orchestration. This is the replacement for a long-running or ambient orchestrator.

## Scope

- Add an orchestrator episode record.
- Start a normal coding-tool session for a lifecycle event.
- Link the episode session to project, project run, lifecycle event, and playbook.
- Ensure the episode can execute explicit service/CLI actions.
- Record episode status and summary.
- Stop after the episode completes its decision/action turn.
- Key episode creation by the triggering lifecycle event id so retries and stream replays are idempotent.
- Use a dedicated project-orchestrator consumer/service path, not the ambient agent worker.
- Apply a per-project-run lock or equivalent guard while starting episodes and executing actions.
- Record retry count, last error, context packet hash or snapshot, action results, and terminal status.
- Start the coding-tool session through the session service/router and configured adapters. Do not hardcode Claude, Fly, or provider-specific imports in orchestration services.

## Completion requirements

- [ ] Lifecycle events can start a new orchestrator episode session.
- [ ] Episodes are normal sessions, not ambient agent turns.
- [ ] Episodes receive project/run/ticket/playbook context.
- [ ] Episode decisions and action results are durable.
- [ ] Duplicate lifecycle events do not start duplicate episodes.
- [ ] Failed episode startup is visible and retryable.
- [ ] Episode records enforce a unique trigger event id.
- [ ] At-least-once event delivery produces exactly-once episode side effects.
- [ ] Paused, cancelled, or completed project runs do not start new episodes.
- [ ] Tests cover retry after failed startup without creating a second session.

## Notes

- The first version can be manual or service-triggered. The important boundary is explicit lifecycle event in, session episode out.
- If the initial product defaults to Claude Code, express that through `CodingToolAdapter` configuration and session input defaults only.
