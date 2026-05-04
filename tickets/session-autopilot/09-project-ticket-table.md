# 09 — Project Ticket Table

## Summary

Add the project-scoped ticket surface so generated tickets are reviewable and useful before autonomous execution exists.

## What needs to happen

- Add project ticket query/filtering support.
- Reuse existing ticket grid patterns.
- Show project planning metadata:
  - plan position
  - dependency readiness
  - generated/manual source where available
  - execution state when available later
- Support opening the existing ticket detail panel.
- Support filtering/sorting by status, priority, assignee, and dependency state.
- Hydrate rows from ticket, planned-ticket, dependency, and project-link events.

## Deliverable

Users can review, edit, and manage tickets generated from a project plan.

## Completion requirements

- [x] Project detail has a Tickets view.
- [x] Tickets list is filtered by project.
- [ ] Planned ticket order is visible.
- [ ] Dependency state is visible.
- [ ] Existing ticket detail panel works.
- [ ] Store updates from events, not mutation response reads.
- [x] Empty state explains that planning can generate tickets.
- [x] A normal project-linked ticket without `ProjectPlanTicket` still appears.
- [ ] A planned ticket row can be upserted directly from event payload snapshots.

## Implementation notes

- Keep tickets as normal tickets.
- Do not fork a separate project-ticket implementation.
- The first slice can be a compact project detail list; graduate to the existing grid/table pattern when planned-ticket metadata ships.
- Virtualize the full list/table once it can grow beyond the compact detail panel.
- Components should receive entity IDs and select fields through Zustand hooks.
- Planned-ticket metadata augments normal tickets; it does not replace them.

## How to test

1. Generate or seed project tickets.
2. Open project tickets view.
3. Update a ticket and verify event hydration updates the row.
4. Verify dependency metadata displays correctly.
5. Add a manually linked ticket and verify it appears without plan metadata.
