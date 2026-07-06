import type { Context } from "../context.js";
import type { CreateChatInput, AddChatMemberInput } from "@trace/gql";
import { chatService } from "../services/chat.js";
import { resolveActor } from "../services/actor.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { filterAsyncIterator } from "../lib/async-iterator.js";
import { isActiveChatMember } from "../services/access.js";
import { requireOrgContext } from "../lib/require-org.js";

export const chatQueries = {
  chats: (_: unknown, _args: Record<string, never>, ctx: Context) => {
    return chatService.getChats(ctx.userId, requireOrgContext(ctx));
  },
  chat: (_: unknown, args: { id: string }, ctx: Context) => {
    return chatService.getChat(args.id, ctx.userId, requireOrgContext(ctx));
  },
  chatMessages: (
    _: unknown,
    args: { chatId: string; after?: Date; before?: Date; limit?: number },
    ctx: Context,
  ) => {
    return chatService.getMessages(args.chatId, ctx.userId, requireOrgContext(ctx), {
      after: args.after,
      before: args.before,
      limit: args.limit,
    });
  },
  searchMessages: (_: unknown, args: { query: string; limit?: number }, ctx: Context) => {
    return chatService.searchMessages(
      args.query,
      ctx.userId,
      requireOrgContext(ctx),
      args.limit ?? undefined,
    );
  },
};

export const chatMutations = {
  createChat: (_: unknown, args: { input: CreateChatInput }, ctx: Context) => {
    return chatService.create(args.input, requireOrgContext(ctx), ctx.actorType, ctx.userId);
  },
  sendChatMessage: (
    _: unknown,
    args: {
      chatId: string;
      text?: string;
      html?: string;
      parentId?: string;
      clientMutationId?: string | null;
    },
    ctx: Context,
  ) => {
    return chatService.sendMessage({
      chatId: args.chatId,
      text: args.text,
      html: args.html,
      parentId: args.parentId,
      clientMutationId: args.clientMutationId ?? undefined,
      organizationId: requireOrgContext(ctx),
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  editChatMessage: (_: unknown, args: { messageId: string; html: string }, ctx: Context) => {
    return chatService.editMessage({
      messageId: args.messageId,
      html: args.html,
      organizationId: requireOrgContext(ctx),
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  deleteChatMessage: (_: unknown, args: { messageId: string }, ctx: Context) => {
    return chatService.deleteMessage({
      messageId: args.messageId,
      organizationId: requireOrgContext(ctx),
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  addChatMember: (_: unknown, args: { input: AddChatMemberInput }, ctx: Context) => {
    return chatService.addMember(
      args.input.chatId,
      args.input.userId,
      requireOrgContext(ctx),
      ctx.actorType,
      ctx.userId,
    );
  },
  leaveChat: (_: unknown, args: { chatId: string }, ctx: Context) => {
    return chatService.leave(args.chatId, requireOrgContext(ctx), ctx.actorType, ctx.userId);
  },
  renameChat: (_: unknown, args: { chatId: string; name: string }, ctx: Context) => {
    return chatService.rename(
      args.chatId,
      args.name,
      requireOrgContext(ctx),
      ctx.actorType,
      ctx.userId,
    );
  },
};

export const chatSubscriptions = {
  chatEvents: {
    subscribe: async (_: unknown, args: { chatId: string; types?: string[] }, ctx: Context) => {
      const orgId = requireOrgContext(ctx);
      const chat = await chatService.getChat(args.chatId, ctx.userId, orgId);
      if (!chat) throw new Error("Not authorized for this chat");

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
    members: (chat: { id: string; members?: unknown[] }, _args: unknown, ctx: Context) =>
      Array.isArray(chat.members) ? chat.members : ctx.chatMembersLoader.load(chat.id),
    messages: async (
      chat: { id: string },
      args: { after?: string; before?: string; limit?: number },
      ctx: Context,
    ) => {
      return chatService.getMessages(chat.id, ctx.userId, requireOrgContext(ctx), {
        after: args.after ? new Date(args.after) : undefined,
        before: args.before ? new Date(args.before) : undefined,
        limit: args.limit,
      });
    },
    createdBy: async (chat: { createdById: string }, _args: unknown, ctx: Context) => {
      const user = await ctx.userLoader.load(chat.createdById);
      if (!user) throw new Error("User not found");
      return user;
    },
  },
  Message: {
    actor: (message: { actorType: string; actorId: string }, _args: unknown, ctx: Context) =>
      resolveActor(message, ctx.userLoader),
  },
  MessageSearchHit: {
    actor: (hit: { actorType: string; actorId: string }, _args: unknown, ctx: Context) =>
      resolveActor(hit, ctx.userLoader),
  },
  ChatMember: {
    user: async (member: { userId: string }, _args: unknown, ctx: Context) => {
      const user = await ctx.userLoader.load(member.userId);
      if (!user) throw new Error("User not found");
      return user;
    },
  },
};
