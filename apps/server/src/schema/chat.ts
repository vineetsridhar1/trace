import type { Context } from "../context.js";
import type { CreateChatInput, AddChatMemberInput } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { chatService } from "../services/chat.js";
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
  chat: (_: unknown, args: { id: string }, ctx: Context) => {
    return chatService.getChat(args.id, ctx.organizationId, ctx.userId);
  },
  chatMessages: (
    _: unknown,
    args: { chatId: string; after?: Date; before?: Date; limit?: number },
    ctx: Context,
  ) => {
    return chatService.getMessages(args.chatId, ctx.organizationId, ctx.userId, {
      after: args.after,
      before: args.before,
      limit: args.limit,
    });
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
    args: { chatId: string; text?: string; html?: string; parentId?: string },
    ctx: Context,
  ) => {
    return chatService.sendMessage({
      chatId: args.chatId,
      organizationId: ctx.organizationId,
      text: args.text,
      html: args.html,
      parentId: args.parentId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  editChatMessage: (_: unknown, args: { messageId: string; html: string }, ctx: Context) => {
    return chatService.editMessage({
      messageId: args.messageId,
      html: args.html,
      organizationId: ctx.organizationId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  deleteChatMessage: (_: unknown, args: { messageId: string }, ctx: Context) => {
    return chatService.deleteMessage({
      messageId: args.messageId,
      organizationId: ctx.organizationId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  addChatMember: (_: unknown, args: { input: AddChatMemberInput }, ctx: Context) => {
    return chatService.addMember(
      args.input.chatId,
      args.input.userId,
      ctx.organizationId,
      ctx.actorType,
      ctx.userId,
    );
  },
  leaveChat: (_: unknown, args: { chatId: string }, ctx: Context) => {
    return chatService.leave(args.chatId, ctx.organizationId, ctx.actorType, ctx.userId);
  },
  renameChat: (_: unknown, args: { chatId: string; name: string }, ctx: Context) => {
    return chatService.rename(
      args.chatId,
      args.name,
      ctx.organizationId,
      ctx.actorType,
      ctx.userId,
    );
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
          const isMember = await isActiveChatMember(args.chatId, ctx.userId, ctx.organizationId);
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
      ctx: Context,
    ) => {
      return chatService.getMessages(chat.id, ctx.organizationId, ctx.userId, {
        after: args.after ? new Date(args.after) : undefined,
        before: args.before ? new Date(args.before) : undefined,
        limit: args.limit,
      });
    },
    createdBy: (chat: { createdById: string }) => {
      return prisma.user.findUniqueOrThrow({ where: { id: chat.createdById } });
    },
  },
  Message: {
    actor: async (message: { actorType: string; actorId: string }) => {
      const actor: { type: string; id: string; name: string | null; avatarUrl: string | null } = {
        type: message.actorType,
        id: message.actorId,
        name: null,
        avatarUrl: null,
      };
      if (message.actorType === "user") {
        const user = await prisma.user.findUnique({
          where: { id: message.actorId },
          select: { name: true, avatarUrl: true },
        });
        actor.name = user?.name ?? null;
        actor.avatarUrl = user?.avatarUrl ?? null;
      }
      return actor;
    },
  },
  ChatMember: {
    user: (member: { userId: string }) => {
      return prisma.user.findUniqueOrThrow({ where: { id: member.userId } });
    },
  },
};
