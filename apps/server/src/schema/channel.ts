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
        include: { user: { select: { id: true, email: true, name: true, avatarUrl: true, role: true } } },
      });
      return members.map((m) => ({ user: m.user, joinedAt: m.joinedAt }));
    },
  },
};
