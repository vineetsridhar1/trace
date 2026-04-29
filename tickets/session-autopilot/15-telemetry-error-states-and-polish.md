# 15 — Integration, Telemetry, and Polish

## Summary

Complete the loop by integrating approved ticket branches into the group branch, surfacing errors clearly, and adding the metrics needed to evaluate the workflow.

## What needs to happen

- Add service-layer integration flow:
  - merge or cherry-pick approved ticket branch into group branch
  - record integration result
  - update TicketExecution status
  - emit integration events
  - create conflict gates when needed
- Surface the final group branch/PR as the user QA target.
- Emit metrics for:
  - Ultraplan created/completed/failed/cancelled
  - controller runs created/started/completed/failed
  - planned tickets created/updated/reordered
  - controller run summary validation failures
  - worker sessions launched
  - next-ticket scheduling decisions
  - worker done/failed/stopped outcomes
  - human gates created/resolved/dismissed
  - ticket executions integrated/blocked/failed
  - integration conflicts
- Emit performance signals for:
  - controller run latency
  - context packet size
  - diff truncation
  - worker execution duration
  - integration duration
- Surface error states clearly in the session group UI.
- Add lightweight timeline/history entries for Ultraplan actions, primarily from controller run summaries.
- Verify degraded behavior when runtime, bridge, permission, summary parsing, or integration assumptions fail.

## Dependencies

- [05 — Group Controls and Ultraplan UI](05-header-controls-and-settings-ui.md)
- [07 — Branch and Diff Runtime Commands](07-commit-diff-bridge-command.md)
- [11 — Worker Execution Actions](11-continue-worker-execution.md)
- [12 — Human Gates Server Flow](12-human-validation-handoff-server.md)
- [13 — Human Gate Inbox UI](13-human-validation-inbox-web-ui.md)
- [14 — Guardrails, Pause, and Sequencing](14-guardrails-pause-and-cooldowns.md)

## Completion requirements

- [ ] Approved ticket branches can integrate into the group branch.
- [ ] Conflict results create gates instead of corrupting state.
- [ ] Final group branch is visible as the QA/merge target.
- [ ] Controller run metrics distinguish created/started/completed/failed.
- [ ] Planned-ticket events are visible and hydrate client state without refetches.
- [ ] Metrics can distinguish sequential v1 scheduling from future DAG scheduling.
- [ ] User-visible error states are understandable and recoverable.
- [ ] Permission/runtime/summary/integration failures degrade into clear `failed`, `blocked`, or `needs_human` states.

## Implementation notes

- This is where service-owned git mutation becomes product-visible.
- Do not merge into the repository default branch.
- Keep timeline/history lightweight; controller-run summary events should carry most of the product-readable activity.
- All Ultraplan and ticket-execution events should carry snapshots sufficient for Zustand upserts.

## How to test

1. Integrate a clean ticket branch into the group branch.
2. Force an integration conflict and verify a conflict gate.
3. Verify the final group branch contains integrated work from multiple tickets.
4. Verify metrics emit for controller runs, workers, gates, and integration events.
5. Verify UI error states for bridge/runtime/summary/integration failures.
