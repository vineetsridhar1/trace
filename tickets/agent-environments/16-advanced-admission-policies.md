# 16 - Advanced Admission Policies

## Summary

Add richer environment admission policies after the V1 local/provisioned runtime architecture is stable.

## Plan coverage

Owns plan lines:

- 79-88: post-V1 advanced admission policy examples
- 1042-1051: open decision on whether advanced admission policies stay in config or become first-class columns

## What needs to happen

- Decide whether advanced policies stay inside `AgentEnvironment.config` or become first-class columns/tables.
- Add optional allowed repo rules.
- Add max concurrent sessions per environment.
- Add max session duration per environment.
- Add per-environment quota policy if needed.
- Add clear validation errors before provisioning.
- Add tests for policy enforcement under concurrent session starts.

## Dependencies

- [11 - Session Environment Selection](11-session-environment-selection.md)
- [13 - Testing, Telemetry, and Rollout](13-testing-telemetry-and-rollout.md)

## Completion requirements

- [ ] Advanced policies are enforced before runtime provisioning.
- [ ] Concurrency enforcement is race-safe.
- [ ] Policy failures are visible and actionable in the UI.
- [ ] Existing V1 environments without advanced policies continue to work.

## Implementation notes

- This is intentionally post-V1 because race-safe concurrency and quota enforcement are more complex than basic tool compatibility.
- Keep V1 limited to enabled-state and supported-tool checks unless a customer need makes advanced policies urgent.

## How to test

1. Create an environment with allowed repo rules and verify disallowed repos fail before provisioning.
2. Create an environment with max concurrency and verify simultaneous starts do not exceed the limit.
3. Create an environment with max session duration and verify long sessions are stopped or rejected according to policy.
