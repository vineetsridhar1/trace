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

- [ ] `AgentExecutionLog` table exists with migration
- [ ] `ProcessedAgentEvent` table exists with migration
- [ ] `AgentCostTracker` table exists with migration
- [ ] Service methods exist to write execution logs and update cost tracking
- [ ] Budget check method returns remaining budget percentage for an org
- [ ] Logs are queryable by org, by date range, by status
- [ ] Cost tracker correctly aggregates across multiple planner calls in a day

## How to test

1. Write a sample execution log entry — verify it persists and is queryable
2. Update cost tracker for an org — verify totals accumulate correctly across multiple updates
3. Check budget for an org with a $1.00 daily limit and $0.80 spent — verify it returns 20% remaining
4. Check budget for an org with no spending — verify it returns 100%
5. Query execution logs by org and date range — verify correct filtering
