# 07 — Orchestrator Context Packet

## Summary

Build the context packet given to each orchestrator episode.

## Scope

- Include lifecycle event details.
- Include project, project run, tickets, current ticket execution, and playbook.
- Include relevant prior decisions and messages.
- Include implementation session messages when relevant.
- Include branch/checkpoint/diff context when available.
- Keep the packet bounded and deterministic.
- Leave a template slot for the user-provided final prompt.
- Store either the packet snapshot or a stable hash plus all source cursors on the orchestrator episode for audit and replay.
- Use event cursors, summaries, and hard limits for long project histories and session logs.
- Build the packet in a service with deterministic ordering and explicit token/size budgets.

## Completion requirements

- [ ] Context packet includes the triggering lifecycle event.
- [ ] Context packet includes current project/ticket state.
- [ ] Context packet includes the effective playbook.
- [ ] Context packet can include diff/session history without unbounded growth.
- [ ] Large projects and long implementation sessions still produce bounded packets.
- [ ] Packet construction records source event/message/checkpoint cursors for debugging.
- [ ] Tests cover packet construction for implementation complete, review complete, QA response, and PR merged events.
- [ ] Packet construction does not use ambient memory.

## Notes

- The context packet is the orchestrator's memory boundary. It should be inspectable in debug UI later.
- Prefer concise entity snapshots plus links/ids over bulk event dumps. Include full diffs only when they are necessary and bounded.
