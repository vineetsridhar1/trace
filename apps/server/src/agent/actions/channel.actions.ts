/**
 * Channel domain actions — create, update, delete, join, leave, sendMessage, editMessage, deleteMessage, get
 */

import type { AgentActionRegistration, ActionDispatcher } from "./types.js";
import { actorInfo } from "./types.js";

// ---------------------------------------------------------------------------
// Action registrations
// ---------------------------------------------------------------------------

export const channelActions: AgentActionRegistration[] = [
  {
    name: "channel.sendMessage",
    service: "channelService",
    method: "sendMessage",
    description:
      "Send a message in a channel thread. Use to communicate with the team in a channel context. " +
      "Prefer threaded replies (set threadId) to minimize noise in the main channel.",
    catalogDescription: "Send/post/write a message in a channel (channelId, text, threadId)",
    risk: "medium",
    suggestable: true,
    tier: "core",
    parameters: {
      fields: {
        channelId: { type: "string", description: "The channel to send the message in", required: true },
        text: { type: "string", description: "Plain text message content" },
        html: { type: "string", description: "HTML-formatted message content" },
        threadId: { type: "string", description: "Thread ID for threaded replies" },
      },
    },
    scopes: ["channel"],
  },
  {
    name: "channel.create",
    service: "channelService",
    method: "create",
    description:
      "Create a new channel in the organization. Use to set up a new space for team communication.",
    catalogDescription: "Create/add/make a new channel (name, type, projectId)",
    risk: "medium",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        name: { type: "string", description: "Channel name", required: true },
        organizationId: { type: "string", description: "Organization ID", required: true },
        description: { type: "string", description: "Channel description" },
        projectId: { type: "string", description: "Project to associate the channel with" },
      },
    },
    scopes: ["channel", "project", "system"],
  },
  {
    name: "channel.update",
    service: "channelService",
    method: "update",
    description:
      "Update a channel's settings such as name or description.",
    catalogDescription: "Edit/modify a channel's settings (channelId, name, description)",
    risk: "medium",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        channelId: { type: "string", description: "The channel to update", required: true },
        name: { type: "string", description: "New channel name" },
        description: { type: "string", description: "New channel description" },
      },
    },
    scopes: ["channel"],
  },
  {
    name: "channel.delete",
    service: "channelService",
    method: "delete",
    description:
      "Delete a channel permanently. This is a high-risk destructive action.",
    catalogDescription: "Remove/destroy/delete a channel permanently (channelId)",
    risk: "high",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        channelId: { type: "string", description: "The channel to delete", required: true },
      },
    },
    scopes: ["channel"],
  },
  {
    name: "channel.join",
    service: "channelService",
    method: "join",
    description:
      "Join a channel as a member.",
    catalogDescription: "Join/enter a channel (channelId)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        channelId: { type: "string", description: "The channel to join", required: true },
      },
    },
    scopes: ["channel"],
  },
  {
    name: "channel.leave",
    service: "channelService",
    method: "leave",
    description:
      "Leave a channel.",
    catalogDescription: "Leave/exit a channel (channelId)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        channelId: { type: "string", description: "The channel to leave", required: true },
      },
    },
    scopes: ["channel"],
  },
  {
    name: "channel.editMessage",
    service: "channelService",
    method: "editChannelMessage",
    description:
      "Edit a previously sent message in a channel.",
    catalogDescription: "Edit/modify a channel message (messageId, html)",
    risk: "medium",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        messageId: { type: "string", description: "The message to edit", required: true },
        html: { type: "string", description: "New HTML content for the message", required: true },
      },
    },
    scopes: ["channel"],
  },
  {
    name: "channel.deleteMessage",
    service: "channelService",
    method: "deleteChannelMessage",
    description:
      "Delete a message from a channel. This is a destructive action.",
    catalogDescription: "Delete/remove a message from a channel (messageId)",
    risk: "high",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        messageId: { type: "string", description: "The message to delete", required: true },
      },
    },
    scopes: ["channel"],
  },
  {
    name: "channel.get",
    service: "channelService",
    method: "getChannel",
    description:
      "Get details about a specific channel including name, description, and members.",
    catalogDescription: "Fetch/read/view channel details (channelId)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        channelId: { type: "string", description: "The channel to look up", required: true },
      },
    },
    scopes: ["channel", "chat", "ticket", "session", "project"],
  },
  {
    name: "channel.list",
    service: "channelService",
    method: "listChannels",
    description:
      "List channels in the organization. Optionally filter by project.",
    catalogDescription: "List/browse all channels in the org (projectId)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        projectId: { type: "string", description: "Filter channels by project ID" },
      },
    },
    scopes: ["channel", "chat", "ticket", "session", "project", "system"],
  },
  {
    name: "channel.listMessages",
    service: "channelService",
    method: "getChannelMessages",
    description:
      "Read recent messages from a channel. Use to understand what was discussed or to get context before responding.",
    catalogDescription: "Read/fetch recent messages in a channel (channelId, limit)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        channelId: { type: "string", description: "The channel to read messages from", required: true },
        limit: { type: "number", description: "Maximum number of messages to return (default 20, max 50)" },
      },
    },
    scopes: ["channel"],
  },
  {
    name: "channel.getMembers",
    service: "channelService",
    method: "getMembers",
    description:
      "List all members of a channel. Use to find who is in a channel before sending messages or assigning work.",
    catalogDescription: "List/get members of a channel (channelId)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        channelId: { type: "string", description: "The channel to list members for", required: true },
      },
    },
    scopes: ["channel"],
  },
];

