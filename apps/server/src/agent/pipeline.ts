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
  LLMResponse,
} from "@trace/shared";
import type { OrgAgentSettings } from "../services/agent-identity.js";
import type { AggregatedBatch } from "./aggregator.js";
import type { AgentContextPacket } from "./context-builder.js";
import { TIER3_TOKEN_BUDGET } from "./context-builder.js";
import type { PlannerOutput, PlannerTurnResult, ProposedAction } from "./planner.js";
import {
  DEFAULT_SONNET_MODEL,
  DEFAULT_OPUS_MODEL,
  PLANNER_TOOL,
  buildSystemPrompt,
  runPlannerTurn,
} from "./planner.js";
import type { PolicyDecision, PolicyActionResult } from "./policy-engine.js";
import type { ExecutionResult } from "./executor.js";
import { buildContext } from "./context-builder.js";
import { fetchProjectSoulFile, fetchRepoIdForScope, loadRepoSoulFile } from "./soul-file-resolver.js";
import { evaluatePolicy } from "./policy-engine.js";
import { ActionExecutor } from "./executor.js";
import { createSuggestions } from "./suggestion.js";
import { refreshSummary } from "./summary-worker.js";
import { executionLoggingService } from "../services/execution-logging.js";
import { costTrackingService } from "../services/cost-tracking.js";
import { processedEventService } from "../services/processed-event.js";
import { estimateCostCents } from "./cost-utils.js";
import { llmCallLoggingService, type LlmCallRecord } from "../services/llm-call-logging.js";
import { createTimedLogger, incrementMetric, type AgentLogger } from "./logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONSUMER_NAME = "agent-pipeline";
const MAX_ITERATIONS = 10;

const INITIAL_USER_MESSAGE =
  `Analyze the context above and make your decision. ` +
  `Call the planner_decision tool with your response. ` +
  `You have up to ${MAX_ITERATIONS} turns. This is turn 1 of ${MAX_ITERATIONS}.`;

const DEFAULT_MENTION_FALLBACK =
  "Hey! I saw your mention but I'm not sure how to help here. Could you give me more details?";

// ---------------------------------------------------------------------------
// Logging — uses shared timed logger
// ---------------------------------------------------------------------------

type PipelineLogger = AgentLogger;

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

/** Mutable state carried across turns inside the loop. */
interface LoopState {
  packet: AgentContextPacket;
  currentTier: "tier2" | "tier3";
  promoted: boolean;
  promotionReason: string | undefined;
  promotedModel: string | null;
  messageHistory: LLMMessage[];
  turnResults: TurnResult[];
  llmCallRecords: LlmCallRecord[];
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastModel: string;
  anyMessageSendExecuted: boolean;
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
  const logger = createTimedLogger("agent-pipeline", startTime);
  const { log, logError } = logger;

  // ── Event dedup ──
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

  // ── Determine tier ──
  const isRuleBasedTier3 = batch.maxTier === 3;
  const sonnetModel = process.env.AGENT_SONNET_MODEL ?? DEFAULT_SONNET_MODEL;
  const opusModel = process.env.AGENT_TIER3_MODEL ?? DEFAULT_OPUS_MODEL;

  // ── Resolve soul files (project + repo) ──
  const scopeType = batch.scopeKey.split(":")[0];
  const scopeId = batch.scopeKey.split(":").slice(1).join(":");
  const [projectSoulFile, repoSoulFile] = await Promise.all([
    fetchProjectSoulFile(batch.organizationId, scopeType, scopeId).catch(() => undefined),
    fetchRepoIdForScope(batch.organizationId, scopeType, scopeId)
      .then((repoId) => repoId ? loadRepoSoulFile(repoId) : undefined)
      .catch(() => undefined),
  ]);

  // ── Build context (once) ──
  let packet: AgentContextPacket;
  try {
    packet = await buildContext({
      batch,
      agentSettings,
      projectSoulFile,
      repoSoulFile,
      tokenBudget: isRuleBasedTier3 ? TIER3_TOKEN_BUDGET : undefined,
    });
    log("context built", {
      scopeKey: packet.scopeKey,
      triggerEventType: packet.triggerEvent.eventType,
      relevantEntities: packet.relevantEntities.length,
      tokensUsed: packet.tokenBudget.used,
      tier: isRuleBasedTier3 ? "tier3" : "tier2",
    });
  } catch (err) {
    logError("context builder failed", err);
    return;
  }

