# 14 — Guardrails, Pause, and Cooldowns

## Summary

Add the loop protections that keep Session Autopilot useful instead of noisy: max auto turns, checkpoint dedupe, pause semantics, and cooldowns after human dismissal.

## What needs to happen

- Enforce a max consecutive auto-turn count.
- Store and compare the last reviewed checkpoint sha.
- Prevent duplicate `continue_worker` actions for the same checkpoint.
- Add pause and resume behavior for Autopilot.
- Add cooldown behavior when a human dismisses a validation request.
- Prevent review runs while Autopilot is paused or cooling down.

## Dependencies

- [11 — Continue-Worker Execution](11-continue-worker-execution.md)
- [12 — Human Validation Handoff (Server)](12-human-validation-handoff-server.md)

## Completion requirements

- [ ] Autopilot cannot continue indefinitely without human involvement.
- [ ] Same-checkpoint duplicate actions are blocked.
- [ ] Pause and resume are explicit product states.
- [ ] Dismissal cooldowns prevent instant re-notification spam.

## Implementation notes

- Keep these protections in the service/orchestrator layer, not the UI.
- Favor a small set of clear rules over many heuristics.

## How to test

1. Trigger repeated continue decisions and verify max-turn enforcement.
2. Replay a review on the same checkpoint and verify no action is taken.
3. Pause Autopilot and verify worker completion no longer triggers review.
4. Dismiss a validation inbox item and verify cooldown behavior.
