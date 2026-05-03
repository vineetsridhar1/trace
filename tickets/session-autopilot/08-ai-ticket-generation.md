# 08 — AI Ticket Generation

## Summary

Let the planning AI convert project planning state into real Trace tickets.

## What needs to happen

- Write the ticket-generation prompt.
- Require generated tickets to include:
  - title
  - description
  - priority
  - labels
  - acceptance criteria
  - test plan
  - dependencies
  - rationale
- Add scoped actions:
  - `ticket.create`
  - `ticket.update`
  - `ticket.addDependency`
  - `projectRun.addPlannedTicket`
  - `projectRun.updatePlannedTicket`
  - `projectRun.requestApproval`
- Require a structured generation summary.
- Ask more questions instead of generating tickets when planning context is insufficient.

## Deliverable

The AI can turn an approved-enough project plan into durable project tickets with dependency metadata.

## Completion requirements

- [ ] Ticket generation produces machine-readable output.
- [ ] Tickets are created through `ticketService`.
- [ ] Planned-ticket associations are created through project-run services.
- [ ] Dependencies are persisted as edges.
- [ ] The generation summary is durable.
- [ ] Invalid or partial outputs fail safely.

## Implementation notes

- Do not parse freeform markdown as the source of truth.
- Do not let the model write directly to the database.
- Human approval can be required for large or risky plans.

## How to test

1. Provide planning context with enough detail.
2. Verify ticket actions create durable tickets.
3. Verify dependency edges are persisted.
4. Provide ambiguous context and verify the model asks for clarification.
