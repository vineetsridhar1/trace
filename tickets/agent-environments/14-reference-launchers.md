# 14 - Reference Launchers

## Summary

Provide optional launcher examples outside Trace core for common infrastructure targets.

## Plan coverage

Owns plan lines:

- 11: reference launcher support for AWS, Fly, Kubernetes, and other platforms
- 87-92: launcher examples outside Trace core
- 613-672: launcher-side auth verification, idempotency, timestamp checks, and replay rejection where applicable
- 1052-1079: AWS VPC usage path through the provisioned adapter

## What needs to happen

- Add an executable reference launcher for at least one provider and deployment documentation for:
  - AWS ECS Fargate
  - Fly
  - Kubernetes Job
- Executable launcher examples should implement:
  - `POST /trace/start-session`
  - `POST /trace/stop-session`
  - `POST /trace/session-status`
- Executable launcher examples should verify Trace authentication.
- Executable launcher examples should honor idempotency keys for duplicate start/stop requests.
- Bearer launcher examples should:
  - require HTTPS
  - compare bearer tokens in constant time
  - avoid logging tokens
- HMAC launcher examples should reject old timestamps and replayed request IDs.
- Executable launcher examples should inject runtime env vars:
  - `TRACE_SESSION_ID`
  - `TRACE_ORG_ID`
  - `TRACE_RUNTIME_INSTANCE_ID`
  - `TRACE_RUNTIME_TOKEN`
  - `TRACE_BRIDGE_URL`
- Document IAM/networking requirements for AWS ECS.
- Document that launchers are examples, not core adapters.

## Dependencies

- [06 - Provisioned Lifecycle Adapter](06-provisioned-lifecycle-adapter.md)
- [07 - Cloud Runtime Bridge Authentication](07-cloud-runtime-bridge-authentication.md)

## Completion requirements

- [x] At least one reference launcher demonstrates the provisioned lifecycle contract.
- [x] Launcher verifies configured auth mode.
- [x] Launcher starts compute and causes runtime bridge connection.
- [x] Launcher stops compute.
- [x] Launcher handles duplicate start/stop calls idempotently.
- [x] Docs clearly separate launcher code from Trace core.

## Implementation notes

- This is post-V1 unless a customer deployment needs it immediately.
- AWS ECS is the most useful first reference for company VPC deployment.
- Do not add provider-specific generated types or SDK clients to Trace core.

## How to test

1. Run the launcher locally against a mock Trace lifecycle request.
2. Verify auth rejection on invalid input.
3. Verify start returns provider runtime ID.
4. Verify stop is idempotent.
