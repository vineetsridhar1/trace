/**
 * Chat domain actions — create, sendMessage, editMessage, deleteMessage, addMember, leave, rename, get
 */

import type { AgentActionRegistration, ActionDispatcher } from "./types.js";
import { actorInfo } from "./types.js";

// ---------------------------------------------------------------------------
// Action registrations
// ---------------------------------------------------------------------------

export const chatActions: AgentActionRegistration[] = [
  {
    name: "message.send",
    service: "chatService",
    method: "sendMessage",
    description:
      "Send a message in a chat. Use to communicate with team members, provide updates, or respond to questions. Only for direct/group chats — use channel.sendMessage for channel messages.",
    catalogDescription: "Send/post/write a message in a DM or group chat (chatId, text, html, parentId)",
    risk: "medium",
    suggestable: true,
    tier: "core",
    parameters: {
      fields: {
        chatId: { type: "string", description: "The chat to send the message in", required: true },
        text: { type: "string", description: "Plain text message content" },
        html: { type: "string", description: "HTML-formatted message content" },
        parentId: { type: "string", description: "Parent message ID for threading" },
      },
    },
    scopes: ["chat"],
  },
  {
    name: "chat.create",
    service: "chatService",
    method: "create",
    description:
      "Start a new direct message or group chat with specified members.",
    catalogDescription: "Start/open/create a new DM or group chat (memberIds, name)",
    risk: "medium",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        organizationId: { type: "string", description: "Organization ID", required: true },
        memberIds: {
          type: "array",
          description: "User IDs to include in the chat",
          required: true,
          items: { type: "string" },
        },
        name: { type: "string", description: "Chat name (for group chats)" },
      },
    },
    scopes: ["chat", "channel", "ticket", "session"],
  },
  {
    name: "chat.editMessage",
    service: "chatService",
    method: "editMessage",
    description:
      "Edit a previously sent message in a chat.",
    catalogDescription: "Edit/modify a chat message (messageId, html)",
    risk: "medium",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        messageId: { type: "string", description: "The message to edit", required: true },
        html: { type: "string", description: "New HTML content for the message", required: true },
      },
    },
    scopes: ["chat"],
  },
  {
    name: "chat.deleteMessage",
    service: "chatService",
    method: "deleteMessage",
    description:
      "Delete a message from a chat. This is a destructive action.",
    catalogDescription: "Delete/remove a message from a chat (messageId)",
    risk: "high",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        messageId: { type: "string", description: "The message to delete", required: true },
      },
    },
    scopes: ["chat"],
  },
  {
    name: "chat.addMember",
    service: "chatService",
    method: "addMember",
    description:
      "Add a user to an existing group chat.",
    catalogDescription: "Add/invite a user to a group chat (chatId, userId)",
    risk: "medium",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        chatId: { type: "string", description: "The chat to add the member to", required: true },
        userId: { type: "string", description: "The user to add", required: true },
      },
    },
    scopes: ["chat"],
  },
  {
    name: "chat.leave",
    service: "chatService",
    method: "leave",
    description:
      "Leave a group chat.",
    catalogDescription: "Leave/exit a group chat (chatId)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        chatId: { type: "string", description: "The chat to leave", required: true },
      },
    },
    scopes: ["chat"],
  },
  {
    name: "chat.rename",
    service: "chatService",
    method: "rename",
    description:
      "Rename a group chat.",
    catalogDescription: "Rename/retitle a group chat (chatId, name)",
    risk: "medium",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        chatId: { type: "string", description: "The chat to rename", required: true },
        name: { type: "string", description: "New chat name", required: true },
      },
    },
    scopes: ["chat"],
  },
  {
    name: "chat.get",
    service: "chatService",
    method: "getChat",
    description:
      "Get details about a specific chat including members and type (DM vs group).",
    catalogDescription: "Fetch/read/view chat details (chatId)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        chatId: { type: "string", description: "The chat to look up", required: true },
      },
    },
    scopes: ["chat", "channel", "ticket", "session"],
  },
];

// ---------------------------------------------------------------------------
// Dispatchers
// ---------------------------------------------------------------------------

export const chatDispatchers: Record<string, ActionDispatcher> = {
  "message.send": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.chatService.sendMessage({
      chatId: args.chatId as string,
      text: args.text as string | undefined,
      html: args.html as string | undefined,
      parentId: args.parentId as string | undefined,
      actorType,
      actorId,
    });
  },

  "chat.create": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.chatService.create(
      {
        organizationId: args.organizationId as string,
        memberIds: args.memberIds as string[],
        name: args.name as string | undefined,
      },
      actorType,
      actorId,
    );
  },

  "chat.editMessage": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.chatService.editMessage({
      messageId: args.messageId as string,
      html: args.html as string,
      actorType,
      actorId,
    });
  },

  "chat.deleteMessage": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.chatService.deleteMessage({
      messageId: args.messageId as string,
      actorType,
      actorId,
    });
  },

  "chat.addMember": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.chatService.addMember(
      args.chatId as string,
      args.userId as string,
      actorType,
      actorId,
    );
  },

  "chat.leave": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.chatService.leave(args.chatId as string, actorType, actorId);
  },

  "chat.rename": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.chatService.rename(
      args.chatId as string,
      args.name as string,
      actorType,
      actorId,
    );
  },

  "chat.get": (services, args, ctx) => {
    return services.chatService.getChat(args.chatId as string, ctx.agentId);
  },
};
