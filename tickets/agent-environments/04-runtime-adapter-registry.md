# 04 - Runtime Adapter Registry

## Summary

Replace direct hosting-mode branching with an environment-aware runtime adapter registry.

## Plan coverage

Owns plan lines:

- 85-97: runtime adapter responsibilities and boundary from message handling
- 119-136: adapter registry in the target architecture
- 354-429: runtime adapter interface, start result contract, and registry
- 896-903: phase 2 registry and router dispatch work
- 996: V1 local/provisioned adapter type requirement

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
- Preserve current `SessionAdapter` behavior during the transition if needed, but make the new boundary environment-aware.

## Dependencies

- [01 - Database Schema and Event Types](01-database-schema-and-event-types.md)
- [03 - Agent Environment Service](03-agent-environment-service.md)

## Completion requirements

- [ ] `SessionRouter` can dispatch through the registry.
- [ ] Adapter lookup fails clearly for unsupported adapter types.
- [ ] Local and provisioned adapters implement the same lifecycle interface.
- [ ] Existing bridge command sending remains centralized in `SessionRouter`.
- [ ] No provider-specific code is added to the registry.

## Implementation notes

- Adapter lifecycle and bridge command delivery are separate concerns.
- The adapter starts/selects compute; the bridge carries live traffic.
- Avoid introducing `aws`, `fly`, or `kubernetes` as adapter types in Trace core.

## How to test

1. Unit test registry lookup for `local` and `provisioned`.
2. Unit test unsupported adapter type handling.
3. Start a local session and confirm it still routes through the existing bridge.
4. Use a mocked provisioned adapter and confirm session startup delegates to it.
