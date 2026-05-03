# 10 — Manual Execution Links

## Summary

Let users manually start sessions or session groups from project tickets before autonomous orchestration exists.

## What needs to happen

- Add actions from a project ticket:
  - start session for ticket
  - start session group for ticket/project
  - link existing session/session group to ticket/project
- Store links through existing ticket/project link services or new service methods.
- Show linked sessions/session groups on project and ticket surfaces.
- Ensure sessions started from a project inherit project/repo context.

## Deliverable

Projects become useful for real coding workflows before the orchestrator can launch workers.

## Completion requirements

- [ ] User can start a session from a project ticket.
- [ ] Session links back to the project and ticket.
- [ ] User can link an existing session to a project ticket.
- [ ] Project detail shows linked active sessions/session groups.
- [ ] Ticket detail shows linked sessions.
- [ ] Events hydrate the links.

## Implementation notes

- This is the bridge milestone between planning and automation.
- Do not add scheduler behavior here.
- Reuse existing session start behavior where possible.

## How to test

1. Start a session from a project ticket.
2. Verify project, ticket, and session links.
3. Link an existing session to a ticket.
4. Verify UI updates from events.
