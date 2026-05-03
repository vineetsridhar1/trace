# 10 — Project Ticket Table

## Summary

Add the project-scoped ticket table so generated tickets are reviewable and useful before autonomous execution exists.

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

## Deliverable

Users can review, edit, and manage tickets generated from a project plan.

## Completion requirements

- [ ] Project detail has a Tickets view.
- [ ] Tickets list is filtered by project.
- [ ] Planned ticket order is visible.
- [ ] Dependency state is visible.
- [ ] Existing ticket detail panel works.
- [ ] Store updates from events, not mutation response reads.
- [ ] Empty state explains that planning can generate tickets.

## Implementation notes

- Keep tickets as normal tickets.
- Do not fork a separate project-ticket implementation.
- Virtualize the list/table.

## How to test

1. Generate or seed project tickets.
2. Open project tickets view.
3. Update a ticket and verify event hydration updates the row.
4. Verify dependency metadata displays correctly.
