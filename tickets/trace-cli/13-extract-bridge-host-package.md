# 13 - Extract Bridge Host Package

## Summary

Move the local runtime host logic out of `apps/desktop/src/bridge.ts` (~1,660 lines, already Electron-free) into a new `packages/bridge-host`, consumed by the desktop app with zero behavior change. This unlocks ticket 14 (`trace runtime up`) without a rewrite.

## Plan coverage

Owns plan lines:

- 58: portable-bridge baseline (desktop bridge has no Electron imports)
- 87: `packages/bridge-host` package definition
- 190: extraction approach (behavior-preserving refactor)
- 298: bridge-host testing requirements
- 305: open decision resolved — reuse the desktop bridge, not `apps/container-bridge`'s loop

## What needs to happen

- Create `packages/bridge-host` (tsc build like `packages/shared`) and move the runtime-host machinery from `apps/desktop/src/bridge.ts`: bridge WebSocket connection loop, `runtime_hello` registration, `prepare` (worktree creation), `run`/`send` (tool process management), terminal multiplexing keyed by `terminalId`, file operations, linked-checkout handlers, heartbeats.
- Define an injection surface for host-specific concerns so desktop and CLI differ only in configuration:
  - auth header/cookie provider (desktop uses the session cookie; CLI will use a bridge token)
  - repo registry (which local repos are registered, their paths)
  - workspace root for worktrees, instance ID, runtime label
- `apps/desktop` consumes the package, providing its Electron-side implementations of the injection points. Its observable behavior — every bridge message, in the same order — is unchanged.
- The wire protocol (`packages/shared/src/bridge.ts`) is untouched. `runtime_hello hostingMode: "local"` semantics are preserved exactly.

## Dependencies

- None. Fully parallel with M1/M2/M4.

## Completion requirements

- [ ] `packages/bridge-host` builds standalone with no Electron or desktop imports
- [ ] Desktop compiles against the package with its bridge behavior preserved
- [ ] Local sessions from desktop still work: register, `prepare` → `workspace_ready`, `run` → output events, terminals, stop/cleanup
- [ ] Terminal multiplexing by `terminalId` behaves identically (multiple concurrent terminals per session)
- [ ] `packages/shared/src/bridge.ts` has no changes

## Implementation notes

- This is a move-and-parameterize refactor. Resist cleanups; diff-review is the safety net and it should read as relocation plus injection seams.
- Follow the agent-environments plan's terminal-multiplexing requirements (`tickets/agent-environments/agent-environments-plan.md`, Terminal Multiplexing section) — they are the contract this package must keep.
- `node-pty` and `ws` move with the code; check how desktop currently builds/bundles native deps before choosing where `node-pty` lives.

## How to test

1. Run the agent-environments local checklist end to end with the refactored desktop: bridge registers as local, repo-backed session runs, `prepare`/`workspace_ready`/`run`/output flow, terminals open and multiplex, stop/delete cleans up.
2. Unit-test the injection seams (auth provider called on connect, repo registry consulted on `runtime_hello`).
3. Diff review confirms no protocol or ordering changes.
