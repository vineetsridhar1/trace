/**
 * Suggestion Delivery — creates InboxItems for policy-engine "suggest" decisions.
 *
 * When the policy engine routes an action to "suggest" (instead of "execute" or "drop"),
 * this module creates an InboxItem carrying the full proposed action so that a human
 * can accept, edit, or dismiss it.
 *
 * Includes semantic deduplication: before creating a suggestion, checks for existing
 * active suggestions with the same item type in the same scope and compares titles
 * using Levenshtein distance. Duplicates are suppressed and logged.
 *
 * Ticket: #14, #19
 * Dependencies: #07 (Action Executor), #12 (Policy Engine)
 */

import type { InboxItemType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { PolicyActionResult } from "./policy-engine.js";
import type { PlannerOutput } from "./planner.js";
import type { AgentContextPacket } from "./context-builder.js";
import { inboxService } from "../services/inbox.js";
import { mapActionToItemType } from "./action-types.js";

export { mapActionToItemType } from "./action-types.js";

// ---------------------------------------------------------------------------
// Expiry defaults (milliseconds)
// ---------------------------------------------------------------------------

const EXPIRY_DEFAULTS_MS: Partial<Record<InboxItemType, number>> = {
  ticket_suggestion: 72 * 60 * 60 * 1000,       // 72h
  field_change_suggestion: 72 * 60 * 60 * 1000,  // 72h
  comment_suggestion: 48 * 60 * 60 * 1000,       // 48h
  link_suggestion: 48 * 60 * 60 * 1000,          // 48h
  session_suggestion: 24 * 60 * 60 * 1000,       // 24h
  message_suggestion: 24 * 60 * 60 * 1000,       // 24h
  agent_suggestion: 48 * 60 * 60 * 1000,         // 48h
};

const DEFAULT_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48h

function getExpiryTimestamp(itemType: InboxItemType): string {
  const ms = EXPIRY_DEFAULTS_MS[itemType] ?? DEFAULT_EXPIRY_MS;
  return new Date(Date.now() + ms).toISOString();
}

// ---------------------------------------------------------------------------
// Semantic deduplication — Levenshtein similarity
// ---------------------------------------------------------------------------

const DEDUP_SIMILARITY_THRESHOLD = 0.7;

/**
 * Compute Levenshtein distance between two strings.
 * Uses the classic dynamic-programming approach with O(min(a,b)) space.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure `a` is the shorter string for O(min) space
  if (a.length > b.length) [a, b] = [b, a];

  const aLen = a.length;
  const bLen = b.length;
  let prev = new Array<number>(aLen + 1);
  let curr = new Array<number>(aLen + 1);

  for (let i = 0; i <= aLen; i++) prev[i] = i;

  for (let j = 1; j <= bLen; j++) {
    curr[0] = j;
    for (let i = 1; i <= aLen; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        prev[i] + 1,     // deletion
        curr[i - 1] + 1, // insertion
        prev[i - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[aLen];
}

/**
 * Compute similarity between two strings as a ratio in [0, 1].
 * 1.0 = identical, 0.0 = completely different.
 */
export function titleSimilarity(a: string, b: string): number {
  const aNorm = a.toLowerCase().trim();
  const bNorm = b.toLowerCase().trim();
  const maxLen = Math.max(aNorm.length, bNorm.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(aNorm, bNorm) / maxLen;
}

export interface DedupResult {
  isDuplicate: boolean;
  existingId?: string;
  existingTitle?: string;
  similarity?: number;
}

// ---------------------------------------------------------------------------
// Suggestion payload shape
// ---------------------------------------------------------------------------

export interface SuggestionPayload {
  actionType: string;
  args: Record<string, unknown>;
  confidence: number;
  triggerEventId: string;
  agentId: string;
  rationaleSummary: string;
  expiresAt: string;
  /** Scope where the suggestion originated — used for dismissal cooldown. */
  scopeType: string;
  scopeId: string;
}

// ---------------------------------------------------------------------------
// Create suggestion
// ---------------------------------------------------------------------------

export interface CreateSuggestionInput {
  policyResult: PolicyActionResult;
  plannerOutput: PlannerOutput;
  context: AgentContextPacket;
  agentId: string;
  /** The user to notify. Caller determines the best recipient. */
  userId: string;
}

/**
 * Create an InboxItem representing a suggestion from the agent.
 * Called by the agent pipeline when the policy engine returns "suggest".
 *
 * Before creating, checks for semantic duplicates — active suggestions of the
 * same item type in the same scope whose action-derived title is similar
 * (Levenshtein ≥ 0.7). Returns null if the suggestion is suppressed as a duplicate.
 */
export async function createSuggestion(input: CreateSuggestionInput) {
  const { policyResult, plannerOutput, context, agentId, userId } = input;
  const { action } = policyResult;

  const itemType = mapActionToItemType(action.actionType);
  const expiresAt = getExpiryTimestamp(itemType);
  const generatedTitle = generateTitle(action.actionType, action.args);

  const title =
    plannerOutput.userVisibleMessage ??
    generatedTitle;

  // ── Semantic dedup: check for existing similar suggestions ──
  const dedup = await checkDuplicate({
    orgId: context.organizationId,
    scopeType: context.scopeType,
    scopeId: context.scopeId,
    itemType,
    title: generatedTitle,
  });

  if (dedup.isDuplicate) {
    console.log(
      `[suggestion-dedup] suppressed duplicate suggestion`,
      JSON.stringify({
        itemType,
        title,
        existingId: dedup.existingId,
        existingTitle: dedup.existingTitle,
        similarity: dedup.similarity?.toFixed(3),
        scopeType: context.scopeType,
        scopeId: context.scopeId,
        orgId: context.organizationId,
      }),
    );
    return null;
  }

  const payload: SuggestionPayload = {
    actionType: action.actionType,
    args: action.args,
    confidence: plannerOutput.confidence,
    triggerEventId: context.triggerEvent.id,
    agentId,
    rationaleSummary: plannerOutput.rationaleSummary,
    expiresAt,
    scopeType: context.scopeType,
    scopeId: context.scopeId,
  };

  return inboxService.createItem({
    orgId: context.organizationId,
    userId,
    itemType,
    title,
    summary: plannerOutput.rationaleSummary,
    payload: payload as unknown as Prisma.InputJsonValue,
    sourceType: "agent_suggestion",
    sourceId: context.triggerEvent.id,
  });
}

/**
 * Check if a semantically similar suggestion already exists.
 * Queries active suggestions of the same item type whose payload matches
 * the same scope, then compares action-derived titles via Levenshtein similarity.
 */
async function checkDuplicate(input: {
  orgId: string;
  scopeType: string;
  scopeId: string;
  itemType: InboxItemType;
  title: string;
}): Promise<DedupResult> {
  const existing = await inboxService.findActiveSuggestionsByScope({
    orgId: input.orgId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    itemType: input.itemType,
  });

  for (const item of existing) {
    const similarity = titleSimilarity(
      input.title,
      getDedupComparisonTitle(item),
    );
    if (similarity >= DEDUP_SIMILARITY_THRESHOLD) {
      return {
        isDuplicate: true,
        existingId: item.id,
        existingTitle: item.title,
        similarity,
      };
    }
  }

  return { isDuplicate: false };
}

// ---------------------------------------------------------------------------
// Batch create suggestions
// ---------------------------------------------------------------------------

export interface CreateSuggestionsInput {
  suggestions: PolicyActionResult[];
  plannerOutput: PlannerOutput;
  context: AgentContextPacket;
  agentId: string;
  userId: string;
}

export interface CreatedSuggestionRecord {
  actionType: string;
  itemId: string;
  itemType: InboxItemType;
}

export interface SuppressedSuggestionRecord {
  actionType: string;
  reason: "duplicate_suppressed";
}

export interface CreateSuggestionsResult {
  created: CreatedSuggestionRecord[];
  suppressed: SuppressedSuggestionRecord[];
}

/**
 * Create InboxItems for all "suggest" decisions from a policy evaluation.
 * Returns both created suggestions and duplicates that were suppressed.
 */
export async function createSuggestions(input: CreateSuggestionsInput) {
  const { suggestions, plannerOutput, context, agentId, userId } = input;

  const created: CreatedSuggestionRecord[] = [];
  const suppressed: SuppressedSuggestionRecord[] = [];
  for (const policyResult of suggestions) {
    const item = await createSuggestion({
      policyResult,
      plannerOutput,
      context,
      agentId,
      userId,
    });
    if (item) {
      created.push({
        actionType: policyResult.action.actionType,
        itemId: item.id,
        itemType: item.itemType,
      });
    } else {
      suppressed.push({
        actionType: policyResult.action.actionType,
        reason: "duplicate_suppressed",
      });
    }
  }
  return { created, suppressed };
}

// ---------------------------------------------------------------------------
// Title generation
// ---------------------------------------------------------------------------

/**
 * Generate a dedup-friendly title that includes distinguishing content.
 * This title is used for Levenshtein comparison — it must include enough
 * detail to differentiate suggestions of the same type with different content.
 */
function generateTitle(actionType: string, args: Record<string, unknown>): string {
  switch (actionType) {
    case "ticket.create":
      return `Suggested ticket: ${(args.title as string) || "New ticket"}`;
    case "ticket.update": {
      const ticketId = (args.id as string) || "";
      const fields = Object.keys(args).filter((k) => k !== "id").join(", ");
      return `Suggested update to ticket ${ticketId}: ${fields || "fields"}`.trim();
    }
    case "ticket.addComment": {
      const preview = typeof args.text === "string" ? args.text.slice(0, 80) : "";
      return `Suggested comment on ticket ${(args.ticketId as string) || ""}: ${preview}`.trim();
    }
    case "link.create":
      return `Suggested link: ${(args.entityType as string) || ""} ${(args.entityId as string) || ""}`.trim();
    case "session.start": {
      const prompt = typeof args.prompt === "string" ? args.prompt.slice(0, 120) : "";
      return `Suggested coding session: ${prompt || "no prompt"}`;
    }
    case "message.send":
    case "channel.sendMessage":
    case "message.sendToChannel": {
      const text = typeof args.text === "string" ? args.text.slice(0, 200) : "";
      return `Suggested message: ${text || "no content"}`;
    }
    default:
      return `Agent suggestion: ${actionType}`;
  }
}

function getDedupComparisonTitle(item: {
  title: string;
  payload?: unknown;
}): string {
  const payload =
    item.payload && typeof item.payload === "object"
      ? item.payload as Record<string, unknown>
      : null;
  const actionType = typeof payload?.actionType === "string" ? payload.actionType : null;
  const args =
    payload?.args && typeof payload.args === "object"
      ? payload.args as Record<string, unknown>
      : null;

  if (actionType && args) {
    return generateTitle(actionType, args);
  }

  return item.title;
}
