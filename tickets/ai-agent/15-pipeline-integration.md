# 15 — End-to-End Pipeline Integration

## Summary

Wire everything together. The individual components exist (router, aggregator, context builder, planner, policy engine, executor, suggestion delivery) — this ticket connects them into a single pipeline that runs in the agent worker.

## What needs to happen

- Create `apps/server/src/agent/pipeline.ts` — the orchestrator that chains the components together
- The pipeline for each event batch should follow this sequence:
  1. **Context builder** assembles the context packet from the batch
  2. **Planner** receives the packet and returns a decision
  3. **Policy engine** evaluates each proposed action
  4. For `execute` decisions → **executor** runs the action
  5. For `suggest` decisions → **suggestion creator** makes an InboxItem
  6. For `drop` decisions → log and discard
  7. **Execution logger** records the full decision chain (context token allocation, planner output, policy decision, final action, latency, cost)
  8. **Cost tracker** updates the org's daily spend
- Wire this pipeline into the agent worker's event consumption loop:
  - Worker consumes event → router decides → if aggregate: aggregator batches → when window closes: pipeline runs on the batch
  - If direct: pipeline runs immediately on a single-event batch
  <!-- Ticket 05 wired the aggregator into agent-worker.ts. Ticket 10 wired the context builder into `handleBatch()` — it now calls `buildContext({ batch, agentSettings })` asynchronously and logs the result. The pipeline orchestrator should replace the current `.then(log)` chain in `handleBatch()` (agent-worker.ts lines 128-148) with: `buildContext() → planner() → policyEngine() → executor/suggestion`. The `agentContexts` Map is already available in the closure. Import `buildContext` from `./agent/context-builder.js` and `AgentContextPacket` type for the pipeline function signature. Note: loadPersistedWindows() uses a global SCAN, so multi-worker deployment will need scoped recovery (e.g. by consumer name or org assignment). -->
- Handle errors at each stage — if the planner fails, log it and move on. If the executor fails, log the failure. Never let one bad event crash the pipeline
- Add structured logging throughout so the full decision chain is traceable

## Dependencies

- All previous tickets (04-14)
  <!-- Ticket 08 created: Three services to wire in the pipeline:
    1. `executionLoggingService.write(input)` — call after each planner run to record the full decision chain. `WriteExecutionLogInput` takes: organizationId, triggerEventId, batchSize, agentId, modelTier, model, promoted, promotionReason, inputTokens, outputTokens, estimatedCostCents, contextTokenAllocation, disposition, confidence, plannedActions, policyDecision, finalActions, status, inboxItemId, latencyMs. Import types `ModelTier`, `ExecutionDisposition`, `ExecutionStatus` from `@prisma/client`.
    2. `costTrackingService.recordCost({ organizationId, modelTier, costCents, isSummary? })` — call after each planner call and each summary generation to update daily cost aggregation.
    3. `processedEventService.markProcessed({ consumerName, eventId, organizationId, resultHash? })` / `isProcessed(consumerName, eventId)` — call in the worker loop to skip already-processed events.
    IMPORTANT: The router (ticket 04) uses `CostTracker.getRemainingBudgetFraction(orgId): number` (synchronous, 0.0-1.0). Create an adapter that caches `costTrackingService.checkBudget(orgId)` with a 30-60s TTL, returns `remainingPercent / 100`, and inject it via `setCostTracker()` from `./agent/router.js`. -->
  <!-- Ticket 07 created: `ActionExecutor` class in `./agent/executor.js`. Instantiate with `new ActionExecutor(serviceContainer)` where serviceContainer has { ticketService, chatService, sessionService, inboxService }. Call `executor.execute({ actionType, args }, { organizationId, agentId, triggerEventId })`. Returns `ExecutionResult { status, actionType, result?, error? }`. Note: idempotency is currently in-memory — migrate to Redis before deploying (use SET with EX 3600 on key `idempotency:agent:{agentId}:{actionName}:{triggerEventId}`). The executor handles no_op internally (returns success, no service call). -->

## Completion requirements

- [ ] Pipeline module exists and chains all components
- [ ] Agent worker runs the full pipeline for every event batch
- [ ] Each stage's output feeds into the next stage
- [ ] Execution logs capture the full decision chain
- [ ] Cost tracking is updated after each planner call
- [ ] Errors in any stage are caught, logged, and don't crash the worker
- [ ] The pipeline processes events from all scope types that the router forwards

## How to test

This is the big integration test. Run through these scenarios end-to-end:

1. **Chat message about a bug** → agent is a member of the chat → router forwards → aggregator batches → context builder finds a matching ticket → planner suggests linking → policy routes to suggest → InboxItem appears for the user
2. **Casual chat message** → router forwards → aggregator batches → planner returns ignore → nothing happens
3. **Message in a chat where agent is not a member** → router drops → nothing happens
4. **Ticket assigned to agent** → router sends direct → planner decides to act → executor runs the action → execution log captures everything
5. **Org AI disabled** → router drops everything → nothing happens
6. **20 rapid messages in a scope** → aggregator batches them → single planner call for the batch → verify only one LLM call, not 20
7. Check execution logs after all scenarios — verify full decision chains are recorded with token counts and costs
