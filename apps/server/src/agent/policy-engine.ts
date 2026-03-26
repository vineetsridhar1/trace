/**
 * Policy Engine — sits between the planner and executor.
 *
 * Takes the planner's decision and routes each proposed action based on:
 *   - The action's risk level (from the action registry)
 *   - The planner's confidence score (0–1)
 *   - The scope's autonomy mode (observe / suggest / act)
 *
 * Also enforces anti-chaos mechanisms: per-scope rate limiting, dismissal
 * cooldown, and cost budget checking.
 *
 * Ticket: #12
 * Dependencies: #06 (Action Registry), #11 (Tier 2 Planner), #08 (Cost Tracking)
 */

import type { AgentContextPacket } from "./context-builder.js";
import type { PlannerOutput, ProposedAction } from "./planner.js";
import type { RiskLevel } from "./action-registry.js";
import { findAction } from "./action-registry.js";
import { costTrackingService } from "../services/cost-tracking.js";
import { redis } from "../lib/redis.js";
import { mapActionToItemType } from "./suggestion.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PolicyDecision = "execute" | "suggest" | "drop";

export interface PolicyActionResult {
  action: ProposedAction;
  decision: PolicyDecision;
  reason: string;
}

export interface PolicyResult {
  /** Per-action decisions. */
  actions: PolicyActionResult[];
  /** Overall planner output (pass-through for downstream logging). */
  plannerOutput: PlannerOutput;
}

export type AutonomyMode = "observe" | "suggest" | "act";

// ---------------------------------------------------------------------------
// Confidence × Risk × Autonomy thresholds
// ---------------------------------------------------------------------------

interface Thresholds {
  suggestMin: number;
  actMin: number;
}

/**
 * Configurable threshold matrix. Keyed by `${riskLevel}:${autonomyMode}`.
 * Values: { suggestMin, actMin } — minimum confidence to suggest or act.
 */
const THRESHOLD_MATRIX: Record<string, Thresholds> = {
  "low:suggest":    { suggestMin: 0.3, actMin: 0.6 },
  "low:act":        { suggestMin: 0.2, actMin: 0.4 },
  "medium:suggest": { suggestMin: 0.5, actMin: 0.9 },
  "medium:act":     { suggestMin: 0.3, actMin: 0.7 },
  "high:suggest":   { suggestMin: 0.6, actMin: 0.95 },
  "high:act":       { suggestMin: 0.5, actMin: 0.85 },
};

function getThresholds(risk: RiskLevel, mode: AutonomyMode): Thresholds {
  return THRESHOLD_MATRIX[`${risk}:${mode}`] ?? { suggestMin: 1, actMin: 1 };
}

// ---------------------------------------------------------------------------
// Per-scope suggestion rate limiting
// ---------------------------------------------------------------------------

/** Default max suggestions per scope type per hour. */
const SUGGESTION_RATE_LIMITS: Record<string, number> = {
  channel: 100,
  chat: 100,
  ticket: 100,
  session: 100,
  project: 2,
  system: 0,
};

/** DMs get 0 unsolicited suggestions. */
const DM_RATE_LIMIT = 0;

interface SuggestionRateEntry {
  count: number;
  windowStart: number;
}

const SUGGESTION_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Key: "orgId:scopeType:scopeId" */
const suggestionRates = new Map<string, SuggestionRateEntry>();

function suggestionRateKey(orgId: string, scopeType: string, scopeId: string): string {
  return `${orgId}:${scopeType}:${scopeId}`;
}

/**
 * Check if a suggestion would exceed the per-scope rate limit.
 * Returns true if the suggestion should be suppressed.
 * Increments the counter as a side effect when not suppressed.
 */
function isSuggestionRateLimited(input: {
  organizationId: string;
  scopeType: string;
  scopeId: string;
  isDm?: boolean;
}): boolean {
  const limit = input.isDm
    ? DM_RATE_LIMIT
    : (SUGGESTION_RATE_LIMITS[input.scopeType] ?? 2);

  if (limit <= 0) return true;

  const key = suggestionRateKey(input.organizationId, input.scopeType, input.scopeId);
  const now = Date.now();
  const entry = suggestionRates.get(key);

  if (!entry || now - entry.windowStart > SUGGESTION_RATE_WINDOW_MS) {
    suggestionRates.set(key, { count: 1, windowStart: now });
    return false;
  }

  if (entry.count >= limit) return true;

  entry.count++;
  return false;
}

