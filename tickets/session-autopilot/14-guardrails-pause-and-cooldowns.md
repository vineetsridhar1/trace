# 14 — Guardrails, Pause, and Concurrency

## Summary

Add the safety rules that keep Ultraplan from becoming noisy or destructive: dedupe, pause/resume behavior, controller run limits, worker concurrency limits, and gate cooldowns.

## What needs to happen

- Enforce one active controller run per session group.
- Enforce configurable worker concurrency per Ultraplan.
- Prevent duplicate controller actions for the same worker completion event.
- Prevent duplicate active gates for the same execution/reason.
- Add pause and resume behavior for Ultraplan.
- Add cooldown behavior when a human dismisses or rejects a gate.
- Prevent new worker launches while paused or blocked on required gates.
- Add max retry/attempt behavior for failed ticket executions.

## Dependencies

- [11 — Worker Execution Actions](11-continue-worker-execution.md)
- [12 — Human Gates Server Flow](12-human-validation-handoff-server.md)

## Completion requirements

- [ ] Controller cannot process the same completion event repeatedly.
- [ ] Worker concurrency is bounded.
- [ ] Pause prevents new worker launches and integrations.
- [ ] Resume restarts the scheduler/controller safely.
- [ ] Dismissal cooldowns prevent instant re-notification spam.
- [ ] Failed executions do not retry forever.

## Implementation notes

- Keep protections in the service/router layer, not the UI.
- Favor a small set of deterministic rules over many heuristics.
- Parallel worker execution should be allowed only when dependencies permit it.

## How to test

1. Emit duplicate worker completion events and verify one controller action.
2. Start more ready tickets than the concurrency limit and verify only allowed workers launch.
3. Pause Ultraplan and verify no new worker/integration action starts.
4. Dismiss a gate and verify cooldown behavior.
5. Force repeated worker failures and verify max-attempt handling.
