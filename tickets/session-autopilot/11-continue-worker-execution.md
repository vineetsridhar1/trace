# 11 — Worker Execution Actions

## Summary

Let the controller create, start, and continue ticket worker sessions through service-backed actions.

## What needs to happen

- Add service methods/actions for:
  - creating a ticket execution
  - creating a ticket branch/worktree from the group branch
  - starting a worker session with `role = ticket_worker`
  - linking the worker session to the ticket execution
  - sending a follow-up message to an existing worker
  - marking execution state as running/reviewing/blocked/ready
- Ensure worker sessions use their own ticket branch.
- Ensure workers do not directly mutate the group integration branch.
- Emit ticket execution events for every transition.
- Handle runtime access or delivery errors safely.

## Dependencies

- [10 — Ultraplan Event Router](10-autopilot-orchestrator.md)

## Completion requirements

- [ ] Controller can create a TicketExecution for a ticket.
- [ ] Controller can start a worker session for that execution.
- [ ] Worker session has `role = ticket_worker`.
- [ ] Worker session uses a ticket-specific branch/worktree.
- [ ] Controller can send a bounded follow-up to a worker.
- [ ] Failures surface as execution/Ultraplan errors, not silent drops.

## Implementation notes

- Reuse the existing session service and session router.
- Do not create a second session launch path for Ultraplan.
- Follow-up messages should be concrete and scoped to the ticket.

## How to test

1. Create a ticket execution from a service call.
2. Start a worker session and verify branch, role, and links.
3. Send a follow-up to an existing worker.
4. Simulate runtime access failure and verify state/error events.
5. Verify the group branch is unchanged by worker launch.
