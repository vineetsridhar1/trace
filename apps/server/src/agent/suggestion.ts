/**
 * Suggestion Delivery — creates InboxItems for policy-engine "suggest" decisions.
 *
 * When the policy engine routes an action to "suggest" (instead of "execute" or "drop"),
 * this module creates an InboxItem carrying the full proposed action so that a human
 * can accept, edit, or dismiss it.
 *
 * Ticket: #14
 * Dependencies: #07 (Action Executor), #12 (Policy Engine)
 */

import type { InboxItemType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { PolicyActionResult } from "./policy-engine.js";
import type { PlannerOutput } from "./planner.js";
import type { AgentContextPacket } from "./context-builder.js";
import { inboxService } from "../services/inbox.js";

// ---------------------------------------------------------------------------
// Action name → InboxItemType mapping
// ---------------------------------------------------------------------------

const ACTION_TO_ITEM_TYPE: Record<string, InboxItemType> = {
  "ticket.create": "ticket_suggestion",
  "ticket.update": "field_change_suggestion",
  "ticket.addComment": "comment_suggestion",
  "link.create": "link_suggestion",
  "session.start": "session_suggestion",
  "message.send": "message_suggestion",
};

function mapActionToItemType(actionType: string): InboxItemType {
  return ACTION_TO_ITEM_TYPE[actionType] ?? "agent_suggestion";
}

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
 */
export async function createSuggestion(input: CreateSuggestionInput) {
  const { policyResult, plannerOutput, context, agentId, userId } = input;
  const { action } = policyResult;

  const itemType = mapActionToItemType(action.actionType);
  const expiresAt = getExpiryTimestamp(itemType);

  const title =
    plannerOutput.userVisibleMessage ??
    generateTitle(action.actionType, action.args);

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

/**
 * Create InboxItems for all "suggest" decisions from a policy evaluation.
 * Returns the created inbox items.
 */
export async function createSuggestions(input: CreateSuggestionsInput) {
  const { suggestions, plannerOutput, context, agentId, userId } = input;

  const results = [];
  for (const policyResult of suggestions) {
    const item = await createSuggestion({
      policyResult,
      plannerOutput,
      context,
      agentId,
      userId,
    });
    results.push(item);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Title generation
// ---------------------------------------------------------------------------

function generateTitle(actionType: string, args: Record<string, unknown>): string {
  switch (actionType) {
    case "ticket.create":
      return `Suggested ticket: ${(args.title as string) || "New ticket"}`;
    case "ticket.update":
      return `Suggested update to ticket`;
    case "ticket.addComment":
      return `Suggested comment on ticket`;
    case "link.create":
      return `Suggested link between entities`;
    case "session.start":
      return `Suggested coding session`;
    case "message.send":
      return `Suggested message`;
    default:
      return `Agent suggestion: ${actionType}`;
  }
}
