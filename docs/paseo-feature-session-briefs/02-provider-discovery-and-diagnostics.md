# Session Brief: Runtime Provider Discovery and Diagnostics

## Assignment

Replace Trace's static coding-tool capability assumptions with a runtime-reported provider catalog.
The catalog must tell clients which tools, models, reasoning modes, and optional features are really
available on a selected runtime and provide actionable diagnostics when discovery fails.

Before changing code, read the repository's `AGENTS.md`, inspect the current implementations named
below, and follow current architecture if filenames or contracts have evolved.

## Product example

When a user chooses a local Mac runtime, Trace might show:

- Codex: ready; models `gpt-5.6`, `gpt-5.4`; reasoning `low` through `xhigh`
- Claude Code: unavailable; executable not found
- Cursor Agent: error; installed but authentication check failed

The session form should use that catalog instead of a global hardcoded model array. A refresh button
should rerun discovery and display sanitized diagnostic details.

## Current Trace context

- `packages/shared/src/models.ts` contains static model, reasoning, and default lists.
- `apps/desktop/src/coding-tools.ts` probes installed CLI versions and update status.
- `apps/desktop/src/bridge.ts` sends `supportedTools` in runtime hello.
- `apps/server/src/lib/session-router.ts` stores runtime metadata and checks supported tools.
- `packages/shared/src/adapters/coding-tool.ts` has `run`, `abort`, and optional `getSessionId`, but no
  catalog contract.
- `SessionRuntimeInstance` exposes `supportedTools`, not discovered models/modes/features.
- Paseo references: `provider-snapshot-manager.ts`, `provider-catalog-session.ts`, and
  `/Users/vineet/programming/paseo/docs/providers.md`.

## Required design

1. Define a provider-neutral catalog contract with provider/tool identity, discovery scope,
   availability (`ready`, `unavailable`, `error`), version, models, modes/reasoning values, feature
   flags, discovery timestamp, and sanitized diagnostics.
2. Support both runtime-global and workspace/session-group-scoped discovery because some providers
   derive capabilities from the current directory or repo config.
3. Add discovery to the coding-tool/provider adapter boundary. Vendor-specific command parsing stays
   inside adapter implementations.
4. Extend bridge/runtime RPC so local and provisioned runtimes perform discovery where the tools are
   actually installed. The central server should not pretend its own binaries represent a remote
   runtime.
5. Cache successful snapshots using a stable content hash. Return warm snapshots quickly, permit an
   explicit forced refresh, and avoid an arbitrary TTL unless measurements show one is needed.
6. Store only useful normalized catalog state. Never include access tokens, raw environment values,
   complete provider responses, or command output that may contain secrets.
7. Expose catalog queries/refresh through services and thin GraphQL resolvers. Update runtime/session
   selectors and coding-tool settings to show availability and diagnostics.
8. Preserve static values as a documented fallback only when a provider cannot discover a catalog;
   mark the source as fallback so the UI does not imply it was verified.
9. Session admission must revalidate that the selected runtime/provider/model combination is allowed
   and return an actionable error if it has changed.

## Diagnostics behavior

- Distinguish executable missing, unsupported version, unauthenticated provider, command timeout,
  malformed response, and unknown failure where adapters can identify them safely.
- Include a safe remediation hint such as “install the Codex CLI” or “authenticate on this runtime.”
- Add per-probe timeouts and cancellation. One broken provider must not block other catalog results.
- Log structured diagnostic codes and durations, with aggressive secret redaction.

## Completion criteria

- Two runtimes with different installed providers return different catalogs and the session UI
  reflects the selected runtime.
- At least the currently supported coding tools implement catalog discovery or an explicit fallback.
- Workspace-scoped discovery cannot escape the authorized session-group workdir.
- Forced refresh updates changed provider availability without restarting the server/desktop app.
- A missing, unauthenticated, timed-out, and malformed provider each produce safe, tested diagnostic
  states rather than breaking the whole catalog.
- Session creation rejects stale/invalid runtime-tool-model combinations in the service layer.
- No provider secret or raw credential-bearing output appears in GraphQL, logs, or stored snapshots.
- Relevant bridge, adapter, service, GraphQL, and UI tests pass and codegen/types are current.

## Likely touchpoints

- `packages/shared/src/adapters/coding-tool.ts`
- `packages/shared/src/models.ts`
- `apps/desktop/src/coding-tools.ts`
- `apps/desktop/src/bridge.ts`
- provisioned/container bridge equivalents
- `apps/server/src/lib/bridge-handler.ts`
- `apps/server/src/lib/session-router.ts`
- provider catalog service and `packages/gql/src/schema.graphql`
- session creation and coding-tool settings UI

Do not add custom third-party provider installation, quota fetching, MCP, or orchestration here.
