# Ticket 10: Server Runtime, Data & Eventing Hardening

## Goal

Make the server safe to operate in production: secure by default, transactional where it matters, observable, and able to scale past a single in-memory process. This is the back-end hardening ticket the current migration set is missing.

## Context

The current server has several production blockers:

- `apps/server/src/app.ts` allows `cors({ origin: '*' })`.
- `apps/server/src/config.ts` falls back to a default JWT secret.
- `apps/server/src/services/pubsub.ts` uses in-memory `graphql-subscriptions` `PubSub`, which does not support multi-instance deployment.
- Core business logic is concentrated in very large services:
  - `workspaceService.ts`
  - `eventService.ts`
  - `ticketService.ts`
- The Prisma schema still carries significant legacy naming and lifecycle coupling.

Even if Tickets 1-8 are finished perfectly, the server is still not yet a production-grade control plane.

## Tasks

### 1. Replace in-memory pubsub with a real event bus

Introduce a `DomainEventBus` abstraction and back it with one of:

- Redis pubsub + durable outbox
- Postgres `LISTEN/NOTIFY` + durable outbox

Requirements:

- a status change or workspace update must survive process restart
- subscriptions must work across multiple server instances
- publish must be decoupled from GraphQL resolver code
- the system must support replay / catch-up semantics where needed

`graphql-subscriptions` `PubSub` can remain as an adapter at the GraphQL edge, but it cannot remain the source of truth.

### 2. Validate configuration at startup

Move env parsing into `packages/config` and fail fast when required settings are missing or insecure.

At minimum, validate:

- `DATABASE_URL`
- `JWT_SECRET`
- GitHub OAuth config
- storage path/bucket config
- CORS origins
- deployment mode

The server must refuse to boot in non-dev environments with a default JWT secret.

### 3. Harden the HTTP and WebSocket edge

- Replace `origin: '*'` with an allowlist.
- Add rate limiting on auth-sensitive and write-heavy routes.
- Review per-route body-size limits instead of one blanket `10mb` default.
- Add request IDs.
- Ensure WS auth expiry and disconnect handling are explicit.
- Standardize error responses so clients can distinguish auth, validation, conflict, and internal failures.

### 4. Split large services by bounded responsibility

Refactor the current service layer into clearer modules, for example:

- `workspaceLifecycleService`
- `eventIngestService`
- `ticketOrchestrationService`
- `reviewWorkflowService`
- `workspaceQueryService`

The point is not cosmetic file splitting. The point is:

- fewer cross-service side effects
- explicit transaction boundaries
- clearer tests around invariants

### 5. Make lifecycle writes transactional

Critical workflows must update state, derived records, and emitted events in one transaction or a clearly recoverable sequence. This includes:

- workspace status transitions
- ticket sync/moves
- review triggers
- session/event ingestion

Do not rely on "write DB here, publish there, hope nothing fails in between."

### 6. Clean up the data model deliberately

Do not do a reckless rename pass, but do create a real plan for schema cleanup. At minimum:

- add explicit timestamps for status freshness (`statusUpdatedAt`)
- add idempotency support for ingest paths
- model run/session lifecycle more clearly if one workspace can have multiple runs over time
- convert unstable string statuses to Prisma enums where feasible
- document zero-downtime migration steps for legacy table/column names

### 7. Add server observability

- structured logging
- latency/error metrics
- event-ingest metrics
- subscription fanout metrics
- readiness vs liveness endpoints
- alarms around stale active workspaces, failed broadcasts, and auth failures

### 8. Expand test coverage around invariants

Add tests beyond the existing status-path coverage for:

- auth and CORS policy
- WS registration and reconnects
- outbox/event-bus delivery
- idempotent event ingest
- concurrent status/ticket transitions
- migration/backfill safety for new schema fields

## Verification

1. `pnpm --filter trace-server test` passes.
2. `pnpm --filter trace-server build` passes.
3. The server fails fast when required env vars are missing in non-dev mode.
4. Multiple server instances can publish/consume the same workspace updates.
5. Workspace/ticket/status transitions are validated by integration tests under retry/failure scenarios.
6. Logs and metrics expose request IDs and key lifecycle counters.
7. No `cors({ origin: '*' })` remains in the production path.

## Files Changed

- **Modified**: `apps/server/src/app.ts`, `apps/server/src/config.ts`, `apps/server/src/services/pubsub.ts`, `apps/server/src/services/eventService.ts`, `apps/server/src/services/workspaceService.ts`, `apps/server/src/services/ticketService.ts`, GraphQL schema/resolvers, Prisma schema/migrations
- **Created**: outbox/event-bus infrastructure, structured logging/metrics helpers, additional tests
- **Possibly modified**: routes, websocket layer, config package shared with other runtimes

## Dependencies

- Ticket 9 is strongly recommended first so shared config/contracts are not invented twice.
- Ticket 13 depends on this ticket for meaningful observability and deploy readiness.
