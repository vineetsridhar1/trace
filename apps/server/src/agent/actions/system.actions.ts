/**
 * System domain actions — no_op, summary.update
 */

import type { AgentActionRegistration, ActionDispatcher } from "./types.js";
import { EMPTY_PARAMS } from "./types.js";

// ---------------------------------------------------------------------------
// Action registrations
// ---------------------------------------------------------------------------

export const systemActions: AgentActionRegistration[] = [
  {
    name: "summary.update",
    service: "summaryService",
    method: "upsert",
    description:
      "Update or create a rolling summary for an entity. Used for silent enrichment — keeping entity summaries up to date as new events occur. This action is never surfaced as a suggestion.",
    catalogDescription: "Update/refresh an entity's rolling summary (entityType, entityId, summary)",
    risk: "low",
    suggestable: false,
    tier: "core",
    parameters: {
      fields: {
        entityType: {
          type: "string",
          description: "The type of entity to summarize",
          required: true,
          enum: ["chat", "channel", "ticket", "session"],
        },
        entityId: { type: "string", description: "The ID of the entity to summarize", required: true },
        summary: { type: "string", description: "The updated summary text", required: true },
      },
    },
    scopes: ["chat", "channel", "ticket", "session"],
  },
  {
    name: "no_op",
    service: "",
    method: "",
    description:
      "Do nothing. Most events require no action. Choose this when uncertain, when the event is informational, or when acting would not clearly benefit the team. This is the default and most common choice — prefer no_op over low-confidence actions.",
    catalogDescription: "Do nothing — the default and most common choice",
    risk: "low",
    suggestable: false,
    tier: "core",
    parameters: EMPTY_PARAMS,
    scopes: ["chat", "channel", "ticket", "session", "project", "system"],
  },
];

// ---------------------------------------------------------------------------
// Dispatchers
// ---------------------------------------------------------------------------

export const systemDispatchers: Record<string, ActionDispatcher> = {
  "summary.update": (services, args, ctx) => {
    const svc = services.summaryService;
    if (!svc) {
      throw new Error("summaryService is not yet available");
    }
    return svc.upsert({
      entityType: args.entityType,
      entityId: args.entityId,
      summary: args.summary,
      organizationId: ctx.organizationId,
      actorType: "agent",
      actorId: ctx.agentId,
    });
  },

  // no_op is handled directly in the executor (short-circuit before dispatch)
  "no_op": async () => undefined,
};
