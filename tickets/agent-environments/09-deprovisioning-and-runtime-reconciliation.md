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
  - stopped
  - deprovisioning
  - deprovisioned
  - deprovision_failed
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

- [ ] Local stop/delete does not deprovision the user's machine.
- [ ] Provisioned stop calls the configured lifecycle endpoint.
- [ ] Failed stop attempts are retryable.
- [ ] Stuck deprovisioning runtimes are reconciled.
- [ ] Runtime state is eventually marked stopped/deprovisioned or failed.
- [ ] Events accurately reflect deprovision progress.

## Implementation notes

- Bridge disconnection is a signal, not the cleanup mechanism.
- Keep provider-specific state in metadata and connection fields.
- `after_idle` is useful for shared launcher pools, but V1 can default provisioned environments to `on_session_end`.

## How to test

1. Stop a local session and verify only bridge cleanup commands are sent.
2. Stop a provisioned session and verify `stopUrl` is called.
3. Simulate stop endpoint failure and verify retry state.
4. Simulate a runtime stuck in stopping and verify reconciliation.
