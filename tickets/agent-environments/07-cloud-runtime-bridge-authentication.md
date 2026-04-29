# 07 - Cloud Runtime Bridge Authentication

## Summary

Secure cloud runtime bridge registration with short-lived runtime tokens tied to the expected session and environment.

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
- Reject missing, expired, or mismatched runtime tokens.
- Preserve existing local bridge auth behavior.

## Dependencies

- [06 - Provisioned Lifecycle Adapter](06-provisioned-lifecycle-adapter.md)

## Completion requirements

- [ ] Provisioned runtime cannot register without a valid token.
- [ ] Runtime cannot claim a different `runtimeInstanceId`.
- [ ] Runtime cannot register for a different org/session/environment.
- [ ] Expired tokens are rejected.
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
