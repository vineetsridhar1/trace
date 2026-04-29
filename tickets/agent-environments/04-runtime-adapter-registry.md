# 04 - Runtime Adapter Registry

## Summary

Replace direct hosting-mode branching with an environment-aware runtime adapter registry.

## Plan coverage

Owns plan lines:

- 97-109: runtime adapter responsibilities and boundary from message handling
- 131-143: terminal multiplexing requirements at the bridge/adapter boundary
- 145-162: adapter registry in the target architecture
- 381-457: runtime adapter interface, start result contract, and registry
- 970-976: phase 2 registry and router dispatch work
- 1077: V1 local/provisioned adapter type requirement

## What needs to happen

- Define a `RuntimeAdapter` interface for:
  - `validateConfig`
  - `testConfig`
  - `startSession`
  - `stopSession`
  - `getStatus`
- Define shared input/output types for runtime start, stop, and status.
- Add `RuntimeAdapterRegistry` keyed by `local` and `provisioned`.
- Update `SessionRouter` to resolve adapters from the registry.
- Keep existing command delivery through the bridge.
- Preserve bridge-level terminal multiplexing: adapters start/select compute, while multiple terminal sessions per Trace session continue to be addressed by `terminalId` over the bridge.
- Preserve current `SessionAdapter` behavior during the transition if needed, but make the new boundary environment-aware.

## Dependencies

- [01 - Database Schema and Event Types](01-database-schema-and-event-types.md)
- [03 - Agent Environment Service](03-agent-environment-service.md)

## Completion requirements

- [x] `SessionRouter` can dispatch through the registry.
- [x] Adapter lookup fails clearly for unsupported adapter types.
- [x] Local and provisioned adapters implement the same lifecycle interface.
- [x] Existing bridge command sending remains centralized in `SessionRouter`.
- [x] Runtime adapter contracts do not expose or imply a single terminal stream per session.
- [x] Existing terminal commands/events remain multiplexed by `terminalId` after adapter routing.
- [x] No provider-specific code is added to the registry.
- [x] Review follow-up: `RuntimeStopInput` and `RuntimeStatusInput` carry enough environment/config context for authenticated provisioned stop/status implementations.

## Implementation notes

- Adapter lifecycle and bridge command delivery are separate concerns.
- The adapter starts/selects compute; the bridge carries live traffic.
- Terminal creation, input, output, resize, exit, error, and destroy are live bridge traffic and must remain isolated by `terminalId`.
- Ticket 03 introduced service-layer config validation behind a small local/provisioned adapter shim in `AgentEnvironmentService`; replace that shim with the real registry so environment CRUD, environment testing, and session startup all use the same adapter lookup and validation path.
- Review note resolved: stop/status inputs now carry environment context so provisioned stop/status can use the selected environment's URLs and auth secret through the adapter boundary.
- Avoid introducing `aws`, `fly`, or `kubernetes` as adapter types in Trace core.

## How to test

1. Unit test registry lookup for `local` and `provisioned`.
2. Unit test unsupported adapter type handling.
3. Start a local session and confirm it still routes through the existing bridge.
4. Use a mocked provisioned adapter and confirm session startup delegates to it.
5. Create two terminals for one session and confirm adapter routing does not collapse them into one terminal stream.
