/**
 * Agent Pipeline — orchestrates the full decision chain for an event batch.
 *
 * Sequence: context builder → planner → policy engine → executor/suggestion → logging.
 *
 * Handles all disposition types:
 * - ignore: log and return
 * - suggest/act: policy engine → executor or suggestion creator
 * - summarize: trigger summary refresh for the scope
 * - escalate: log and skip (Tier 3 promotion is ticket #16)
 *
 * Every planner run is recorded via executionLoggingService and cost tracked
 * via costTrackingService.
 *
 * Ticket: #15
 * Dependencies: #04-14
 */

import type { ExecutionDisposition, ExecutionStatus, ModelTier } from "@prisma/client";
import type { OrgAgentSettings } from "../services/agent-identity.js";
import type { AggregatedBatch } from "./aggregator.js";
import type { AgentContextPacket } from "./context-builder.js";
import type { PlannerResult } from "./planner.js";
import type { PolicyDecision, PolicyActionResult } from "./policy-engine.js";
import type { ExecutionResult } from "./executor.js";
import { buildContext } from "./context-builder.js";
import { runPlanner } from "./planner.js";
import { evaluatePolicy } from "./policy-engine.js";
import { ActionExecutor } from "./executor.js";
import { createSuggestions } from "./suggestion.js";
import { refreshSummary } from "./summary-worker.js";
import { executionLoggingService } from "../services/execution-logging.js";
import { costTrackingService } from "../services/cost-tracking.js";
import { processedEventService } from "../services/processed-event.js";
import { estimateCostCents } from "./cost-utils.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONSUMER_NAME = "agent-pipeline";

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function log(msg: string, data?: Record<string, unknown>): void {
  const prefix = "[agent-pipeline]";
  if (data) {
    console.log(prefix, msg, JSON.stringify(data));
  } else {
    console.log(prefix, msg);
  }
}

