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
- Define payload contracts:
  - `project_question_asked`: `{ projectRunId, message }`
  - `project_answer_recorded`: `{ projectRunId, message }`
  - `project_decision_recorded`: `{ projectRunId, decision }`
  - `project_risk_recorded`: `{ projectRunId, risk }`
  - `project_plan_summary_updated`: `{ projectRun }`

## Deliverable

The project can maintain an interview thread, decisions, risks, and a plan summary before ticket generation exists.

## Completion requirements

- [x] User planning messages are recorded in the project scope.
- [x] AI questions are recorded in the project scope.
- [x] Answers and decisions update project-run planning state.
- [x] Plan summary is durable and event-backed.
- [x] Planning can request more information instead of prematurely generating tickets.
- [x] Refresh can reconstruct the planning surface without transcript parsing.
- [x] Service tests cover planning state transitions.

## Implementation notes

- The planning conversation is not the orchestrator's only memory.
- Use events and summaries as durable state.
- Keep this ticket focused on persistence and services, not model prompting.
- A linked planning/controller session may exist later, but it is never the canonical planning store.
- Use generated GraphQL/client types for exposed planning payloads; do not redefine schema types locally.

## How to test

1. Start a project run from a goal.
2. Record an AI question.
3. Submit a user answer.
4. Verify decisions and summary updates.
5. Refresh/reload from persisted events and verify the same planning state appears.
