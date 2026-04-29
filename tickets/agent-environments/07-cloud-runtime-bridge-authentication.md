# 07 - Cloud Runtime Bridge Authentication

## Summary

Secure cloud runtime bridge registration with short-lived runtime tokens tied to the expected session and environment.

## Plan coverage

Owns plan lines:

- 106-126: bridge heartbeats and shared local/cloud protocol expectations
- 673-727: cloud runtime bridge bootstrap, `runtime_hello`, empty registered repos, token claims, and validation
- 974-981: phase 5 token validation, protocol compatibility, heartbeat/stale runtime tracking, and startup queue dependency
- 1048: open decision on JWT versus opaque runtime tokens
- 1063: V1 cloud runtime bridge token auth requirement

## What needs to happen

- Add runtime token creation for provisioned sessions.
- Token claims should include:
  - `organizationId`
  - `sessionId`
  - `runtimeInstanceId`
  - `environmentId`
  - expiration
  - allowed bridge scope
- Pass the token and bridge URL to the provisioned launcher.
- Update bridge auth handling to verify cloud tokens.
- Verify `runtime_hello.instanceId` matches token claims.
- Verify `hostingMode` is `cloud` for provisioned runtimes.
- Accept cloud `runtime_hello` registrations with `registeredRepoIds: []` because provisioned runtimes clone on demand.
- Require cloud `runtime_hello` to include protocol and agent version metadata.
- Reject incompatible bridge protocol versions.
- Verify cloud `runtime_hello.supportedTools` is captured or validated consistently with existing bridge capability handling.
- Verify runtime-supported tools satisfy the selected session/environment request.
- Reject missing, expired, or mismatched runtime tokens.
- Preserve existing local bridge auth behavior.
- Track runtime heartbeats for authenticated cloud runtimes.
- Mark stale cloud runtimes disconnected when heartbeats expire.

## Dependencies

- [06 - Provisioned Lifecycle Adapter](06-provisioned-lifecycle-adapter.md)

## Completion requirements

- [ ] Provisioned runtime cannot register without a valid token.
  - Review note: current implementation validates provisioned runtime tokens against an in-memory map, not a JWT or DB-backed opaque token. This is not durable across server restarts or multiple server instances.
- [x] Runtime cannot claim a different `runtimeInstanceId`.
- [ ] Runtime cannot register for a different org/session/environment.
  - Review note: token claims include org/session/environment, but session/environment claims are not independently durable or recoverable because the token source of truth is process-local memory.
- [x] Expired tokens are rejected.
  - Review note: expiry is enforced only while the issuing server process keeps the in-memory token entry.
- [x] Cloud runtime registration supports empty registered repo IDs.
- [x] Incompatible cloud runtime protocol versions are rejected clearly.
- [x] Runtime tool capabilities are checked before marking the runtime ready.
- [x] Cloud runtime heartbeats update runtime connection state.
- [x] Stale cloud runtime connections are detected.
- [x] Local desktop bridge auth still works unchanged.
- [x] Bridge registration emits or triggers runtime-connected state.

## Implementation notes

- Token can be JWT or opaque DB-backed token; decide before implementation. Process-local in-memory token storage is not sufficient for production because provisioned runtimes may connect after server restart or through another server instance.
- Prefer short expiry plus one runtime registration scope.
- Do not let the launcher endpoint authenticate the bridge by itself; Trace must verify the runtime when it connects back.

## How to test

1. Connect a mocked cloud bridge with a valid token and verify registration.
2. Connect with an expired token and verify rejection.
3. Connect with mismatched `instanceId` and verify rejection.
4. Connect a local desktop bridge and verify no regression.
