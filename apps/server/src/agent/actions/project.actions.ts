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
    catalogDescription: "Create/add/make a new project (name, repoId)",
    risk: "medium",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        name: { type: "string", description: "Project name", required: true },
        repoId: { type: "string", description: "Repository to associate the project with" },
      },
    },
    scopes: ["project", "channel", "chat", "system"],
  },
  {
    name: "project.linkEntity",
    service: "organizationService",
    method: "linkEntityToProject",
    description:
      "Link an entity (channel, ticket, or session) to a project for organizational grouping.",
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
          enum: ["channel", "ticket", "session"],
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
    const { actorType, actorId } = actorInfo(ctx);
    return services.organizationService.createProject(
      {
        name: args.name as string,
        organizationId: ctx.organizationId,
        repoId: args.repoId as string | undefined,
      },
      ctx.organizationId,
      actorType,
      actorId,
    );
  },

  "project.linkEntity": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.organizationService.linkEntityToProject(
      args.entityType as EntityType,
      args.entityId as string,
      args.projectId as string,
      ctx.organizationId,
      actorType,
      actorId,
    );
  },

  "project.get": (services, args, ctx) => {
    return services.organizationService.getProject(args.projectId as string, ctx.organizationId);
  },
};
