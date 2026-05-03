# 07 — Ticket Planning Model

## Summary

Add the durable ticket planning fields and project-run planned-ticket association needed before AI ticket generation ships.

## What needs to happen

- Add ticket planning fields:
  - acceptance criteria
  - test plan
  - optional estimate/size if product wants it now
- Add general `TicketDependency` edges.
- Add planned-ticket association:
  - `ProjectPlanTicket`
  - `ProjectPlanTicketStatus`
  - position
  - generated-by metadata
  - rationale
- Expose the model through services and GraphQL.
- Add client store/event hydration support for planned tickets and dependencies.

## Deliverable

Trace can represent a project ticket plan and dependency graph before any worker execution exists.

## Completion requirements

- [ ] Tickets can store acceptance criteria and test plans.
- [ ] Dependencies can represent both linear and branching DAGs.
- [ ] Planned tickets can exist before executions.
- [ ] Planned ticket position/status are durable.
- [ ] Services validate project/run/ticket organization boundaries.
- [ ] Events hydrate planned tickets and dependencies.

## Implementation notes

- Tickets remain normal Trace tickets.
- Do not infer planned tickets only from executions.
- Do not hardcode `previousTicketId` as the only sequencing primitive.

## How to test

1. Create tickets with acceptance criteria and test plans.
2. Create a project run with planned tickets.
3. Create a linear dependency chain.
4. Create a branching dependency graph.
