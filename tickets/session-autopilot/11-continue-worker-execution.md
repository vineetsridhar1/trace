# 11 — Continue-Worker Execution

## Summary

Take a parsed `continue_worker` decision and apply it to the primary worker session using the existing session service control plane.

## What needs to happen

- Map parsed `continue_worker` decisions onto:
  - `sessionService.sendMessage(...)`, or
  - `sessionService.run(...)` when needed
- Update Autopilot state after applying the decision:
  - status
  - last checkpoint sha
  - last decision summary
  - consecutive auto turns
- Emit `session_autopilot_decision_applied`.
- Handle runtime access or delivery errors safely.

## Dependencies

- [10 — Autopilot Orchestrator](10-autopilot-orchestrator.md)

## Completion requirements

- [ ] A valid `continue_worker` decision sends a focused follow-up to the worker session.
- [ ] Worker messages are not duplicated on the same checkpoint.
- [ ] Autopilot state tracks consecutive auto turns.
- [ ] Failures surface as Autopilot errors, not silent drops.

## Implementation notes

- Reuse the existing session service instead of inventing a second message path.
- The follow-up message should be concrete and bounded, not a raw dump of the controller XML.

## How to test

1. Force a `continue_worker` decision and verify the worker session receives one follow-up.
2. Repeat the same decision on the same checkpoint and verify it is ignored.
3. Simulate delivery failure and verify Autopilot enters a visible error state.

