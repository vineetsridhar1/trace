# 07 — Project Planning Conversation Service

## Summary

Add the service-backed planning/interview flow that turns a raw project goal into structured project knowledge.

## What needs to happen

- Add a planning service for project runs.
- Support planning turns:
  - user answers
  - AI questions
  - decisions
  - risks
  - summary updates
- Persist planning state through project events and project-run fields.
- Add a system prompt for the planning agent:
  - interview the user
  - identify missing requirements
  - keep scope explicit
  - avoid creating tickets until enough information exists or the user asks
  - summarize decisions
- Keep the planning flow useful without code execution.

## Deliverable

The project AI can interview the user and maintain durable planning state.

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
- Keep the prompt focused on planning, not autonomous coding.

## How to test

1. Start a project run from a goal.
2. Trigger an AI planning turn.
3. Verify question/summary events are created.
4. Submit an answer.
5. Verify decisions/summary update.
