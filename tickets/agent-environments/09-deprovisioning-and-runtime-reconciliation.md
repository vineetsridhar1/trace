# 09 - Deprovisioning and Runtime Reconciliation

## Summary

Make runtime cleanup adapter-owned, retryable, and resilient to provider or bridge failures.

## Plan coverage

Owns plan lines:

- 106-126: bridge terminate/delete traffic and heartbeat/disconnection signals
- 164-190: runtime state fields used by stopping/stopped/failed transitions
- 439-482: local stop/delete cleanup without deprovisioning the host machine
- 782-831: deprovisioning ownership, local/provisioned cleanup, and policies
- 982-988: phase 6 explicit stop/deprovision states, retries, and reconciliation
- 1065: V1 adapter-owned deprovisioning requirement

## What needs to happen

- Define stop/deprovision states:
  - stopping
  - stopped (local terminal)
  - deprovisioned (provisioned terminal)
  - deprovision_failed
  <!-- Updated after ticket 09 review: the original list included a
       distinct `deprovisioning` state. We collapsed it into `stopping` to
       remove a silent (no-event) state transition; the brief window between
       sending bridge `delete` and the launcher confirming stop is now
       represented by `stopping`. -->

- Implement deprovision policy handling:
  - `on_session_end`
  - `after_idle`
  - `manual`
- For local:
  - send terminate/delete over bridge
  - clean only Trace-created session resources
  - keep desktop bridge alive
- For provisioned:
  - send terminate over bridge if connected
  - call `stopUrl`
  - poll `statusUrl` when needed
  - retry failed stop calls
- Add a background reconciler for stuck stopping/deprovisioning runtimes.
- Emit deprovision lifecycle events.

## Dependencies

- [06 - Provisioned Lifecycle Adapter](06-provisioned-lifecycle-adapter.md)
- [08 - Startup Lifecycle and Pending Delivery](08-startup-lifecycle-and-pending-delivery.md)

## Completion requirements

- [x] Local stop/delete does not deprovision the user's machine.
- [x] Provisioned stop calls the configured lifecycle endpoint.
- [x] Failed stop attempts are retryable.
- [x] Stuck deprovisioning runtimes are reconciled.
- [x] Runtime state is eventually marked stopped/deprovisioned or failed.
- [x] Events accurately reflect deprovision progress.

## Implementation notes

- Bridge disconnection is a signal, not the cleanup mechanism.
- Keep provider-specific state in metadata and connection fields.
- `after_idle` is useful for shared launcher pools, but V1 can default provisioned environments to `on_session_end`.
- A launcher response of `status: "stopping"` indicates async cleanup is still
  in flight — leave the connection in `stopping` and rely on the reconciler
  to re-call `stopUrl` (idempotency key `session:{sessionId}:stop`). Only
  `status: "stopped"` or `"not_found"` should emit
  `session_runtime_stopped` and transition to `deprovisioned`.
- The reconciler bumps `connection.reconcileAttempts` on every pickup and
  abandons the runtime after `MAX_RECONCILE_ATTEMPTS` (10). Abandoned
  runtimes get `autoRetryable: false`, `abandonedAt`, a terminal
  `session_runtime_deprovision_failed` event with `abandoned: true`, and are
  skipped on subsequent reconciler ticks. Ticket 13 owns the operator alert
  that surfaces these.
- A fresh user-initiated stop (delete / unload) calls `resetReconcileState`
  before invoking `destroyRuntime` so the next round starts with a clean
  budget.
- Local stop returns `{ ok: true, status: "stopped" }` synchronously — the
  desktop bridge does the work via the bridge `delete` command. The runtime
  adapter's `stopSession` does not call back into the bridge.
- Connection writes from this ticket's paths
  (`bumpReconcileAttempts`, `resetReconcileState`, `recordRuntimeLifecycle`)
  go through `updateConnectionConditional`, an optimistic-locking helper
  that bumps `connection.version` on each write and retries on version
  mismatch. Pre-existing writers (e.g. `markConnectionLost`) don't
  participate yet — see ticket 15 for the broader cleanup once
  `SessionRuntime` is its own table.
- `attemptStopSession` short-circuits on `ProvisionedLauncherError` with a
  4xx status that isn't 408/425/429. Auth or validation failures don't
  retry; transient 5xx, network errors, and throttles do.

## How to test

1. Stop a local session and verify only bridge cleanup commands are sent.
2. Stop a provisioned session and verify `stopUrl` is called.
3. Simulate stop endpoint failure and verify retry state.
4. Simulate a runtime stuck in stopping and verify reconciliation.
