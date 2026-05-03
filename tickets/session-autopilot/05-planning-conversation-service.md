# 05 — Planning Conversation Service

## Summary

Add the service-backed planning/interview flow that turns a raw project goal into durable project knowledge.

## What needs to happen

- Add a planning service for project runs.
- Support planning turns:
  - user answers
  - AI questions
  - decisions
  - risks
  - summary updates
- Persist planning state through project events and project-run fields.
- Add project planning event payloads with snapshots for hydration.
- Keep the planning flow useful without code execution.

## Deliverable

The project can maintain an interview thread, decisions, risks, and a plan summary before ticket generation exists.

## Completion requirements

- [ ] User planning messages are recorded in the project scope.
- [ ] AI questions are recorded in the project scope.
- [ ] Answers and decisions update project-run planning state.
- [ ] Plan summary is durable and event-backed.
- [ ] Planning can request more information instead of prematurely generating tickets.
- [ ] Service tests cover planning state transitions.

## Implementation notes

- The planning conversation is not the orchestrator's only memory.
- Use events and summaries as durable state.
- Keep this ticket focused on persistence and services, not model prompting.

## How to test

1. Start a project run from a goal.
2. Record an AI question.
3. Submit a user answer.
4. Verify decisions and summary updates.
