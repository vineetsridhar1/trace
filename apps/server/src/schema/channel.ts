import type { Context } from "../context.js";
import type { CreateChannelInput } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { channelService } from "../services/channel.js";
import { pubsub, topics } from "../lib/pubsub.js";

export const channelQueries = {
  channels: (_: unknown, args: { organizationId: string; projectId?: string }, _ctx: Context) => {
    if (args.projectId) {
      return prisma.channel.findMany({
        where: { organizationId: args.organizationId, projects: { some: { projectId: args.projectId } } },
      });
    }
    return prisma.channel.findMany({
      where: { organizationId: args.organizationId },
    });
  },
  channel: (_: unknown, args: { id: string }, _ctx: Context) => {
    return prisma.channel.findUnique({ where: { id: args.id } });
  },
};

export const channelMutations = {
  createChannel: (_: unknown, args: { input: CreateChannelInput }, _ctx: Context) => {
    return channelService.create(args.input);
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
