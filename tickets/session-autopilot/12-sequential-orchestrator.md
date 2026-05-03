# 12 — Sequential Orchestrator

## Summary

Add the first autonomous execution loop: one ready ticket worker at a time.

## What needs to happen

- Add ticket execution records.
- Add `SessionRole.ticket_worker`.
- Define ticket-execution event payloads:
  - `ticket_execution_created`: `{ ticketExecution, projectRun, ticket }`
  - `ticket_execution_updated`: `{ ticketExecution, projectRun, ticket }`
- Add a scheduler that selects the next ready ticket:
  - unstarted
  - dependencies completed/integrated
  - project run not paused
  - no active worker for the run
- Start one worker session for the selected ticket.
- Wake a controller run when a worker completes, fails, or stops.
- Dedupe worker lifecycle wakeups.
- Keep worker sessions linked to ticket, project, project run, and session group.

## Deliverable

A project run can implement a ticket plan sequentially through normal Trace sessions.

## Completion requirements

- [ ] Project run can start the next ready ticket.
- [ ] Only one worker is active per project run.
- [ ] Worker session is linked to ticket/project/project run.
- [ ] Worker completion creates one controller run.
- [ ] Worker failure creates one controller run.
- [ ] Ordinary `session_output` does not wake the controller.
- [ ] Ticket execution state transitions are event-backed.
- [ ] Dependency cycles are impossible because the planning service rejects them.
- [ ] Scheduler readiness ignores tickets not planned in the current project run.

## Implementation notes

- Keep integration out of scope unless needed for readiness semantics.
- Use dependency edges even if v1 plans are linear.
- This ticket should preserve a path to `maxParallelWorkers > 1`.
- Sequential scheduling is equivalent to `maxParallelWorkers = 1`.
- Worker sessions are runtimes for execution attempts, not the durable execution record.

## How to test

1. Create a project run with three dependent tickets.
2. Start orchestration.
3. Verify only the first ticket worker starts.
4. Complete the worker and verify controller wakeup.
5. Verify duplicate lifecycle events do not create duplicate controller runs.
6. Add an unrelated project ticket and verify the scheduler ignores it.