  // ── DMs always use Sonnet — direct conversations need comprehension ──
  const isDm =
    packet.scopeType === "chat" &&
    packet.scopeEntity?.data.type === "dm";
  const isDmPromoted = !isRuleBasedTier3 && isDm;

  // ── Initialize loop state ──
  const state: LoopState = {
    packet,
    currentTier: isRuleBasedTier3 ? "tier3" : isDmPromoted ? "tier3" : "tier2",
    promoted: isRuleBasedTier3 || isDmPromoted,
    promotionReason: isRuleBasedTier3 ? "rule_based:router" : isDmPromoted ? "dm_conversation" : undefined,
    promotedModel: isRuleBasedTier3 ? opusModel : isDmPromoted ? sonnetModel : null,
    messageHistory: [{ role: "user", content: INITIAL_USER_MESSAGE }],
    turnResults: [],
    llmCallRecords: [],
    totalCostCents: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    lastModel: "",
    anyMessageSendExecuted: false,
  };

  const { text: systemPrompt, blockVersions } = buildSystemPrompt(packet);

  // ── Capture replay packet (structured context snapshot for eval replay) ──
  // This is re-captured after tier-3 promotion to reflect the rebuilt context.
  let replayPacket = buildReplayPacket(packet);

  // ── Multi-turn loop ──
  for (let turn = 1; turn <= MAX_ITERATIONS; turn++) {
    log(`── turn ${turn}/${MAX_ITERATIONS} start ──`, { scopeKey: packet.scopeKey });

    // Call planner
    let turnResult: PlannerTurnResult;
    try {
      turnResult = await runPlannerTurn(
        systemPrompt,
        state.messageHistory,
        state.packet.permissions.actions,
        state.promotedModel ? { model: state.promotedModel } : undefined,
      );
    } catch (err) {
      logError(`planner failed on turn ${turn}`, err);
      break;
    }

    const { output: plannerOutput, response: llmResponse } = turnResult;
    const messagesSnapshot = structuredClone(state.messageHistory);
    accumulateCost(state, llmResponse, turnResult.latencyMs);

    // Capture per-call LLM data for observability
    // Only store systemPrompt on the first turn to avoid redundant multi-KB copies
    state.llmCallRecords.push({
      turnNumber: turn,
      model: llmResponse.model,
      provider: turnResult.provider,
      systemPrompt: turn === 1 ? systemPrompt : null,
      messages: messagesSnapshot,
      tools: [PLANNER_TOOL],
      maxTokens: turnResult.maxTokens,
      temperature: 0,
      responseContent: llmResponse.content,
      stopReason: llmResponse.stopReason ?? "end_turn",
      inputTokens: llmResponse.usage.inputTokens,
      outputTokens: llmResponse.usage.outputTokens,
      estimatedCostCents: estimateTurnCost(llmResponse),
      latencyMs: turnResult.latencyMs,
    });

    log("planner decided", {
      scopeKey: state.packet.scopeKey,
      turn,
      disposition: plannerOutput.disposition,
      confidence: plannerOutput.confidence,
      actionCount: plannerOutput.proposedActions.length,
      actions: plannerOutput.proposedActions.map((a) => a.actionType),
      done: plannerOutput.done ?? false,
      rationale: plannerOutput.rationaleSummary,
      model: llmResponse.model,
      tier: state.currentTier,
      promoted: state.promoted,
      latencyMs: turnResult.latencyMs,
      costCents: Math.round(estimateTurnCost(llmResponse) * 1000) / 1000,
    });

    // ── Escalation (turn 1 only) ──
    if (turn === 1 && shouldPromote(state, plannerOutput)) {
      const promoted = await handlePromotion({
        state,
        plannerOutput,
        llmResponse,
        batch,
        agentSettings,
        sonnetModel,
        opusModel,
        projectSoulFile,
        repoSoulFile,
        logger,
      });
      if (promoted) {
        // Re-snapshot the replay packet from the rebuilt context
        replayPacket = buildReplayPacket(state.packet);
        continue; // Re-run turn 1 with promoted model
      }
      // Budget suppressed — fall through
    }

    // Later-turn escalation → end the loop
    if (turn > 1 && plannerOutput.disposition === "escalate") {
      log("escalation on later turn, treating as done", { scopeKey: state.packet.scopeKey, turn });
      break;
    }

    // ── Terminal dispositions ──
    if (plannerOutput.disposition === "escalate") {
      logUnresolvedEscalation(state, log);
      break;
    }

    if (plannerOutput.disposition === "summarize") {
      await handleSummarize(state.packet, turnResult, llmResponse, state.turnResults, log, logError);
      break;
    }

    if (plannerOutput.disposition === "ignore") {
      const overridden = handleIgnore(plannerOutput, turn, state.packet, log);
      if (!overridden) {
        pushEmptyTurn(state.turnResults, turn, plannerOutput, turnResult, llmResponse);
        break;
      }
      // overridden = forced @mention reply, fall through to execute
    }

    // ── Inject @mention threading ──
    injectParentId(plannerOutput, state.packet);

    // ── Policy → Execute → Suggest ──
    const turnRecord = await executeTurn({
      turn,
      plannerOutput,
      llmResponse,
      turnResult,
      state,
      agentSettings,
      executor,
      logger,
    });

    state.turnResults.push(turnRecord);

    // ── Check if done ──
    if (plannerOutput.done) {
      log("planner signaled done", { scopeKey: state.packet.scopeKey, turn });
      break;
    }
    if (turn >= MAX_ITERATIONS) {
      log("hard cap reached", { scopeKey: state.packet.scopeKey, turn });
      break;
    }

    // ── Feed results back to planner ──
    appendToolResult(state.messageHistory, llmResponse, turnRecord, turn, log, state.packet.scopeKey);
  }

