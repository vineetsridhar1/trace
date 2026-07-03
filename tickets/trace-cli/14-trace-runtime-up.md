# 14 - CLI Local Runtime (`trace runtime up`)

## Summary

`trace runtime up` registers the user's machine as a local Trace runtime over `/bridge`, using `packages/bridge-host`. Neovim plus one terminal command becomes a complete Trace setup — no Electron app required for local sessions.

## Plan coverage

Owns plan lines:

- 73-74, 81: the runtime-host face of the process
- 131: `trace runtime up` command
- 178-192: local runtime hosting flow, repo registration, independence from M1/M2/M4
- 231: server gaps revealed by CLI hosting (e.g. runtime labels)

## What needs to happen

- `trace runtime up`:
  - persist a stable `instanceId` in `config.json` (generated once)
  - GET `/auth/bridge-token?instanceId=<id>` with bearer + org header (`apps/server/src/routes/auth.ts` ~line 744)
  - connect to `wss://<server>/bridge` and send `runtime_hello { hostingMode: "local", supportedTools, registeredRepoIds }` via bridge-host
  - stay resident: heartbeats, `prepare`/`run`/`send`/terminal handling all come from bridge-host
  - reconnect loop that re-fetches the bridge token on each reconnect (tokens are short-lived)
  - human status output on stderr/stdout: registered repos, connected state, active sessions
- Repo registry commands: `trace runtime add-repo <path>`, `trace runtime list-repos`, `trace runtime remove-repo <path>` — map local paths to Trace repo IDs the same way desktop registers repos (follow its repo-registration flow), persisted in `~/.config/trace/`.
- `supportedTools`: detect installed tools (claude code, codex, ...) the same way desktop does, overridable in config.
- Graceful shutdown on SIGINT: warn when sessions are active, perform the same cleanup desktop performs on bridge disconnect, never delete user repos (local runtimes clean Trace-created worktrees only).

## Dependencies

- [03 - Auth Commands](03-auth-commands.md)
- [13 - Extract Bridge Host Package](13-extract-bridge-host-package.md)

## Completion requirements

- [ ] `trace runtime up` appears as a connected local runtime (`myBridgeRuntimes` / bridge access UI)
- [ ] A session created from web/nvim against this runtime runs end to end: `prepare` → `workspace_ready` → `run` → streamed output
- [ ] Terminals attach and multiplex against CLI-hosted sessions
- [ ] Token refresh keeps the runtime connected across bridge-token expiry and server restarts
- [ ] SIGINT with active sessions warns and cleans up worktree/process state correctly
- [ ] Sessions execute with no Electron app installed

## Implementation notes

- The CLI wrapper should be thin: config + token + status rendering around bridge-host. If logic wants to live here, it probably belongs in `packages/bridge-host`.
- Bridge auth uses the `bridge_auth` token type (`apps/server/src/lib/auth.ts`); the local-mode nuances live in `apps/server/src/lib/bridge-handler.ts` — read its `runtime_hello` validation before wiring.
- Runtime label: something identifiable like `nvim-cli @ <hostname>`; server-side label handling gaps go in this ticket (plan line 231).

## How to test

1. `trace runtime up` on a machine with a registered repo; from the web UI create a local session on that runtime; verify the full lifecycle including terminal attach.
2. Let the bridge token expire / restart the server; verify auto-reconnect re-registers with sessions intact per existing local-runtime semantics.
3. SIGINT during an active session; verify cleanup matches desktop behavior (worktree removed only when Trace-created, process stopped).
