/**
 * Scope Adapter — encapsulates scope-specific behavior for the agent pipeline.
 *
 * Each scope type (chat, ticket, session, channel) has its own adapter that
 * provides scope-specific defaults and behaviors. The context builder, policy
 * engine, and aggregator use these adapters instead of hardcoded switches.
 *
 * Ticket: #21
 */

import type { AgentEvent } from "./router.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ScopeAdapter {
  /** The scope type this adapter handles. */
  readonly scopeType: string;

  /**
   * Build the aggregation scope key for an event.
   * Handles scope-specific sub-grouping (e.g., threads within a chat or channel).
   */
  buildScopeKey(event: AgentEvent): string;

  /**
   * Default autonomy mode for this scope type.
   * Used as a fallback when no scope/project/org override is set.
   */
  getDefaultAutonomyMode(): "observe" | "suggest" | "act";

  /**
   * Maximum unsolicited suggestions per scope key per hour.
   * 0 means no unsolicited suggestions are allowed.
   */
  getRateLimit(): number;
}

// ---------------------------------------------------------------------------
// Implementations
// ---------------------------------------------------------------------------

export const chatScopeAdapter: ScopeAdapter = {
  scopeType: "chat",

  buildScopeKey(event: AgentEvent): string {
    const parentMessageId = event.payload.parentMessageId as string | undefined;
    if (parentMessageId) {
      return `chat:${event.scopeId}:thread:${parentMessageId}`;
    }
    return `chat:${event.scopeId}`;
  },

  getDefaultAutonomyMode(): "observe" | "suggest" | "act" {
    // Chat-type defaults are further refined by DM vs group in scope-autonomy service
    return "suggest";
  },

  getRateLimit(): number {
    return 100;
  },
};

export const ticketScopeAdapter: ScopeAdapter = {
  scopeType: "ticket",

  buildScopeKey(event: AgentEvent): string {
    return `ticket:${event.scopeId}`;
  },

  getDefaultAutonomyMode(): "observe" | "suggest" | "act" {
    return "suggest";
  },

  getRateLimit(): number {
    return 100;
  },
};

export const sessionScopeAdapter: ScopeAdapter = {
  scopeType: "session",

  buildScopeKey(event: AgentEvent): string {
    return `session:${event.scopeId}`;
  },

  getDefaultAutonomyMode(): "observe" | "suggest" | "act" {
    return "suggest";
  },

  getRateLimit(): number {
    return 100;
  },
};

export const channelScopeAdapter: ScopeAdapter = {
  scopeType: "channel",

  buildScopeKey(event: AgentEvent): string {
    // Channel messages can be threaded — group by thread for aggregation
    const threadId = event.metadata?.threadId as string | undefined;
    if (threadId) {
      return `channel:${event.scopeId}:thread:${threadId}`;
    }
    return `channel:${event.scopeId}`;
  },

  getDefaultAutonomyMode(): "observe" | "suggest" | "act" {
    // Channels are team-visible — use org default (suggest by default)
    return "suggest";
  },

  getRateLimit(): number {
    // Max 2 suggestions per thread per hour for channels
    return 2;
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const adapters: Record<string, ScopeAdapter> = {
  chat: chatScopeAdapter,
  ticket: ticketScopeAdapter,
  session: sessionScopeAdapter,
  channel: channelScopeAdapter,
};

/**
 * Get the scope adapter for a given scope type.
 * Returns undefined for unknown scope types — callers should fall back to
 * generic behavior.
 */
export function getScopeAdapter(scopeType: string): ScopeAdapter | undefined {
  return adapters[scopeType];
}
