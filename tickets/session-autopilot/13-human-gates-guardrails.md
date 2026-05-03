# 13 — Human Gates and Guardrails

## Summary

Add human approval gates and loop-protection controls for project orchestration.

## What needs to happen

- Add project orchestration inbox gate types:
  - project plan approval
  - ticket validation
  - conflict resolution
  - final review
- Add pause/resume/cancel service methods for project runs.
- Add cooldowns and dedupe for controller triggers.
- Prevent infinite controller/worker loops.
- Require human approval for large or risky plans when configured.
- Route gate resolution back into project-run state.

## Deliverable

The project orchestrator can safely stop for human judgment and avoid runaway execution.

## Completion requirements

- [ ] Project run can be paused/resumed/cancelled.
- [ ] Plan approval gate can be created and resolved.
- [ ] Ticket validation gate can be created and resolved.
- [ ] Gate resolution emits project events.
- [ ] Controller wakeup after gate resolution is deduped.
- [ ] Cooldowns prevent rapid repeated controller runs.
- [ ] UI clearly shows active gate state.

## Implementation notes

- Inbox remains the human handoff primitive.
- Gate payloads should include project, project run, ticket, execution, session, branch, and summary IDs where relevant.
- Do not let unresolved gates silently continue execution.

## How to test

1. Create a plan approval gate.
2. Resolve it and verify the project run advances.
3. Pause a running project run and verify no worker starts.
4. Emit duplicate gate-resolution events and verify one wakeup.