function logError(msg: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[agent-pipeline] ${msg}:`, message);
}

// ---------------------------------------------------------------------------
// Pipeline input
// ---------------------------------------------------------------------------

export interface PipelineInput {
  batch: AggregatedBatch;
  agentSettings: OrgAgentSettings;
  executor: ActionExecutor;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full agent pipeline for a single event batch.
 *
 * This is the core orchestrator: builds context, runs the planner, evaluates
 * policy, executes or creates suggestions, and records the full decision chain.
 */
export async function runPipeline(input: PipelineInput): Promise<void> {
  const { batch, agentSettings, executor } = input;
  const startTime = Date.now();

  // ── Event dedup — skip events already processed ──
  const triggerEvent = batch.events[batch.events.length - 1];
  if (!triggerEvent) {
    log("empty batch, skipping", { scopeKey: batch.scopeKey });
    return;
  }

  const alreadyProcessed = await processedEventService.isProcessed(
    CONSUMER_NAME,
    triggerEvent.id,
  );
  if (alreadyProcessed) {
    log("trigger event already processed, skipping", {
      eventId: triggerEvent.id,
      scopeKey: batch.scopeKey,
    });
    return;
  }

  // ── 1. Build context ──
  let packet: AgentContextPacket;
  try {
    packet = await buildContext({ batch, agentSettings });
    log("context built", {
      scopeKey: packet.scopeKey,
      triggerEventType: packet.triggerEvent.eventType,
      relevantEntities: packet.relevantEntities.length,
      tokensUsed: packet.tokenBudget.used,
    });
  } catch (err) {
    logError("context builder failed", err);
    return;
  }

  // ── 2. Run planner ──
  let plannerResult: PlannerResult;
  try {
    plannerResult = await runPlanner(packet);
  } catch (err) {
    logError("planner failed unexpectedly", err);
    return;
  }

  const { output: plannerOutput } = plannerResult;
  const costCents = estimateCostCents(
    plannerResult.model,
    plannerResult.usage.inputTokens,
    plannerResult.usage.outputTokens,
  );

  log("planner decided", {
    scopeKey: packet.scopeKey,
    disposition: plannerOutput.disposition,
    confidence: plannerOutput.confidence,
    actionCount: plannerOutput.proposedActions.length,
    model: plannerResult.model,
    latencyMs: plannerResult.latencyMs,
    costCents: Math.round(costCents * 1000) / 1000,
  });

  // ── 3. Record cost ──
  try {
    await costTrackingService.recordCost({
      organizationId: packet.organizationId,
      modelTier: "tier2" as ModelTier,
      costCents,
    });
  } catch (err) {
    logError("cost tracking failed (non-fatal)", err);
  }

  // ── 4. Map planner disposition to Prisma enum ──
  const dispositionMap: Record<string, ExecutionDisposition> = {
    ignore: "ignore",
    suggest: "suggest",
    act: "act",
    summarize: "summarize",
    escalate: "escalate",
  };
  const executionDisposition: ExecutionDisposition =
    dispositionMap[plannerOutput.disposition] ?? "ignore";

  // ── 5. Handle special dispositions before policy engine ──

  // Ignore: log and return
  if (plannerOutput.disposition === "ignore") {
    await writeExecutionLog({
      packet,
      plannerResult,
      costCents,
      agentSettings,
      batch,
      disposition: executionDisposition,
      status: "dropped",
      policyDecision: {},
      finalActions: [],
    });
    await markProcessed(packet);
    return;
  }

  // Escalate: log for Tier 3 promotion (ticket #16 will handle re-running with Opus)
  if (plannerOutput.disposition === "escalate") {
    log("escalation requested (Tier 3 not yet implemented)", {
      scopeKey: packet.scopeKey,
      promotionReason: plannerOutput.promotionReason,
    });
    await writeExecutionLog({
      packet,
      plannerResult,
      costCents,
      agentSettings,
      batch,
      disposition: executionDisposition,
      status: "blocked",
      policyDecision: { reason: "escalation_pending_tier3" },
      finalActions: [],
    });
    await markProcessed(packet);
    return;
  }

  // Summarize: trigger summary refresh for the scope
  if (plannerOutput.disposition === "summarize") {
    log("summary requested", { scopeKey: packet.scopeKey });
    try {
      const summaryResult = await refreshSummary(
        packet.organizationId,
        packet.scopeType,
        packet.scopeId,
      );
      log("summary refreshed", {
        scopeKey: packet.scopeKey,
        costCents: summaryResult?.costCents,
      });
    } catch (err) {
      logError("summary refresh failed (non-fatal)", err);
    }
    await writeExecutionLog({
      packet,
      plannerResult,
      costCents,
      agentSettings,
      batch,
      disposition: executionDisposition,
      status: "succeeded",
      policyDecision: {},
      finalActions: [],
    });
    await markProcessed(packet);
    return;
  }

  // ── 6. Policy engine (for suggest/act dispositions) ──
  let policyActions: PolicyActionResult[];
  try {
    const policyResult = await evaluatePolicy({
      plannerOutput,
      context: packet,
    });
    policyActions = policyResult.actions;
  } catch (err) {
    logError("policy engine failed", err);
    await writeExecutionLog({
      packet,
      plannerResult,
      costCents,
      agentSettings,
      batch,
      disposition: executionDisposition,
      status: "failed",
      policyDecision: { error: err instanceof Error ? err.message : String(err) },
      finalActions: [],
    });
    await markProcessed(packet);
    return;
  }

  // Group actions by decision
  const byDecision = new Map<PolicyDecision, PolicyActionResult[]>();
  for (const actionResult of policyActions) {
    const existing = byDecision.get(actionResult.decision) ?? [];
    existing.push(actionResult);
    byDecision.set(actionResult.decision, existing);
  }

  log("policy evaluated", {
    scopeKey: packet.scopeKey,
    execute: byDecision.get("execute")?.length ?? 0,
    suggest: byDecision.get("suggest")?.length ?? 0,
    drop: byDecision.get("drop")?.length ?? 0,
  });

  // ── 7. Execute actions ──
  const executionResults: Array<ExecutionResult & { decision: PolicyDecision }> = [];
  const executes = byDecision.get("execute") ?? [];
  for (const actionResult of executes) {
    try {
      const result = await executor.execute(actionResult.action, {
        organizationId: packet.organizationId,
        agentId: agentSettings.agentId,
        triggerEventId: packet.triggerEvent.id,
      });
      executionResults.push({ ...result, decision: "execute" });
      log("action executed", {
        scopeKey: packet.scopeKey,
        actionType: result.actionType,
        status: result.status,
        ...(result.error ? { error: result.error } : {}),
      });
    } catch (err) {
      logError(`executor failed for ${actionResult.action.actionType}`, err);
      executionResults.push({
        status: "failed",
        actionType: actionResult.action.actionType,
        error: err instanceof Error ? err.message : String(err),
        decision: "execute",
      });
    }
  }

  // ── 8. Create suggestions ──
  const suggests = byDecision.get("suggest") ?? [];
  let inboxItemId: string | undefined;
  if (suggests.length > 0) {
    try {
      const triggerActorType = packet.triggerEvent.actorType;
      const triggerActorId = packet.triggerEvent.actorId;
      const userId = triggerActorType === "user" ? triggerActorId : agentSettings.agentId;

      const items = await createSuggestions({
        suggestions: suggests,
        plannerOutput,
        context: packet,
        agentId: agentSettings.agentId,
        userId,
      });

      // Capture first inbox item ID for the execution log
      if (items.length > 0) {
        inboxItemId = items[0].id;
      }

      log("suggestions created", {
        scopeKey: packet.scopeKey,
        count: items.length,
        types: items.map((i) => i.itemType),
      });
    } catch (err) {
      logError("suggestion creation failed", err);
    }
  }

  // Log dropped actions
  const drops = byDecision.get("drop") ?? [];
  for (const dropped of drops) {
    log("action dropped by policy", {
      scopeKey: packet.scopeKey,
      actionType: dropped.action.actionType,
      reason: dropped.reason,
    });
  }

  // ── 9. Determine overall execution status ──
  let status: ExecutionStatus;
  if (executes.length > 0) {
    const anyFailed = executionResults.some((r) => r.status === "failed");
    status = anyFailed ? "failed" : "succeeded";
  } else if (suggests.length > 0) {
    status = "suggested";
  } else {
    status = "dropped";
  }

  // ── 10. Write execution log ──
  const finalActions = [
    ...executionResults.map((r) => ({
      actionType: r.actionType,
      decision: r.decision,
      status: r.status,
      ...(r.error ? { error: r.error } : {}),
    })),
    ...suggests.map((s) => ({
      actionType: s.action.actionType,
      decision: "suggest" as const,
      status: "suggested",
    })),
    ...drops.map((d) => ({
      actionType: d.action.actionType,
      decision: "drop" as const,
      reason: d.reason,
    })),
  ];

  await writeExecutionLog({
    packet,
    plannerResult,
    costCents,
    agentSettings,
    batch,
    disposition: executionDisposition,
    status,
    policyDecision: Object.fromEntries(
      policyActions.map((a) => [a.action.actionType, { decision: a.decision, reason: a.reason }]),
    ),
    finalActions,
    inboxItemId,
  });

  // ── 11. Mark trigger event as processed ──
  await markProcessed(packet);

  log("pipeline complete", {
    scopeKey: packet.scopeKey,
    disposition: plannerOutput.disposition,
    status,
    durationMs: Date.now() - startTime,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface WriteLogInput {
  packet: AgentContextPacket;
  plannerResult: PlannerResult;
  costCents: number;
  agentSettings: OrgAgentSettings;
  batch: AggregatedBatch;
  disposition: ExecutionDisposition;
  status: ExecutionStatus;
  policyDecision: Record<string, unknown>;
  finalActions: Record<string, unknown>[];
  inboxItemId?: string;
}

async function writeExecutionLog(input: WriteLogInput): Promise<void> {
  const { packet, plannerResult, costCents, agentSettings, batch, disposition, status, policyDecision, finalActions, inboxItemId } = input;
  try {
    await executionLoggingService.write({
      organizationId: packet.organizationId,
      triggerEventId: packet.triggerEvent.id,
      batchSize: batch.events.length,
      agentId: agentSettings.agentId,
      modelTier: "tier2" as ModelTier,
      model: plannerResult.model,
      promoted: false,
      inputTokens: plannerResult.usage.inputTokens,
      outputTokens: plannerResult.usage.outputTokens,
      estimatedCostCents: costCents,
      contextTokenAllocation: packet.tokenBudget.sections,
      disposition,
      confidence: plannerResult.output.confidence,
      plannedActions: plannerResult.output.proposedActions.map((a) => ({
        actionType: a.actionType,
        args: a.args,
      })),
      policyDecision,
      finalActions,
      status,
      inboxItemId,
      latencyMs: plannerResult.latencyMs,
    });
  } catch (err) {
    logError("execution log write failed (non-fatal)", err);
  }
}

async function markProcessed(packet: AgentContextPacket): Promise<void> {
  try {
    await processedEventService.markProcessed({
      consumerName: CONSUMER_NAME,
      eventId: packet.triggerEvent.id,
      organizationId: packet.organizationId,
    });
  } catch (err) {
    logError("markProcessed failed (non-fatal)", err);
  }
}
