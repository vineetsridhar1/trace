# 12 - Normalized Deltas

## Summary

Ship the daemon's push side: `entity/upserted`, `session/nodes`, `badge/update`, and `connection/state` notifications, plus the paginated `session/timeline` method. Normalized, render-ready data crosses the RPC boundary — the editor never sees raw events.

## Plan coverage

Owns plan lines:

- 143: optimistic updates surfacing as immediate node appends
- 155: `session/timeline` pagination
- 165-174: notification set and the normalized-data design decision

## What needs to happen

- `entity/upserted { type, entity }`: subscribe to the entity store and emit deltas when events upsert entities (sessions, channels, tickets). Batch bursts (e.g. hydration) into one notification per entity, and never emit during initial hydration before `initialize` returns.
- `session/nodes { sessionId, ... }`: for each subscribed session scope, maintain node state via `buildSessionNodes` / `routeSessionOutput` and emit incremental payloads — appended nodes and patches to existing nodes (streaming agent text updates the same node, not a new one). Define the append/patch payload shape precisely in the protocol doc; ticket 17 renders it.
- Optimistic prompts: a `session/prompt` action immediately emits the optimistic node append; reconciliation (via `reconcileOptimisticSessionMessage`) emits a patch, not a duplicate.
- `badge/update { needsInputCount, mentionCount }`: derived selectors over the store (sessions with `needs_input`, mention events from the ambient tier); emitted on change, debounced.
- `session/timeline { sessionId, beforeEventId?, limit }`: fetch the older page via the `sessionTimeline` query, normalize to nodes, return them for prepending. Must not disturb the live node state.
- `connection/state` transitions (wired in ticket 10) documented alongside the rest.

## Dependencies

- [11 - Snapshot, Scope, and Action Methods](11-snapshot-scope-and-action-methods.md)

## Completion requirements

- [x] Driving a session from another client produces a correct `session/nodes` stream (append + patch, no duplicates) for a subscribed daemon
- [x] Prompting through the daemon shows the optimistic node immediately and reconciles cleanly
- [x] `badge/update` fires when a session enters/leaves `needs_input`
- [x] `session/timeline` pages backward without corrupting the live stream
- [x] Unsubscribed scopes emit no `session/nodes` traffic
- [x] The protocol document specifies every notification and node payload shape

## Implementation notes

- The node-diffing logic (previous node list → append/patch payload) should be a pure, unit-tested function; it is the heart of the transcript UX and shared conceptually with ticket 08's renderer.
- Node kinds come from client-core (`user_prompt`, `agent_text`, `tool_use`, `plan`, `question`, …). If an editor needs data a node lacks, extend the shared node builder, not the daemon.

## How to test

1. Golden transcript against `dev:local`: subscribe a session, drive it from the web UI, assert the notification stream (kinds, order, patch vs append).
2. Unit-test node diffing with fixture node sequences, including streaming-text patches and optimistic reconciliation.
3. Pagination test: long session, page backward twice, assert node order and no live-stream disturbance.
