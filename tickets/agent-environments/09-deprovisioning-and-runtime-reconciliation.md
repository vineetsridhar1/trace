# 09 - Deprovisioning and Runtime Reconciliation

## Summary

Make runtime cleanup adapter-owned, retryable, and resilient to provider or bridge failures.

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
