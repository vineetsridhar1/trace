# 03 — Project Ticket List

## Summary

Show the durable ticket list for a project after D0 ticket generation completes.

## Scope

- Load tickets linked to a project.
- Show the list on project detail.
- Include status, priority, assignees, labels, and created/updated state.
- Support opening the existing ticket detail panel or equivalent ticket detail surface.
- Keep normal manually linked project tickets visible.
- Hydrate generated tickets from service-created events into the shared entity store. Do not depend on approval mutation results or urql cache state.
- Design the query and store path so it can become paginated without replacing the UI architecture.
- Virtualize the ticket list when it can grow beyond a small D0 list.

## Completion requirements

- [ ] Clicking a project shows its tickets.
- [ ] Tickets created from the approved plan appear without refresh.
- [ ] Refresh reloads the same ticket list from the DB.
- [ ] Empty state points the user back to planning/ticket generation.
- [ ] Ticket rows use normal ticket entities, not a separate project-ticket type.
- [ ] Ticket rows receive IDs and select fields from Zustand instead of passing deep ticket objects through the UI tree.
- [ ] Project ticket events upsert full tickets and project links into the client store.
- [ ] Ticket list does not depend on the ambient agent.

## Notes

- The first list can be compact, but avoid building it around an unbounded project detail query that must load every related ticket forever.
- Lists derive from the entity store; mutations fire-and-forget and reconcile through events.
