# 09 — Entity Summaries

## Summary

The agent needs compressed history to reason about long-lived entities. Entity summaries are AI-generated rolling summaries for chats, tickets, sessions, projects, and repos. They're stored in a dedicated table and maintained by a background worker. This is a critical data product — the planner is only as good as the summaries it reads.

## What needs to happen

### Data model

- Add an `EntitySummary` table to the Prisma schema:
  - `id`, `organizationId`, `entityType` (channel/chat/ticket/session/project/repo), `entityId`
  - `summaryType` (rolling/milestone)
  - `content` (text — the summary itself)
  - `startEventId`, `endEventId`, `eventCount` (the range of events this summary covers)
  - `createdAt`, `updatedAt`
- Index on `(organizationId, entityType, entityId, summaryType)`

### Service layer

- Create `apps/server/src/services/summary.ts` with methods:
  - `getLatest({ organizationId, entityType, entityId })` — fetch the most recent rolling summary
  - `upsert({ organizationId, entityType, entityId, summaryType, content, startEventId, endEventId, eventCount })` — create or update a summary
  - `isFresh(summary, currentEventCount)` — check if the summary is within the freshness threshold (20 events or 30 minutes since last update)

### Summary generation

- Create a summary generation function that takes a list of events and the previous summary (if any) and calls an LLM to produce an updated summary
- The prompt should instruct the model to produce factual, structured output: key decisions, open questions, action items, blockers, entities referenced
- Use a cheap model (Haiku-class) for summary generation

### Background worker

- Add a summary refresh loop to the agent worker that periodically checks for stale summaries and refreshes them
- A summary update is triggered when an entity accumulates 20+ new events since the last summary OR 30+ minutes have elapsed
- The context builder (ticket 10) should be able to trigger a synchronous refresh for high-priority events if the summary is stale

## Dependencies

- 01 (Redis — for tracking event counts per entity)
- 03 (Agent Identity)

## Completion requirements

- [x] `EntitySummary` table exists with migration
- [x] Summary service with `getLatest`, `upsert`, and `isFresh` methods
- [x] Summary generation function that calls an LLM and produces structured summaries
- [x] Background worker refreshes stale summaries
- [x] Summaries are scoped by org (no cross-org data)
- [x] Entity type is generic — adding "channel" summaries later requires no schema changes

## How to test

1. Create 25 events on a ticket — verify the background worker generates a rolling summary
2. Fetch the summary via `getLatest` — verify it contains structured content covering those events
3. Create 5 more events — verify `isFresh` still returns true (under threshold)
4. Create 20 more events — verify the worker refreshes the summary
5. Check that summaries for different orgs are completely isolated
