# 05 - Local Environment Adapter

## Summary

Represent local desktop bridge sessions as agent environments without changing the existing local runtime behavior.

## Plan coverage

Owns plan lines:

- 7-10: connected local desktop bridge support
- 30-42: existing local bridge/session-router baseline
- 106-126: shared bridge protocol for local runtime traffic
- 439-482: local adapter purpose, config, start flow, stop flow, and no host deprovisioning
- 950-952: phase 2 local adapter extraction
- 998: migration of existing local runtime selection
- 1045: open decision on explicit local records versus any accessible bridge
- 1057: V1 local adapter type requirement

## What needs to happen

- Extract or wrap the current local session adapter as `LocalRuntimeAdapter`.
- Support config such as:
  - explicit `runtimeInstanceId`
  - or `runtimeSelection: "any_accessible_local"`
- Reuse current bridge behavior:
  - local bridge connects first
  - server sends `prepare`
  - desktop creates worktree
  - server sends `run` or `send`
  - desktop streams output back
- Keep local repo availability checks.
- Keep bridge access authorization.
- Ensure local deprovisioning only stops processes and cleans Trace-created worktrees.

## Dependencies

- [04 - Runtime Adapter Registry](04-runtime-adapter-registry.md)

## Completion requirements

- [x] Existing local sessions still work.
- [x] Local environments can select an explicit connected bridge.
- [x] Local environments can fall back to an accessible bridge when configured that way.
- [x] Local sessions do not try to provision or deprovision the user's machine.
- [x] Local stop/delete still sends bridge commands for process/worktree cleanup.

## Implementation notes

- Do not rewrite the desktop bridge.
- Keep `runtime_hello hostingMode=local` behavior intact.
- Local should be the lowest-risk adapter because it is mostly a representation change.

## How to test

1. Start Trace Desktop and confirm the bridge registers as local.
2. Create a local environment pointing at the bridge.
3. Start a repo-backed local session.
4. Verify `prepare`, `workspace_ready`, `run`, and output events still flow.
5. Stop/delete the session and verify cleanup still happens locally.
