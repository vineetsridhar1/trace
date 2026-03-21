# 05 — Event Aggregator

## Summary

The aggregator batches related events into coherent units before they reach the planner. A 5-message thread about a bug is one conceptual trigger, not 5 independent planner calls. This reduces LLM costs and produces better decisions.

## What needs to happen

- Create `apps/server/src/agent/aggregator.ts`
- The aggregator manages a `Map<string, AggregationWindow>` of active windows keyed by scope key
- Scope key construction should handle all current scope types:
  - `chat:{chatId}:thread:{parentMessageId}` for threaded chat messages
  - `chat:{chatId}` for top-level chat messages
  - `ticket:{ticketId}` for ticket activity
  - `session:{sessionId}` for session activity
  - Generic `{scopeType}:{scopeId}` fallback for future scope types (like channels)
- A window closes when any of these conditions are met:
  - Silence timeout: no new events for 30 seconds (configurable)
  - Max events: 25 events in the window
  - Max wall clock: 5 minutes since window opened
- When a window closes, emit the full batch of events to the next stage (context builder, once it exists — for now, log the batch)
- Events routed as `direct` by the router should bypass aggregation and go straight through as a single-event batch
- Back aggregation windows with Redis hashes so they survive worker restarts. On startup, recover any open windows from Redis and resume their timers
- The silence timeout per scope type should be configurable (channels may want longer windows than tickets)

## Dependencies

- 04 (Event Router)
  <!-- Ticket 04 created: `AgentEvent` type (id, organizationId, scopeType, scopeId, eventType, actorType, actorId, payload, metadata, timestamp), `RoutingResult` with decision ("aggregate"|"direct"|"drop") and maxTier annotation. The aggregator receives events with decision="aggregate" and should pass through decision="direct" as single-event batches. Import from `./agent/router.js`. -->

## Completion requirements

- [x] Aggregator module exists and receives events from the router
- [x] Events are grouped by scope key into windows
- [x] Windows close on silence timeout, max events, or max wall clock
- [x] Direct-routed events bypass aggregation
- [x] Open windows survive worker restart via Redis backup
- [x] Closed windows emit batches with all events and metadata (scope key, org, timing)
- [x] Scope key construction is generic enough that adding channels later is trivial

## Implementation notes
<!-- Added after implementation review -->
- Aggregator lives at `apps/server/src/agent/aggregator.ts`, wired into `agent-worker.ts`
- `EventAggregator` class manages windows with `start()` / `stop()` lifecycle and `ingest(event, routing)` entry point
- `buildScopeKey(event)` constructs scope keys: `chat:{id}:thread:{parentId}`, `chat:{id}`, `ticket:{id}`, `session:{id}`, generic `{type}:{id}` fallback
- Windows keyed by `{orgId}:{scopeKey}` in the internal Map
- Silence timeouts are configurable per scope type via `DEFAULT_SILENCE_TIMEOUTS` (chat/ticket/session: 30s, channel: 60s)
- `maxTier` tracks the most restrictive tier across all events in a window
- Redis persistence uses `SET` with TTL (max wall clock + 60s buffer) at key `agent:aggregator:window:{orgId}:{scopeKey}`
- On startup, `start()` recovers windows via `SCAN`, checks expiry, resumes active ones with fresh silence timers
- On shutdown, `stop()` persists all open windows to Redis so they survive restart
- `AggregatedBatch` carries: scopeKey, organizationId, events[], maxTier, openedAt, closedAt, closeReason
- Batch handler is injected via constructor — currently logs, future tickets (#10 context builder) will replace

## How to test

1. Send 3 messages in a chat thread quickly, then wait 30+ seconds — verify they arrive as a single batch of 3
2. Send messages across two different threads simultaneously — verify they produce two separate batches
3. Send 25+ messages rapidly in one scope — verify the window closes at 25 and a new one opens
4. Route an event as `direct` — verify it bypasses aggregation and arrives immediately
5. Kill and restart the worker mid-window — verify the window recovers and closes correctly
