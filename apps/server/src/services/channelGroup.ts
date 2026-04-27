import type { ActorType } from "@trace/gql";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { assertActorOrgAccess } from "./actor-auth.js";

export class ChannelGroupService {
  async list(organizationId: string) {
    return prisma.channelGroup.findMany({
      where: { organizationId },
      orderBy: { position: "asc" },
      include: { channels: { orderBy: { position: "asc" } } },
    });
  }

  async create(
    input: { organizationId: string; name: string; position?: number | null },
    actorType: ActorType,
    actorId: string,
  ) {
    const [group] = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertActorOrgAccess(tx, input.organizationId, actorType, actorId);

      // If no position specified, append after all top-level items (ungrouped channels + groups)
      let position = input.position ?? null;
      if (position === null) {
        const lastGroup = await tx.channelGroup.findFirst({
          where: { organizationId: input.organizationId },
          orderBy: { position: "desc" },
          select: { position: true },
        });
        const lastUngroupedChannel = await tx.channel.findFirst({
          where: { organizationId: input.organizationId, groupId: null },
          orderBy: { position: "desc" },
          select: { position: true },
        });
        const maxPos = Math.max(lastGroup?.position ?? -1, lastUngroupedChannel?.position ?? -1);
        position = maxPos + 1;
      }

      const group = await tx.channelGroup.create({
        data: {
          name: input.name,
          position,
          organizationId: input.organizationId,
        },
        include: { channels: true },
      });

      await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "system",
          scopeId: input.organizationId,
          eventType: "channel_group_created",
          payload: {
            channelGroup: {
              id: group.id,
              name: group.name,
              position: group.position,
              isCollapsed: group.isCollapsed,
            },
          },
          actorType,
          actorId,
        },
        tx,
      );

      return [group] as const;
    });

    return group;
  }

  async update(
    id: string,
    input: { name?: string | null; position?: number | null; isCollapsed?: boolean | null },
    actorType: ActorType,
    actorId: string,
  ) {
    const [group] = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.channelGroup.findFirstOrThrow({
        where: { id },
        select: { organizationId: true },
      });
      await assertActorOrgAccess(tx, existing.organizationId, actorType, actorId);

      const data: Record<string, unknown> = {};
      if (input.name != null) data.name = input.name;
      if (input.position != null) data.position = input.position;
      if (input.isCollapsed != null) data.isCollapsed = input.isCollapsed;

      const group = await tx.channelGroup.update({
        where: { id },
        data,
        include: { channels: true },
      });

      await eventService.create(
        {
          organizationId: group.organizationId,
          scopeType: "system",
          scopeId: group.organizationId,
          eventType: "channel_group_updated",
          payload: {
            channelGroup: {
              id: group.id,
              name: group.name,
              position: group.position,
              isCollapsed: group.isCollapsed,
            },
          },
          actorType,
          actorId,
        },
        tx,
      );

      return [group] as const;
    });

    return group;
  }

  async delete(id: string, actorType: ActorType, actorId: string) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const group = await tx.channelGroup.findUniqueOrThrow({ where: { id } });
      await assertActorOrgAccess(tx, group.organizationId, actorType, actorId);

      // Find channels in this group before ungrouping
      const affectedChannels = await tx.channel.findMany({
        where: { groupId: id },
        select: { id: true, name: true, type: true, position: true },
      });

      // Ungroup all channels in this group
      await tx.channel.updateMany({
        where: { groupId: id },
        data: { groupId: null },
      });

      await tx.channelGroup.delete({ where: { id } });

      // Emit channel_group_deleted with the affected channel IDs so clients can patch them
      await eventService.create(
        {
          organizationId: group.organizationId,
          scopeType: "system",
          scopeId: group.organizationId,
          eventType: "channel_group_deleted",
          payload: {
            channelGroupId: id,
            ungroupedChannels: affectedChannels.map(
              (c: { id: string; name: string; type: string; position: number }) => ({
                id: c.id,
                name: c.name,
                type: c.type,
                position: c.position,
                groupId: null,
              }),
            ),
          },
          actorType,
          actorId,
        },
        tx,
      );
    });

    return true;
  }

  async moveChannel(
    input: { channelId: string; groupId?: string | null; position: number },
    actorType: ActorType,
    actorId: string,
  ) {
    const [channel] = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.channel.findFirstOrThrow({
        where: { id: input.channelId },
        select: { organizationId: true },
      });
      await assertActorOrgAccess(tx, existing.organizationId, actorType, actorId);
      if (input.groupId) {
        await tx.channelGroup.findFirstOrThrow({
          where: { id: input.groupId, organizationId: existing.organizationId },
          select: { id: true },
        });
      }

      const channel = await tx.channel.update({
        where: { id: input.channelId },
        data: {
          groupId: input.groupId ?? null,
          position: input.position,
        },
      });

      await eventService.create(
        {
          organizationId: channel.organizationId,
          scopeType: "system",
          scopeId: channel.organizationId,
          eventType: "channel_updated",
          payload: {
            channel: {
              id: channel.id,
              name: channel.name,
              type: channel.type,
              position: channel.position,
              groupId: channel.groupId,
              baseBranch: channel.baseBranch,
              setupScript: channel.setupScript,
              runScripts: channel.runScripts,
            },
          },
          actorType,
          actorId,
        },
        tx,
      );

      return [channel] as const;
    });

    return channel;
  }

  async reorderGroups(
    organizationId: string,
    groupIds: string[],
    actorType: ActorType,
    actorId: string,
  ) {
    const groups = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertActorOrgAccess(tx, organizationId, actorType, actorId);

      const updated = await Promise.all(
        groupIds.map((id, index) =>
          tx.channelGroup.update({
            where: { id },
            data: { position: index },
            include: { channels: true },
          }),
        ),
      );

      await eventService.create(
        {
          organizationId,
          scopeType: "system",
          scopeId: organizationId,
          eventType: "channel_group_updated",
          payload: {
            reorder: true,
            groups: updated.map((g: { id: string; position: number }) => ({
              id: g.id,
              position: g.position,
            })),
          },
          actorType,
          actorId,
        },
        tx,
      );

      return updated;
    });

    return groups;
  }

  async reorderChannels(
    groupId: string | null,
    channelIds: string[],
    actorType: ActorType,
    actorId: string,
  ) {
    const channels = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const scopedChannels = await tx.channel.findMany({
        where: { id: { in: channelIds } },
        select: { id: true, organizationId: true },
      });
      if (scopedChannels.length !== channelIds.length) {
        throw new Error("Channel not found");
      }
      const organizationId = scopedChannels[0]?.organizationId;
      if (
        !organizationId ||
        scopedChannels.some((channel) => channel.organizationId !== organizationId)
      ) {
        throw new Error("Channels must belong to the same organization");
      }
      await assertActorOrgAccess(tx, organizationId, actorType, actorId);
      if (groupId) {
        await tx.channelGroup.findFirstOrThrow({
          where: { id: groupId, organizationId },
          select: { id: true },
        });
      }

      const updated = await Promise.all(
        channelIds.map((id, index) =>
          tx.channel.update({
            where: { id },
            data: { position: index, groupId: groupId ?? null },
          }),
        ),
      );

      if (updated.length === 0) return [];

      await eventService.create(
        {
          organizationId,
          scopeType: "system",
          scopeId: organizationId,
          eventType: "channel_updated",
          payload: {
            reorder: true,
            channels: updated.map(
              (c: { id: string; position: number; groupId: string | null }) => ({
                id: c.id,
                position: c.position,
                groupId: c.groupId,
              }),
            ),
          },
          actorType,
          actorId,
        },
        tx,
      );

      return updated;
    });

    return channels;
  }
}

export const channelGroupService = new ChannelGroupService();
