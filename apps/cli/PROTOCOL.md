# Trace Editor Daemon Protocol

`trace daemon --stdio` speaks JSON-RPC 2.0, one JSON object per line (NDJSON), over
stdin/stdout. stdout carries protocol frames exclusively; diagnostics go to stderr.
Protocol version: **1** (single integer, bumped on breaking change).

## Framing

- One JSON object per line. The reader tolerates split/joined chunks; a malformed
  line yields a parse-error response and the daemon keeps running.
- Requests carry `id`, `method`, `params`; responses carry `result` or `error`;
  daemon-initiated notifications carry `method` + `params` and no `id`.
- Requests are dispatched strictly in arrival order.

## Error codes

| Code   | Meaning                                                    |
| ------ | ---------------------------------------------------------- |
| -32700 | Parse error                                                |
| -32600 | Invalid request                                            |
| -32601 | Method not found                                           |
| -32602 | Invalid params                                             |
| -32603 | Internal error                                             |
| -32000 | Server disconnected                                        |
| -32001 | Unauthenticated (run `trace login`)                        |
| -32002 | Not initialized                                            |
| -32003 | Protocol version mismatch (`data: { expected, received }`) |

Every method except `initialize` returns `-32002` before the handshake.

## Methods

### initialize `{ protocolVersion, clientInfo }`

Boots the client runtime, hydrates the entity store for the active org
(channels, sessions, tickets, repos — hydrate-on-initialize so the session
switcher has data immediately), and opens the always-on ambient `orgEvents`
subscription.

→ `{ cliVersion, protocolVersion, user: { id, name, email } | null, org: { id, name } | null, connectionState }`

### shutdown

Responds `null`, disposes subscriptions and the socket, exits 0. stdin EOF
triggers the same path.

### Snapshots (store-backed, no GraphQL round-trips)

- `sessions/list` → `{ sessions: SessionSnapshot[] }`
- `channels/list` → `{ channels: [{ id, name, type, memberCount, repo }] }`
- `tickets/list` → `{ tickets: [{ id, title, status, priority, updatedAt }] }`
- `repos/list` → `{ repos: [{ id, name }] }`
- `orgs/list` → `{ orgs: [{ id, name, role, active }] }`

`SessionSnapshot`:

```
{ id, name, agentStatus, sessionStatus, tool, model, repo: { id, name } | null,
  branch, workdir, runtimeLabel, connectionState, sessionGroupId, prUrl,
  worktreeDeleted, lastMessageAt, lastEventPreview, updatedAt }
```

### org/switch `{ org }` (name or ID)

Tears down scopes and the runtime, persists the new active org, re-hydrates.
→ `{ org: { id, name } }`

### scope/subscribe / scope/unsubscribe `{ scopeType, scopeId }`

Refcounted viewport subscriptions (`session` | `channel` | `chat`). The first
subscriber opens the underlying GraphQL subscription; the last closes it.
Subscribing to a session immediately emits its current transcript as a
`session/nodes` append and then streams deltas. → `{ count }`

### session/timeline `{ sessionId, beforeEventId?, limit? }`

Fetches an older page, normalized off to the side — the live store and node
trackers are untouched. Page backward by passing the previous `oldestEventId`.

→ `{ sessionId, nodes: ProtocolNode[], hasOlder, oldestEventId }`

### Actions (fire-and-forget; store updates arrive via events)

- `session/prompt { sessionId, text }` → `{ accepted, id, queued }` — queues when
  the agent is busy (like the web composer); otherwise sends, emitting an
  optimistic `user_prompt` node immediately that the canonical event patches.
- `session/create { repoId?, branch?, tool?, model?, prompt? }` → `{ accepted, id, sessionGroupId }`
- `session/stop { sessionId }` → `{ accepted, id }`
- `channel/send { channelId, text }` → `{ accepted, id }`

## Notifications

### connection/state `{ state }`

`connected` | `reconnecting` | `disconnected`. Reconnection is automatic
(exponential backoff); state transitions are informational.

### entity/upserted `{ type, entity }`

Emitted when events upsert entities (`sessions` | `channels` | `tickets`).
`entity` uses the same snapshot shapes as the list methods. Never emitted
during initial hydration.

### badge/update `{ needsInputCount, mentionCount }`

Emitted once with the post-hydration baseline right after `initialize`, then
debounced (100ms) and only when the counts change. `needsInputCount` is
sessions with `sessionStatus == "needs_input"`; `mentionCount` is unresolved
inbox items.

### session/nodes `{ sessionId, patched, appended, truncateFrom?, count }`

Incremental transcript deltas for subscribed session scopes:

- `appended: ProtocolNode[]` — nodes to add after the last emitted node
- `patched: [{ index, node }]` — replace already-emitted nodes in place
  (streaming updates, optimistic reconciliation — never a duplicate append)
- `truncateFrom?: number` — drop emitted nodes from this index first (rollback)
- `count` — total after applying, as a consistency check

## ProtocolNode shapes

Normalized, render-ready nodes. Editors never see raw events; if a renderer
needs more data, extend the shared node-building path in client-core.

```
{ id, kind: "user_prompt", text, timestamp, optimistic }
{ id, kind: "agent_text",  text, timestamp }
{ id, kind: "tool_use",    name, summary, timestamp }
{ id, kind: "command",     command, output, exitCode, timestamp }
{ id, kind: "read_group",  items: [{ toolName, filePath }], timestamp }
{ id, kind: "plan",        content, filePath, timestamp }
{ id, kind: "question",    questions: [{ question, header, options, multiSelect }], timestamp }
{ id, kind: "pr",          action, url, timestamp }
{ id, kind: "error",       message, timestamp }
```
