# 16 — Parallel DAG Scheduler

## Summary

Expand project orchestration from sequential execution to dependency-aware parallel workers.

## What needs to happen

- Add scheduler support for `maxParallelWorkers`.
- Select all ready tickets whose dependencies are satisfied.
- Start multiple workers up to the configured limit.
- Prevent two workers from claiming the same ticket.
- Keep integration serialized.
- Handle stale worker bases and integration conflicts.
- Add debug surfaces for scheduler decisions.

## Deliverable

Independent ready tickets can run in parallel while preserving a coherent final integration branch.

## Completion requirements

- [ ] Scheduler identifies multiple ready tickets.
- [ ] `maxParallelWorkers` is enforced.
- [ ] Ticket claims are concurrency-safe.
- [ ] Integration queue is serialized.
- [ ] Failed or blocked workers do not block unrelated ready tickets unless dependencies require it.
- [ ] Scheduler decisions are inspectable.
- [ ] Tests cover branching DAGs.

## Implementation notes

- This is intentionally post-v1.
- Keep the v1 sequential scheduler as `maxParallelWorkers = 1`.
- Expect more conflicts when workers start from the same integration checkpoint.

## How to test

1. Create a DAG with two independent tickets and one downstream ticket.
2. Set max parallel workers to 2.
3. Verify the independent tickets start together.
4. Verify the downstream ticket waits.
5. Verify integration remains serialized.
