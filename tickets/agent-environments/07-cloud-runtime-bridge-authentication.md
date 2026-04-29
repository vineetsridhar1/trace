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
- [ ] Runtime cannot claim a different `runtimeInstanceId`.
- [ ] Runtime cannot register for a different org/session/environment.
- [ ] Expired tokens are rejected.
- [ ] Cloud runtime registration supports empty registered repo IDs.
- [ ] Incompatible cloud runtime protocol versions are rejected clearly.
- [ ] Runtime tool capabilities are checked before marking the runtime ready.
- [ ] Cloud runtime heartbeats update runtime connection state.
- [ ] Stale cloud runtime connections are detected.
- [ ] Local desktop bridge auth still works unchanged.
- [ ] Bridge registration emits or triggers runtime-connected state.

## Implementation notes

- Token can be JWT or opaque DB-backed token; decide before implementation.
- Prefer short expiry plus one runtime registration scope.
- Do not let the launcher endpoint authenticate the bridge by itself; Trace must verify the runtime when it connects back.

## How to test

1. Connect a mocked cloud bridge with a valid token and verify registration.
2. Connect with an expired token and verify rejection.
3. Connect with mismatched `instanceId` and verify rejection.
4. Connect a local desktop bridge and verify no regression.
