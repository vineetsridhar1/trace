# 12 — Human Validation Handoff (Server)

## Summary

Create the server-side handoff path for `request_human_validation`. This ticket creates the inbox item, updates Autopilot state, and wires resolution or dismissal back into the Autopilot lifecycle.

## What needs to happen

- Create `autopilot_validation_request` inbox items through the inbox service.
- Define the payload:
  - session group id
  - worker session id
  - checkpoint sha
  - PR url
  - summary
  - QA checklist
  - controller tool/model
- Emit `session_autopilot_handoff_requested`.
- Update Autopilot state to `needs_human`.
- Define what happens when the inbox item is resolved or dismissed.

## Dependencies

- [10 — Autopilot Orchestrator](10-autopilot-orchestrator.md)

## Completion requirements

- [ ] `request_human_validation` creates one active inbox item.
- [ ] Duplicate active validation inbox items are not created for the same group.
- [ ] Autopilot state transitions to `needs_human`.
- [ ] Inbox resolution or dismissal is visible to Autopilot.

## Implementation notes

- Use the inbox service and event service; do not special-case the DB writes.
- Prefer `sourceType = session_group` for the inbox item if the handoff is truly lineage-scoped.

## How to test

1. Force a `request_human_validation` decision and verify an inbox item is created.
2. Force the same decision again and verify no duplicate active item is created.
3. Resolve the inbox item and verify Autopilot state updates.
4. Dismiss the inbox item and verify cooldown/pause hooks are possible.

