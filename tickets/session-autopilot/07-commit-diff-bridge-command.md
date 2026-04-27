# 07 — Commit Diff Bridge Command

## Summary

Add first-class support for retrieving a commit patch from a session runtime. The controller needs this to review real code changes, not just assistant prose.

## What needs to happen

- Add a new bridge command and result type:
  - `commit_diff`
  - `commit_diff_result`
- Add session-router support for requesting commit diffs from a runtime.
- Implement handlers in:
  - shared bridge contract
  - desktop bridge
  - container bridge
- Use `git show --stat --patch` or equivalent for the target sha.
- Add size limits and safe error handling.

## Dependencies

- None

## Completion requirements

- [ ] Server can request a commit diff by sha from a runtime.
- [ ] Desktop and container bridges both support the command.
- [ ] Invalid refs fail safely.
- [ ] Large diffs are truncated deterministically.

## Implementation notes

- Keep the command read-only.
- The controller does not need a perfect raw patch for huge diffs; a bounded response with top hunks is acceptable.

## How to test

1. Create a checkpoint commit in a session workspace.
2. Request its diff through the new server path.
3. Verify correct output on both local and cloud runtimes.
4. Verify invalid sha and missing workdir cases return safe errors.
