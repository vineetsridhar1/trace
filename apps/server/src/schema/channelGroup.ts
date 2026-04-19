import type { Context } from "../context.js";
import type { CreateChannelGroupInput, UpdateChannelGroupInput, MoveChannelInput, ReorderChannelGroupsInput, ReorderChannelsInput } from "@trace/gql";
import { channelGroupService } from "../services/channelGroup.js";
import { requireOrgContext } from "../lib/require-org.js";

export const channelGroupQueries = {
  channelGroups: (_: unknown, args: { organizationId: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    if (args.organizationId !== orgId) {
      throw new Error("Not authorized for this organization");
    }
    return channelGroupService.list(orgId);
  },
};

export const channelGroupMutations = {
  createChannelGroup: (_: unknown, args: { input: CreateChannelGroupInput }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    if (args.input.organizationId !== orgId) {
      throw new Error("Not authorized for this organization");
    }
    return channelGroupService.create(orgId, args.input, ctx.actorType, ctx.userId);
  },
  updateChannelGroup: (_: unknown, args: { id: string; input: UpdateChannelGroupInput }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return channelGroupService.update(args.id, orgId, args.input, ctx.actorType, ctx.userId);
  },
  deleteChannelGroup: (_: unknown, args: { id: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return channelGroupService.delete(args.id, orgId, ctx.actorType, ctx.userId);
  },
  moveChannel: (_: unknown, args: { input: MoveChannelInput }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return channelGroupService.moveChannel(orgId, args.input, ctx.actorType, ctx.userId);
  },
  reorderChannelGroups: (_: unknown, args: { input: ReorderChannelGroupsInput }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    if (args.input.organizationId !== orgId) {
      throw new Error("Not authorized for this organization");
    }
    return channelGroupService.reorderGroups(orgId, args.input.groupIds, ctx.actorType, ctx.userId);
  },
  reorderChannels: (_: unknown, args: { input: ReorderChannelsInput }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return channelGroupService.reorderChannels(orgId, args.input.groupId ?? null, args.input.channelIds, ctx.actorType, ctx.userId);
  },
};
