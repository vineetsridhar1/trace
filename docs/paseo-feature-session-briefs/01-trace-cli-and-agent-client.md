# Session Brief: Trace CLI and In-Session Agent Client

## Assignment

Implement a full first-party `trace` CLI that behaves like another Trace client. Human users should
pair and authenticate it similarly to a mobile device. A coding agent running inside a Trace session
should use the same binary and server endpoints with a restricted session credential. Do not create
a parallel control API or an MCP server in this session.

Before changing code, read the repository's `AGENTS.md`, inspect the current implementations named
below, and follow current architecture if filenames or contracts have evolved.

## Product examples

```sh
trace auth pair
trace session list --org "$ORG_ID"
trace session get "$TRACE_SESSION_ID"
trace session send "$TRACE_SESSION_ID" "Run the focused tests"
trace session stop "$TRACE_SESSION_ID"
trace terminal list --session "$TRACE_SESSION_ID"
```

Inside a Trace-launched coding session, context should be automatic:

```sh
trace session get                         # defaults to TRACE_SESSION_ID
trace session send --self "status update"
```

Commands added by later briefs must plug into this CLI rather than creating separate binaries.

## Current Trace context

- `runtime/bin/trace.mjs` currently handles artifact upload; preserve that command and compatibility.
- `packages/client-core` already supports cookie and bearer authentication and GraphQL transport.
- `apps/server/src/services/mobile-auth.ts` and `/auth/mobile/*` implement short-lived pairing codes,
  opaque hashed device secrets, expiry, last-seen tracking, and revocation.
- The server already exposes application actions through GraphQL, `/ws`, `/terminal`, and uploads.
- `apps/server/src/lib/agent-invocation-auth.ts` has an invocation credential, but it is intentionally
  narrow and is not a general user credential.
- The service layer is authoritative. Existing GraphQL mutations such as session start, send, queue,
  run, terminate, archive, and delete must be reused.

## Required design

1. Create a real workspace package for the CLI and retain a small runtime entrypoint/wrapper if the
   runtime image needs one. Do not let the artifact script grow into an untestable monolith.
2. Implement a shared typed HTTP/GraphQL client used by CLI commands. Prefer generated GQL types and
   documents; do not redefine schema types.
3. Generalize mobile-device pairing into a first-party client-device concept, or add an equivalent
   CLI device type while preserving existing mobile tokens and routes. A CLI token must be opaque,
   hashed at rest, revocable, scoped to its owner, and stored in the OS credential store when
   available. A protected file with strict permissions may be the documented fallback.
4. Add login/pair, status, logout, device naming, server selection, JSON output, and useful exit codes.
   Never print credentials.
5. Inject session context when launching coding tools: server URL, organization ID, session ID,
   session-group ID, and a short-lived restricted agent credential. Avoid secrets in command-line
   arguments and logs.
6. Extend authentication so the restricted credential resolves to an agent/session actor with an
   explicit capability allowlist. It may read its permitted context and perform only approved
   session actions. It must not inherit organization-admin or arbitrary cross-session powers.
7. Commands call existing GraphQL operations and streams. If an operation is missing, add a service
   method first, then a thin resolver, then the CLI adapter.
8. Provide human-readable output by default and stable `--json` output for automation. Errors must
   distinguish authentication, authorization, validation, connectivity, and server failures.

## MVP command surface

- `trace auth pair|status|logout`
- `trace context`
- `trace org list`
- `trace session list|get|start|send|run|stop|archive`
- `trace session events` with a bounded snapshot and optional follow mode
- Existing `trace artifact push`
- A documented command-registration pattern for terminal, Git, provider, and browser briefs

Do not add child-agent orchestration, schedules, loops, or MCP in this implementation.

## Security requirements

- Human and agent credentials are different token classes even though they use the same client.
- Authorize every operation server-side; environment context is a default selector, never proof of
  authority.
- Agent tokens are short-lived, audience-bound, session-bound, and invalid after the invocation or
  session is no longer eligible. Rotation/replacement must revoke their effective use.
- Pairing codes expire and are single-use. Device tokens can be listed and revoked from settings.
- Redact bearer values from logs, errors, telemetry, process listings, and test snapshots.

## Completion criteria

- A new human CLI can pair, persist its credential safely, list permitted sessions, send a message,
  observe the resulting event, and log out/revoke itself.
- An agent launched in session A can use implicit context for allowed reads/actions in A, but cannot
  act on an unauthorized session B or use admin-only operations.
- Existing web, mobile, desktop, mobile-pairing, and artifact-upload flows remain compatible.
- CLI `--json` responses are documented and covered by tests; failures return non-zero stable codes.
- Service mutations, not CLI code or resolvers, create and publish events.
- Focused auth/service/CLI tests pass, GraphQL codegen is current, and affected packages typecheck.

## Likely touchpoints

- `runtime/bin/trace.mjs`
- new CLI workspace package and root workspace scripts
- `packages/client-core/`
- `packages/gql/src/schema.graphql`
- `apps/server/src/services/mobile-auth.ts`
- `apps/server/src/lib/auth.ts`
- `apps/server/src/lib/agent-invocation-auth.ts`
- `apps/server/src/routes/auth.ts`
- coding-tool launch environment in the desktop/container bridge adapters

Before implementation, inventory the exact existing session operations and reuse them. If package or
auth names have changed, follow current architecture rather than these suggested filenames.
