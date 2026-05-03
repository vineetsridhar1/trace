# 14 — Integration and Final QA

## Summary

Integrate approved ticket work into a project run integration branch/session group and surface operational state clearly.

## What needs to happen

- Add service-owned branch integration operations.
- Preserve workspace identity:
  - project run/session group integration branch
  - per-ticket worker branch/workdir
- Integrate approved ticket branches into the integration branch.
- Record integration checkpoints.
- Report conflicts as human gates.
- Add final QA gate.
- Add telemetry for planning, controller runs, workers, gates, and integration.
- Polish error states across project run UI.
- Define integration event payloads:
  - `ticket_execution_integrated`: `{ ticketExecution, projectRun, ticket }`
  - conflict gate events include branch/checkpoint IDs needed for review.

## Deliverable

A sequential project run can produce one final testable branch with clear conflict and QA handling.

## Completion requirements

- [ ] Worker branches do not directly mutate the integration branch.
- [ ] Integration is service-owned.
- [ ] Successful integration records checkpoint metadata.
- [ ] Conflict creates a human gate.
- [ ] Final QA gate can be requested.
- [ ] Project UI shows integration status.
- [ ] Telemetry captures controller/worker/integration failures.
- [ ] Errors are actionable and visible.
- [ ] Integration events hydrate project-run and ticket-execution state without refetching.

## Implementation notes

- Do not autonomously merge into the repo default branch.
- Keep integration serialized even after parallel workers exist.
- Reuse bridge/runtime branch utilities where possible.
- Integration state belongs to services and execution records, not session transcript parsing.

## How to test

1. Complete a ticket worker.
2. Approve integration.
3. Verify branch integration updates the project run.
4. Simulate conflict and verify gate creation.
5. Complete final QA and verify project run completion.
