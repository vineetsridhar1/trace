# 17 — Runtime Action Wrapper and Auth Plumbing

## Summary

Provide scoped service-backed actions to planning/controller sessions so agents can operate through Trace services.

## What needs to happen

- Launch planning/controller sessions with scoped runtime context:
  - project id
  - project run id
  - controller run id when present
  - runtime token
  - allowed action set
- Provide a runtime executable or equivalent action surface.
- Initial actions:
  - `project.get`
  - `project.update`
  - `project.askQuestion`
  - `project.recordDecision`
  - `project.summarizePlan`
  - `ticket.create`
  - `ticket.update`
  - `ticket.addDependency`
  - `projectRun.addPlannedTicket`
  - `projectRun.updatePlannedTicket`
  - `projectRun.requestApproval`
- Later execution actions:
  - `projectRun.createTicketExecution`
  - `projectRun.startWorker`
  - `projectRun.markExecutionReady`
  - `integration.mergeTicketBranch`
  - `integration.reportConflict`
- Validate every action server-side.

## Deliverable

Agents can plan and create tickets through the same service layer as users.

## Completion requirements

- [ ] Runtime token scopes actions to one project/project run.
- [ ] Invalid project/run/action combinations are rejected.
- [ ] Actions call services, not database writes.
- [ ] Actions emit normal events through services.
- [ ] Action output is machine-readable.
- [ ] Controller prompt documents available actions.
- [ ] Tests cover authorization failures.

## Implementation notes

- This is the boundary that keeps the feature Trace-native.
- Do not rely on model-returned JSON batches as the only action channel.
- Do not expose broad admin capabilities to controller sessions.

## How to test

1. Launch a planning/controller session with scoped env.
2. Call `project.get`.
3. Call `ticket.create`.
4. Attempt an out-of-scope project action and verify rejection.
