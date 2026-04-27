/**
 * Memory domain actions — memory.search
 *
 * Allows the agent to search its derived memory store for past facts,
 * decisions, preferences, patterns, and relationships.
 */

import type { AgentActionRegistration, ActionDispatcher } from "./types.js";

// ---------------------------------------------------------------------------
// Action registrations
// ---------------------------------------------------------------------------

export const memoryActions: AgentActionRegistration[] = [
  {
    name: "memory.search",
    service: "memoryService",
    method: "search",
    description:
      "Search the agent's long-term memory for past facts, decisions, preferences, patterns, and relationships. " +
      "Use this to recall information from previous conversations or events.",
    catalogDescription:
      "Search/recall past facts, decisions, preferences from memory (query, subjectType?, kind?)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        query: {
          type: "string",
          description: "Text query to search memories for",
          required: true,
        },
        subjectType: {
          type: "string",
          description: "Filter by subject type",
          enum: ["user", "project", "repo", "team", "channel", "ticket", "session"],
        },
        kind: {
          type: "string",
          description: "Filter by memory kind",
          enum: ["fact", "preference", "decision", "pattern", "relationship"],
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default 20, max 50)",
        },
      },
    },
    scopes: ["chat", "channel", "ticket", "session", "project", "system"],
  },
];

// ---------------------------------------------------------------------------
// Dispatchers
// ---------------------------------------------------------------------------

export const memoryDispatchers: Record<string, ActionDispatcher> = {
  "memory.search": (services, args, ctx) => {
    if (!services.memoryService) {
      return Promise.resolve({ error: "Memory service not available" });
    }
    return services.memoryService.search({
      organizationId: ctx.organizationId,
      query: args.query as string,
      subjectType: args.subjectType as string | undefined,
      kind: args.kind as import("@prisma/client").MemoryKind | undefined,
      limit: typeof args.limit === "number" ? args.limit : undefined,
      scopeType: ctx.scopeType as import("@prisma/client").ScopeType | undefined,
      scopeId: ctx.scopeId,
      isDm: ctx.isDm,
    });
  },
};
