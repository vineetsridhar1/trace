/**
 * Event Router — first stage of the agent pipeline.
 *
 * Makes cheap, deterministic decisions about which events to process.
 * No LLM calls — pure code. Returns one of: drop, aggregate, direct.
 *
 * Ticket: #04
 */

import type { OrgAgentSettings } from "../services/agent-identity.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RoutingDecision = "drop" | "aggregate" | "direct";

export interface RoutingResult {
  decision: RoutingDecision;
  reason: string;
  /** Max planner tier allowed (undefined = no restriction) */
  maxTier?: number;
}

export interface AgentEvent {
  id: string;
  organizationId: string;
  scopeType: string;
  scopeId: string;
  eventType: string;
  actorType: string;
  actorId: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/** Interface for cost tracking — will be implemented by ticket #08 */
export interface CostTracker {
  /** Returns remaining budget as a fraction (0.0 to 1.0) */
  getRemainingBudgetFraction(organizationId: string): number;
}

// ---------------------------------------------------------------------------
// Routing rules — adding a new event type is a one-line change
// ---------------------------------------------------------------------------

/**
 * Events routed directly to the planner (bypass aggregation).
 * Map of eventType -> predicate on the event. If predicate returns true, route direct.
 */
const DIRECT_RULES: Record<string, (event: AgentEvent, agentId: string) => boolean> = {
  ticket_assigned: (event, agentId) => {
    const assigneeId = event.payload.assigneeId;
    return typeof assigneeId === "string" && assigneeId === agentId;
  },
  session_terminated: (event) => event.payload.needsInput === true,
  session_paused: (event) => event.payload.needsInput === true,
  message_sent: (event, agentId) => {
    const mentions = event.payload.mentions;
    return (
      Array.isArray(mentions) &&
      mentions.some((m) => typeof m === "object" && m !== null && (m as Record<string, unknown>).userId === agentId)
    );
  },
};

// ---------------------------------------------------------------------------
// Tier 3 promotion rules — events that warrant the premium (Opus-class) model.
// When matched, maxTier is set to 3 so the pipeline skips Tier 2 entirely.
// ---------------------------------------------------------------------------

/**
 * Determine whether an event should be promoted to Tier 3.
 * Returns true if the event matches a Tier 3 trigger condition.
 */
function shouldPromoteToTier3(event: AgentEvent, agentId: string): boolean {
  // 1. Ticket assigned directly to the agent → Tier 3
  if (event.eventType === "ticket_assigned") {
    const assigneeId = event.payload.assigneeId;
    if (typeof assigneeId === "string" && assigneeId === agentId) return true;
  }

  // 2. Ticket with priority "urgent" or "high" (created or updated)
  if (event.eventType === "ticket_created" || event.eventType === "ticket_updated") {
    const priority = event.payload.priority;
    if (priority === "urgent" || priority === "high") return true;
  }

  // 3. Explicit @mention of the agent in a non-DM message (complex question indicator).
  //    DM messages are excluded — they default to Tier 2 and only promote via
  //    model-requested escalation (promotionReason). This avoids wasting Opus-class
  //    tokens on simple DM queries like "what's the status of TK-142?".
  if (event.eventType === "message_sent" && event.scopeType === "chat") {
    const chatType = getAgentChatType(event.organizationId, event.scopeId);
    if (chatType !== "dm") {
      const mentions = event.payload.mentions;
      if (
        Array.isArray(mentions) &&
        mentions.some(
          (m) => typeof m === "object" && m !== null && (m as Record<string, unknown>).userId === agentId,
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Events that should be aggregated (batched before planner).
 * Simple set — if the event type is here and not direct, it's aggregated.
 */
const AGGREGATE_EVENT_TYPES = new Set<string>([
  "message_sent",
  "message_edited",
  "ticket_created",
  "ticket_updated",
  "ticket_commented",
  "session_output",
]);

/**
 * Low-value events that are always dropped.
 */
const LOW_VALUE_EVENT_TYPES = new Set<string>([
  "inbox_item_created",
  "inbox_item_resolved",
]);

/**
 * Self-trigger allowlist: event type + scope type combos where the agent
 * should still observe its own events (e.g., monitoring sessions it started).
 */
const SELF_TRIGGER_ALLOWLIST = new Set<string>([
  "session_output:session",
  "session_terminated:session",
  "session_paused:session",
]);

// ---------------------------------------------------------------------------
// Chat membership gate
// ---------------------------------------------------------------------------

export type ChatType = "dm" | "group";

/**
 * Tracks which chats the agent is a member of, per org.
 * Key: orgId, Value: Map of chatId → chat type ("dm" | "group").
 */
const chatMemberships = new Map<string, Map<string, ChatType>>();

/**
 * Update chat membership based on membership events.
 * Called by the agent worker for every event before routing.
 *
 * Handles three event types:
 * - `chat_created`: The initial members are embedded in the payload. If the
 *   agent is one of them, register the chat (this is how DM creation works —
 *   ChatService.create() emits chat_created but not individual chat_member_added).
 * - `chat_member_added`: A member was added after creation.
 * - `chat_member_removed`: A member left or was removed.
 *
 * Falls back to "group" if the chat type cannot be determined.
 */
export function updateChatMembership(event: AgentEvent, agentId: string): void {
  if (event.eventType === "chat_created") {
    // chat_created includes all initial members in payload.chat.members
    const chat = event.payload.chat as Record<string, unknown> | undefined;
    if (!chat) return;
    const members = chat.members as Array<{ user?: { id?: string } }> | undefined;
    if (!Array.isArray(members)) return;
    const isAgentMember = members.some(
      (m) => m?.user?.id === agentId,
    );
    if (isAgentMember) {
      let chats = chatMemberships.get(event.organizationId);
      if (!chats) {
        chats = new Map();
        chatMemberships.set(event.organizationId, chats);
      }
      const chatType = (chat.type === "dm" ? "dm" : "group") as ChatType;
      chats.set(event.scopeId, chatType);
    }
  } else if (event.eventType === "chat_member_added") {
    const userId = event.payload.userId as string | undefined;
    if (userId === agentId) {
      let chats = chatMemberships.get(event.organizationId);
      if (!chats) {
        chats = new Map();
        chatMemberships.set(event.organizationId, chats);
      }
      // Infer chat type from payload if available
      const chatType = inferChatTypeFromPayload(event) ?? "group";
      chats.set(event.scopeId, chatType);
    }
  } else if (event.eventType === "chat_member_removed") {
    const userId = event.payload.userId as string | undefined;
    if (userId === agentId) {
      const chats = chatMemberships.get(event.organizationId);
      if (chats) {
        chats.delete(event.scopeId);
      }
    }
  }
}

/**
 * Try to infer chat type from a chat_member_added event's payload.
 * The chat_created event includes `chat.type` directly. For other membership
 * events where the type can't be determined, returns null and the caller
 * falls back to "group" (the safer default — group behavior is more
 * conservative than DM behavior).
 */
function inferChatTypeFromPayload(event: AgentEvent): ChatType | null {
  // chat_created payload includes chat.type directly
  const chat = event.payload.chat as Record<string, unknown> | undefined;
  if (chat && typeof chat.type === "string") {
    return chat.type === "dm" ? "dm" : "group";
  }
  return null;
}

export function isAgentChatMember(orgId: string, chatId: string): boolean {
  return chatMemberships.get(orgId)?.has(chatId) ?? false;
}

/** Get the chat type for a chat the agent is a member of. */
export function getAgentChatType(orgId: string, chatId: string): ChatType | null {
  return chatMemberships.get(orgId)?.get(chatId) ?? null;
}

/** Seed chat memberships from the database on startup (with chat types). */
export function seedChatMemberships(
  orgId: string,
  chats: Array<{ chatId: string; type: ChatType }>,
): void {
  const map = new Map<string, ChatType>();
  for (const chat of chats) {
    map.set(chat.chatId, chat.type);
  }
  chatMemberships.set(orgId, map);
}

/** Clear all memberships (for testing) */
export function clearChatMemberships(): void {
  chatMemberships.clear();
}

// ---------------------------------------------------------------------------
// Rate limiter per scope
// ---------------------------------------------------------------------------

interface ScopeRateState {
  count: number;
  windowStart: number;
}

const RATE_LIMIT_WINDOW_MS = 10_000; // 10 seconds
const RATE_LIMIT_MAX_EVENTS = 20; // max events per scope per window

/** Per-scope rate tracking. Key: "orgId:scopeType:scopeId" */
const scopeRates = new Map<string, ScopeRateState>();

function scopeRateKey(event: AgentEvent): string {
  return `${event.organizationId}:${event.scopeType}:${event.scopeId}`;
}

/**
 * Check if a scope is rate-limited. Returns true if the event should be coalesced.
 * Increments the counter as a side effect.
 */
function isRateLimited(event: AgentEvent): boolean {
  const key = scopeRateKey(event);
  const now = Date.now();
  const state = scopeRates.get(key);

  if (!state || now - state.windowStart > RATE_LIMIT_WINDOW_MS) {
    // New window
    scopeRates.set(key, { count: 1, windowStart: now });
    return false;
  }

  state.count++;
  return state.count > RATE_LIMIT_MAX_EVENTS;
}

/** Periodically clean up stale rate limit entries */
export function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [key, state] of scopeRates) {
    if (now - state.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      scopeRates.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Cost budget degradation
// ---------------------------------------------------------------------------

/**
 * Default cost tracker — returns full budget. The agent worker should replace
 * this with a CachedCostTracker that polls CostTrackingService periodically
 * (e.g., every 30s) and converts remainingPercent (0-100) to a fraction (0.0-1.0).
 */
const defaultCostTracker: CostTracker = {
  getRemainingBudgetFraction: () => 1.0,
};

let activeCostTracker: CostTracker = defaultCostTracker;

export function setCostTracker(tracker: CostTracker): void {
  activeCostTracker = tracker;
}

function getCostBudgetTier(remaining: number): RoutingResult | null {
  if (remaining <= 0) {
    return { decision: "drop", reason: "cost_budget_exhausted" };
  }
  if (remaining < 0.1) {
    // Observe-only: only allow silent enrichment (summaries), drop suggestions/actions
    // For now, drop everything — ticket #09 (entity summaries) will add the enrichment path
    return { decision: "drop", reason: "cost_budget_observe_only" };
  }
  // remaining >= 0.1: normal or suppress-tier3 — handled by maxTier annotation
  return null;
}

function getMaxTier(remaining: number): number | undefined {
  if (remaining < 0.5) return 2; // suppress Tier 3 promotions
  return undefined; // no restriction
}

// ---------------------------------------------------------------------------
// Main routing function
// ---------------------------------------------------------------------------

export function routeEvent(
  event: AgentEvent,
  settings: OrgAgentSettings,
): RoutingResult {
  const agentId = settings.agentId;

  // 1. Org AI disabled
  if (settings.status === "disabled") {
    return { decision: "drop", reason: "org_ai_disabled" };
  }

  // 2. Cost budget — exhausted or observe-only
  const budgetFraction = activeCostTracker.getRemainingBudgetFraction(event.organizationId);
  const budgetResult = getCostBudgetTier(budgetFraction);
  if (budgetResult) {
    return budgetResult;
  }

  // 3. Self-trigger suppression
  if (event.actorType === "agent" && event.actorId === agentId) {
    const allowKey = `${event.eventType}:${event.scopeType}`;
    if (!SELF_TRIGGER_ALLOWLIST.has(allowKey)) {
      return { decision: "drop", reason: "self_trigger" };
    }
  }

  // 4. Low-value events
  if (LOW_VALUE_EVENT_TYPES.has(event.eventType)) {
    return { decision: "drop", reason: "low_value_event" };
  }

  // 5. Chat membership gate — drop chat-scoped events if agent not a member
  if (event.scopeType === "chat") {
    // Always process membership events (they update the gate itself)
    const isMembershipEvent =
      event.eventType === "chat_member_added" ||
      event.eventType === "chat_member_removed" ||
      event.eventType === "chat_created";
    if (!isMembershipEvent) {
      if (!isAgentChatMember(event.organizationId, event.scopeId)) {
        return { decision: "drop", reason: "not_chat_member" };
      }
    }
  }

  // 6. Rate limiting per scope
  if (isRateLimited(event)) {
    return { decision: "drop", reason: "rate_limited" };
  }

  const budgetMaxTier = getMaxTier(budgetFraction);

  // Determine Tier 3 promotion — overrides budget-based maxTier only upward
  const tier3Promoted = shouldPromoteToTier3(event, agentId);
  const maxTier = tier3Promoted
    ? (budgetMaxTier === 2 ? 2 : 3) // respect budget suppression
    : budgetMaxTier;

  // 7a. DM direct routing — all messages in DMs bypass aggregation
  if (event.scopeType === "chat" && event.eventType === "message_sent") {
    const chatType = getAgentChatType(event.organizationId, event.scopeId);
    if (chatType === "dm") {
      return { decision: "direct", reason: "direct:dm_message", maxTier };
    }
  }

  // 7b. Direct routing — check if this event should bypass aggregation
  const directRule = DIRECT_RULES[event.eventType];
  if (directRule && directRule(event, agentId)) {
    return { decision: "direct", reason: `direct:${event.eventType}`, maxTier };
  }

  // 8. Aggregate routing
  if (AGGREGATE_EVENT_TYPES.has(event.eventType)) {
    return { decision: "aggregate", reason: `aggregate:${event.eventType}`, maxTier };
  }

  // 9. Default: drop (conservative — new event types must be explicitly opted in)
  return { decision: "drop", reason: "no_matching_rule" };
}
