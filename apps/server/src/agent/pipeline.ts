/**
 * Agent Pipeline — orchestrates the full multi-turn decision loop for an event batch.
 *
 * The pipeline runs up to MAX_ITERATIONS turns:
 *   1. Build context and system prompt (once)
 *   2. Loop: call planner → enforce policy → execute/suggest → feed results back
 *   3. The planner sees execution results and decides what to do next
 *   4. Loop ends when planner sets done=true, returns ignore, or hits the cap
 *
 * Key design decisions:
 * - Context is built once — no DB re-queries mid-loop
 * - Cost is aggregated across all turns into a single entry
 * - Tier 3 promotion only on turn 1 — later escalations end the loop
 * - Hard cap of 10 turns enforced in code, not by the LLM
 * - @mention replies are forced deterministically (not LLM-dependent)
 *
 * Ticket: #15, #16
 * Dependencies: #04-14
 */

import type { ExecutionDisposition, ExecutionStatus } from "@prisma/client";
import type {
  LLMAssistantContentBlock,
  LLMMessage,
} from "@trace/shared";
import type { OrgAgentSettings } from "../services/agent-identity.js";
import type { AggregatedBatch } from "./aggregator.js";
import type { AgentContextPacket } from "./context-builder.js";
import { TIER3_TOKEN_BUDGET } from "./context-builder.js";
import type { PlannerOutput, PlannerTurnResult } from "./planner.js";
import { DEFAULT_TIER3_MODEL, buildSystemPrompt, runPlannerTurn } from "./planner.js";
import type { PolicyDecision, PolicyActionResult } from "./policy-engine.js";
import type { ExecutionResult } from "./executor.js";
import { buildContext } from "./context-builder.js";
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
const MAX_ITERATIONS = 10;

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
// Per-turn tracking
// ---------------------------------------------------------------------------

interface TurnResult {
  turn: number;
  plannerOutput: PlannerOutput;
  executed: Array<{ actionType: string; status: string; error?: string }>;
  suggested: Array<{ actionType: string }>;
  dropped: Array<{ actionType: string; reason?: string }>;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full agent pipeline for a single event batch.
 *
 * Operates in a multi-turn loop: the planner proposes actions, they are
 * executed, and the results are fed back for the next turn. The loop
 * continues until the planner sets done=true, returns ignore, or hits
 * the hard cap of MAX_ITERATIONS.
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

  // ── Determine tier — rule-based Tier 3 promotion ──
  const isRuleBasedTier3 = batch.maxTier === 3;
  let currentTier: "tier2" | "tier3" = isRuleBasedTier3 ? "tier3" : "tier2";
  let promoted = false;
  let promotionReason: string | undefined;

  // ── 1. Build context (once — Tier 3 gets a larger token budget) ──
  let packet: AgentContextPacket;
  try {
    packet = await buildContext({
      batch,
      agentSettings,
      tokenBudget: currentTier === "tier3" ? TIER3_TOKEN_BUDGET : undefined,
    });
    log("context built", {
      scopeKey: packet.scopeKey,
      triggerEventType: packet.triggerEvent.eventType,
      relevantEntities: packet.relevantEntities.length,
      tokensUsed: packet.tokenBudget.used,
      tier: currentTier,
    });
  } catch (err) {
    logError("context builder failed", err);
    return;
  }

  // For rule-based Tier 3, mark as promoted
  if (isRuleBasedTier3) {
    promoted = true;
    promotionReason = "rule_based:router";
  }

  // ── Build system prompt (once) ──
  const tier3Model = process.env.AGENT_TIER3_MODEL ?? DEFAULT_TIER3_MODEL;
  const systemPrompt = buildSystemPrompt(packet);
  const messageHistory: LLMMessage[] = [];
  const turnResults: TurnResult[] = [];
  let totalCostCents = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastModel = "";
  let anyMessageSendExecuted = false;

