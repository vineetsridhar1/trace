# 06 - Event Tailing

## Summary

Add streaming reads: `trace events tail` for the org-wide or scoped event firehose, and the `--follow` flag on `trace channel`. This is the first CLI surface exercising scoped subscriptions end to end.

## Plan coverage

Owns plan lines:

- 124: `trace channel <name> --follow`
- 128: `trace events tail` with scope and type filters
- 142: viewport-driven scoped subscriptions, exercised from the CLI

## What needs to happen

- `trace events tail [--scope <type>:<id>] [--types a,b,c]`:
  - no scope → `orgEvents(organizationId, types)` subscription
  - `--scope session:<id>` → `sessionEvents`, `--scope channel:<id|name>` → `channelEvents`, `--scope chat:<id>` → `chatEvents`
  - human output: one line per event (timestamp, eventType, actor, scope, short payload preview); `--json` emits NDJSON, one event object per line
- `trace channel <name> --follow`: print the recent page (ticket 05 behavior), then keep the `channelEvents` subscription open and append new messages.
- Clean lifecycle: SIGINT closes the subscription and the socket, exits 0. Reconnect transitions print to stderr (`# reconnecting...`), never stdout, so NDJSON consumers stay parseable.

## Dependencies

- [04 - Headless Client Runtime](04-headless-client-runtime.md)
- Coordinates with [05 - Read Commands](05-read-commands.md): the `channel` command and name resolver land there; this ticket adds `--follow` to it.

## Completion requirements

- [x] `events tail` streams org events live against `dev:local`
- [x] `--scope` and `--types` filter server-side via subscription arguments
  - Verified: only the `chatEvents` resolver honors `types` today; `orgEvents`/`channelEvents` declare but ignore it, so the CLI passes the argument through *and* filters client-side (server fix is out of scope per the no-server-changes guardrail)
- [x] `--json` output is strict NDJSON with nothing else on stdout
- [x] SIGINT exits cleanly; reconnects resume the stream and are reported on stderr
- [x] `channel --follow` appends messages sent from another client in real time

## Implementation notes

- Subscription arguments already support type filters (`orgEvents(organizationId!, types: [String!])` in `packages/gql/src/schema.graphql`) — pass filters through rather than filtering client-side.
- This command reads the raw event stream deliberately (debugging/scripting tool); the normalized-node rendering path is tickets 08 and 12.

## How to test

1. Run `trace events tail --json` while sending a message from the web UI; assert the event appears as one NDJSON line.
2. `--types message_sent` excludes other event types.
3. Restart the dev server mid-tail: stderr shows reconnect notices, stream resumes, stdout stays valid NDJSON.
