# 14 — Guardrails, Pause, and Sequencing

## Summary

Add the safety rules that keep Ultraplan from becoming noisy or destructive: dedupe, pause/resume behavior, controller-run limits, v1 sequential scheduling, and gate cooldowns.

## What needs to happen

- Enforce one active controller run per session group.
- Enforce v1 `maxParallelWorkers = 1` per Ultraplan.
- Keep the scheduler dependency-aware so future DAG parallelism can be added without replacing the model.
- Prevent duplicate controller runs for the same worker completion event.
- Prevent duplicate active gates for the same execution/reason.
- Add pause and resume behavior for Ultraplan.
- Add cooldown behavior when a human dismisses or rejects a gate.
- Prevent new worker launches and controller-run side effects while paused or blocked on required gates.
- Prevent controller-run sessions from affecting normal session group status.
- Add max retry/attempt behavior for failed ticket executions.

## Dependencies

- [11 — Worker Execution Actions](11-continue-worker-execution.md)
- [12 — Human Gates Server Flow](12-human-validation-handoff-server.md)

## Completion requirements

- [ ] Controller cannot process the same completion event repeatedly.
- [ ] Only one controller run can be active per session group.
- [ ] Only one worker execution can be active per Ultraplan in v1.
- [ ] Scheduler chooses the next ticket from dependency state, not just raw array order.
- [ ] Pause prevents new worker launches and integrations.
- [ ] Controller-run active/failed state is excluded from user-facing group active/failed state.
- [ ] Resume restarts the scheduler/controller-run pipeline safely.
- [ ] Dismissal cooldowns prevent instant re-notification spam.
- [ ] Failed executions do not retry forever.

## Implementation notes

- Keep protections in the service/router layer, not the UI.
- Favor a small set of deterministic rules over many heuristics.
- Parallel worker execution is v2; v1 should preserve the dependency model but run sequentially.

## How to test

1. Emit duplicate worker completion events and verify one controller run.
2. Start more ready tickets than the v1 limit and verify only one worker launches.
3. Pause Ultraplan and verify no new worker/integration action starts.
4. Dismiss a gate and verify cooldown behavior.
5. Force repeated worker failures and verify max-attempt handling.