// ---------------------------------------------------------------------------
// Dispatchers
// ---------------------------------------------------------------------------

export const channelDispatchers: Record<string, ActionDispatcher> = {
  "channel.sendMessage": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.channelService.sendMessage(
      args.channelId as string,
      args.text as string,
      (args.threadId as string | undefined) ?? null,
      actorType,
      actorId,
    );
  },

  "channel.create": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.channelService.create(
      {
        name: args.name as string,
        organizationId: args.organizationId as string,
        description: args.description as string | undefined,
        projectId: args.projectId as string | undefined,
      },
      actorType,
      actorId,
    );
  },

  "channel.update": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.channelService.update(
      args.channelId as string,
      {
        name: args.name as string | undefined,
        description: args.description as string | undefined,
      },
      actorType,
      actorId,
    );
  },

  "channel.delete": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.channelService.delete(
      args.channelId as string,
      ctx.organizationId,
      actorType,
      actorId,
    );
  },

  "channel.join": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.channelService.join(args.channelId as string, actorType, actorId);
  },

  "channel.leave": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.channelService.leave(args.channelId as string, actorType, actorId);
  },

  "channel.editMessage": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.channelService.editChannelMessage({
      messageId: args.messageId as string,
      html: args.html as string,
      actorType,
      actorId,
    });
  },

  "channel.deleteMessage": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.channelService.deleteChannelMessage({
      messageId: args.messageId as string,
      actorType,
      actorId,
    });
  },

  "channel.get": (services, args, ctx) => {
    return services.channelService.getChannel(args.channelId as string, ctx.agentId);
  },

  "channel.list": (services, args, ctx) => {
    return services.channelService.listChannels(
      ctx.organizationId,
      ctx.agentId,
      { projectId: args.projectId as string | undefined },
    );
  },

  "channel.listMessages": (services, args, ctx) => {
    const limit = Math.min(typeof args.limit === "number" ? args.limit : 20, 50);
    return services.channelService.getChannelMessages(
      args.channelId as string,
      ctx.agentId,
      { limit },
    );
  },

  "channel.getMembers": (services, args) => {
    return services.channelService.getMembers(args.channelId as string);
  },
};
