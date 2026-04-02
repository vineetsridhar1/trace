/**
 * Project domain actions — create, linkEntity, get
 */

import type { AgentActionRegistration, ActionDispatcher, EntityType } from "./types.js";
import { actorInfo } from "./types.js";

// ---------------------------------------------------------------------------
// Action registrations
// ---------------------------------------------------------------------------

export const projectActions: AgentActionRegistration[] = [
  {
    name: "project.create",
    service: "organizationService",
    method: "createProject",
    description:
      "Create a new project in the organization. Projects group related channels, tickets, and sessions.",
    catalogDescription: "Create/add/make a new project (name, description)",
    risk: "medium",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        name: { type: "string", description: "Project name", required: true },
        organizationId: { type: "string", description: "Organization ID", required: true },
        description: { type: "string", description: "Project description" },
      },
    },
    scopes: ["project", "channel", "chat", "system"],
  },
  {
    name: "project.linkEntity",
    service: "organizationService",
    method: "linkEntityToProject",
    description:
      "Link an entity (channel, ticket, session, repo) to a project for organizational grouping.",
    catalogDescription: "Link/associate an entity to a project (entityType, entityId, projectId)",
    risk: "low",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        entityType: {
          type: "string",
          description: "Type of entity to link",
          required: true,
          enum: ["channel", "ticket", "session", "repo"],
        },
        entityId: { type: "string", description: "ID of the entity to link", required: true },
        projectId: { type: "string", description: "Project to link the entity to", required: true },
      },
    },
    scopes: ["project", "channel", "ticket", "session"],
  },
  {
    name: "project.get",
    service: "organizationService",
    method: "getProject",
    description:
      "Get details about a specific project including linked entities.",
    catalogDescription: "Fetch/read/view project details (projectId)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        projectId: { type: "string", description: "The project to look up", required: true },
      },
    },
    scopes: ["project", "channel", "ticket", "session", "chat"],
  },
];

// ---------------------------------------------------------------------------
// Dispatchers
// ---------------------------------------------------------------------------

export const projectDispatchers: Record<string, ActionDispatcher> = {
  "project.create": (services, args, ctx) => {
    if (!services.organizationService) throw new Error("organizationService not available");
    const { actorType, actorId } = actorInfo(ctx);
    return services.organizationService.createProject(
      {
        name: args.name as string,
        organizationId: args.organizationId as string,
        description: args.description as string | undefined,
      },
      actorType,
      actorId,
    );
  },

  "project.linkEntity": (services, args, ctx) => {
    if (!services.organizationService) throw new Error("organizationService not available");
    const { actorType, actorId } = actorInfo(ctx);
    return services.organizationService.linkEntityToProject(
      args.entityType as EntityType,
      args.entityId as string,
      args.projectId as string,
      actorType,
      actorId,
    );
  },

  "project.get": (services, args, ctx) => {
    if (!services.organizationService) throw new Error("organizationService not available");
    return services.organizationService.getProject(args.projectId as string, ctx.organizationId);
  },
};
