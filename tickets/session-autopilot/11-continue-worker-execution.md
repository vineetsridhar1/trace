# 11 — Worker Execution Actions

## Summary

Let controller runs create, start, and continue ticket worker sessions through service-backed actions. V1 starts only one worker execution at a time.

## What needs to happen

- Add service methods/actions for:
  - creating a ticket execution
  - creating a ticket branch/worktree from the group branch
  - starting a worker session with `role = ticket_worker`
  - linking the worker session to the ticket execution
  - sending a follow-up message to an existing worker
  - marking execution state as running/reviewing/blocked/ready
- Add scheduler helper for selecting the next runnable ticket from dependency edges.
- Select runnable tickets from `UltraplanTicket` membership and dependency state.
- Ensure worker sessions use their own ticket branch.
- Ensure workers do not directly mutate the group integration branch.
- Ensure worker session branch/workdir changes do not overwrite session-group integration branch/workdir state.
- Ensure v1 does not launch more than one active worker execution per Ultraplan.
- Emit ticket execution events for every transition.
- Handle runtime access or delivery errors safely.

## Dependencies

- [10 — Ultraplan Event Router](10-autopilot-orchestrator.md)

## Completion requirements

- [ ] Controller run can create a TicketExecution for a ticket.
- [ ] Controller run can start a worker session for that execution.
- [ ] Worker session has `role = ticket_worker`.
- [ ] Worker session uses a ticket-specific branch/worktree.
- [ ] Scheduler starts only the next dependency-ready ticket.
- [ ] Scheduler ignores tickets that are not linked through `UltraplanTicket`.
- [ ] V1 blocks parallel worker launches for one Ultraplan.
- [ ] Controller run can send a bounded follow-up to a worker.
- [ ] Failures surface as execution/Ultraplan errors, not silent drops.

## Implementation notes

- Reuse the existing session service and session router.
- Do not create a second session launch path for Ultraplan.
- Follow-up messages should be concrete and scoped to the ticket.

## How to test

1. Create a ticket execution from a service call.
2. Start a worker session and verify branch, role, and links.
3. Send a follow-up to an existing worker.
4. Try to start a second worker while one execution is active and verify it is rejected or queued.
5. Simulate runtime access failure and verify state/error events.
6. Verify the group branch is unchanged by worker launch.
7. Verify worker branch/workdir state remains ticket-execution scoped.
