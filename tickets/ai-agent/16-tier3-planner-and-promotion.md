# 16 — Tier 3 Planner & Promotion

## Summary

Add the premium model tier for high-stakes decisions. Tier 3 uses an Opus-class model and is called either by rule-based promotion (router sends directly) or model-requested promotion (Tier 2 outputs a `promotionReason`).

## What needs to happen

- Extend the planner (ticket 11) to support model selection by tier
- Add Tier 3 trigger rules to the router:
  - Ticket with priority `urgent` or `high` → Tier 3
  - Explicit @mention of the agent with a complex question → Tier 3
  - Ticket assigned to the agent → Tier 3
- When the router selects Tier 3, annotate the event so the pipeline skips Tier 2 entirely
- When Tier 2 returns a `promotionReason`, the pipeline should:
  - Discard the Tier 2 output
  - Re-run the planner with the same context packet using the Tier 3 model
  - Never chain Tier 2 → Tier 3 (don't use Tier 2 output as input to Tier 3)
- Tier 3 gets a larger token budget for the context packet (e.g. 64K vs 32K for Tier 2)
- Cost budget enforcement: if the org's remaining budget is 10-50%, suppress Tier 3 promotions and use Tier 2 instead
- Log whether the call was promoted and the promotion reason in the execution log

## Dependencies

- 11 (Tier 2 Planner)
  <!-- Ticket 11 created: `runPlanner(ctx, options?)` in `./agent/planner.js` already supports model override via `options.model`. For Tier 3, call `runPlanner(ctx, { model: TIER3_MODEL })` with the Opus-class model. The planner returns `PlannerResult` with `.output.promotionReason` when Tier 2 requests escalation. Note: the ticket spec mentioned `OrgAgentSettings.modelTier` but this field doesn't exist — model selection should be handled at the pipeline level (this ticket) by passing the model via `options.model`. Consider adding a `modelTier` or `tier3Model` field to `OrgAgentSettings` (ticket 03) if per-org model selection is needed. -->
- 15 (Pipeline Integration)
  <!-- Ticket 15 created: The pipeline orchestrator is at `apps/server/src/agent/pipeline.ts`. The `disposition === "escalate"` branch is at pipeline.ts:210-228 — currently logs as "blocked" and marks processed. To wire Tier 3 promotion: (1) intercept before `markProcessed()`, (2) re-run `runPlanner(packet, { model: TIER3_MODEL })` with the same context packet, (3) feed the Tier 3 result back into the policy engine (pipeline.ts:261+), (4) update the execution log with `promoted: true`, `promotionReason`, and `modelTier: "tier3"`. The `writeExecutionLog` helper at pipeline.ts:445 already accepts `promoted` and `promotionReason` fields — just pass `true` and the planner's `promotionReason`. For rule-based promotion (router annotates maxTier=3), add a `maxTier` check at the top of `runPipeline()` and call the planner with `{ model: TIER3_MODEL }` directly, skipping Tier 2 entirely. The `AggregatedBatch.maxTier` field is already propagated from the router. -->

## Completion requirements

- [ ] Planner supports Tier 2 and Tier 3 model selection
- [ ] Router identifies Tier 3 trigger conditions
- [ ] Model-requested promotion works (Tier 2 promotionReason → re-run with Tier 3)
- [ ] Rule-based promotion bypasses Tier 2 entirely
- [ ] Tier 3 gets a larger context token budget
- [ ] Cost budget enforcement suppresses Tier 3 when budget is low
- [ ] Execution logs record tier, promotion status, and reason

## How to test

1. Assign a ticket to the agent — verify Tier 3 is used directly (no Tier 2 call)
2. Trigger an event where Tier 2 returns a `promotionReason` — verify Tier 3 re-runs with the same context
3. Set org cost budget to 20% remaining — verify Tier 3 promotions are suppressed to Tier 2
4. Compare execution logs for Tier 2 vs Tier 3 calls — verify different models, different token budgets, different cost
