# 13 - Testing, Telemetry, and Rollout

## Summary

Add end-to-end confidence, operational visibility, and rollout controls for agent environments.

## Plan coverage

Owns plan lines:

- 131-143: terminal multiplexing requirements that need local/provisioned verification
- 1022-1060: unit, service, and integration test requirements plus open-decision handoff
- Also consolidates verification for the implementation tickets' `How to test` sections

## What needs to happen

- Add unit tests for:
  - environment validation
  - default selection
  - registry lookup
  - provisioned bearer auth header generation
  - optional provisioned signature generation
  - lifecycle request replay/timestamp rejection
  - lifecycle idempotency keys
  - status mapping
  - environment compatibility constraints
- Add service tests for:
  - session creation with explicit environment
  - session creation with org default
  - compatibility fallback
  - startup timeout
  - pending message drain
  - fallback behavior when no environment exists
  - compatibility rejection before provisioning
- Add integration tests with a mock provisioned launcher.
  - Include duplicate start/stop calls with the same idempotency key.
  - Include incompatible runtime protocol and unsupported tool registration.
  - Include two concurrent terminals on one session/runtime and assert terminal output, resize, and exit handling stay isolated by `terminalId`.
- Add telemetry/logging for:
  - environment create/update/test
  - provisioned start latency
  - bridge connection latency
  - runtime heartbeat freshness
  - startup timeout
  - deprovision failure
- Add negative assertions that launcher bearer tokens and runtime tokens are not logged.
- Add feature flag or rollout guard if needed.
- Add operator-facing error messages for failed provisioning and deprovisioning.

## Dependencies

- [07 - Cloud Runtime Bridge Authentication](07-cloud-runtime-bridge-authentication.md)
- [08 - Startup Lifecycle and Pending Delivery](08-startup-lifecycle-and-pending-delivery.md)
- [09 - Deprovisioning and Runtime Reconciliation](09-deprovisioning-and-runtime-reconciliation.md)
- [10 - Agent Environment Settings UI](10-agent-environment-settings-ui.md)
- [11 - Session Environment Selection](11-session-environment-selection.md)
- [12 - Cloud Compatibility and Fly Decoupling](12-cloud-compatibility-and-fly-decoupling.md)

## Completion requirements

- [ ] Critical service and adapter paths have automated coverage.
- [ ] Mock provisioned launcher test covers start, bridge connect, message delivery, and stop.
- [ ] Local and provisioned runtime tests cover multiple terminal sessions for one Trace session.
- [ ] Startup failures produce actionable user-visible errors.
- [ ] Deprovision failures are visible and retryable.
- [ ] Rollout path is documented.

## Implementation notes

- Prefer deterministic mock launchers over real cloud provider tests in CI.
- Provider-specific reference launcher tests belong with the launcher, not Trace core.
- Keep telemetry provider-neutral.

## How to test

1. Run the server test suite.
2. Run web tests for settings/session creation surfaces.
3. Run an integration scenario with delayed bridge connection.
4. Run an integration scenario with failed stop and reconciliation.
5. Run a terminal multiplexing scenario with two terminals attached to the same session/runtime.
