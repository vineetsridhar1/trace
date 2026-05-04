# 03 — Project Ticket List

## Summary

Show the durable ticket list for a project after D0 ticket generation completes.

## Scope

- Load tickets linked to a project.
- Show the list on project detail.
- Include status, priority, assignees, labels, and created/updated state.
- Support opening the existing ticket detail panel or equivalent ticket detail surface.
- Keep normal manually linked project tickets visible.

## Completion requirements

- [ ] Clicking a project shows its tickets.
- [ ] Tickets created from the approved plan appear without refresh.
- [ ] Refresh reloads the same ticket list from the DB.
- [ ] Empty state points the user back to planning/ticket generation.
- [ ] Ticket rows use normal ticket entities, not a separate project-ticket type.
- [ ] Ticket list does not depend on the ambient agent.

## Notes

- The first list can be compact. A larger grid/table can follow once planned-ticket metadata and execution state exist.
