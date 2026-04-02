/**
 * Read domain actions — events.query, users.search
 */

import type { AgentActionRegistration, ActionDispatcher } from "./types.js";

// ---------------------------------------------------------------------------
// Action registrations
// ---------------------------------------------------------------------------

export const readActions: AgentActionRegistration[] = [
  {
    name: "events.query",
    service: "eventService",
    method: "query",
    description:
      "Search and list recent events in a scope. Use to understand what happened recently in a channel, ticket, session, or chat.",
    catalogDescription: "Search/list/fetch recent events in a scope (scopeType, scopeId, limit)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        scopeType: {
          type: "string",
          description: "Type of scope to query events from",
          required: true,
          enum: ["chat", "channel", "ticket", "session"],
        },
        scopeId: { type: "string", description: "ID of the scope", required: true },
        limit: { type: "number", description: "Maximum number of events to return (default 20, max 50)" },
      },
    },
    scopes: ["chat", "channel", "ticket", "session", "project"],
  },
  {
    name: "users.search",
    service: "organizationService",
    method: "searchUsers",
    description:
      "Search for users in the organization by name or email. Use to find user IDs for assigning tickets, adding to chats, etc.",
    catalogDescription: "Search/find/lookup users by name or email (query)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        query: { type: "string", description: "Search query to match against user names and emails", required: true },
      },
    },
    scopes: ["chat", "channel", "ticket", "session", "project"],
  },
];

// ---------------------------------------------------------------------------
// Dispatchers
// ---------------------------------------------------------------------------

export const readDispatchers: Record<string, ActionDispatcher> = {
  "events.query": (services, args, ctx) => {
    if (!services.eventService) throw new Error("eventService not available");
    const limit = Math.min(typeof args.limit === "number" ? args.limit : 20, 50);
    return services.eventService.query(ctx.organizationId, {
      scopeType: args.scopeType as string,
      scopeId: args.scopeId as string,
      limit,
    });
  },

  "users.search": (services, args, ctx) => {
    if (!services.organizationService) throw new Error("organizationService not available");
    return services.organizationService.searchUsers(
      args.query as string,
      ctx.organizationId,
    );
  },
};
