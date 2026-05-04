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

## Completion requirements

- [ ] Context packet includes the triggering lifecycle event.
- [ ] Context packet includes current project/ticket state.
- [ ] Context packet includes the effective playbook.
- [ ] Context packet can include diff/session history without unbounded growth.
- [ ] Tests cover packet construction for implementation complete, review complete, QA response, and PR merged events.
- [ ] Packet construction does not use ambient memory.

## Notes

- The context packet is the orchestrator's memory boundary. It should be inspectable in debug UI later.
