/**
 * Ticket domain actions — create, update, addComment, assign, unassign, link, unlink, query, get
 */

import type {
  AgentActionRegistration,
  ActionDispatcher,
  CreateTicketServiceInput,
  EntityType,
} from "./types.js";
import { actorInfo } from "./types.js";

// ---------------------------------------------------------------------------
// Action registrations
// ---------------------------------------------------------------------------

export const ticketActions: AgentActionRegistration[] = [
  {
    name: "ticket.create",
    service: "ticketService",
    method: "create",
    description:
      "Create a new ticket. Use when a conversation reveals a bug, task, or feature request that should be tracked. Requires a title at minimum.",
    catalogDescription: "Create/add/file a new ticket (title, description, priority, labels)",
    risk: "medium",
    suggestable: true,
    tier: "core",
    parameters: {
      fields: {
        title: { type: "string", description: "Ticket title", required: true },
        description: { type: "string", description: "Detailed description of the ticket" },
        priority: {
          type: "string",
          description: "Ticket priority level",
          enum: ["low", "medium", "high", "urgent"],
        },
        labels: {
          type: "array",
          description: "Labels to apply to the ticket",
          items: { type: "string" },
        },
        channelId: { type: "string", description: "Channel to associate the ticket with" },
        projectId: { type: "string", description: "Project to associate the ticket with" },
        assigneeIds: {
          type: "array",
          description: "User IDs to assign to the ticket",
          items: { type: "string" },
        },
      },
    },
    scopes: ["chat", "channel", "ticket", "session", "project"],
  },
  {
    name: "ticket.update",
    service: "ticketService",
    method: "update",
    description:
      "Update an existing ticket's fields such as status, priority, labels, or assignees. Use when new information changes the state of a tracked issue.",
    catalogDescription: "Edit/modify/change a ticket's fields (id, status, priority, title, labels)",
    risk: "medium",
    suggestable: true,
    tier: "core",
    parameters: {
      fields: {
        id: { type: "string", description: "The ticket ID to update", required: true },
        title: { type: "string", description: "New title" },
        description: { type: "string", description: "New description" },
        status: {
          type: "string",
          description: "New status",
          enum: ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"],
        },
        priority: {
          type: "string",
          description: "New priority",
          enum: ["low", "medium", "high", "urgent"],
        },
        labels: {
          type: "array",
          description: "Replace labels",
          items: { type: "string" },
        },
      },
    },
    scopes: ["ticket", "chat", "channel", "session"],
  },
  {
    name: "ticket.addComment",
    service: "ticketService",
    method: "addComment",
    description:
      "Add a comment to an existing ticket. Use to provide updates, context, or analysis on a tracked issue.",
    catalogDescription: "Comment/reply/post on a ticket (ticketId, text)",
    risk: "medium",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        ticketId: { type: "string", description: "The ticket to comment on", required: true },
        text: { type: "string", description: "The comment text", required: true },
      },
    },
    scopes: ["ticket", "chat", "channel", "session"],
  },
  {
    name: "ticket.assign",
    service: "ticketService",
    method: "assign",
    description:
      "Assign a ticket to a user. Use when work ownership needs to change or a ticket needs an owner.",
    catalogDescription: "Assign/give a ticket to a user (ticketId, userId)",
    risk: "medium",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        ticketId: { type: "string", description: "The ticket to assign", required: true },
        userId: { type: "string", description: "The user to assign the ticket to", required: true },
      },
    },
    scopes: ["ticket", "chat", "channel", "session"],
  },
  {
    name: "ticket.unassign",
    service: "ticketService",
    method: "unassign",
    description:
      "Remove a user's assignment from a ticket. Use when someone is no longer responsible for a ticket.",
    catalogDescription: "Unassign/remove a user from a ticket (ticketId, userId)",
    risk: "medium",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        ticketId: { type: "string", description: "The ticket to unassign from", required: true },
        userId: { type: "string", description: "The user to unassign", required: true },
      },
    },
    scopes: ["ticket", "chat", "channel", "session"],
  },
  {
    name: "ticket.link",
    service: "ticketService",
    method: "link",
    description:
      "Create a link between a ticket and another entity (session, channel, chat, etc.). Use to connect related items for traceability.",
    catalogDescription: "Link/connect a ticket to another entity (ticketId, entityType, entityId)",
    risk: "low",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        ticketId: { type: "string", description: "The ticket to link from", required: true },
        entityType: {
          type: "string",
          description: "The type of entity to link to",
          required: true,
          enum: ["session", "channel", "chat", "ticket", "project"],
        },
        entityId: { type: "string", description: "The ID of the entity to link to", required: true },
      },
    },
    scopes: ["ticket", "chat", "channel", "session", "project"],
  },
  {
    name: "ticket.unlink",
    service: "ticketService",
    method: "unlink",
    description:
      "Remove a link between a ticket and another entity. Use to disconnect items that are no longer related.",
    catalogDescription: "Unlink/disconnect a ticket from another entity (ticketId, entityType, entityId)",
    risk: "low",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        ticketId: { type: "string", description: "The ticket to unlink from", required: true },
        entityType: {
          type: "string",
          description: "The type of entity to unlink",
          required: true,
          enum: ["session", "channel", "chat", "ticket", "project"],
        },
        entityId: { type: "string", description: "The ID of the entity to unlink", required: true },
      },
    },
    scopes: ["ticket", "chat", "channel", "session", "project"],
  },
  {
    name: "ticket.query",
    service: "ticketService",
    method: "searchByRelevance",
    description:
      "Search for tickets by keyword. Use to check if a ticket already exists before creating one, " +
      "to look up the status of a ticket, or to find related work. Returns matching tickets with their current status, priority, and assignees.",
    catalogDescription: "Search/find/lookup tickets by keyword (query, limit)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        query: { type: "string", description: "Search keywords to match against ticket titles and descriptions", required: true },
        limit: { type: "number", description: "Maximum number of results to return (default 5, max 10)" },
      },
    },
    scopes: ["chat", "channel", "ticket", "session", "project"],
  },
  {
    name: "ticket.get",
    service: "ticketService",
    method: "getById",
    description:
      "Get a specific ticket by its exact ID. Use when a user asks about the status of a specific ticket, " +
      "or when you need to check a ticket's current state before taking action on it. " +
      "Returns the full ticket with status, priority, assignees, and labels, or null if not found.",
    catalogDescription: "Fetch/read/view a specific ticket by ID (ticketId)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        ticketId: { type: "string", description: "The exact ticket ID to look up", required: true },
      },
    },
    scopes: ["chat", "channel", "ticket", "session", "project"],
  },
];

