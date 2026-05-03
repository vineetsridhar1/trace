# 09 — Ticket Generation Contract

## Summary

Define the prompt, runtime actions, and structured output contract for converting a project plan into durable tickets.

## What needs to happen

- Write the ticket-generation system prompt.
- Require generated tickets to include:
  - title
  - description
  - priority
  - labels
  - acceptance criteria
  - test plan
  - dependencies
  - rationale
- Require a structured summary of:
  - assumptions
  - open questions
  - risks
  - proposed milestones
  - tickets created or updated
- Use service-backed actions to create/update tickets.
- Request approval when the plan is large, ambiguous, or high risk.

## Deliverable

The AI can turn planning state into real project tickets with dependency metadata.

## Completion requirements

- [ ] Prompt is stored in the repo and covered by tests where practical.
- [ ] Ticket generation produces machine-readable output.
- [ ] Tickets are created through `ticketService`.
- [ ] Planned ticket associations are created through project-run services.
- [ ] Dependencies are persisted as edges.
- [ ] The controller summary is durable.
- [ ] Invalid or partial outputs fail safely.

## Implementation notes

- Do not parse freeform markdown as the source of truth.
- Do not let the model write directly to the database.
- Allow the model to ask more questions instead of generating tickets.

## How to test

1. Provide a planning context with enough detail.
2. Verify ticket actions create durable tickets.
3. Verify dependency edges are persisted.
4. Provide ambiguous context and verify the model asks for clarification.
