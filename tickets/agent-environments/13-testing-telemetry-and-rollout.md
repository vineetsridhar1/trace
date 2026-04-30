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
  - reconciler iterations (per-tick reconciled count, time-to-deprovisioned)
  - abandoned runtimes — surface every `session_runtime_deprovision_failed`
    event whose payload includes `abandoned: true` (ticket 09 emits this
    after `MAX_RECONCILE_ATTEMPTS` retries). Operator alert should include
    `sessionId`, `providerRuntimeId`, and `reconcileAttempts`.
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

- [x] Critical service and adapter paths have automated coverage.
- [x] Mock provisioned launcher test covers start, bridge connect, message delivery, and stop.
- [x] Local and provisioned runtime tests cover multiple terminal sessions for one Trace session.
- [x] Startup failures produce actionable user-visible errors.
- [x] Deprovision failures are visible and retryable.
  - Reconciliation/retry already shipped with ticket 09; this ticket should
    add the operator-facing surface (telemetry + alert when a runtime stays
    in `deprovision_failed` / `deprovisioning` past a cap).
- [x] Rollout path is documented.

## Review follow-ups

- [x] Add a deterministic mock provisioned launcher integration test that
  covers start, bridge connect, pending message delivery, duplicate start/stop
  idempotency keys, and stop.
- [x] Add provisioned terminal multiplexing coverage for two concurrent
  terminals on one Trace session/runtime, including output, resize, and exit
  isolation by `terminalId`.
- [x] Make abandoned runtime alerting event-driven or otherwise queryable so
  every `session_runtime_deprovision_failed` event with `abandoned: true` is
  surfaced, not only the in-process `markRuntimeAbandoned` call path.
- [x] Add an assertion that abandoned runtime alerts include `providerRuntimeId`
  alongside `sessionId` and `reconcileAttempts`.
- [x] Add negative log assertions for network/error paths that may include
  launcher bearer tokens or runtime bridge tokens in exception messages.

## Implementation notes

- Prefer deterministic mock launchers over real cloud provider tests in CI.
- Provider-specific reference launcher tests belong with the launcher, not Trace core.
- Keep telemetry provider-neutral.

## Rollout path

1. Keep all provisioned environments disabled by default until their `/status`
   test passes from org settings.
2. Enable one non-default provisioned environment for an internal org and start
   sessions by explicitly selecting that environment.
3. Watch provider-neutral telemetry for:
   - `environment.create`, `environment.update`, and `environment.test`
   - `launcher.request` and `provisioned.start`
   - `bridge.connected`, `provisioned.bridge_ready`, and `provisioned.startup_timeout`
   - `runtime.heartbeat_stale`
   - `deprovision.reconciler_iteration`, `deprovision.failed`, and
     `deprovision.abandoned_runtime`
4. Promote the environment to org default only after explicit sessions show
   stable startup, bridge connection, terminal multiplexing, and deprovision.
5. Roll back by clearing `isDefault` or disabling the environment; existing
   local bridge environments remain available as the fallback path.

Telemetry payloads must stay provider-neutral and must not include launcher
bearer tokens, runtime bridge tokens, HMAC secrets, or HMAC signatures.

## How to test

1. Run the server test suite.
2. Run web tests for settings/session creation surfaces.
3. Run an integration scenario with delayed bridge connection.
4. Run an integration scenario with failed stop and reconciliation.
5. Run a terminal multiplexing scenario with two terminals attached to the same session/runtime.
