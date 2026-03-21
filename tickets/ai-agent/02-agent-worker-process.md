# 02 — Agent Worker Process

## Summary

Create the agent worker as a separate entry point in `apps/server`. This is the long-running process that consumes events from Redis Streams and will eventually run the full AI pipeline. For now it just needs to boot, connect to Redis, consume events, and log them.

## What needs to happen

- Create `apps/server/src/agent-worker.ts` as a new entry point
- The worker should:
  - Initialize the same service container used by the API server (Prisma, Redis, services)
  - Create a Redis Streams consumer group (`agent-runtime`) for each active org
  - Block-read events using `XREADGROUP` in a loop
  - Log consumed events to stdout with org, scope, and event type
  - Acknowledge events with `XACK` after processing
  - Handle graceful shutdown (SIGTERM/SIGINT — stop consuming, close connections)
- On startup, the worker should discover active organizations and subscribe to their streams. New orgs created while the worker is running should be picked up (either via polling or by subscribing to an org-creation event)
- Add `dev:agent` script to `apps/server/package.json`
- Add `dev:agent` to the root `pnpm dev` parallel command so it starts alongside the server and web app
- The worker must recover from Redis disconnections and reconnect automatically

## Implementation notes from ticket 01

<!-- Updated after ticket 01: XADD in EventService is fire-and-forget (.catch logs only), so Redis Streams may have gaps if Redis is temporarily unavailable. Postgres is the source of truth. -->

- The Redis client module is at `apps/server/src/lib/redis.ts` — import `redis` from there for XREADGROUP
- Stream key pattern: `stream:org:{orgId}:events` — each entry has a single field `event` containing the JSON-serialized event
- `maxRetriesPerRequest: null` is already set on the Redis client, which is required for blocking XREADGROUP
- **Important**: The XADD in EventService is fire-and-forget, so the stream may have gaps if Redis was briefly unavailable. On startup, the worker should compare its last-processed stream ID against the Postgres event table to detect and backfill any missed events. This ensures at-least-once delivery as required by the plan (§7).

## Dependencies

- 01 (Redis Infrastructure)

## Completion requirements

- [x] `apps/server/src/agent-worker.ts` exists and runs as a separate process
- [x] Worker consumes events from Redis Streams using consumer groups
- [x] `pnpm dev:agent` starts the worker
- [x] Worker logs every event it consumes (event type, scope, org)
- [x] Worker handles graceful shutdown without hanging
- [x] Worker reconnects if Redis connection drops
- [x] Worker does not interfere with the API server process

## How to test

1. Run `pnpm dev` — verify the agent worker starts alongside the server
2. Perform actions in the web UI (send messages, create tickets)
3. Check worker stdout — consumed events should appear with their type and scope
4. Stop and restart the worker — it should resume from where it left off (not reprocess old events, not miss events emitted while it was down)
5. Kill Redis, restart it — worker should reconnect and resume