// ---------------------------------------------------------------------------
// Dispatchers
// ---------------------------------------------------------------------------

export const ticketDispatchers: Record<string, ActionDispatcher> = {
  "ticket.create": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.ticketService.create({
      organizationId: ctx.organizationId,
      title: args.title as string,
      description: args.description as string | undefined,
      priority: args.priority as CreateTicketServiceInput["priority"],
      labels: args.labels as string[] | undefined,
      channelId: args.channelId as string | undefined,
      projectId: args.projectId as string | undefined,
      assigneeIds: args.assigneeIds as string[] | undefined,
      actorType,
      actorId,
    });
  },

  "ticket.update": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    const { id, ...input } = args;
    return services.ticketService.update(id as string, input, actorType, actorId);
  },

  "ticket.addComment": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.ticketService.addComment(
      args.ticketId as string,
      args.text as string,
      actorType,
      actorId,
    );
  },

  "ticket.assign": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.ticketService.assign({
      ticketId: args.ticketId as string,
      userId: args.userId as string,
      actorType,
      actorId,
    });
  },

  "ticket.unassign": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.ticketService.unassign({
      ticketId: args.ticketId as string,
      userId: args.userId as string,
      actorType,
      actorId,
    });
  },

  "ticket.link": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.ticketService.link({
      ticketId: args.ticketId as string,
      entityType: args.entityType as EntityType,
      entityId: args.entityId as string,
      actorType,
      actorId,
    });
  },

  "ticket.unlink": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.ticketService.unlink({
      ticketId: args.ticketId as string,
      entityType: args.entityType as EntityType,
      entityId: args.entityId as string,
      actorType,
      actorId,
    });
  },

  "ticket.query": (services, args, ctx) => {
    const limit = Math.min(typeof args.limit === "number" ? args.limit : 5, 10);
    return services.ticketService.searchByRelevance({
      organizationId: ctx.organizationId,
      query: args.query as string,
      limit,
    });
  },

  "ticket.get": (services, args, ctx) => {
    return services.ticketService.getById(ctx.organizationId, args.ticketId as string);
  },
};
