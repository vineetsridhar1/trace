# 07 — Branch and Diff Runtime Commands

## Summary

Add runtime/bridge support for reading worker branch diffs and performing service-owned integration operations into the session group branch.

## What needs to happen

- Add read-only bridge command support for commit/branch diffs:
  - latest checkpoint patch
  - branch diff against group branch
  - file/stat summary
- Add service-owned integration command support:
  - merge ticket branch into group branch
  - cherry-pick ticket checkpoint into group branch if chosen
  - rebase ticket branch onto updated group branch
  - abort/report conflicts safely
- Implement handlers in:
  - desktop bridge
  - container bridge
  - session router
  - shared bridge types
- Add size limits and deterministic truncation for diff output.
- Ensure integration operations can only run through authorized service calls.

## Dependencies

- [01 — Database Schema and Event Types](01-database-schema-and-event-types.md)
- [04 — Ultraplan Service CRUD and Controller Runs](04-autopilot-service-crud-and-state.md)

## Completion requirements

- [ ] Server can request a bounded diff for a worker branch/checkpoint.
- [ ] Desktop and container bridges both support the diff command.
- [ ] Service-owned merge/rebase/cherry-pick commands exist behind authorization.
- [ ] Invalid refs fail safely.
- [ ] Merge conflicts produce structured conflict results, not silent failures.
- [ ] Large diffs are truncated deterministically.

## Implementation notes

- Keep diff commands read-only.
- Integration commands are mutating but must remain service-owned and event-backed.
- Diff-only bridge plumbing can be prototyped earlier, but merge/rebase/cherry-pick behavior should land after Ultraplan service ownership exists.
- Do not let controller-run sessions run privileged git operations directly.
- Controller-run context should include diffs only when useful, mainly worker review or integration decisions.

## How to test

1. Request a diff for a valid checkpoint.
2. Request a diff for an invalid ref and verify a safe error.
3. Merge a ticket branch into a group branch in a test repo.
4. Force a conflict and verify structured conflict output.
5. Verify large diffs are truncated predictably.
