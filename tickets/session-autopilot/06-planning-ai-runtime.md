# 06 — Planning AI Runtime

## Summary

Wire the AI planning runtime, context packet, prompt, and scoped actions for project interviewing.

## What needs to happen

- Build project planning context packets from:
  - project details
  - members
  - repo metadata
  - initial goal
  - prior questions and answers
  - recorded decisions
  - recorded risks
  - plan summary
- Add a planning system prompt:
  - interview the user
  - identify missing requirements
  - keep scope explicit
  - avoid creating tickets too early
  - summarize decisions
- Provide scoped service-backed actions:
  - `project.get`
  - `project.askQuestion`
  - `project.recordAnswer`
  - `project.recordDecision`
  - `project.recordRisk`
  - `project.summarizePlan`
- Define each action contract before prompt integration:
  - typed input shape
  - typed result shape
  - allowed scope types
  - actor authorization rule
  - event emitted on success
  - safe failure behavior
- Launch planning/controller sessions with scoped runtime context.

## Deliverable

The project AI can ask useful clarifying questions and update durable planning state through Trace services.

## Completion requirements

- [ ] Context packet includes canonical project state.
- [ ] Prompt is stored in the repo.
- [ ] Runtime token scopes actions to one project/project run.
- [ ] Actions call services, not database writes.
- [ ] Action output is machine-readable.
- [ ] Invalid project/run/action combinations are rejected.
- [ ] Prompt cannot create tickets before ticket-generation actions ship.

## Implementation notes

- Reuse existing agent context-builder patterns where practical.
- Keep packets bounded and deterministic.
- Do not rely on model-returned JSON batches as the only action channel.
- Planning sessions are runtime/transcript surfaces only; durable planning state is the project event stream plus `ProjectRun`.
- Runtime actions must use the same service methods humans use.

## How to test

1. Build context for a new project run.
2. Trigger a planning AI turn.
3. Verify the AI can ask a question through a service action.
4. Attempt an out-of-scope project action and verify rejection.
5. Verify an attempted ticket-generation action is unavailable in this milestone.
