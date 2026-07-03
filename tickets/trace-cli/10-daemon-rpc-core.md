# 10 - Daemon RPC Core

## Summary

Implement `trace daemon --stdio`: NDJSON-framed JSON-RPC 2.0 over stdin/stdout with an `initialize` handshake, error model, and lifecycle discipline. This protocol layer is the contract the Neovim plugin (and any future editor) builds against.

## Plan coverage

Owns plan lines:

- 36-49: CLI-engine rationale and the web-architecture mirror (daemon as store, editor as renderer)
- 77-81: the daemon face of the process
- 130: `trace daemon --stdio` command
- 145-152: protocol framing and `initialize`
- 162: `shutdown`
- 176: one daemon per editor instance
- 303: shared-socket open decision (resolved for V1: per-editor stdio)

## What needs to happen

- Framing: one JSON object per line on stdin/stdout. Line-buffered reader tolerant of partial chunks; a malformed line yields a JSON-RPC parse error response, never a crash.
- JSON-RPC 2.0: requests (id + method + params) → responses (result | error), plus server-initiated notifications (no id). Error objects carry `code`, `message`, `data`; define stable codes for: parse error, method not found, invalid params, not initialized, unauthenticated, server disconnected.
- `initialize { protocolVersion, clientInfo }` → `{ cliVersion, protocolVersion, user, org, connectionState }`. Every other method before `initialize` returns "not initialized". Version mismatch returns a structured error the plugin can show via `:checkhealth`.
- `shutdown` → clean dispose (runtime, subscriptions, socket) then exit 0. stdin EOF (editor died) triggers the same path.
- stdout carries protocol frames exclusively; all logging goes to stderr (or a `--log-file`).
- Boot the ticket 04 runtime on `initialize` and forward its connection-state callback as `connection/state` notifications.

## Dependencies

- [04 - Headless Client Runtime](04-headless-client-runtime.md)

## Completion requirements

- [ ] A scripted stdin session (initialize → shutdown) round-trips correctly
- [ ] Malformed input lines produce parse-error responses and the daemon survives
- [ ] Calls before `initialize` are rejected with the documented error code
- [ ] stdin EOF exits promptly with cleanup (no orphaned daemon)
- [ ] `connection/state` notifications fire on server disconnect/reconnect
- [ ] Nothing but protocol frames ever appears on stdout

## Implementation notes

- Keep the protocol layer (framing, correlation, dispatch) separate from method implementations — tickets 11/12 register methods into it, and golden-transcript tests drive it directly.
- Protocol version is a single integer, bumped on breaking change; the plugin pins the versions it supports.
- No `Content-Length` framing; NDJSON keeps the Lua side to `vim.json.decode` per line.

## How to test

1. Golden transcripts: pipe scripted request files into the daemon, assert exact response/notification streams.
2. Fuzz the reader with split/joined/garbage lines; assert parse errors and survival.
3. Kill the parent process; verify the daemon exits on EOF within a bounded time.
