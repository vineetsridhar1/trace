# 08 - Startup Lifecycle and Pending Delivery

## Summary

Track slow provisioned runtime startup explicitly and queue user messages until the runtime bridge is ready.

## Plan coverage

Owns plan lines:

- 85-97: service layer and runtime bridge own message handling, not adapters
- 546: provisioned runtime readiness waits for bridge connection
- 678-731: startup lifecycle states, bridge-readiness rule, and pending message delivery
- 911-918: phase 4 wait-for-bridge and timeout behavior
- 924-925: phase 5 queued message delivery while starting
- 1001: V1 startup timeout requirement

## What needs to happen

- Add lifecycle transitions for:
  - requested
  - provisioning
  - booting or connecting
  - connected
  - failed
  - timed out
- Update session creation to persist runtime start state before calling the adapter.
- Treat provider start success as provisioning, not readiness.
- Treat bridge connection as readiness.
- Queue messages while runtime is not connected.
- Drain queued messages in event order once the bridge registers.
- Add startup timeout based on environment config.
- Emit runtime lifecycle events for each transition.

## Dependencies

- [06 - Provisioned Lifecycle Adapter](06-provisioned-lifecycle-adapter.md)
- [07 - Cloud Runtime Bridge Authentication](07-cloud-runtime-bridge-authentication.md)

## Completion requirements

- [ ] A slow provisioned runtime shows a starting/provisioning state.
- [ ] User messages sent during startup are persisted.
- [ ] Pending messages are delivered once the runtime bridge connects.
- [ ] Startup timeout marks runtime failed/timed out.
- [ ] Timed-out sessions do not later dispatch stale queued messages to the wrong runtime.
- [ ] Lifecycle events are emitted in order.

## Implementation notes

- Do not use mutation results to update client state; rely on events.
- Bridge connection is the readiness point.
- Keep delivery idempotent so reconnects do not duplicate user messages.

## How to test

1. Use a mock provisioned adapter that delays bridge registration.
2. Send a user message during startup.
3. Register the bridge and verify the message is delivered once.
4. Repeat with no bridge registration and verify timeout behavior.
5. Verify the UI receives lifecycle events through normal subscriptions.