/** Periodically clean up stale suggestion rate entries. */
export function cleanupSuggestionRates(): void {
  const now = Date.now();
  for (const [key, entry] of suggestionRates) {
    if (now - entry.windowStart > SUGGESTION_RATE_WINDOW_MS * 2) {
      suggestionRates.delete(key);
    }
  }
}

/** Clear all suggestion rate state (for testing). */
export function clearSuggestionRates(): void {
  suggestionRates.clear();
}

// ---------------------------------------------------------------------------
// Dismissal cooldown tracking (Redis-backed, keyed by itemType)
//
// Ticket #19: dismissals are stored in Redis with automatic TTL expiry.
// Key format: suppress:{orgId}:{scopeType}:{scopeId}:{itemType}
// ---------------------------------------------------------------------------

const DISMISSAL_COOLDOWN_SECONDS = 24 * 60 * 60; // 24 hours

function dismissalRedisKey(orgId: string, scopeType: string, scopeId: string, itemType: string): string {
  return `suppress:${orgId}:${scopeType}:${scopeId}:${itemType}`;
}

/**
 * Record that a user dismissed a suggestion of the given item type in a scope.
 * Stores in Redis with automatic 24h TTL — no cleanup needed.
 */
export async function recordDismissal(input: {
  organizationId: string;
  scopeType: string;
  scopeId: string;
  itemType: string;
}): Promise<void> {
  const key = dismissalRedisKey(input.organizationId, input.scopeType, input.scopeId, input.itemType);
  await redis.set(key, "1", "EX", DISMISSAL_COOLDOWN_SECONDS);
}

/**
 * Check if a suggestion of the given item type is on cooldown in a scope.
 */
async function isDismissalCooldownActive(input: {
  organizationId: string;
  scopeType: string;
  scopeId: string;
  itemType: string;
}): Promise<boolean> {
  const key = dismissalRedisKey(input.organizationId, input.scopeType, input.scopeId, input.itemType);
  const exists = await redis.exists(key);
  return exists === 1;
}

