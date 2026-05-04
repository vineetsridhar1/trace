# 05 — Planning Conversation Service

## Summary

Add service-backed persistence for planning artifacts produced by project-linked interviewer sessions.

## What needs to happen

- Add a planning service for project runs.
- Support durable planning artifacts:
  - decisions
  - risks
  - summary updates
- Persist approved planning state through project events and project-run fields.
- Add project planning event payloads with snapshots for hydration.
- Keep the planning flow useful without code execution.
- Define payload contracts:
  - `project_question_asked`: `{ projectRunId, message }`
  - `project_answer_recorded`: `{ projectRunId, message }`
  - `project_decision_recorded`: `{ projectRunId, decision }`
  - `project_risk_recorded`: `{ projectRunId, risk }`
  - `project_plan_summary_updated`: `{ projectRun }`

## Deliverable

The project can maintain approved plan state, decisions, risks, and a plan summary while the live interview itself happens in a normal linked session.

## Completion requirements

- [x] User planning messages can be recorded in the project scope when needed.
- [x] AI questions can be recorded in the project scope when needed.
- [x] Answers and decisions update project-run planning state.
- [x] Plan summary is durable and event-backed.
- [x] Planning can request more information instead of prematurely generating tickets.
- [x] Refresh can reconstruct durable approved planning artifacts without transcript parsing.
- [x] Service tests cover planning state transitions.

## Implementation notes

- The planning conversation is not the orchestrator's only memory.
- Use events and summaries as durable state.
- Keep this ticket focused on persistence and services, not model prompting.
- The live interview uses a normal project-linked session in ticket 06.
- Use generated GraphQL/client types for exposed planning payloads; do not redefine schema types locally.

## How to test

1. Start a project run from a goal.
2. Record an AI question.
3. Submit a user answer.
4. Verify decisions and summary updates.
5. Refresh/reload from persisted events and verify the same planning state appears.
