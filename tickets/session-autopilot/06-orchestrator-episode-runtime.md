# 06 — Orchestrator Episode Runtime

## Summary

Create a new Claude session for each lifecycle event that needs orchestration. This is the replacement for a long-running or ambient orchestrator.

## Scope

- Add an orchestrator episode record.
- Start a normal Claude session for a lifecycle event.
- Link the episode session to project, project run, lifecycle event, and playbook.
- Ensure the episode can execute explicit service/CLI actions.
- Record episode status and summary.
- Stop after the episode completes its decision/action turn.

## Completion requirements

- [ ] Lifecycle events can start a new orchestrator episode session.
- [ ] Episodes are normal sessions, not ambient agent turns.
- [ ] Episodes receive project/run/ticket/playbook context.
- [ ] Episode decisions and action results are durable.
- [ ] Duplicate lifecycle events do not start duplicate episodes.
- [ ] Failed episode startup is visible and retryable.

## Notes

- The first version can be manual or service-triggered. The important boundary is explicit lifecycle event in, session episode out.
