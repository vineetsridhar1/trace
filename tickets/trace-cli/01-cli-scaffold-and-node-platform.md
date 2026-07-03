# 01 - CLI Scaffold and Node Platform

## Summary

Create `apps/cli` (`@trace/cli`, bin `trace`) with config/credential storage and a Node implementation of client-core's `Platform` interface, so every later ticket has a working process skeleton with correct auth, output, and file-handling conventions from day one.

## Plan coverage

Owns plan lines:

- 13: `trace` CLI deliverable
- 61-81: architecture diagram and the commands face of the process
- 85: `apps/cli` package definition
- 102-106: token/config file locations, permissions, and env overrides (shared with 03)
- 110: global `--json` output convention
- 302, 306: token-storage and arg-parser open decisions (resolved here: `0600` file, `commander`)

## What needs to happen

- Add `apps/cli` as a pnpm workspace member: `@trace/cli`, `"bin": { "trace": "dist/index.js" }`, ESM, `tsc -b` build and `tsx watch` dev matching sibling apps. Node >= 22.
- Command registration skeleton with `commander`: one file per command group under `src/commands/`, global flags `--server` and `--json`, `trace --version` from package version.
- `src/config.ts`: config dir at `~/.config/trace` (respect `XDG_CONFIG_HOME`), `config.json` (server URL, active org ID) and `credentials.json` (token, created with mode `0600`), plus `TRACE_SERVER` / `TRACE_TOKEN` env overrides.
- `src/platform/node-platform.ts` implementing `Platform` from `packages/client-core/src/platform.ts`:
  - `authMode: "bearer"`, `clientSource: "cli"`
  - `fetch`: global fetch
  - `createWebSocket`: `ws` package
  - `storage` backed by `config.json`, `secureStorage` backed by `credentials.json`
- Output discipline: command output on stdout, diagnostics on stderr. The daemon (ticket 10) depends on stdout staying clean.

## Dependencies

- None.

## Completion requirements

- [x] `pnpm --filter @trace/cli build` produces a runnable `trace` bin
- [x] `trace --help` lists command groups; `trace --version` prints the package version
- [x] Config and credential files are created lazily; `credentials.json` has `0600` permissions
- [x] `TRACE_SERVER` / `TRACE_TOKEN` take precedence over files
- [x] The platform implementation type-checks against client-core's `Platform` interface
- [x] `react` is not in the CLI dependency graph

## Implementation notes

- Until ticket 02 lands, import `Platform` with `import type` only — the runtime `setPlatform()` call happens in ticket 04 through the headless entrypoint.
- No TUI framework. Human output is plain lines/columns.
- Do not add speculative commands; this ticket ships scaffold + platform only.

## How to test

1. Unit tests for config read/write, env-override precedence, and credential file permissions.
2. `pnpm --filter @trace/cli build && trace --help && trace --version`.
3. Write a credential via the storage module and verify `stat -f "%Lp"` reports `600`.
