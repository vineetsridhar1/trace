/**
 * Read domain actions — events.query, users.search, org.listMembers, org.listProjects, org.listRepos, users.getProfile
 */

import type { ScopeType } from "@trace/gql";
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
        limit: {
          type: "number",
          description: "Maximum number of events to return (default 20, max 50)",
        },
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
        query: {
          type: "string",
          description: "Search query to match against user names and emails",
          required: true,
        },
      },
    },
    scopes: ["chat", "channel", "ticket", "session", "project"],
  },
  {
    name: "users.getProfile",
    service: "organizationService",
    method: "getUserProfile",
    description: "Get a user's profile by ID including name, email, and avatar.",
    catalogDescription: "Fetch/view a user's profile by ID (userId)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        userId: { type: "string", description: "The user ID to look up", required: true },
      },
    },
    scopes: ["chat", "channel", "ticket", "session", "project"],
  },
  {
    name: "org.listProjects",
    service: "organizationService",
    method: "listProjects",
    description: "List all projects in the organization. Optionally filter by repo.",
    catalogDescription: "List/browse all projects in the org (repoId)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        repoId: { type: "string", description: "Filter projects by repository ID" },
      },
    },
    scopes: ["chat", "channel", "ticket", "session", "project", "system"],
  },
  {
    name: "org.listRepos",
    service: "organizationService",
    method: "listRepos",
    description: "List all repositories connected to the organization.",
    catalogDescription: "List/browse all repos in the org",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {},
    },
    scopes: ["chat", "channel", "ticket", "session", "project", "system"],
  },
];

// ---------------------------------------------------------------------------
// Dispatchers
// ---------------------------------------------------------------------------

export const readDispatchers: Record<string, ActionDispatcher> = {
  "events.query": (services, args, ctx) => {
    const limit = Math.min(typeof args.limit === "number" ? args.limit : 20, 50);
    return services.eventService.query(ctx.organizationId, {
      scopeType: args.scopeType as ScopeType | undefined,
      scopeId: args.scopeId as string,
      limit,
    });
  },

  "users.search": (services, args, ctx) => {
    return services.organizationService.searchUsers(args.query as string, ctx.organizationId);
  },

  "users.getProfile": (services, args) => {
    return services.organizationService.getUserProfile(args.userId as string);
  },

  "org.listProjects": (services, args, ctx) => {
    return services.organizationService.listProjects(
      ctx.organizationId,
      args.repoId as string | undefined,
    );
  },

  "org.listRepos": (services, _args, ctx) => {
    return services.organizationService.listRepos(ctx.organizationId);
  },
};
