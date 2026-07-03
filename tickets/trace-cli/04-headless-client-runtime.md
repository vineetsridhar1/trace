# 04 - Headless Client Runtime

## Summary

Build the shared runtime module that boots client-core in Node: platform injection, GraphQL client, Zustand stores, and an always-on `orgEvents` subscription feeding `handleOrgEvent`. Every command, the daemon, and `sessions attach` sit on top of this module.

## Plan coverage

Owns plan lines:

- 18-24: core model rules as they apply to the CLI
- 55, 57: client-core and GraphQL baseline
- 69-71: client-core transport legs in the architecture diagram
- 136-141: mutations fire-and-forget, store updates only from events, scope partitioning

## What needs to happen

- `apps/cli/src/runtime.ts`: `createClientRuntime({ serverUrl, token, orgId })` returning `{ gql, stores, start(), dispose() }`.
- On `start()`: `setPlatform(nodePlatform)` (from ticket 01, via the headless entry), `createGqlClient` with the `ws` WebSocket, hydrate the auth store, open the `orgEvents` subscription and pipe every event through `handleOrgEvent` into the entity store.
- Expose non-React store access helpers (`getState`, `subscribe`) for command code and the daemon.
- Surface connection state (`connected` / `reconnecting` / `disconnected`) via callback; reconnection itself is client-core's exponential backoff — do not reimplement it.
- `dispose()` tears down subscriptions and closes the WebSocket so one-shot commands exit promptly instead of hanging on an open socket.
- Enforce the store rule at the API level: the runtime exposes no way to write mutation results into the store.

## Dependencies

- [01 - CLI Scaffold and Node Platform](01-cli-scaffold-and-node-platform.md)
- [02 - client-core Headless Entrypoint](02-client-core-headless-entrypoint.md)
- [03 - Auth Commands](03-auth-commands.md)

## Completion requirements

- [ ] A one-shot command can boot the runtime, run a query, and exit cleanly (no hung socket)
- [ ] Events arriving on `orgEvents` upsert entities via `handleOrgEvent`
- [ ] Killing and restarting the server mid-run produces `reconnecting` → `connected` transitions and the subscription resumes
- [ ] All imports come from `@trace/client-core/headless`; `react` remains absent from the dependency graph
- [ ] No code path updates the store from a mutation result

## Implementation notes

- Mirror `apps/web/src/lib/urql.ts` for URL derivation: HTTP on `/graphql`, WebSocket on `/ws`.
- WebSocket `connectionParams` carry `token` and `organizationId` exactly as `packages/client-core/src/gql/createClient.ts` already does — pass them through, don't duplicate the logic.
- One-shot commands may choose not to `start()` the subscription at all (plain queries); the daemon and tailing commands always do.

## How to test

1. Unit: feed fixture events through the runtime and assert entity-store contents.
2. Integration against `pnpm dev:local`: start the runtime, create an entity from a second client (web UI or another CLI process), assert the store updates within a subscription roundtrip.
3. Kill the dev server mid-run; assert reconnect callbacks fire and the store updates again after recovery.
