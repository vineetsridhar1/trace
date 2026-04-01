import type { Context } from "../context.js";
import type { CreateChannelGroupInput, UpdateChannelGroupInput, MoveChannelInput, ReorderChannelGroupsInput, ReorderChannelsInput } from "@trace/gql";
import { channelGroupService } from "../services/channelGroup.js";

export const channelGroupQueries = {
  channelGroups: (_: unknown, args: { organizationId: string }) =>
    channelGroupService.list(args.organizationId),
};

export const channelGroupMutations = {
  createChannelGroup: (_: unknown, args: { input: CreateChannelGroupInput }, ctx: Context) => {
    return channelGroupService.create(args.input, ctx.actorType, ctx.userId);
  },
  updateChannelGroup: (_: unknown, args: { id: string; input: UpdateChannelGroupInput }, ctx: Context) => {
    return channelGroupService.update(args.id, args.input, ctx.actorType, ctx.userId);
  },
  deleteChannelGroup: (_: unknown, args: { id: string }, ctx: Context) => {
    return channelGroupService.delete(args.id, ctx.actorType, ctx.userId);
  },
  moveChannel: (_: unknown, args: { input: MoveChannelInput }, ctx: Context) => {
    return channelGroupService.moveChannel(args.input, ctx.actorType, ctx.userId);
  },
  reorderChannelGroups: (_: unknown, args: { input: ReorderChannelGroupsInput }, ctx: Context) => {
    return channelGroupService.reorderGroups(args.input.organizationId, args.input.groupIds, ctx.actorType, ctx.userId);
  },
  reorderChannels: (_: unknown, args: { input: ReorderChannelsInput }, ctx: Context) => {
    return channelGroupService.reorderChannels(args.input.groupId ?? null, args.input.channelIds, ctx.actorType, ctx.userId);
  },
};
