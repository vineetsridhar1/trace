# 01 — Redis Infrastructure

## Summary

Add Redis to the server as the backbone for multi-process communication. The current pub/sub system is an in-memory EventEmitter that only works within a single process. The agent worker will run as a separate process, so we need Redis for both real-time pub/sub and durable event streaming.

## What needs to happen

- Add `ioredis` to `apps/server`
- Create a Redis client module at `apps/server/src/lib/redis.ts` that connects using env config (`REDIS_URL`)
- Replace the `PubSub` class in `apps/server/src/lib/pubsub.ts` with a Redis-backed implementation that preserves the same interface (`publish`, `asyncIterator`, and the `topics` export)
- All existing GraphQL subscriptions and event broadcasting must continue to work exactly as before — this is a transparent backend swap
- Add Redis Streams support: the `EventService.create()` method should `XADD` every event to an org-scoped stream (`stream:org:{orgId}:events`) after writing to Postgres. This is the durable stream the agent worker will consume from
- Add a `docker-compose.yml` (or update existing) to run Redis locally for dev
- Add `REDIS_URL` to `.env.example`

## Dependencies

None — this is the foundation.

## Completion requirements

- [x] `ioredis` installed and Redis client module exists
- [x] `PubSub` class uses Redis pub/sub instead of EventEmitter
- [x] All existing GraphQL subscriptions still work (test by running `pnpm dev:server` and `pnpm dev:web`, verify real-time updates in the UI)
- [x] Every event created via `EventService.create()` is also added to a Redis Stream keyed by org
- [x] Redis runs locally via docker-compose or similar
- [x] Graceful fallback or clear error if Redis is not running

## How to test

1. Start Redis locally, run `pnpm dev`, open the web app
2. Perform actions that emit events (send a chat message, create a ticket, start a session)
3. Verify real-time updates still appear in the UI without page refresh
4. Use `redis-cli` to verify streams exist: `XLEN stream:org:{orgId}:events` should show a count matching the number of events created
5. `XRANGE stream:org:{orgId}:events - +` should show the event payloads
