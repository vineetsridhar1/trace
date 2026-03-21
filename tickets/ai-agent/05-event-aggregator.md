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

## Completion requirements

- [ ] Aggregator module exists and receives events from the router
- [ ] Events are grouped by scope key into windows
- [ ] Windows close on silence timeout, max events, or max wall clock
- [ ] Direct-routed events bypass aggregation
- [ ] Open windows survive worker restart via Redis backup
- [ ] Closed windows emit batches with all events and metadata (scope key, org, timing)
- [ ] Scope key construction is generic enough that adding channels later is trivial

## How to test

1. Send 3 messages in a chat thread quickly, then wait 30+ seconds — verify they arrive as a single batch of 3
2. Send messages across two different threads simultaneously — verify they produce two separate batches
3. Send 25+ messages rapidly in one scope — verify the window closes at 25 and a new one opens
4. Route an event as `direct` — verify it bypasses aggregation and arrives immediately
5. Kill and restart the worker mid-window — verify the window recovers and closes correctly
