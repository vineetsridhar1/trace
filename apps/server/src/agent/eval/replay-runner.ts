/**
 * Replay Runner — loads execution logs with replay packets, rebuilds prompts
 * using current prompt blocks + stored context, calls the planner, and
 * compares output against the stored disposition/actions.
 *
 * This cleanly isolates prompt changes from context changes:
 * - Context comes from the stored replayPacket
 * - Prompt blocks come from the current codebase
 */

import type { AgentExecutionLog } from "@prisma/client";
import { prisma } from "../../lib/db.js";
import type { AgentContextPacket } from "../context-builder.js";
import { getActionsByScope } from "../actions/index.js";
import type { ScopeType } from "../actions/types.js";
import { resolveSoulFile } from "../soul-file-resolver.js";
import { buildSystemPrompt } from "../planner.js";
import { runPlannerTurn } from "../planner.js";
import { PLANNER_TOOL } from "../planner.js";
import { scoreEval } from "./eval-scorer.js";
import type { EvalCase, EvalResult, EvalRunSummary } from "./eval-types.js";
import { getBlockVersions } from "../prompt-blocks.js";

// ---------------------------------------------------------------------------
// Load eval cases from execution logs
// ---------------------------------------------------------------------------

export async function loadEvalCases(input: {
  organizationId?: string;
  limit?: number;
  /** Only load cases with a replay packet. Set false to include legacy logs. */
  requireReplayPacket?: boolean;
}): Promise<EvalCase[]> {
  const limit = input.limit ?? 50;
  const requireReplay = input.requireReplayPacket ?? true;

  const where: Record<string, unknown> = {};
  if (input.organizationId) where.organizationId = input.organizationId;
  if (requireReplay) where.replayPacket = { not: null };

  const logs = await prisma.agentExecutionLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return logs.map((log) => logToEvalCase(log)).filter((c): c is EvalCase => c !== null);
}

function logToEvalCase(log: AgentExecutionLog): EvalCase | null {
  const replayPacket = log.replayPacket as Record<string, unknown> | null;
  if (!replayPacket) return null;

  const plannedActions = log.plannedActions as Array<{ actionType?: string }> | null;
  const actionNames = (plannedActions ?? [])
    .map((a) => a.actionType)
    .filter((n): n is string => !!n);

  return {
    executionLogId: log.id,
    organizationId: log.organizationId,
    replayPacket,
    originalPromptVersions: log.promptVersions as Record<string, number> | null,
    originalDisposition: log.disposition,
    originalConfidence: log.confidence,
    originalActions: actionNames,
  };
}

// ---------------------------------------------------------------------------
// Rebuild context packet from stored replay data
// ---------------------------------------------------------------------------

function rebuildContextPacket(replayPacket: Record<string, unknown>): AgentContextPacket {
  const scopeType = (replayPacket.scopeType as string) ?? "channel";
  const actions = getActionsByScope(scopeType as ScopeType);

  return {
    organizationId: (replayPacket.organizationId as string) ?? "",
    scopeKey: (replayPacket.scopeKey as string) ?? "",
    scopeType,
    scopeId: (replayPacket.scopeId as string) ?? "",
    isDm: (replayPacket.isDm as boolean) ?? false,
    isMention: (replayPacket.isMention as boolean) ?? false,
    triggerEvent: replayPacket.triggerEvent as AgentContextPacket["triggerEvent"],
    eventBatch: (replayPacket.eventBatch as AgentContextPacket["eventBatch"]) ?? [],
    soulFile: (replayPacket.soulFile as string) ?? resolveSoulFile({ orgSoulFile: "" }),
    scopeEntity: (replayPacket.scopeEntity as AgentContextPacket["scopeEntity"]) ?? null,
    relevantEntities: (replayPacket.relevantEntities as AgentContextPacket["relevantEntities"]) ?? [],
    recentEvents: (replayPacket.recentEvents as AgentContextPacket["recentEvents"]) ?? [],
    summaries: (replayPacket.summaries as AgentContextPacket["summaries"]) ?? [],
    memories: (replayPacket.memories as AgentContextPacket["memories"]) ?? [],
    actors: (replayPacket.actors as AgentContextPacket["actors"]) ?? [],
    permissions: {
      autonomyMode: ((replayPacket.permissions as Record<string, unknown>)?.autonomyMode as string) ?? "observe",
      actions,
    },
    tokenBudget: { total: 0, used: 0, sections: {} },
  };
}

// ---------------------------------------------------------------------------
// Run a single eval case
// ---------------------------------------------------------------------------

export async function runEvalCase(evalCase: EvalCase): Promise<EvalResult> {
  const startTime = Date.now();
  const packet = rebuildContextPacket(evalCase.replayPacket);
  const { text: systemPrompt, blockVersions } = buildSystemPrompt(packet);

  const initialMessage = "Analyze the context above and make your decision. Call the planner_decision tool with your response. You have up to 10 turns. This is turn 1 of 10.";

  const turnResult = await runPlannerTurn(
    systemPrompt,
    [{ role: "user", content: initialMessage }],
    packet.permissions.actions,
  );

  const replayActions = (turnResult.output.proposedActions ?? []).map(
    (a: { actionType: string }) => a.actionType,
  );

  const scores = scoreEval({
    originalDisposition: evalCase.originalDisposition,
    replayDisposition: turnResult.output.disposition,
    originalConfidence: evalCase.originalConfidence,
    replayConfidence: turnResult.output.confidence,
    originalActions: evalCase.originalActions,
    replayActions,
  });

  return {
    caseId: evalCase.executionLogId,
    replayDisposition: turnResult.output.disposition,
    replayConfidence: turnResult.output.confidence,
    replayActions,
    currentPromptVersions: blockVersions,
    scores,
    latencyMs: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// Run all eval cases and produce a summary
// ---------------------------------------------------------------------------

export async function runEvalSuite(cases: EvalCase[]): Promise<EvalRunSummary> {
  const results: EvalResult[] = [];

  for (const evalCase of cases) {
    try {
      const result = await runEvalCase(evalCase);
      results.push(result);
    } catch (err) {
      console.error(`Eval case ${evalCase.executionLogId} failed:`, err);
    }
  }

  const totalCases = results.length;
  const dispositionMatchCount = results.filter((r) => r.scores.dispositionMatch).length;
  const avgConfidenceDelta = totalCases > 0
    ? results.reduce((sum, r) => sum + r.scores.confidenceDelta, 0) / totalCases
    : 0;
  const avgActionSetOverlap = totalCases > 0
    ? results.reduce((sum, r) => sum + r.scores.actionSetOverlap, 0) / totalCases
    : 0;
  const avgComposite = totalCases > 0
    ? results.reduce((sum, r) => sum + r.scores.composite, 0) / totalCases
    : 0;

  return {
    totalCases,
    dispositionMatchCount,
    avgConfidenceDelta,
    avgActionSetOverlap,
    avgComposite,
    results,
    promptVersions: getBlockVersions(),
    timestamp: new Date().toISOString(),
  };
}
