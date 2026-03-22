import type { Context } from "../context.js";
import type { CreateChannelInput } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { channelService } from "../services/channel.js";
import { pubsub, topics } from "../lib/pubsub.js";

export const channelQueries = {
  channels: (_: unknown, args: { organizationId: string; projectId?: string; memberOnly?: boolean }, ctx: Context) => {
    const where: Record<string, unknown> = { organizationId: args.organizationId };

    if (args.projectId) {
      where.projects = { some: { projectId: args.projectId } };
    }

    if (args.memberOnly) {
      where.members = { some: { userId: ctx.userId, leftAt: null } };
    }

    return prisma.channel.findMany({ where });
  },
  channel: (_: unknown, args: { id: string }, _ctx: Context) => {
    return prisma.channel.findUnique({ where: { id: args.id } });
  },
  channelMessages: (
    _: unknown,
    args: { channelId: string; after?: string; before?: string; limit?: number },
    ctx: Context,
  ) => {
    return channelService.getChannelMessages(args.channelId, ctx.userId, {
      after: args.after ? new Date(args.after) : undefined,
      before: args.before ? new Date(args.before) : undefined,
      limit: args.limit ?? undefined,
    });
  },
};

export const channelMutations = {
  createChannel: (_: unknown, args: { input: CreateChannelInput }, ctx: Context) => {
    return channelService.create(args.input, ctx.actorType, ctx.userId);
  },
  joinChannel: (_: unknown, args: { channelId: string }, ctx: Context) => {
    return channelService.join(args.channelId, ctx.actorType, ctx.userId);
  },
  leaveChannel: (_: unknown, args: { channelId: string }, ctx: Context) => {
    return channelService.leave(args.channelId, ctx.actorType, ctx.userId);
  },
  sendMessage: (_: unknown, args: { channelId: string; text: string; parentId?: string }, ctx: Context) => {
    return channelService.sendMessage(args.channelId, args.text, args.parentId ?? null, ctx.actorType, ctx.userId);
  },
  sendChannelMessage: (
    _: unknown,
    args: { channelId: string; text?: string; html?: string; parentId?: string },
    ctx: Context,
  ) => {
    return channelService.sendChannelMessage({
      channelId: args.channelId,
      text: args.text ?? undefined,
      html: args.html ?? undefined,
      parentId: args.parentId ?? undefined,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  editChannelMessage: (_: unknown, args: { messageId: string; html: string }, ctx: Context) => {
    return channelService.editChannelMessage({
      messageId: args.messageId,
      html: args.html,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
  deleteChannelMessage: (_: unknown, args: { messageId: string }, ctx: Context) => {
    return channelService.deleteChannelMessage({
      messageId: args.messageId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
};

export const channelSubscriptions = {
  channelEvents: {
    subscribe: (_: unknown, args: { channelId: string; organizationId: string }) => {
      return pubsub.asyncIterator(topics.channelEvents(args.channelId));
    },
  },
};

export const channelTypeResolvers = {
  Channel: {
    members: async (channel: { id: string }) => {
      const members = await prisma.channelMember.findMany({
        where: { channelId: channel.id, leftAt: null },
        include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
      });
      return members.map((m) => ({ user: m.user, joinedAt: m.joinedAt }));
    },
  },
};
