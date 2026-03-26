# 23 — Debug Console Event Feed

## Summary

Add a real-time event feed to the Agent Debug Console that shows events flowing through the agent pipeline with their routing decisions (drop/aggregate/direct). This was part of ticket #22's scope but was deferred because it requires infrastructure for streaming routing decisions from the worker to the frontend.

## What needs to happen

### Backend

- Add a mechanism for the agent worker to publish routing decisions to Redis (e.g., a capped Redis Stream or pub/sub channel like `agent:debug:events:{orgId}`)
- Each entry should include: event ID, event type, scope key, timestamp, routing decision (drop/aggregate/direct), reason, and for aggregated events the window they joined
- Add a GraphQL subscription or polling query to read recent routing decisions
- Cap the buffer to prevent unbounded growth (e.g., keep last 200 entries per org, or TTL 5 minutes)

### Frontend

- Add an "Event Feed" tab to the debug console (`AgentDebugPage.tsx`)
- Show a real-time scrolling list of events with: timestamp, event type, scope, routing decision badge (color-coded: green=direct, blue=aggregate, gray=drop)
- Auto-scroll to latest, with ability to pause auto-scroll
- Clicking an event could link to the execution log if one was produced

### Implementation notes

<!-- Ticket 22 created: The debug console page already exists at `apps/web/src/components/agent-debug/AgentDebugPage.tsx` with a tab system. Add a new tab for the event feed. The worker already publishes status via `apps/server/src/services/agent-worker-status.ts` — extend this pattern or add a dedicated debug stream. The router (`apps/server/src/agent/router.ts`) returns `RoutingResult` with `action: "drop" | "aggregate" | "direct"` — this is the data to capture. -->

## Dependencies

- 22 (Agent Debug Console — provides the page and tab infrastructure)
- 04 (Event Router — produces routing decisions)

## Completion requirements

- [ ] Routing decisions are published by the worker and queryable from the server
- [ ] Event feed tab exists in the debug console with real-time event display
- [ ] Each event shows its routing decision with visual distinction
- [ ] Feed is capped/expired to prevent unbounded growth

## How to test

1. Open the debug console event feed tab
2. Trigger events in the system (send messages, create tickets)
3. Verify events appear in the feed within a few seconds
4. Verify routing decisions are shown (drop/aggregate/direct) with correct classification
5. Stop sending events — verify the feed doesn't grow unboundedly
