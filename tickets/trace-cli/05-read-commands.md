# 05 - Read Commands

## Summary

Ship the read-only command surface: `trace sessions list`, `trace channels list`, `trace tickets list`, and `trace channel <name>`, with stable `--json` output and compact human output.

## Plan coverage

Owns plan lines:

- 108-110: command-surface conventions (`--json`, no TUI framework)
- 117: `sessions list` with filters
- 123-124: `channels list` and `channel <name>` (the `--follow` flag belongs to ticket 06)
- 127: `tickets list`

## What needs to happen

- `trace sessions list [--status <s>] [--repo <name>]`: the `sessions(organizationId, ...)` query with filters mapped to its arguments; columns: id (short), name, agentStatus, sessionStatus, tool, repo/branch, updated.
- `trace channels list`: the `channels(organizationId)` query; name, type, member count.
- `trace tickets list [--status open]`: tickets query with status filter.
- `trace channel <name>`: resolve channel by name, print the most recent messages (bounded page) with actor prefixes and timestamps.
- `--json` on every command emits stable shapes (documented field set, not raw GraphQL responses passed through).
- Shared name→ID resolver helpers (channel by name, repo by name, session by ID prefix) in one module — tickets 07 and 08 reuse them.

## Dependencies

- [04 - Headless Client Runtime](04-headless-client-runtime.md)

## Completion requirements

- [ ] All four commands work against a seeded `pnpm dev:local` org
- [ ] `--json` output is snapshot-tested and documented
- [ ] Filters map to server-side query arguments, not client-side filtering, wherever the schema supports it
- [ ] Name resolution errors list near-matches instead of failing silently
- [ ] Commands exit promptly (runtime disposed, no hanging socket)

## Implementation notes

- One-shot reads query GraphQL directly; they do not need the event subscription. The "events are the source of truth" rule governs store updates, not read paths.
- Check `packages/gql/src/schema.graphql` for the exact filter arguments on `sessions` — use what exists, don't add schema.
- Human output: plain aligned columns, ISO-ish relative timestamps, no color dependency (respect `NO_COLOR` if color is added).

## How to test

1. Seed `dev:local` with channels/sessions/tickets; snapshot-test `--json` output of each command.
2. `trace sessions list --status needs_input` returns only matching sessions.
3. `trace channel <name>` on an unknown name suggests near-matches and exits non-zero.
