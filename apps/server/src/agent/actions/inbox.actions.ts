/**
 * Inbox domain actions — escalate.toHuman, suggestion.query
 */

import type { AgentActionRegistration, ActionDispatcher } from "./types.js";

// ---------------------------------------------------------------------------
// Action registrations
// ---------------------------------------------------------------------------

export const inboxActions: AgentActionRegistration[] = [
  {
    name: "escalate.toHuman",
    service: "inboxService",
    method: "createItem",
    description:
      "Escalate to a human by creating an inbox notification. Use when the agent encounters something it cannot handle confidently and needs human judgment or intervention.",
    catalogDescription: "Escalate/notify/alert a human for help (userId, title, summary)",
    risk: "low",
    suggestable: false,
    tier: "core",
    parameters: {
      fields: {
        userId: { type: "string", description: "The user to notify", required: true },
        title: { type: "string", description: "Short title for the escalation", required: true },
        summary: { type: "string", description: "Detailed explanation of what needs attention" },
        sourceType: { type: "string", description: "Type of entity that triggered the escalation", required: true },
        sourceId: { type: "string", description: "ID of the entity that triggered the escalation", required: true },
      },
    },
    scopes: ["chat", "channel", "ticket", "session", "project", "system"],
  },
  {
    name: "suggestion.query",
    service: "inboxService",
    method: "listAgentSuggestions",
    description:
      "Query the agent's own pending suggestions (inbox items). Use to check whether a suggestion was already made, " +
      "whether it was accepted or dismissed, or to avoid creating duplicate suggestions. " +
      "Returns inbox items with their status (active, resolved, expired) and payload.",
    catalogDescription: "List/check/query pending agent suggestions (status, limit)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        status: {
          type: "string",
          description: "Filter by status",
          enum: ["active", "resolved"],
        },
        limit: { type: "number", description: "Maximum number of results to return (default 10, max 25)" },
      },
    },
    scopes: ["chat", "channel", "ticket", "session", "project"],
  },
];

// ---------------------------------------------------------------------------
// Dispatchers
// ---------------------------------------------------------------------------

export const inboxDispatchers: Record<string, ActionDispatcher> = {
  "escalate.toHuman": (services, args, ctx) => {
    return services.inboxService.createItem({
      orgId: ctx.organizationId,
      userId: args.userId as string,
      itemType: (args.itemType as Parameters<typeof services.inboxService.createItem>[0]["itemType"]) ?? "agent_escalation",
      title: args.title as string,
      summary: args.summary as string | undefined,
      payload: args.payload as Parameters<typeof services.inboxService.createItem>[0]["payload"],
      sourceType: args.sourceType as string,
      sourceId: args.sourceId as string,
    });
  },

  "suggestion.query": (services, args, ctx) => {
    const limit = Math.min(typeof args.limit === "number" ? args.limit : 10, 25);
    return services.inboxService.listAgentSuggestions(ctx.organizationId, {
      status: args.status as "active" | "resolved" | undefined,
      limit,
    });
  },
};