  // ── Multi-turn loop ──
  for (let turn = 1; turn <= MAX_ITERATIONS; turn++) {
    log(`── turn ${turn}/${MAX_ITERATIONS} start ──`, { scopeKey: packet.scopeKey });

    // ── Step 1: Construct user message ──
    if (turn === 1) {
      messageHistory.push({
        role: "user",
        content:
          `Analyze the context above and make your decision. ` +
          `Call the planner_decision tool with your response. ` +
          `You have up to ${MAX_ITERATIONS} turns. This is turn 1 of ${MAX_ITERATIONS}.`,
      });
    }
    // Turn N>1: tool_result is already appended at the end of the previous iteration

    // ── Step 2: Call planner ──
    let turnResult: PlannerTurnResult;
    try {
      turnResult = await runPlannerTurn(
        systemPrompt,
        messageHistory,
        packet.permissions.actions,
        currentTier === "tier3" ? { model: tier3Model } : undefined,
      );
    } catch (err) {
      logError(`planner failed on turn ${turn}`, err);
      break;
    }

    const { output: plannerOutput, response: llmResponse } = turnResult;
    lastModel = llmResponse.model;

    // Track cost
    const turnCostCents = estimateCostCents(
      llmResponse.model,
      llmResponse.usage.inputTokens,
      llmResponse.usage.outputTokens,
    );
    totalCostCents += turnCostCents;
    totalInputTokens += llmResponse.usage.inputTokens;
    totalOutputTokens += llmResponse.usage.outputTokens;

    log("planner decided", {
      scopeKey: packet.scopeKey,
      turn,
      disposition: plannerOutput.disposition,
      confidence: plannerOutput.confidence,
      actionCount: plannerOutput.proposedActions.length,
      actions: plannerOutput.proposedActions.map((a) => a.actionType),
      done: plannerOutput.done ?? false,
      rationale: plannerOutput.rationaleSummary,
      model: llmResponse.model,
      tier: currentTier,
      promoted,
      latencyMs: turnResult.latencyMs,
      costCents: Math.round(turnCostCents * 1000) / 1000,
    });

    // ── Step 2a: Model-requested promotion (turn 1 only) ──
    if (
      turn === 1 &&
      currentTier === "tier2" &&
      plannerOutput.disposition === "escalate" &&
      plannerOutput.promotionReason
    ) {
      // Record Tier 2 cost
      try {
        await costTrackingService.recordCost({
          organizationId: packet.organizationId,
          modelTier: "tier2",
          costCents: turnCostCents,
        });
      } catch (err) {
        logError("tier2 cost tracking failed (non-fatal)", err);
      }

      let budgetAllowsTier3 = true;
      try {
        const budgetStatus = await costTrackingService.checkBudget(packet.organizationId);
        if (budgetStatus.remainingPercent < 50) {
          budgetAllowsTier3 = false;
          log("Tier 3 promotion suppressed — budget below 50%", {
            scopeKey: packet.scopeKey,
            remainingPercent: budgetStatus.remainingPercent,
          });
        }
      } catch (err) {
        logError("budget check failed, suppressing Tier 3 (non-fatal)", err);
        budgetAllowsTier3 = false;
      }

      if (budgetAllowsTier3) {
        promoted = true;
        promotionReason = plannerOutput.promotionReason;
        currentTier = "tier3";
        log("promoting to Tier 3", { scopeKey: packet.scopeKey, promotionReason });

        // Rebuild context with larger budget
        try {
          packet = await buildContext({
            batch,
            agentSettings,
            tokenBudget: TIER3_TOKEN_BUDGET,
          });
        } catch (err) {
          logError("Tier 3 context rebuild failed", err);
          break;
        }

        // Reset message history for fresh Tier 3 start
        messageHistory.length = 0;
        messageHistory.push({
          role: "user",
          content:
            `Analyze the context above and make your decision. ` +
            `Call the planner_decision tool with your response. ` +
            `You have up to ${MAX_ITERATIONS} turns. This is turn 1 of ${MAX_ITERATIONS}.`,
        });
        continue; // Re-run turn 1 with Tier 3
      }
      // Budget suppressed — fall through with escalation
    }

    // ── Step 3: Handle escalation on later turns — treat as done ──
    if (turn > 1 && plannerOutput.disposition === "escalate") {
      log("escalation on later turn, treating as done", {
        scopeKey: packet.scopeKey,
        turn,
      });
      break;
    }

    // ── Step 4: Handle special dispositions ──

    // Escalate (turn 1, budget suppressed or Tier 3 already ran)
    if (plannerOutput.disposition === "escalate") {
      const escalationReason = currentTier === "tier3"
        ? "tier3_escalation_unresolvable"
        : "tier3_promotion_suppressed_by_budget";
      log("escalation unresolved", {
        scopeKey: packet.scopeKey,
        reason: escalationReason,
        tier: currentTier,
      });
      break;
    }

    // Summarize
    if (plannerOutput.disposition === "summarize") {
      log("summary requested", { scopeKey: packet.scopeKey, turn });
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
      // Summarize doesn't feed back — done
      turnResults.push({
        turn,
        plannerOutput,
        executed: [],
        suggested: [],
        dropped: [],
        latencyMs: turnResult.latencyMs,
        inputTokens: llmResponse.usage.inputTokens,
        outputTokens: llmResponse.usage.outputTokens,
        model: llmResponse.model,
      });
      break;
    }

    // Ignore — unless @mention on turn 1
    if (plannerOutput.disposition === "ignore") {
      if (turn === 1 && packet.isMention) {
        // Override: force reply for @mentions
        const triggerMessageId = packet.triggerEvent.payload.messageId as string | undefined;
        const replyText =
          plannerOutput.rationaleSummary &&
          plannerOutput.rationaleSummary !== "Defaulted to ignore due to invalid or missing planner output."
            ? plannerOutput.rationaleSummary
            : "Hey! I saw your mention but I'm not sure how to help here. Could you give me more details?";
        plannerOutput.disposition = "act";
        plannerOutput.proposedActions = [
          {
            actionType: "message.send",
            args: {
              chatId: packet.scopeId,
              text: replyText,
              ...(triggerMessageId ? { parentId: triggerMessageId } : {}),
            },
          },
        ];
        log("@mention override: planner ignored but forcing reply", {
          scopeKey: packet.scopeKey,
          turn,
          triggerMessageId,
        });
      } else if (plannerOutput.done || turn > 1) {
        // Planner is done or explicitly said nothing more to do
        turnResults.push({
          turn,
          plannerOutput,
          executed: [],
          suggested: [],
          dropped: [],
          latencyMs: turnResult.latencyMs,
          inputTokens: llmResponse.usage.inputTokens,
          outputTokens: llmResponse.usage.outputTokens,
          model: llmResponse.model,
        });
        break;
      } else {
        // Turn 1 ignore without @mention — just stop
        turnResults.push({
          turn,
          plannerOutput,
          executed: [],
          suggested: [],
          dropped: [],
          latencyMs: turnResult.latencyMs,
          inputTokens: llmResponse.usage.inputTokens,
          outputTokens: llmResponse.usage.outputTokens,
          model: llmResponse.model,
        });
        break;
      }
    }

    // ── Step 5: Inject parentId for @mention threading ──
    if (packet.isMention) {
      const triggerMessageId = packet.triggerEvent.payload.messageId as string | undefined;
      if (triggerMessageId) {
        for (const action of plannerOutput.proposedActions) {
          if (action.actionType === "message.send" && !action.args.parentId) {
            action.args.parentId = triggerMessageId;
          }
        }
      }
    }

    // ── Step 6: Policy engine ──
    let policyActions: PolicyActionResult[];
    try {
      const policyResult = await evaluatePolicy({
        plannerOutput,
        context: packet,
        isDm: packet.isDm,
      });
      policyActions = policyResult.actions;
    } catch (err) {
      logError(`policy engine failed on turn ${turn}`, err);
      break;
    }

    const byDecision = new Map<PolicyDecision, PolicyActionResult[]>();
    for (const actionResult of policyActions) {
      const existing = byDecision.get(actionResult.decision) ?? [];
      existing.push(actionResult);
      byDecision.set(actionResult.decision, existing);
    }

    log("policy evaluated", {
      scopeKey: packet.scopeKey,
      turn,
      execute: byDecision.get("execute")?.length ?? 0,
      suggest: byDecision.get("suggest")?.length ?? 0,
      drop: byDecision.get("drop")?.length ?? 0,
    });

    // ── Step 7: Execute actions ──
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

        if (actionResult.action.actionType === "message.send" && result.status === "success") {
          anyMessageSendExecuted = true;
        }

        log("action executed", {
          scopeKey: packet.scopeKey,
          turn,
          actionType: result.actionType,
          status: result.status,
          ...(result.error ? { error: result.error } : {}),
        });
      } catch (err) {
        logError(`executor failed for ${actionResult.action.actionType} on turn ${turn}`, err);
        executionResults.push({
          status: "failed",
          actionType: actionResult.action.actionType,
          error: err instanceof Error ? err.message : String(err),
          decision: "execute",
        });
      }
    }

    // ── Step 8: Create suggestions ──
    const suggests = byDecision.get("suggest") ?? [];
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
        log("suggestions created", {
          scopeKey: packet.scopeKey,
          turn,
          count: items.length,
          types: items.map((i) => i.itemType),
        });
      } catch (err) {
        logError(`suggestion creation failed on turn ${turn}`, err);
      }
    }

    // Log dropped actions
    const drops = byDecision.get("drop") ?? [];
    for (const dropped of drops) {
      log("action dropped by policy", {
        scopeKey: packet.scopeKey,
        turn,
        actionType: dropped.action.actionType,
        reason: dropped.reason,
      });
    }

    // ── Record turn results ──
    const turnRecord: TurnResult = {
      turn,
      plannerOutput,
      executed: executionResults.map((r) => ({
        actionType: r.actionType,
        status: r.status,
        ...(r.error ? { error: r.error } : {}),
      })),
      suggested: suggests.map((s) => ({ actionType: s.action.actionType })),
      dropped: drops.map((d) => ({
        actionType: d.action.actionType,
        reason: d.reason,
      })),
      latencyMs: turnResult.latencyMs,
      inputTokens: llmResponse.usage.inputTokens,
      outputTokens: llmResponse.usage.outputTokens,
      model: llmResponse.model,
    };
    turnResults.push(turnRecord);

    // ── Step 9: Check if done ──
    if (plannerOutput.done) {
      log("planner signaled done", { scopeKey: packet.scopeKey, turn });
      break;
    }

    // Don't build tool_result if this is the last iteration
    if (turn >= MAX_ITERATIONS) {
      log("hard cap reached", { scopeKey: packet.scopeKey, turn });
      break;
    }

    // ── Step 10: Build tool_result and append to message history ──
    // Append the assistant response (raw LLM content blocks)
    messageHistory.push({
      role: "assistant",
      content: llmResponse.content,
    });

    // Find the tool_use ID to reference in the tool_result
    const toolUseBlock = llmResponse.content.find(
      (b: LLMAssistantContentBlock) => b.type === "tool_use" && b.name === "planner_decision",
    );
    const toolUseId = toolUseBlock && toolUseBlock.type === "tool_use" ? toolUseBlock.id : "unknown";

    const turnsRemaining = MAX_ITERATIONS - turn;
    const toolResultPayload = {
      turn: turn + 1,
      maxTurns: MAX_ITERATIONS,
      executed: turnRecord.executed,
      suggested: turnRecord.suggested,
      dropped: turnRecord.dropped,
      note: `Turn ${turn} of ${MAX_ITERATIONS} complete. ${turnsRemaining} turn${turnsRemaining === 1 ? "" : "s"} remaining. Set done=true if finished.`,
    };

    log("feeding results back to planner", {
      scopeKey: packet.scopeKey,
      turn,
      toolResult: toolResultPayload,
    });

    messageHistory.push({
      role: "tool",
      content: [
        {
          type: "tool_result",
          toolUseId,
          content: JSON.stringify(toolResultPayload),
        },
      ],
    });
  }

  // ── Post-loop: @mention fallback ──
  if (packet.isMention && !anyMessageSendExecuted) {
    const triggerMessageId = packet.triggerEvent.payload.messageId as string | undefined;
    const lastRationale = turnResults.length > 0
      ? turnResults[turnResults.length - 1].plannerOutput.rationaleSummary
      : undefined;
    const replyText = lastRationale && lastRationale !== "Defaulted to ignore due to invalid or missing planner output."
      ? lastRationale
      : "Hey! I saw your mention but I'm not sure how to help here. Could you give me more details?";

    log("@mention fallback: no message.send executed across all turns, forcing reply", {
      scopeKey: packet.scopeKey,
      totalTurns: turnResults.length,
    });

    try {
      await executor.execute(
        {
          actionType: "message.send",
          args: {
            chatId: packet.scopeId,
            text: replyText,
            ...(triggerMessageId ? { parentId: triggerMessageId } : {}),
          },
        },
        {
          organizationId: packet.organizationId,
          agentId: agentSettings.agentId,
          triggerEventId: packet.triggerEvent.id,
        },
      );
      anyMessageSendExecuted = true;
    } catch (err) {
      logError("@mention fallback execution failed", err);
    }
  }

  // ── Aggregate cost ──
  try {
    await costTrackingService.recordCost({
      organizationId: packet.organizationId,
      modelTier: currentTier,
      costCents: totalCostCents,
    });
  } catch (err) {
    logError("cost tracking failed (non-fatal)", err);
  }

  // ── Determine overall status ──
  const allExecuted = turnResults.flatMap((t) => t.executed);
  const allSuggested = turnResults.flatMap((t) => t.suggested);
  const allDropped = turnResults.flatMap((t) => t.dropped);

  let overallStatus: ExecutionStatus;
  if (allExecuted.length > 0) {
    const anyFailed = allExecuted.some((r) => r.status === "failed");
    overallStatus = anyFailed ? "failed" : "succeeded";
  } else if (allSuggested.length > 0) {
    overallStatus = "suggested";
  } else {
    overallStatus = "dropped";
  }

  // Map last planner disposition to Prisma enum
  const dispositionMap: Record<string, ExecutionDisposition> = {
    ignore: "ignore",
    suggest: "suggest",
    act: "act",
    summarize: "summarize",
    escalate: "escalate",
  };
  const lastTurnOutput = turnResults.length > 0
    ? turnResults[turnResults.length - 1].plannerOutput
    : undefined;
  const executionDisposition: ExecutionDisposition =
    dispositionMap[lastTurnOutput?.disposition ?? "ignore"] ?? "ignore";

  // ── Write execution log ──
  const finalActions = [
    ...allExecuted.map((r) => ({
      actionType: r.actionType,
      decision: "execute" as const,
      status: r.status,
      ...(r.error ? { error: r.error } : {}),
    })),
    ...allSuggested.map((s) => ({
      actionType: s.actionType,
      decision: "suggest" as const,
      status: "suggested",
    })),
    ...allDropped.map((d) => ({
      actionType: d.actionType,
      decision: "drop" as const,
      reason: d.reason,
    })),
  ];

  // Build a synthetic PlannerResult for the log (aggregated from all turns)
  const aggregatedPlannerResult = {
    output: lastTurnOutput ?? {
      disposition: "ignore" as const,
      confidence: 0,
      rationaleSummary: "No planner turns completed.",
      proposedActions: [],
    },
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    latencyMs: turnResults.reduce((sum, t) => sum + t.latencyMs, 0),
    model: lastModel || (currentTier === "tier3" ? tier3Model : "unknown"),
  };

  await writeExecutionLog({
    packet,
    plannerResult: aggregatedPlannerResult,
    costCents: totalCostCents,
    agentSettings,
    batch,
    disposition: executionDisposition,
    status: overallStatus,
    policyDecision: { iterations: turnResults.length, turns: turnResults },
    finalActions,
    modelTier: currentTier,
    promoted,
    promotionReason,
  });

  // ── Mark trigger event as processed ──
  await markProcessed(packet);

  log("pipeline complete", {
    scopeKey: packet.scopeKey,
    iterations: turnResults.length,
    disposition: executionDisposition,
    status: overallStatus,
    actionsExecuted: allExecuted.length,
    actionsSuggested: allSuggested.length,
    actionsDropped: allDropped.length,
    totalCostCents: Math.round(totalCostCents * 1000) / 1000,
    durationMs: Date.now() - startTime,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface WriteLogInput {
  packet: AgentContextPacket;
  plannerResult: {
    output: PlannerOutput;
    usage: { inputTokens: number; outputTokens: number };
    latencyMs: number;
    model: string;
  };
  costCents: number;
  agentSettings: OrgAgentSettings;
  batch: AggregatedBatch;
  disposition: ExecutionDisposition;
  status: ExecutionStatus;
  policyDecision: Record<string, unknown>;
  finalActions: Record<string, unknown>[];
  inboxItemId?: string;
  modelTier?: "tier2" | "tier3";
  promoted?: boolean;
  promotionReason?: string;
}

async function writeExecutionLog(input: WriteLogInput): Promise<void> {
  const {
    packet, plannerResult, costCents, agentSettings, batch,
    disposition, status, policyDecision, finalActions, inboxItemId,
    modelTier = "tier2", promoted: wasPromoted = false, promotionReason: promoReason,
  } = input;
  try {
    await executionLoggingService.write({
      organizationId: packet.organizationId,
      triggerEventId: packet.triggerEvent.id,
      batchSize: batch.events.length,
      agentId: agentSettings.agentId,
      modelTier,
      model: plannerResult.model,
      promoted: wasPromoted,
      promotionReason: promoReason,
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
