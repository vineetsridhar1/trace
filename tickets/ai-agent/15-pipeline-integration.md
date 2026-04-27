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
    <!-- Ticket 11 created: Import `runPlanner` from `./agent/planner.js` and `PlannerResult` type. Call `runPlanner(contextPacket, { model? })` — returns `PlannerResult` with `.output` (PlannerOutput), `.usage` ({ inputTokens, outputTokens }), `.latencyMs`, `.model`. The planner never throws — on any error it returns disposition "ignore" with usage zeroed. If `output.disposition === "escalate"` and `output.promotionReason` is set, re-run with Tier 3 model (ticket 16). Feed `result.usage` and `result.latencyMs` into the execution logger. Feed `result.output.proposedActions` into the policy engine. -->
    <!-- Ticket 12 created: Import `evaluatePolicy` from `./agent/policy-engine.js` and `PolicyResult`, `PolicyEngineInput` types. Call `evaluatePolicy({ plannerOutput: plannerResult.output, context: contextPacket, isDm? })` — returns `PolicyResult` with `.actions` (array of `PolicyActionResult { action, decision, reason }`). The policy engine is async (checks cost budget via DB with 30s cache). Loop over `result.actions`: if `decision === "execute"` → pass to executor, if `decision === "suggest"` → pass to suggestion creator (ticket 14), if `decision === "drop"` → log reason and skip. NOTE: `disposition === "escalate"` from the planner is NOT handled by the policy engine — intercept escalations BEFORE calling evaluatePolicy and route to Tier 3 promotion (ticket 16) instead. The policy engine also does NOT handle `disposition === "summarize"` — those should be routed to the summary service directly. -->
- Handle errors at each stage — if the planner fails, log it and move on. If the executor fails, log the failure. Never let one bad event crash the pipeline
- Add structured logging throughout so the full decision chain is traceable

## Dependencies

- All previous tickets (04-14)
  <!-- Ticket 13 created: The context builder's `BuildContextInput` now accepts optional `projectSoulFile` and `repoSoulFile` fields. When wiring the pipeline, if the batch scope involves a session with a linked repo, fetch the repo-level `.trace/soul.md` (if available) and pass it as `repoSoulFile`. Similarly, if the scope belongs to a project, check for a project-level soul file. For v1, it's fine to just pass `undefined` for both — the resolver falls back to org-level or platform default automatically. The resolver handles truncation to the 2000-token budget internally. -->
  <!-- Ticket 08 created: Three services to wire in the pipeline:
    1. `executionLoggingService.write(input)` — call after each planner run to record the full decision chain. `WriteExecutionLogInput` takes: organizationId, triggerEventId, batchSize, agentId, modelTier, model, promoted, promotionReason, inputTokens, outputTokens, estimatedCostCents, contextTokenAllocation, disposition, confidence, plannedActions, policyDecision, finalActions, status, inboxItemId, latencyMs. Import types `ModelTier`, `ExecutionDisposition`, `ExecutionStatus` from `@prisma/client`.
    2. `costTrackingService.recordCost({ organizationId, modelTier, costCents, isSummary? })` — call after each planner call and each summary generation to update daily cost aggregation.
    3. `processedEventService.markProcessed({ consumerName, eventId, organizationId, resultHash? })` / `isProcessed(consumerName, eventId)` — call in the worker loop to skip already-processed events.
    IMPORTANT: The router (ticket 04) uses `CostTracker.getRemainingBudgetFraction(orgId): number` (synchronous, 0.0-1.0). Create an adapter that caches `costTrackingService.checkBudget(orgId)` with a 30-60s TTL, returns `remainingPercent / 100`, and inject it via `setCostTracker()` from `./agent/router.js`. -->
  <!-- Ticket 07 created: `ActionExecutor` class in `./agent/executor.js`. Instantiate with `new ActionExecutor(serviceContainer)` where serviceContainer has { ticketService, chatService, sessionService, inboxService }. Call `executor.execute({ actionType, args }, { organizationId, agentId, triggerEventId })`. Returns `ExecutionResult { status, actionType, result?, error? }`. Note: idempotency is currently in-memory — migrate to Redis before deploying (use SET with EX 3600 on key `idempotency:agent:{agentId}:{actionName}:{triggerEventId}`). The executor handles no_op internally (returns success, no service call). -->

## Completion requirements

- [x] Pipeline module exists and chains all components — extracted to `apps/server/src/agent/pipeline.ts` with `runPipeline()` as the entry point. `handleBatch()` in `agent-worker.ts` now delegates to it.
- [x] Agent worker runs the full pipeline for every event batch — `handleBatch()` calls `runPipeline({ batch, agentSettings, executor })`
- [x] Each stage's output feeds into the next stage — planner output feeds policy engine, policy decisions route to executor or suggestion creator
- [x] Execution logs capture the full decision chain — `executionLoggingService.write()` called after every planner run, records tokens, cost, context allocation, disposition, confidence, planned/final actions, policy decisions, latency
- [x] Cost tracking is updated after each planner call — `costTrackingService.recordCost()` called with model-aware cost estimation after every planner run
- [x] Errors in any stage are caught, logged, and don't crash the worker — each stage has its own try/catch; policy engine failure still writes execution log and marks processed
- [x] The pipeline processes events from all scope types that the router forwards
- [x] Event dedup via `processedEventService.isProcessed()` / `markProcessed()` prevents re-processing trigger events
- [x] Disposition routing: ignore → log+drop, escalate → log as blocked (pending ticket #16), summarize → trigger `refreshSummary()`, suggest/act → policy engine

<!-- Updated after ticket #15 PR: All completion requirements met. Pipeline extracted to dedicated module with 12 unit tests (pipeline.test.ts). The pipeline handles all 5 disposition types. Escalation logs as "blocked" pending Tier 3 implementation in ticket #16 — the integration point is at pipeline.ts:210-228. Cost estimation uses the same model-aware lookup as summary-worker.ts (NOTE: this is duplicated and should be extracted to a shared utility). -->
<!-- Updated after multi-turn agentic loop PR: The pipeline now operates in an iterative loop of up to 10 turns (MAX_ITERATIONS=10). Each turn: planner proposes actions → policy evaluates → execute/suggest → results fed back as tool_result. The planner uses `done: boolean` to signal completion. Key exports: `runPlannerTurn()` (multi-turn entry point), `buildSystemPrompt()` (exported for pipeline reuse). Default model is Haiku; planner can choose escalation target via `promotionTarget: "sonnet" | "opus"`. @mention replies are forced deterministically in pipeline code. Pipeline logs include elapsed timestamps for observability. -->

## How to test

This is the big integration test. Run through these scenarios end-to-end:

1. **Chat message about a bug** → agent is a member of the chat → router forwards → aggregator batches → context builder finds a matching ticket → planner suggests linking → policy routes to suggest → InboxItem appears for the user
2. **Casual chat message** → router forwards → aggregator batches → planner returns ignore → nothing happens
3. **Message in a chat where agent is not a member** → router drops → nothing happens
4. **Ticket assigned to agent** → router sends direct → planner decides to act → executor runs the action → execution log captures everything
5. **Org AI disabled** → router drops everything → nothing happens
6. **20 rapid messages in a scope** → aggregator batches them → single planner call for the batch → verify only one LLM call, not 20
7. Check execution logs after all scenarios — verify full decision chains are recorded with token counts and costs
