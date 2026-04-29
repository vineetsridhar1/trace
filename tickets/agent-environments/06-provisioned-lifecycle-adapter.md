# 06 - Provisioned Lifecycle Adapter

## Summary

Add the generic provisioned adapter that calls an org-owned authenticated lifecycle endpoint to start, stop, and inspect runtimes.

## Plan coverage

Owns plan lines:

- 7-11: generic provisioned runtimes and reference-launcher path
- 76-96: authenticated provisioned endpoints, admission constraints, and launcher examples outside core
- 131-143: provisioned runtime terminal multiplexing parity with local runtimes
- 503-689: provisioned adapter purpose, config, start/stop/status contracts, auth, idempotency, and replay expectations
- 691-722: runtime bootstrap values passed to the launcher and bridge terminal parity
- 930-957: launcher auth secret references and adapter-time secret resolution
- 985-992: phase 4 provisioned adapter work
- 1067: open decision on provisioned status polling scope
- 1080-1081: V1 authenticated provisioned start/stop/status and idempotency requirements

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
- Ensure provisioned runtime startup does not create a one-terminal contract:
  - the lifecycle endpoint starts compute only
  - terminal creation and I/O flow over the runtime bridge
  - the connected runtime must accept multiple `terminal_create` commands for the same session/runtime
  - terminal traffic must remain keyed and isolated by `terminalId`
- Implement `stopSession`:
  - consume the selected environment config through `RuntimeStopInput` or a typed environment reference
  - call `stopUrl` with `sessionId`, provider runtime ID, and reason
  - reuse the stop idempotency key on retries
- Implement `getStatus`:
  - consume the selected environment config through `RuntimeStatusInput` or a typed environment reference
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
- [ ] Provisioned adapter lifecycle contracts do not expose a single terminal stream.
- [ ] Provisioned runtimes can support multiple bridge-created terminals per session/runtime.
- [ ] Provider response parsing does not use `any`.
- [ ] AI messages are never sent to lifecycle endpoints.
- [ ] The launcher bearer token is never passed to the runtime bridge or agent container.

## Implementation notes

- Replace the ticket 04 `LegacyCloudMachineProvisionedRuntimeAdapter` compatibility shim with the
  generic lifecycle endpoint implementation. The shim exists only to keep current cloud sessions
  working while the registry boundary lands.
- Ticket 04's initial contract passes environment config to `startSession` only. Extend the
  stop/status inputs or router call sites as part of this ticket before implementing authenticated
  `stopUrl` and `statusUrl`; the adapter should not query around the registry boundary for config.
- This is the only Trace-core cloud adapter in V1.
- AWS, Fly, Kubernetes, and internal platforms all sit behind this lifecycle contract.
- Keep the launcher payload stable before building reference launchers.
- The lifecycle endpoint is not a terminal API. Once the runtime connects, terminal behavior must match local bridge behavior and remain multiplexed by `terminalId`.

## How to test

1. Unit test bearer auth header generation without logging the token.
2. Unit test optional signature generation with a fixed secret/body/timestamp.
3. Unit test start/stop idempotency key generation.
4. Unit test start response parsing.
5. Unit test status mapping.
6. Integration test against a local mock HTTP launcher.
7. Verify bad auth or malformed responses produce clear session runtime failures.
8. In the mock launcher scenario, create two terminals for one provisioned session and verify output, resize, and exit events stay isolated by `terminalId`.
