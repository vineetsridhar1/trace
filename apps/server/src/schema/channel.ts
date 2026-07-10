import type { Context } from "../context.js";
import type { AddChannelMemberInput, CreateChannelInput, UpdateChannelInput } from "@trace/gql";
import { channelService } from "../services/channel.js";
import { assertChannelAccess, isActiveChannelMember } from "../services/access.js";
import { filterAsyncIterator } from "../lib/async-iterator.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { requireOrgContext } from "../lib/require-org.js";
import { organizationService } from "../services/organization.js";

export const channelQueries = {
  channels: (
    _: unknown,
    args: { organizationId: string; projectId?: string; memberOnly?: boolean },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);
    if (orgId !== args.organizationId) {
      throw new Error("Not authorized for this organization");
    }
    return channelService.listChannels(args.organizationId, ctx.userId, {
      projectId: args.projectId,
      memberOnly: args.memberOnly,
    });
  },
  channel: async (_: unknown, args: { id: string }, ctx: Context) => {
    return channelService.getChannel(args.id, requireOrgContext(ctx), ctx.userId);
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
  updateChannel: async (
    _: unknown,
    args: { id: string; input: UpdateChannelInput },
    ctx: Context,
  ) => {
    await assertChannelAccess(args.id, ctx.userId);
    return channelService.update(args.id, args.input, ctx.actorType, ctx.userId);
  },
  deleteChannel: async (_: unknown, args: { id: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return channelService.delete(args.id, orgId, ctx.actorType, ctx.userId);
  },
  joinChannel: (_: unknown, args: { channelId: string }, ctx: Context) => {
    return channelService.join(args.channelId, ctx.actorType, ctx.userId);
  },
  addChannelMember: (_: unknown, args: { input: AddChannelMemberInput }, ctx: Context) => {
    return channelService.addMember(
      args.input.channelId,
      args.input.userId,
      ctx.actorType,
      ctx.userId,
    );
  },
  leaveChannel: (_: unknown, args: { channelId: string }, ctx: Context) => {
    return channelService.leave(args.channelId, ctx.actorType, ctx.userId);
  },
  sendMessage: (
    _: unknown,
    args: { channelId: string; text: string; parentId?: string },
    ctx: Context,
  ) => {
    return channelService.sendMessage(
      args.channelId,
      args.text,
      args.parentId ?? null,
      requireOrgContext(ctx),
      ctx.actorType,
      ctx.userId,
    );
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
      organizationId: requireOrgContext(ctx),
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
    subscribe: async (
      _: unknown,
      args: { channelId: string; organizationId: string },
      ctx: Context,
    ) => {
      const orgId = requireOrgContext(ctx);
      if (orgId !== args.organizationId) {
        throw new Error("Not authorized for this organization");
      }
      await assertChannelAccess(args.channelId, ctx.userId, orgId);
      // Re-check membership per event so revocation applies mid-stream,
      // matching chatEvents.
      return filterAsyncIterator(
        pubsub.asyncIterator<unknown>(topics.channelEvents(args.channelId)),
        () => isActiveChannelMember(args.channelId, ctx.userId, orgId),
      );
    },
  },
};

export const channelTypeResolvers = {
  Channel: {
    members: (channel: { id: string }) => channelService.getMembers(channel.id),
    memberCount: (channel: { id: string; _count?: { members?: number } }) =>
      channel._count?.members ?? channelService.getMemberCount(channel.id),
    viewerIsMember: (
      channel: { id: string; members?: Array<{ userId: string }> },
      _: unknown,
      ctx: Context,
    ) => {
      if ("members" in channel && channel.members) {
        return channel.members.some((member) => member.userId === ctx.userId);
      }
      return channelService.isMember(channel.id, ctx.userId);
    },
    repo: (channel: { repo?: unknown; repoId?: string | null }) => {
      if ("repo" in channel) {
        return channel.repo ?? null;
      }
      if (!channel.repoId) return null;
      return organizationService.getRepoById(channel.repoId);
    },
    owner: (channel: { owner?: unknown; ownerId?: string | null }) => {
      if ("owner" in channel) {
        return channel.owner ?? null;
      }
      if (!channel.ownerId) return null;
      return organizationService.getUserProfile(channel.ownerId);
    },
  },
};
