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
- Define each action contract before prompt work:
  - typed input shape
  - typed result shape
  - allowed scope types
  - actor authorization rule
  - event emitted on success
  - safe failure behavior
  - whether human approval is required
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
- [ ] Generated tickets are linked to the project but not treated as project-owned children.
- [ ] Dependency cycles are rejected before any partial plan is committed.

## Implementation notes

- Do not parse freeform markdown as the source of truth.
- Do not let the model write directly to the database.
- Human approval can be required for large or risky plans.
- Prefer transactional ticket generation: either the full valid plan is persisted, or the service returns a structured error/gate.

## How to test

1. Provide planning context with enough detail.
2. Verify ticket actions create durable tickets.
3. Verify dependency edges are persisted.
4. Provide ambiguous context and verify the model asks for clarification.
5. Provide a cyclic dependency plan and verify no partial ticket plan is committed.
