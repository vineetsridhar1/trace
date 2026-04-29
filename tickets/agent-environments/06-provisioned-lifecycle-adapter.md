# 06 - Provisioned Lifecycle Adapter

## Summary

Add the generic provisioned adapter that calls an org-owned signed lifecycle endpoint to start, stop, and inspect runtimes.

## Plan coverage

Owns plan lines:

- 7-11: generic provisioned runtimes and reference-launcher path
- 76-84: signed provisioned endpoints and launcher examples outside core
- 474-626: provisioned adapter purpose, config, start/stop/status contracts, signing, and replay expectations
- 627-639: runtime bootstrap values passed to the launcher
- 859-883: signing secret references and adapter-time secret resolution
- 911-918: phase 4 provisioned adapter work
- 988: open decision on provisioned status polling scope
- 999: V1 signed provisioned start/stop/status requirement

## What needs to happen

- Implement `ProvisionedRuntimeAdapter`.
- Validate config:
  - `startUrl`
  - `stopUrl`
  - `statusUrl`
  - `signingSecretId`
  - `startupTimeoutSeconds`
  - `deprovisionPolicy`
  - optional `launcherMetadata`
- Sign lifecycle requests with timestamp, request id, and HMAC.
- Define launcher-side replay protection expectations:
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
- Implement `getStatus`:
  - call `statusUrl` and map launcher status to Trace status
- Add request/response validation with `unknown` narrowing.

## Dependencies

- [03 - Agent Environment Service](03-agent-environment-service.md)
- [04 - Runtime Adapter Registry](04-runtime-adapter-registry.md)

## Completion requirements

- [ ] Provisioned config validation rejects missing URLs/secrets.
- [ ] Start request is signed.
- [ ] Stop request is signed.
- [ ] Status request is signed.
- [ ] Webhook contract documents timestamp freshness and replay protection.
- [ ] Start payload contains all values needed for the launcher to boot `trace-agent-runtime`.
- [ ] Adapter stores provider runtime ID in session connection state.
- [ ] Provider response parsing does not use `any`.
- [ ] AI messages are never sent to lifecycle endpoints.

## Implementation notes

- This is the only Trace-core cloud adapter in V1.
- AWS, Fly, Kubernetes, and internal platforms all sit behind this lifecycle contract.
- Keep the launcher payload stable before building reference launchers.

## How to test

1. Unit test signature generation with a fixed secret/body/timestamp.
2. Unit test start response parsing.
3. Unit test status mapping.
4. Integration test against a local mock HTTP launcher.
5. Verify bad signatures or malformed responses produce clear session runtime failures.
