# 07 - Write Commands

## Summary

Ship the write surface: `trace send`, `trace sessions new`, `trace sessions prompt`, `trace sessions stop`. Mutations are fire-and-forget; mutation results are used for stdout confirmation only, never for store writes.

## Plan coverage

Owns plan lines:

- 118: `sessions new`
- 120-121: `sessions prompt`, `sessions stop`
- 125: `send`
- 140: fire-and-forget mutation rule
- 143: optimistic-update helpers (echo behavior shared with 08 and 12)

## What needs to happen

- `trace send <channel> -m <text>`: resolve channel (ticket 05 helper), call the channel message mutation, print the created message/event ID.
- `trace sessions new --repo <name> [--branch <b>] [--tool claude_code] [-m <prompt>]`: `startSession` with resolved repo; when `-m` is given, deliver the initial prompt through the appropriate mutation (`runSession` for the initial prompt — verify exact semantics of `startSession` vs `runSession` vs `queueSessionMessage` in the schema and `SessionService` before wiring). Print the new session ID.
- `trace sessions prompt <id> -m <text>`: `sendSessionMessage`; if the runtime is not connected the service queues delivery (verify with `queuedMessages` semantics) — the CLI does not wait for output.
- `trace sessions stop <id>`: `terminateSession`.
- All mutation helpers live in a shared module (`apps/cli/src/mutations.ts`) — ticket 11's daemon action methods delegate to the same functions.
- Exit code reflects mutation acceptance, not session outcome.

## Dependencies

- [04 - Headless Client Runtime](04-headless-client-runtime.md)
- Reuses name resolvers from [05 - Read Commands](05-read-commands.md); can develop in parallel against IDs.

## Completion requirements

- [ ] `send` posts a message visible in the web client
- [ ] `sessions new` creates a session that provisions/starts exactly as one created from the web
- [ ] `sessions prompt` delivers to a connected runtime and queues for a disconnected one
- [ ] `sessions stop` terminates the session
- [ ] No command writes mutation results into the entity store
- [ ] `--json` prints the created/affected entity ID in a stable shape

## Implementation notes

- The mutation set is `startSession`, `runSession`, `sendSessionMessage`, `queueSessionMessage`, `terminateSession`, and the channel send mutation in `packages/gql/src/schema.graphql` — read the resolver → service path in `apps/server` for the create-then-prompt sequencing rather than guessing.
- Tool/model defaults: fall back to the user's `defaultSessionTool` / `defaultSessionModel` from `/auth/me` rather than hardcoding.

## How to test

1. Against `dev:local` with the desktop bridge running: `sessions new --repo <r> -m "hello"` produces a running session with the prompt delivered (verify in web UI or `trace sessions attach`).
2. Prompt a session whose runtime is disconnected; verify it lands in queued messages and delivers on reconnect.
3. Snapshot-test `--json` confirmation shapes.
