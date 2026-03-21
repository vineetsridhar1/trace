# 08 — Execution Logging & Cost Tracking

## Summary

Every planner decision and action execution must be logged for observability, debugging, and cost management. This is the telemetry backbone — without it, you can't tell if the AI is helping or spamming.

## What needs to happen

### Execution Log

- Add an `AgentExecutionLog` table to the Prisma schema with fields:
  - `id`, `organizationId`, `triggerEventId`, `batchSize`
  - `agentId`, `modelTier` (tier2/tier3), `model` (specific model ID)
  - `promoted` (boolean), `promotionReason` (optional string)
  - `inputTokens`, `outputTokens`, `estimatedCostCents`
  - `disposition` (ignore/suggest/act/summarize/escalate)
  - `confidence` (float)
  - `plannedActions` (JSON), `policyDecision` (JSON), `finalActions` (JSON)
  - `status` (succeeded/suggested/blocked/dropped/failed)
  - `inboxItemId` (optional — if a suggestion was created)
  - `latencyMs`
  - `createdAt`
- Index on `(organizationId, createdAt)` and `(triggerEventId)`
- Create a service for writing and querying execution logs

### Processed Event Dedupe

- Add a `ProcessedAgentEvent` table: `consumerName`, `eventId`, `organizationId`, `processedAt`, `resultHash` (optional)
- Index on `(consumerName, eventId)` and `(organizationId, processedAt)`
- The agent worker should record every event it finishes processing. Before processing an event, check this table to skip already-processed events (handles replays and at-least-once delivery without duplicating work)
- This is separate from the executor's idempotency keys — this is consumer-level dedupe, that is action-level dedupe

### Cost Tracking

- Add an `AgentCostTracker` table: `organizationId`, `date` (YYYY-MM-DD), `totalCostCents`, `tier2Calls`, `tier2CostCents`, `tier3Calls`, `tier3CostCents`, `updatedAt`
- Index on `(organizationId, date)`
- The cost tracker should be updated atomically after each planner call (upsert on org+date)
- Add a method to check remaining budget for an org on a given day
- The router (ticket 04) should call this budget check and downgrade or drop events when budget is low

## Dependencies

- 03 (Agent Identity)

## Completion requirements

- [x] `AgentExecutionLog` table exists with migration
- [x] `ProcessedAgentEvent` table exists with migration
- [x] `AgentCostTracker` table exists with migration
- [x] Service methods exist to write execution logs and update cost tracking
- [x] Budget check method returns remaining budget percentage for an org
- [x] Logs are queryable by org, by date range, by status
- [x] Cost tracker correctly aggregates across multiple planner calls in a day

## Implementation notes
<!-- Added after implementation -->
- Three Prisma models added: `AgentExecutionLog`, `ProcessedAgentEvent`, `AgentCostTracker` with migrations `20260321203642` and `20260321204650`
- Three service classes in `apps/server/src/services/`:
  - `ExecutionLoggingService` (`execution-logging.ts`) — `write(input)`, `query(input)`, `getByTriggerEvent({ organizationId, triggerEventId })`
  - `CostTrackingService` (`cost-tracking.ts`) — `recordCost(input)`, `checkBudget(orgId)`, `getByDateRange(input)`
  - `ProcessedEventService` (`processed-event.ts`) — `isProcessed(consumerName, eventId)`, `markProcessed(input)`, `getProcessedEvents(input)`
- `checkBudget()` returns `BudgetStatus { dailyLimitCents, spentCents, remainingCents, remainingPercent }` — `remainingPercent` is 0-100
- The router (ticket 04) defines `CostTracker.getRemainingBudgetFraction(orgId): number` (synchronous, 0.0-1.0). Ticket #15 must create an adapter that wraps `checkBudget()` with a cached value (since the router calls this per event synchronously, hitting the DB per event is too expensive). Adapter: cache `checkBudget()` result with a 30-60s TTL, return `remainingPercent / 100`
- `recordCost()` uses Prisma upsert with `increment` for atomic daily aggregation. Handles P2002 race condition (concurrent create) with retry-as-update
- `RecordCostInput` accepts `isSummary?: boolean` to track summary calls separately from planner calls
- `AgentExecutionLog` includes `contextTokenAllocation` (JSON) per plan section 14.3
- `AgentCostTracker` includes `summaryCalls`/`summaryCostCents` per plan section 14.5
- `ProcessedAgentEvent` table will grow unboundedly — ticket #19 should add a TTL-based cleanup job alongside its other cleanup work
- Enums `ModelTier`, `ExecutionDisposition`, `ExecutionStatus` are defined in the Prisma schema. Import from `@prisma/client`

## How to test

1. Write a sample execution log entry — verify it persists and is queryable
2. Update cost tracker for an org — verify totals accumulate correctly across multiple updates
3. Check budget for an org with a $1.00 daily limit and $0.80 spent — verify it returns 20% remaining
4. Check budget for an org with no spending — verify it returns 100%
5. Query execution logs by org and date range — verify correct filtering
