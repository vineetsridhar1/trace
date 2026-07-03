# 03 - Auth Commands

## Summary

Implement `trace login`, `trace logout`, `trace whoami`, and `trace org list/switch` against the existing auth endpoints, storing bearer tokens and the active organization locally. No server changes.

## Plan coverage

Owns plan lines:

- 56: existing auth endpoint baseline
- 94-106: login flows, token/config storage, request headers (storage files shared with 01)
- 113-115: auth command surface
- 229: "no server changes for V1 core"

## What needs to happen

- `trace login` (hosted default): POST `/auth/github/device/start`, print the verification URL and user code, poll `/auth/github/device/poll` honoring `interval` and `slow_down` responses until a bearer token is issued; store it via the credentials module. Handle `denied` and `expired` terminally with clear messages.
- `trace login --local`: POST `/auth/local/login` for `pnpm dev:local` / self-hosted-without-OAuth servers.
- `trace logout`: POST `/auth/logout` with the bearer token, then clear `credentials.json`.
- `trace whoami`: GET `/auth/me`; print user, server, and active org. `--json` output stable.
- `trace org list` / `trace org switch <name>`: list the user's organizations (plain GraphQL POST — no WebSocket needed), resolve by name or ID, persist `activeOrgId` in `config.json`.
- Shared HTTP helper attaching `Authorization: Bearer <token>` and the organization ID header, used by all later tickets. A 401 anywhere prints "run `trace login`" and exits non-zero.

## Dependencies

- [01 - CLI Scaffold and Node Platform](01-cli-scaffold-and-node-platform.md)

## Completion requirements

- [ ] Device-flow login obtains and stores a working token against a GitHub-OAuth server
- [x] `--local` login works against `pnpm dev:local`
- [x] `whoami` prints user + active org; `--json` shape is stable
- [x] `org switch` persists, and subsequent commands send the new org header
- [x] `logout` clears credentials and subsequent commands fail with the login hint
- [x] Poll loop respects `interval`, backs off on `slow_down`, and terminates on `denied`/`expired`

## Implementation notes

- Endpoints live in `apps/server/src/routes/auth.ts` — device start ~line 543, poll ~line 603, local login ~line 316, `/auth/me` ~line 690. Follow the exact response shapes there rather than inventing new ones.
- Pairing login (`--pair`) is ticket 09, not this one.
- Org resolution should tolerate both org ID and case-insensitive name.

## How to test

1. Unit-test the poll loop with mocked responses: pending → slow_down → success, plus denied and expired paths.
2. Against `pnpm dev:local`: `trace login --local`, `whoami`, `org list`, `org switch`, `logout`, then verify a read command 401s with the login hint.
3. Verify `TRACE_TOKEN` overrides stored credentials.
