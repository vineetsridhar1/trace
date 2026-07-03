# 11 - Snapshot, Scope, and Action Methods

## Summary

Register the daemon's working methods: entity list snapshots from the store, viewport-driven `scope/subscribe`/`scope/unsubscribe`, and the fire-and-forget action methods (`session/prompt`, `session/create`, `session/stop`, `channel/send`). After this ticket an editor can list, watch, and act — ticket 12 adds the push notifications.

## Plan coverage

Owns plan lines:

- 142: viewport-driven subscriptions with an always-on ambient tier
- 153-154: `orgs/list`, `org/switch`, and the list snapshot methods
- 156-161: action methods and scope subscribe/unsubscribe

## What needs to happen

- Hydration: on `initialize`, run the initial queries that fill the entity store (channels, sessions, tickets, repos for the active org). Document the choice (hydrate-on-initialize vs lazy-per-method) in the protocol doc; recommended: hydrate-on-initialize, since the switcher needs sessions immediately.
- Snapshot methods `channels/list`, `sessions/list`, `tickets/list`, `repos/list`, `orgs/list` read the entity store — they never query GraphQL directly, so their results always agree with what notifications later patch. Session snapshots include status fields and connection metadata (worktree path, runtime label) — ticket 19 depends on it.
- `org/switch`: swap the active org, tear down subscriptions, re-hydrate, confirm.
- `scope/subscribe { scopeType, scopeId }` / `scope/unsubscribe`: refcounted registry mapping scope → GraphQL subscription (`sessionEvents` / `channelEvents` / `chatEvents`), feeding `handleSessionEvent` / `handleOrgEvent`. Ambient `orgEvents` stays always-on regardless.
- Action methods delegate to ticket 07's shared mutation helpers and return `{ accepted: true, id }` acks. No store writes from results — resulting events flow back through subscriptions.

## Dependencies

- [07 - Write Commands](07-write-commands.md)
- [10 - Daemon RPC Core](10-daemon-rpc-core.md)

## Completion requirements

- [ ] After `initialize`, `sessions/list` returns the org's sessions without further round-trips
- [ ] Subscribe/unsubscribe opens/closes the underlying GraphQL subscription (verify by observing server-side subscription lifecycles or ws frames)
- [ ] Refcounting: two subscribes + one unsubscribe keeps the subscription alive
- [ ] Action methods ack immediately and the store updates only when the event arrives
- [ ] `org/switch` re-hydrates and subsequent snapshots reflect the new org

## Implementation notes

- The scope registry is the daemon's version of the web's navigate-in/navigate-away rule (plan line 142) — keep it a small standalone module with unit tests; ticket 17's autocmds are its client.
- Session snapshot shape is a documented protocol type, not a raw GraphQL `Session` — select the fields editors need (id, name, statuses, tool, repo/branch, worktree path, updatedAt) and keep it stable.

## How to test

1. Golden transcript: initialize → sessions/list → scope/subscribe(session) → session/prompt → observe ack; assert no snapshot change until the event lands (with ticket 12's notifications, the full loop closes).
2. Unit-test the refcounted scope registry.
3. `org/switch` transcript asserts re-hydration and new-org snapshots.