/** Clear all dismissals matching a pattern (for testing). */
export async function clearDismissals(): Promise<void> {
  const keys = await redis.keys("suppress:*");
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

// ---------------------------------------------------------------------------
// Cost budget checking
// ---------------------------------------------------------------------------

interface CachedBudget {
  remainingPercent: number;
  fetchedAt: number;
}

const budgetCache = new Map<string, CachedBudget>();
const BUDGET_CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Get remaining budget percent (0–100) for an org. Uses a short cache to
 * avoid hammering the DB on every policy decision.
 */
async function getBudgetPercent(organizationId: string): Promise<number> {
  const cached = budgetCache.get(organizationId);
  if (cached && Date.now() - cached.fetchedAt < BUDGET_CACHE_TTL_MS) {
    return cached.remainingPercent;
  }

  const status = await costTrackingService.checkBudget(organizationId);
  budgetCache.set(organizationId, {
    remainingPercent: status.remainingPercent,
    fetchedAt: Date.now(),
  });
  return status.remainingPercent;
}

/** Clear budget cache (for testing). */
export function clearBudgetCache(): void {
  budgetCache.clear();
}

// ---------------------------------------------------------------------------
// Main policy engine
// ---------------------------------------------------------------------------

export interface PolicyEngineInput {
  plannerOutput: PlannerOutput;
  context: AgentContextPacket;
}

/**
 * Evaluate planner output against the policy matrix and anti-chaos rules.
 * Returns a PolicyResult with a decision for each proposed action.
 */
export async function evaluatePolicy(input: PolicyEngineInput): Promise<PolicyResult> {
  const { plannerOutput, context } = input;
  const autonomyMode = context.permissions.autonomyMode as AutonomyMode;
  const orgId = context.organizationId;

  // ── Hard rule: observe mode → drop everything ──
  if (autonomyMode === "observe") {
    return {
      actions: plannerOutput.proposedActions.map((action) => ({
        action,
        decision: "drop",
        reason: "observe_mode",
      })),
      plannerOutput,
    };
  }

  // ── Hard rule: planner said ignore/summarize → no actions to route ──
  if (
    plannerOutput.disposition === "ignore" ||
    plannerOutput.disposition === "summarize"
  ) {
    return {
      actions: plannerOutput.proposedActions.map((action) => ({
        action,
        decision: "drop",
        reason: `planner_disposition_${plannerOutput.disposition}`,
      })),
      plannerOutput,
    };
  }

  // ── Cost budget check ──
  const budgetPercent = await getBudgetPercent(orgId);
  if (budgetPercent <= 0) {
    return {
      actions: plannerOutput.proposedActions.map((action) => ({
        action,
        decision: "drop",
        reason: "budget_exhausted",
      })),
      plannerOutput,
    };
  }

  // Budget < 10% → observe-only (drop everything except summaries, which
  // were already handled above)
  if (budgetPercent < 10) {
    return {
      actions: plannerOutput.proposedActions.map((action) => ({
        action,
        decision: "drop",
        reason: "budget_observe_only",
      })),
      plannerOutput,
    };
  }

  // ── Evaluate each proposed action individually ──
  const results: PolicyActionResult[] = [];
  const confidence = plannerOutput.confidence;

  for (const action of plannerOutput.proposedActions) {
    const result = await evaluateAction({
      action,
      confidence,
      autonomyMode,
      orgId,
      scopeType: context.scopeType,
      scopeId: context.scopeId,
      isDm: context.isDm,
    });
    results.push(result);
  }

  return { actions: results, plannerOutput };
}

async function evaluateAction(input: {
  action: ProposedAction;
  confidence: number;
  autonomyMode: AutonomyMode;
  orgId: string;
  scopeType: string;
  scopeId: string;
  isDm?: boolean;
}): Promise<PolicyActionResult> {
  const { action, confidence, autonomyMode, orgId, scopeType, scopeId, isDm } = input;

  // ── Hard rule: unknown action → drop ──
  const registration = findAction(action.actionType);
  if (!registration) {
    return { action, decision: "drop", reason: "unknown_action" };
  }

  // ── Hard rule: blocked risk → drop ──
  // The registry currently uses "low" | "medium" | "high", but guard
  // against future "blocked" values.
  if ((registration.risk as string) === "blocked") {
    return { action, decision: "drop", reason: "blocked_action" };
  }

  // ── Look up thresholds ──
  const thresholds = getThresholds(registration.risk, autonomyMode);

  // ── Determine raw decision from matrix ──
  let decision: PolicyDecision;
  let reason: string;

  if (confidence >= thresholds.actMin) {
    decision = "execute";
    reason = `confidence_${confidence}_gte_act_${thresholds.actMin}`;
  } else if (confidence >= thresholds.suggestMin) {
    decision = "suggest";
    reason = `confidence_${confidence}_gte_suggest_${thresholds.suggestMin}`;
  } else {
    return { action, decision: "drop", reason: `confidence_${confidence}_below_suggest_${thresholds.suggestMin}` };
  }

  // ── Hard rule: not suggestable and only reached suggest threshold → drop ──
  if (decision === "suggest" && !registration.suggestable) {
    return { action, decision: "drop", reason: "not_suggestable" };
  }

  // ── Anti-chaos: dismissal cooldown by itemType (only for suggestions) ──
  if (decision === "suggest") {
    const itemType = mapActionToItemType(action.actionType);
    if (await isDismissalCooldownActive({ organizationId: orgId, scopeType, scopeId, itemType })) {
      return { action, decision: "drop", reason: "dismissal_cooldown" };
    }
  }

  // ── Anti-chaos: suggestion rate limit ──
  if (decision === "suggest") {
    if (isSuggestionRateLimited({ organizationId: orgId, scopeType, scopeId, isDm })) {
      return { action, decision: "drop", reason: "suggestion_rate_limited" };
    }
  }

  return { action, decision, reason };
}
