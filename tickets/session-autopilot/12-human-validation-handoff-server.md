# 12 — Human Gates Server Flow

## Summary

Create the server-side path for Ultraplan human gates: plan approval, ticket validation, conflict resolution, and final review.

## What needs to happen

- Create Ultraplan inbox items through the inbox service.
- Support gate item types:
  - `ultraplan_plan_approval`
  - `ultraplan_validation_request`
  - `ultraplan_conflict_resolution`
  - `ultraplan_final_review`
- Define gate payloads with:
  - Ultraplan id
  - controller run id, when applicable
  - session group id
  - ticket id, when applicable
  - ticket execution id, when applicable
  - worker session id, when applicable
  - branch name
  - checkpoint sha
  - summary
  - QA checklist
  - recommended action
  - links to controller run chat and worker session
- Update Ultraplan or TicketExecution state to `needs_human`.
- Define what happens when each gate type is resolved or dismissed.
- Gate resolution should create a fresh controller run when orchestration needs to continue.
- Emit human gate events.
- Emit gate events with `ScopeType.ultraplan` and enough snapshots for client upserts.

## Dependencies

- [10 — Ultraplan Event Router](10-autopilot-orchestrator.md)

## Completion requirements

- [ ] Controller run can request a human gate through the service.
- [ ] Duplicate active gates are not created for the same execution/reason.
- [ ] Ultraplan or execution state transitions to `needs_human`.
- [ ] Inbox resolution/dismissal can trigger a fresh controller run.
- [ ] Gate payloads are complete enough for the web inbox UI.
- [ ] Gate events are scoped to the Ultraplan.

## Implementation notes

- Use the inbox service and event service; do not special-case DB writes.
- Prefer `sourceType = ultraplan` or `ticket_execution` depending on the gate scope.
- Gate resolution should be explicit: approved, changes requested, dismissed, blocked, or cancelled.

## How to test

1. Request a plan approval gate and verify payload/state.
2. Request a ticket validation gate and verify dedupe.
3. Resolve a gate and verify controller-run creation when needed.
4. Dismiss a gate and verify pause/cooldown hooks are possible.
5. Verify events hydrate client state without refetches.
