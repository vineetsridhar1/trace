import type { Context } from "../context.js";
import type { CreateChannelInput, UpdateChannelInput } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { channelService } from "../services/channel.js";
import { assertChannelAccess } from "../services/access.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { requireOrgContext } from "../lib/require-org.js";

export const channelQueries = {
  channels: (_: unknown, args: { organizationId: string; projectId?: string; memberOnly?: boolean }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    if (orgId !== args.organizationId) {
      throw new Error("Not authorized for this organization");
    }

    const where: Record<string, unknown> = { organizationId: args.organizationId };

    if (args.projectId) {
      where.projects = { some: { projectId: args.projectId } };
    }

    if (args.memberOnly) {
      where.members = { some: { userId: ctx.userId, leftAt: null } };
    }

    return prisma.channel.findMany({ where, include: { repo: true } });
  },
  channel: async (_: unknown, args: { id: string }, ctx: Context) => {
    await assertChannelAccess(args.id, ctx.userId);
    return prisma.channel.findUnique({ where: { id: args.id }, include: { repo: true } });
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
    const orgId = requireOrgContext(ctx);
    if (orgId !== args.input.organizationId) {
      throw new Error("Not authorized for this organization");
    }
    return channelService.create(args.input, ctx.actorType, ctx.userId);
  },
  updateChannel: async (_: unknown, args: { id: string; input: UpdateChannelInput }, ctx: Context) => {
    await assertChannelAccess(args.id, ctx.userId);
    return channelService.update(args.id, args.input, ctx.actorType, ctx.userId);
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
    subscribe: async (_: unknown, args: { channelId: string; organizationId: string }, ctx: Context) => {
      const orgId = requireOrgContext(ctx);
      if (orgId !== args.organizationId) {
        throw new Error("Not authorized for this organization");
      }
      await assertChannelAccess(args.channelId, ctx.userId);
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
    repo: (channel: { repo?: unknown; repoId?: string | null }) => {
      if ("repo" in channel) {
        return channel.repo ?? null;
      }
      if (!channel.repoId) return null;
      return prisma.repo.findUnique({ where: { id: channel.repoId } });
    },
  },
};
