import type { Context } from "../context.js";
import type { CreateChatInput, AddChatMemberInput } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { chatService } from "../services/chat.js";
import { eventService } from "../services/event.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { filterAsyncIterator } from "../lib/async-iterator.js";
import { assertChatAccess, isActiveChatMember } from "../services/access.js";

export const chatQueries = {
  chats: (_: unknown, args: { organizationId: string }, ctx: Context) => {
    if (args.organizationId !== ctx.organizationId) {
      throw new Error("Not authorized for this organization");
    }
    return chatService.getChats(args.organizationId, ctx.userId);
  },
  chat: async (_: unknown, args: { id: string }, ctx: Context) => {
    const chat = await chatService.getChat(args.id);
    if (!chat) return null;
    // Verify caller is an active member
    const isMember = chat.members.some((m) => m.userId === ctx.userId);
    if (!isMember) return null;
    return chat;
  },
};

export const chatMutations = {
  createChat: (_: unknown, args: { input: CreateChatInput }, ctx: Context) => {
    if (args.input.organizationId !== ctx.organizationId) {
      throw new Error("Not authorized for this organization");
    }
    return chatService.create(args.input, ctx.actorType, ctx.userId);
  },
  sendChatMessage: (
    _: unknown,
    args: { chatId: string; text: string; parentId?: string },
    ctx: Context,
  ) => {
    return chatService.sendMessage({
      chatId: args.chatId,
      text: args.text,
      parentId: args.parentId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  addChatMember: (_: unknown, args: { input: AddChatMemberInput }, ctx: Context) => {
    return chatService.addMember(args.input.chatId, args.input.userId, ctx.actorType, ctx.userId);
  },
  leaveChat: (_: unknown, args: { chatId: string }, ctx: Context) => {
    return chatService.leave(args.chatId, ctx.actorType, ctx.userId);
  },
};

export const chatSubscriptions = {
  chatEvents: {
    subscribe: async (
      _: unknown,
      args: { chatId: string; organizationId: string; types?: string[] },
      ctx: Context,
    ) => {
      if (args.organizationId !== ctx.organizationId) {
        throw new Error("Not authorized for this organization");
      }

      await assertChatAccess(args.chatId, ctx.userId, ctx.organizationId);

      return filterAsyncIterator(
        pubsub.asyncIterator<{ chatEvents: { eventType: string } }>(topics.chatEvents(args.chatId)),
        async (payload) => {
          const isMember = await isActiveChatMember(args.chatId, ctx.userId);
          if (!isMember) return false;
          if (!args.types?.length) return true;
          return args.types.includes(payload.chatEvents.eventType);
        },
      );
    },
  },
};

export const chatTypeResolvers = {
  Chat: {
    members: (chat: { id: string }) => {
      return prisma.chatMember.findMany({
        where: { chatId: chat.id, leftAt: null },
      });
    },
    messages: async (
      chat: { id: string; organizationId?: string },
      args: { after?: string; before?: string; limit?: number },
    ) => {
      const organizationId = chat.organizationId
        ?? (await prisma.chat.findUniqueOrThrow({ where: { id: chat.id }, select: { organizationId: true } })).organizationId;

      return eventService.query(organizationId, {
        scopeType: "chat",
        scopeId: chat.id,
        after: args.after ? new Date(args.after) : undefined,
        before: args.before ? new Date(args.before) : undefined,
        limit: args.limit,
        excludeReplies: true,
      });
    },
    createdBy: (chat: { createdById: string }) => {
      return prisma.user.findUniqueOrThrow({ where: { id: chat.createdById } });
    },
  },
  ChatMember: {
    user: (member: { userId: string }) => {
      return prisma.user.findUniqueOrThrow({ where: { id: member.userId } });
    },
  },
};