  // ── Post-loop ──
  await postLoop({ state, agentSettings, executor, batch, startTime, replayPacket, blockVersions, logger });
}

// ---------------------------------------------------------------------------
// Turn execution — policy + execute + suggest
// ---------------------------------------------------------------------------

interface ExecuteTurnInput {
  turn: number;
  plannerOutput: PlannerOutput;
  llmResponse: LLMResponse;
  turnResult: PlannerTurnResult;
  state: LoopState;
  agentSettings: OrgAgentSettings;
  executor: ActionExecutor;
  logger: PipelineLogger;
}

async function executeTurn(input: ExecuteTurnInput): Promise<TurnResult> {
  const { turn, plannerOutput, llmResponse, turnResult, state, agentSettings, executor, logger } = input;
  const { log, logError } = logger;

  // ── Policy engine ──
  let policyActions: PolicyActionResult[];
  try {
    const policyResult = await evaluatePolicy({
      plannerOutput,
      context: state.packet,
    });
    policyActions = policyResult.actions;
  } catch (err) {
    logError(`policy engine failed on turn ${turn}`, err);
    return emptyTurnResult(turn, plannerOutput, turnResult, llmResponse);
  }

  const byDecision = groupByDecision(policyActions);

  log("policy evaluated", {
    scopeKey: state.packet.scopeKey,
    turn,
    execute: byDecision.get("execute")?.length ?? 0,
    suggest: byDecision.get("suggest")?.length ?? 0,
    drop: byDecision.get("drop")?.length ?? 0,
  });

  // ── Execute actions ──
  const executionResults: Array<ExecutionResult & { decision: PolicyDecision }> = [];
  for (const actionResult of byDecision.get("execute") ?? []) {
    try {
      const result = await executor.execute(actionResult.action, {
        organizationId: state.packet.organizationId,
        agentId: agentSettings.agentId,
        triggerEventId: state.packet.triggerEvent.id,
        scopeType: state.packet.scopeType,
        scopeId: state.packet.scopeId,
        isDm: state.packet.isDm,
      });
      executionResults.push({ ...result, decision: "execute" });

      if (isReplyAction(actionResult.action.actionType) && result.status === "success") {
        state.anyMessageSendExecuted = true;
      }

      log("action executed", {
        scopeKey: state.packet.scopeKey,
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

  // ── Create suggestions ──
  const suggests = byDecision.get("suggest") ?? [];
  let createdSuggestions: Array<{ actionType: string; itemType: string }> = [];
  let suppressedSuggestions: Array<{ actionType: string; reason: string }> = [];
  if (suggests.length > 0) {
    try {
      const triggerActorType = state.packet.triggerEvent.actorType;
      const triggerActorId = state.packet.triggerEvent.actorId;
      const userId = triggerActorType === "user" ? triggerActorId : agentSettings.agentId;

      const outcome = await createSuggestions({
        suggestions: suggests,
        plannerOutput,
        context: state.packet,
        agentId: agentSettings.agentId,
        userId,
      });
      createdSuggestions = outcome.created.map((record) => ({
        actionType: record.actionType,
        itemType: record.itemType,
      }));
      suppressedSuggestions = outcome.suppressed.map((record) => ({
        actionType: record.actionType,
        reason: record.reason,
      }));

      log("suggestions handled", {
        scopeKey: state.packet.scopeKey,
        turn,
        createdCount: outcome.created.length,
        createdTypes: outcome.created.map((record) => record.itemType),
        suppressedCount: outcome.suppressed.length,
      });
    } catch (err) {
      logError(`suggestion creation failed on turn ${turn}`, err);
    }
  }

  // ── Log dropped actions ──
  const drops = byDecision.get("drop") ?? [];
  for (const dropped of drops) {
    log("action dropped by policy", {
      scopeKey: state.packet.scopeKey,
      turn,
      actionType: dropped.action.actionType,
      reason: dropped.reason,
    });
  }
  for (const dropped of suppressedSuggestions) {
    log("action suppressed during suggestion creation", {
      scopeKey: state.packet.scopeKey,
      turn,
      actionType: dropped.actionType,
      reason: dropped.reason,
    });
  }

  return {
    turn,
    plannerOutput,
    executed: executionResults.map((r) => ({
      actionType: r.actionType,
      status: r.status,
      ...(r.error ? { error: r.error } : {}),
    })),
    suggested: createdSuggestions.map((record) => ({ actionType: record.actionType })),
    dropped: [
      ...drops.map((d) => ({ actionType: d.action.actionType, reason: d.reason })),
      ...suppressedSuggestions,
    ],
    latencyMs: turnResult.latencyMs,
    inputTokens: llmResponse.usage.inputTokens,
    outputTokens: llmResponse.usage.outputTokens,
    model: llmResponse.model,
  };
}

// ---------------------------------------------------------------------------
// Promotion handling
// ---------------------------------------------------------------------------

function shouldPromote(state: LoopState, output: PlannerOutput): boolean {
  return (
    state.currentTier === "tier2" &&
    output.disposition === "escalate" &&
    !!output.promotionReason
  );
}

interface HandlePromotionInput {
  state: LoopState;
  plannerOutput: PlannerOutput;
  llmResponse: LLMResponse;
  batch: AggregatedBatch;
  agentSettings: OrgAgentSettings;
  sonnetModel: string;
  opusModel: string;
  projectSoulFile?: string;
  repoSoulFile?: string;
  logger: PipelineLogger;
}

async function handlePromotion(input: HandlePromotionInput): Promise<boolean> {
  const { state, plannerOutput, llmResponse, batch, agentSettings, sonnetModel, opusModel, projectSoulFile, repoSoulFile, logger } = input;
  const { log, logError } = logger;

  // Record Tier 2 cost before re-running
  const turnCostCents = estimateTurnCost(llmResponse);
  try {
    await costTrackingService.recordCost({
      organizationId: state.packet.organizationId,
      modelTier: "tier2",
      costCents: turnCostCents,
    });
  } catch (err) {
    logError("tier2 cost tracking failed (non-fatal)", err);
  }

  const target = plannerOutput.promotionTarget ?? "sonnet";
  const targetModel = target === "opus" ? opusModel : sonnetModel;
  const isOpus = target === "opus";

  // Only budget-gate Opus
  if (isOpus) {
    try {
      const budgetStatus = await costTrackingService.checkBudget(state.packet.organizationId);
      if (budgetStatus.remainingPercent < 50) {
        log("Opus promotion suppressed — budget below 50%", {
          scopeKey: state.packet.scopeKey,
          remainingPercent: budgetStatus.remainingPercent,
        });
        return false;
      }
    } catch (err) {
      logError("budget check failed, suppressing promotion (non-fatal)", err);
      return false;
    }
  }

  state.promoted = true;
  state.promotionReason = plannerOutput.promotionReason;
  state.promotedModel = targetModel;
  state.currentTier = isOpus ? "tier3" : "tier2";
  log("promoting", {
    scopeKey: state.packet.scopeKey,
    target,
    model: targetModel,
    promotionReason: state.promotionReason,
  });

  // Rebuild context with larger budget for Opus
  if (isOpus) {
    try {
      state.packet = await buildContext({
        batch,
        agentSettings,
        projectSoulFile,
        repoSoulFile,
        tokenBudget: TIER3_TOKEN_BUDGET,
      });
    } catch (err) {
      logError("Opus context rebuild failed", err);
      return false;
    }
  }

  // Reset message history for fresh start
  state.messageHistory.length = 0;
  state.messageHistory.push({ role: "user", content: INITIAL_USER_MESSAGE });
  return true;
}

// ---------------------------------------------------------------------------
// Disposition handlers
// ---------------------------------------------------------------------------

function logUnresolvedEscalation(
  state: LoopState,
  log: PipelineLogger["log"],
): void {
  const reason = state.currentTier === "tier3"
    ? "tier3_escalation_unresolvable"
    : "tier3_promotion_suppressed_by_budget";
  log("escalation unresolved", {
    scopeKey: state.packet.scopeKey,
    reason,
    tier: state.currentTier,
  });
}

async function handleSummarize(
  packet: AgentContextPacket,
  turnResult: PlannerTurnResult,
  llmResponse: LLMResponse,
  turnResults: TurnResult[],
  log: PipelineLogger["log"],
  logError: PipelineLogger["logError"],
): Promise<void> {
  log("summary requested", { scopeKey: packet.scopeKey });
  try {
    const summaryResult = await refreshSummary(
      packet.organizationId,
      packet.scopeType,
      packet.scopeId,
    );
    log("summary refreshed", { scopeKey: packet.scopeKey, costCents: summaryResult?.costCents });
  } catch (err) {
    logError("summary refresh failed (non-fatal)", err);
  }
  pushEmptyTurn(turnResults, turnResults.length + 1, turnResult.output, turnResult, llmResponse);
}

/**
 * Handle "ignore" disposition. Returns true if overridden (forced reply),
 * false if the loop should break.
 *
 * Override triggers:
 * - @mention: user explicitly addressed the agent — always reply
 * - DM: user is in a 1:1 conversation — always reply (rule 1)
 */
function handleIgnore(
  plannerOutput: PlannerOutput,
  turn: number,
  packet: AgentContextPacket,
  log: PipelineLogger["log"],
): boolean {
  const shouldForceReply = turn === 1 && (packet.isMention || packet.isDm);
  if (!shouldForceReply) return false;

  const triggerMessageId = packet.triggerEvent.payload.messageId as string | undefined;
  const replyText = isUsableRationale(plannerOutput.rationaleSummary)
    ? plannerOutput.rationaleSummary
    : DEFAULT_MENTION_FALLBACK;

  plannerOutput.disposition = "act";
  plannerOutput.proposedActions = [
    buildReplyAction(packet, replyText, triggerMessageId),
  ];

  const reason = packet.isMention ? "@mention" : "dm";
  log(`${reason} override: planner ignored but forcing reply`, {
    scopeKey: packet.scopeKey,
    turn,
    triggerMessageId,
  });
  return true; // overridden — continue to execute
}

// ---------------------------------------------------------------------------
// @mention threading + scope-aware reply helpers
// ---------------------------------------------------------------------------

function injectParentId(plannerOutput: PlannerOutput, packet: AgentContextPacket): void {
  if (!packet.isMention) return;
  const triggerMessageId = packet.triggerEvent.payload.messageId as string | undefined;
  if (!triggerMessageId) return;
  for (const action of plannerOutput.proposedActions) {
    if (action.actionType === "message.send" && !action.args.parentId) {
      action.args.parentId = triggerMessageId;
    }
    if (isChannelReplyAction(action.actionType) && !action.args.threadId) {
      action.args.threadId = triggerMessageId;
    }
  }
}

/**
 * Build a scope-aware reply action. Uses channel.sendMessage for channel
 * scopes and message.send for chat scopes.
 */
function buildReplyAction(
  packet: AgentContextPacket,
  text: string,
  triggerMessageId: string | undefined,
): ProposedAction {
  if (packet.scopeType === "channel") {
    return {
      actionType: "channel.sendMessage",
      args: {
        channelId: packet.scopeId,
        text,
        ...(triggerMessageId ? { threadId: triggerMessageId } : {}),
      },
    };
  }
  return {
    actionType: "message.send",
    args: {
      chatId: packet.scopeId,
      text,
      ...(triggerMessageId ? { parentId: triggerMessageId } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Tool result construction
// ---------------------------------------------------------------------------

function appendToolResult(
  messageHistory: LLMMessage[],
  llmResponse: LLMResponse,
  turnRecord: TurnResult,
  turn: number,
  log: PipelineLogger["log"],
  scopeKey: string,
): void {
  messageHistory.push({ role: "assistant", content: llmResponse.content });

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

  log("feeding results back to planner", { scopeKey, turn, toolResult: toolResultPayload });

  messageHistory.push({
    role: "tool",
    content: [{ type: "tool_result", toolUseId, content: JSON.stringify(toolResultPayload) }],
  });
}

// ---------------------------------------------------------------------------
// Post-loop: fallback, cost, logging
// ---------------------------------------------------------------------------

interface PostLoopInput {
  state: LoopState;
  agentSettings: OrgAgentSettings;
  executor: ActionExecutor;
  batch: AggregatedBatch;
  startTime: number;
  replayPacket: Record<string, unknown>;
  blockVersions: Record<string, number>;
  logger: PipelineLogger;
}

function isReplyAction(actionType: string): boolean {
  return actionType === "message.send" ||
    actionType === "message.sendToChannel" ||
    actionType === "channel.sendMessage";
}

function isChannelReplyAction(actionType: string): boolean {
  return actionType === "message.sendToChannel" || actionType === "channel.sendMessage";
}

async function postLoop(input: PostLoopInput): Promise<void> {
  const { state, agentSettings, executor, batch, startTime, replayPacket, blockVersions, logger } = input;
  const { log, logError } = logger;

  // @mention / DM fallback — guarantee a reply was sent
  if ((state.packet.isMention || state.packet.isDm) && !state.anyMessageSendExecuted) {
    await forceReplyFallback(state, agentSettings, executor, log, logError);
  }

  // ── Auto-reply in thread after taking action ──
  // In chat/channel scopes, send a brief thread reply so people know
  // the agent did something. Skip if we already sent a message or in observe mode.
  if (!state.anyMessageSendExecuted && state.packet.permissions.autonomyMode !== "observe") {
    await sendActionConfirmation(state, agentSettings, executor, logger);
  }

  // Record aggregated cost
  try {
    await costTrackingService.recordCost({
      organizationId: state.packet.organizationId,
      modelTier: state.currentTier,
      costCents: state.totalCostCents,
    });
  } catch (err) {
    logError("cost tracking failed (non-fatal)", err);
  }

  // Compute overall status
  const allExecuted = state.turnResults.flatMap((t) => t.executed);
  const allSuggested = state.turnResults.flatMap((t) => t.suggested);
  const allDropped = state.turnResults.flatMap((t) => t.dropped);

  let overallStatus: ExecutionStatus;
  if (allExecuted.length > 0) {
    overallStatus = allExecuted.some((r) => r.status === "failed") ? "failed" : "succeeded";
  } else if (allSuggested.length > 0) {
    overallStatus = "suggested";
  } else {
    overallStatus = "dropped";
  }

  const lastTurnOutput = state.turnResults.length > 0
    ? state.turnResults[state.turnResults.length - 1].plannerOutput
    : undefined;
  const executionDisposition = toExecutionDisposition(lastTurnOutput?.disposition);

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

  const aggregatedPlannerResult = {
    output: lastTurnOutput ?? {
      disposition: "ignore" as const,
      confidence: 0,
      rationaleSummary: "No planner turns completed.",
      proposedActions: [],
    },
    usage: { inputTokens: state.totalInputTokens, outputTokens: state.totalOutputTokens },
    latencyMs: state.turnResults.reduce((sum, t) => sum + t.latencyMs, 0),
    model: state.lastModel || (state.promotedModel ?? "unknown"),
  };

  const executionLogId = await writeExecutionLog({
    packet: state.packet,
    plannerResult: aggregatedPlannerResult,
    costCents: state.totalCostCents,
    agentSettings,
    batch,
    disposition: executionDisposition,
    status: overallStatus,
    policyDecision: { iterations: state.turnResults.length, turns: state.turnResults },
    finalActions,
    modelTier: state.currentTier,
    promoted: state.promoted,
    promotionReason: state.promotionReason,
    replayPacket,
    blockVersions,
    logger,
  });

  // Write per-call LLM records
  if (executionLogId && state.llmCallRecords.length > 0) {
    try {
      await llmCallLoggingService.writeMany(executionLogId, state.llmCallRecords);
    } catch (err) {
      logError("llm call logging failed (non-fatal)", err);
    }
  }

  await markProcessed(state.packet, logger);

  // Track aggregated metrics
  incrementMetric("totalCostCents", state.totalCostCents);
  incrementMetric("totalInputTokens", state.totalInputTokens);
  incrementMetric("totalOutputTokens", state.totalOutputTokens);

  log("pipeline complete", {
    scopeKey: state.packet.scopeKey,
    iterations: state.turnResults.length,
    disposition: executionDisposition,
    status: overallStatus,
    actionsExecuted: allExecuted.length,
    actionsSuggested: allSuggested.length,
    actionsDropped: allDropped.length,
    totalCostCents: Math.round(state.totalCostCents * 1000) / 1000,
    durationMs: Date.now() - startTime,
  });
}

/**
 * Fallback reply for @mentions and DMs. Guarantees a message is sent even if
 * the planner didn't produce one across all turns.
 */
async function forceReplyFallback(
  state: LoopState,
  agentSettings: OrgAgentSettings,
  executor: ActionExecutor,
  log: PipelineLogger["log"],
  logError: PipelineLogger["logError"],
): Promise<void> {
  const triggerMessageId = state.packet.triggerEvent.payload.messageId as string | undefined;
  const lastRationale = state.turnResults.length > 0
    ? state.turnResults[state.turnResults.length - 1].plannerOutput.rationaleSummary
    : undefined;
  const replyText = isUsableRationale(lastRationale)
    ? lastRationale
    : DEFAULT_MENTION_FALLBACK;

  const reason = state.packet.isMention ? "@mention" : "dm";
  log(`${reason} fallback: no message sent across all turns, forcing reply`, {
    scopeKey: state.packet.scopeKey,
    totalTurns: state.turnResults.length,
  });

  try {
    const action = buildReplyAction(state.packet, replyText, triggerMessageId);
    await executor.execute(action, {
      organizationId: state.packet.organizationId,
      agentId: agentSettings.agentId,
      triggerEventId: state.packet.triggerEvent.id,
    });
    state.anyMessageSendExecuted = true;
  } catch (err) {
    logError(`${reason} fallback execution failed`, err);
  }
}

// ---------------------------------------------------------------------------
// Action confirmation reply
// ---------------------------------------------------------------------------

/**
 * Send a brief thread reply in chat/channel scopes after the agent executes
 * actions or creates suggestions, so people know the agent did something.
 *
 * Only fires when:
 * - Scope is chat or channel
 * - At least one action was executed or suggestion was created
 * - No message.send was already executed this pipeline run
 */
async function sendActionConfirmation(
  state: LoopState,
  agentSettings: OrgAgentSettings,
  executor: ActionExecutor,
  logger: PipelineLogger,
): Promise<void> {
  const { scopeType, scopeId } = state.packet;
  if (scopeType !== "chat" && scopeType !== "channel") return;

  const allExecuted = state.turnResults.flatMap((t) => t.executed);
  const allSuggested = state.turnResults.flatMap((t) => t.suggested);

  // Only reply if something actually happened
  const executedNonMessage = allExecuted.filter(
    (r) => r.status === "success" && !isReplyAction(r.actionType) && r.actionType !== "no_op",
  );
  const hasSuggestions = allSuggested.length > 0;

  if (executedNonMessage.length === 0 && !hasSuggestions) return;

  // Build a brief confirmation message
  const parts: string[] = [];
  for (const action of executedNonMessage) {
    parts.push(formatActionConfirmation(action.actionType));
  }
  if (hasSuggestions) {
    const count = allSuggested.length;
    parts.push(
      count === 1
        ? "I have a suggestion — check your inbox."
        : `I have ${count} suggestions — check your inbox.`,
    );
  }

  if (parts.length === 0) return;

  const text = parts.join("\n");

  // Thread to the trigger message — only use actual message IDs, not event IDs
  const triggerMessageId = state.packet.triggerEvent.payload.messageId as string | undefined;

  const actionType = scopeType === "channel" ? "channel.sendMessage" : "message.send";
  const args =
    scopeType === "channel"
      ? { channelId: scopeId, text, ...(triggerMessageId ? { threadId: triggerMessageId } : {}) }
      : { chatId: scopeId, text, ...(triggerMessageId ? { parentId: triggerMessageId } : {}) };

  try {
    await executor.execute(
      { actionType, args },
      {
        organizationId: state.packet.organizationId,
        agentId: agentSettings.agentId,
        triggerEventId: state.packet.triggerEvent.id,
      },
    );
    state.anyMessageSendExecuted = true;
    logger.log("action confirmation sent", {
      scopeKey: state.packet.scopeKey,
      executedActions: executedNonMessage.length,
      suggestions: allSuggested.length,
    });
  } catch (err) {
    logger.logError("action confirmation failed (non-fatal)", err);
  }
}

/** Map action types to human-readable confirmation messages. */
function formatActionConfirmation(actionType: string): string {
  switch (actionType) {
    case "ticket.create":
      return "Done — I created a ticket for this.";
    case "ticket.update":
      return "Done — I updated the ticket.";
    case "ticket.addComment":
      return "Done — I added a comment to the ticket.";
    case "link.create":
      return "Done — I linked the related items.";
    case "session.start":
      return "Done — I started a coding session.";
    case "summary.update":
      return "Done — I updated the summary.";
    case "escalate.toHuman":
      return "I've escalated this to a human — check your inbox.";
    default:
      return `Done — I completed: ${actionType}.`;
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function accumulateCost(state: LoopState, response: LLMResponse, latencyMs: number): void {
  const cost = estimateTurnCost(response);
  state.totalCostCents += cost;
  state.totalInputTokens += response.usage.inputTokens;
  state.totalOutputTokens += response.usage.outputTokens;
  state.lastModel = response.model;
}

function estimateTurnCost(response: LLMResponse): number {
  return estimateCostCents(response.model, response.usage.inputTokens, response.usage.outputTokens);
}

function groupByDecision(actions: PolicyActionResult[]): Map<PolicyDecision, PolicyActionResult[]> {
  const map = new Map<PolicyDecision, PolicyActionResult[]>();
  for (const a of actions) {
    const existing = map.get(a.decision) ?? [];
    existing.push(a);
    map.set(a.decision, existing);
  }
  return map;
}

function emptyTurnResult(
  turn: number,
  plannerOutput: PlannerOutput,
  turnResult: PlannerTurnResult,
  llmResponse: LLMResponse,
): TurnResult {
  return {
    turn,
    plannerOutput,
    executed: [],
    suggested: [],
    dropped: [],
    latencyMs: turnResult.latencyMs,
    inputTokens: llmResponse.usage.inputTokens,
    outputTokens: llmResponse.usage.outputTokens,
    model: llmResponse.model,
  };
}

function pushEmptyTurn(
  turnResults: TurnResult[],
  turn: number,
  plannerOutput: PlannerOutput,
  turnResult: PlannerTurnResult,
  llmResponse: LLMResponse,
): void {
  turnResults.push(emptyTurnResult(turn, plannerOutput, turnResult, llmResponse));
}

function isUsableRationale(rationale: string | undefined): rationale is string {
  return !!rationale && rationale !== "Defaulted to ignore due to invalid or missing planner output.";
}

const DISPOSITION_MAP: Record<string, ExecutionDisposition> = {
  ignore: "ignore",
  suggest: "suggest",
  act: "act",
  summarize: "summarize",
  escalate: "escalate",
};

function toExecutionDisposition(disposition: string | undefined): ExecutionDisposition {
  return DISPOSITION_MAP[disposition ?? "ignore"] ?? "ignore";
}

// ---------------------------------------------------------------------------
// Replay packet builder — structured context snapshot for eval replay
// ---------------------------------------------------------------------------

function buildReplayPacket(packet: AgentContextPacket): Record<string, unknown> {
  return {
    scopeKey: packet.scopeKey,
    scopeType: packet.scopeType,
    scopeId: packet.scopeId,
    isDm: packet.isDm,
    isMention: packet.isMention,
    triggerEvent: packet.triggerEvent,
    eventBatch: packet.eventBatch,
    soulFile: packet.soulFile,
    scopeEntity: packet.scopeEntity,
    relevantEntities: packet.relevantEntities,
    recentEvents: packet.recentEvents,
    summaries: packet.summaries,
    memories: packet.memories,
    actors: packet.actors,
    permissions: {
      autonomyMode: packet.permissions.autonomyMode,
      // Exclude full action registrations — they can be re-derived from scope type
      actionNames: packet.permissions.actions.map((a) => a.name),
    },
  };
}

// ---------------------------------------------------------------------------
// Persistence helpers
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
  replayPacket?: Record<string, unknown>;
  blockVersions?: Record<string, number>;
  logger: PipelineLogger;
}

async function writeExecutionLog(input: WriteLogInput): Promise<string | null> {
  const {
    packet, plannerResult, costCents, agentSettings, batch,
    disposition, status, policyDecision, finalActions, inboxItemId,
    modelTier = "tier2", promoted: wasPromoted = false, promotionReason: promoReason,
    replayPacket: replayPkt, blockVersions: blkVersions,
    logger,
  } = input;
  try {
    const log = await executionLoggingService.write({
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
      replayPacket: replayPkt,
      promptVersions: blkVersions,
    });
    return log.id;
  } catch (err) {
    logger.logError("execution log write failed (non-fatal)", err);
    return null;
  }
}

async function markProcessed(packet: AgentContextPacket, logger: PipelineLogger): Promise<void> {
  try {
    await processedEventService.markProcessed({
      consumerName: CONSUMER_NAME,
      eventId: packet.triggerEvent.id,
      organizationId: packet.organizationId,
    });
  } catch (err) {
    logger.logError("markProcessed failed (non-fatal)", err);
  }
}
