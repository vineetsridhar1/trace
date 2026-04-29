# 06 - Provisioned Lifecycle Adapter

## Summary

Add the generic provisioned adapter that calls an org-owned authenticated lifecycle endpoint to start, stop, and inspect runtimes.

## Plan coverage

Owns plan lines:

- 7-11: generic provisioned runtimes and reference-launcher path
- 76-92: authenticated provisioned endpoints, admission constraints, and launcher examples outside core
- 483-672: provisioned adapter purpose, config, start/stop/status contracts, auth, idempotency, and replay expectations
- 673-685: runtime bootstrap values passed to the launcher
- 910-937: launcher auth secret references and adapter-time secret resolution
- 965-972: phase 4 provisioned adapter work
- 1047: open decision on provisioned status polling scope
- 1060-1061: V1 authenticated provisioned start/stop/status and idempotency requirements

## What needs to happen

- Implement `ProvisionedRuntimeAdapter`.
- Validate config:
  - `startUrl`
  - `stopUrl`
  - `statusUrl`
  - `auth.type`
  - `auth.secretId`
  - `startupTimeoutSeconds`
  - `deprovisionPolicy`
  - optional `launcherMetadata`
- Authenticate lifecycle requests.
- Add stable idempotency keys for lifecycle retries:
  - `session:<sessionId>:start`
  - `session:<sessionId>:stop`
- Support bearer-token launcher auth for V1:
  - resolve the token from `auth.secretId`
  - send it as `Authorization: Bearer <token>`
  - never log the token
- Keep HMAC request signing as an optional stronger mode:
  - timestamp header
  - request id header
  - HMAC signature header
- Define launcher-side auth expectations:
  - use HTTPS only
  - compare bearer tokens in constant time
  - support token rotation through org secret replacement
- Define launcher-side replay protection expectations for HMAC mode:
  - reject invalid signatures
  - reject old timestamps
  - reject replayed request IDs
- Implement `startSession`:
  - create runtime token input
  - send session, org, repo, tool, model, bridge URL, and runtime token payload to `startUrl`
  - include the runtime bootstrap values the launcher must inject into the agent host:
    - `TRACE_SESSION_ID`
    - `TRACE_ORG_ID`
    - `TRACE_RUNTIME_INSTANCE_ID`
    - `TRACE_RUNTIME_TOKEN`
    - `TRACE_BRIDGE_URL`
  - persist returned provider runtime ID and label
- Implement `stopSession`:
  - call `stopUrl` with `sessionId`, provider runtime ID, and reason
  - reuse the stop idempotency key on retries
- Implement `getStatus`:
  - call `statusUrl` and map launcher status to Trace status
- Add request/response validation with `unknown` narrowing.

## Dependencies

- [03 - Agent Environment Service](03-agent-environment-service.md)
- [04 - Runtime Adapter Registry](04-runtime-adapter-registry.md)

## Completion requirements

- [ ] Provisioned config validation rejects missing URLs/auth config/secrets.
- [ ] Start request is authenticated.
- [ ] Stop request is authenticated.
- [ ] Status request is authenticated.
- [ ] Bearer auth sends only the launcher token from the configured org secret.
- [ ] Start retries use the same idempotency key and do not create duplicate compute with a conforming launcher.
- [ ] Stop retries use the same idempotency key and remain safe after an already-stopped runtime.
- [ ] Webhook contract documents bearer handling and optional HMAC timestamp/replay protection.
- [ ] Start payload contains all values needed for the launcher to boot `trace-agent-runtime`.
- [ ] Adapter stores provider runtime ID in session connection state.
- [ ] Provider response parsing does not use `any`.
- [ ] AI messages are never sent to lifecycle endpoints.
- [ ] The launcher bearer token is never passed to the runtime bridge or agent container.

## Implementation notes

- This is the only Trace-core cloud adapter in V1.
- AWS, Fly, Kubernetes, and internal platforms all sit behind this lifecycle contract.
- Keep the launcher payload stable before building reference launchers.

## How to test

1. Unit test bearer auth header generation without logging the token.
2. Unit test optional signature generation with a fixed secret/body/timestamp.
3. Unit test start/stop idempotency key generation.
4. Unit test start response parsing.
5. Unit test status mapping.
6. Integration test against a local mock HTTP launcher.
7. Verify bad auth or malformed responses produce clear session runtime failures.
