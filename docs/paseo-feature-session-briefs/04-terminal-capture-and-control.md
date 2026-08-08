# Session Brief: Terminal Capture and Control

## Assignment

Make Trace terminals safely automatable: authorized clients must be able to list, create, destroy,
capture bounded scrollback, and send input/special keys. Reuse the existing terminal service, relay,
runtime routing, and WebSocket path. Do not implement terminal automation by exposing arbitrary
bridge messages or by creating a second terminal subsystem.

Before changing code, read the repository's `AGENTS.md`, inspect the current implementations named
below, and follow current architecture if filenames or contracts have evolved.

## Product examples

```sh
trace terminal list --session "$TRACE_SESSION_ID"
trace terminal create --session "$TRACE_SESSION_ID" --cols 120 --rows 30
trace terminal capture term_123 --max-bytes 20000
trace terminal send term_123 "pnpm test" --enter
trace terminal key term_123 ctrl-c
trace terminal kill term_123
```

An AI can capture recent output, decide that a dev server is ready, and send a safe key sequence to
the same terminal the user sees. A newly attached human client still receives existing scrollback.

## Current Trace context

- `apps/server/src/services/terminal.ts` owns create/list/destroy authorization and runtime access.
- `apps/server/src/lib/terminal-relay.ts` tracks terminal ownership and a bounded in-memory scrollback
  buffer (currently roughly 50 KiB), relays input/resize, and handles attach/destroy.
- Terminal ownership can span server replicas through the terminal directory/backplane.
- GraphQL exposes terminal list/create/destroy, while `/terminal` is the interactive WebSocket used by
  web/mobile clients.
- Trace lacks a public, authorized capture operation and a normalized send-key operation.
- Paseo's terminal list/create/kill/capture/send-keys commands are the behavioral reference.

## Required design

1. Keep the interactive `/terminal` WebSocket unchanged for full duplex UI use. Add service-layer
   methods for bounded capture and input/key sending so GraphQL/CLI remain thin clients.
2. Centralize terminal authorization. A caller must have access to the terminal's organization,
   session or channel scope, session group, and runtime. Agent credentials must be restricted to
   their granted scope. Knowing a terminal ID is never sufficient.
3. Capture the relay's existing ring buffer; do not start a new shell, scrape UI DOM, or persist
   terminal output as immutable domain events. Return text/bytes with `truncated`, byte count, and a
   stable encoding policy.
4. Handle a terminal owned by another server replica using the existing backplane/directory or a
   narrowly typed request/response extension. Do not silently return an empty local buffer.
5. Enforce server-side maximum capture bytes and input bytes. Normalize line endings and document
   whether ANSI escape sequences are preserved; offer plain-text stripping only through a tested
   deterministic option.
6. Define a small allowlisted special-key vocabulary (`enter`, arrows, tab, escape, backspace,
   `ctrl-c`, etc.) and map it to exact terminal bytes. Raw input remains possible for authorized
   callers but is bounded and auditable as an action without logging its sensitive contents.
7. Add GraphQL operations and CLI commands. Mutating terminal lifecycle should continue to use
   existing service/event behavior. Ephemeral keystrokes and capture reads must not emit output or
   input content into the event log.
8. Preserve owner disconnect, reconnect, terminal resize, cleanup, and runtime pinning behavior.

## Security and failure behavior

- Never log terminal input or captured output; both may contain credentials.
- Capture limits must be enforced after encoding as well as at API input validation.
- Return clear errors for unknown terminal, unauthorized terminal, disconnected runtime, terminal
  closed, and cross-replica timeout.
- Do not accept arbitrary PTY paths, process IDs, workdirs, shell commands, or bridge op names.

## Completion criteria

- An authorized user can create a terminal, send text and special keys, and capture the resulting
  recent output through services, GraphQL, and the CLI.
- A scoped agent can control an allowed session terminal but is denied for another user's/session's
  terminal.
- Capture is bounded and correctly reports truncation; tests cover ANSI/multibyte boundaries and an
  empty/closed terminal.
- Cross-replica capture/input routes to the owning replica and has bounded timeout/failure behavior.
- Existing web/mobile terminal attachment and scrollback behavior remains working.
- Tests confirm terminal contents never enter logs/events and oversized input/capture requests fail.
- Focused terminal service/relay/backplane/GraphQL/CLI tests and affected typechecks pass.

## Likely touchpoints

- `apps/server/src/services/terminal.ts`
- `apps/server/src/lib/terminal-relay.ts`
- terminal directory/realtime backplane modules
- `packages/gql/src/schema.graphql`
- server schema/resolver modules
- Trace CLI terminal command module
- existing terminal integration tests

Do not add activity inference, provider hooks, shell-command APIs, or durable terminal transcripts in
this session; activity is covered by the next brief.
