# 14 - Reference Launchers

## Summary

Provide optional launcher examples outside Trace core for common infrastructure targets.

## What needs to happen

- Add reference launcher documentation and/or example apps for:
  - AWS ECS Fargate
  - Fly
  - Kubernetes Job
- Each launcher should implement:
  - `POST /trace/start-session`
  - `POST /trace/stop-session`
  - `GET /trace/session-status/:runtimeId`
- Each launcher should verify Trace signatures.
- Each launcher should inject runtime env vars:
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

- [ ] At least one reference launcher demonstrates the provisioned lifecycle contract.
- [ ] Launcher verifies signatures.
- [ ] Launcher starts compute and causes runtime bridge connection.
- [ ] Launcher stops compute.
- [ ] Docs clearly separate launcher code from Trace core.

## Implementation notes

- This is post-V1 unless a customer deployment needs it immediately.
- AWS ECS is the most useful first reference for company VPC deployment.
- Do not add provider-specific generated types or SDK clients to Trace core.

## How to test

1. Run the launcher locally against a mock Trace lifecycle request.
2. Verify signature rejection on invalid input.
3. Verify start returns provider runtime ID.
4. Verify stop is idempotent.
