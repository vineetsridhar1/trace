import type { CreateChannelInput, ActorType } from "@trace/gql";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";

export class ChannelService {
  private async normalizeMembers(
    tx: Prisma.TransactionClient,
    channelId: string,
  ): Promise<Array<{ user: { id: string; name: string | null; avatarUrl: string | null }; joinedAt: string }>> {
    const members = await tx.channelMember.findMany({
      where: { channelId, leftAt: null },
    });
    const userIds = members.map((m) => m.userId);
    const users = await tx.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, avatarUrl: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    return members.map((m) => ({
      user: userMap.get(m.userId) ?? { id: m.userId, name: "Unknown", avatarUrl: null },
      joinedAt: m.joinedAt.toISOString(),
    }));
  }

  async create(input: CreateChannelInput, actorType: ActorType, actorId: string) {
    const [channel, _event] = await prisma.$transaction(async (tx) => {
      // Auto-position: if no position specified, append after all items in the target scope
      let position = input.position ?? null;
      if (position === null) {
        if (input.groupId) {
          // Position within the group
          const lastInGroup = await tx.channel.findFirst({
            where: { groupId: input.groupId },
            orderBy: { position: "desc" },
            select: { position: true },
          });
          position = (lastInGroup?.position ?? -1) + 1;
        } else {
          // Position among all top-level items (ungrouped channels + groups)
          const lastUngroupedChannel = await tx.channel.findFirst({
            where: { organizationId: input.organizationId, groupId: null },
            orderBy: { position: "desc" },
            select: { position: true },
          });
          const lastGroup = await tx.channelGroup.findFirst({
            where: { organizationId: input.organizationId },
            orderBy: { position: "desc" },
            select: { position: true },
          });
          const maxPos = Math.max(lastUngroupedChannel?.position ?? -1, lastGroup?.position ?? -1);
          position = maxPos + 1;
        }
      }

      const channel = await tx.channel.create({
        data: {
          name: input.name,
          type: input.type ?? "coding",
          position,
          organizationId: input.organizationId,
          groupId: input.groupId ?? null,
          ...(input.projectIds?.length && {
            projects: {
              create: input.projectIds.map((projectId) => ({ projectId })),
            },
          }),
        },
      });

      // Auto-join creator as channel member
      await tx.channelMember.create({
        data: {
          channelId: channel.id,
          userId: actorId,
        },
      });

      const normalizedMembers = await this.normalizeMembers(tx, channel.id);

      const event = await eventService.create({
        organizationId: input.organizationId,
        scopeType: "channel",
        scopeId: channel.id,
        eventType: "channel_created",
        payload: { channel: { id: channel.id, name: channel.name, type: channel.type, position: channel.position, groupId: channel.groupId, members: normalizedMembers } },
        actorType,
        actorId,
      }, tx);

      return [channel, event] as const;
    });

    return channel;
  }

  async join(channelId: string, actorType: ActorType, actorId: string) {
    await prisma.$transaction(async (tx) => {
      const channel = await tx.channel.findUniqueOrThrow({
        where: { id: channelId },
        select: { id: true, name: true, type: true, organizationId: true },
      });

      // Validate user belongs to the org
      await tx.orgMember.findUniqueOrThrow({
        where: { userId_organizationId: { userId: actorId, organizationId: channel.organizationId } },
      });

      // Handle existing membership (rejoin)
      const existingMembership = await tx.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId: actorId } },
      });

      if (existingMembership?.leftAt === null) {
        // Already a member
        return;
      }

      if (existingMembership) {
        await tx.channelMember.update({
          where: { channelId_userId: { channelId, userId: actorId } },
          data: { leftAt: null, joinedAt: new Date() },
        });
      } else {
        await tx.channelMember.create({
          data: { channelId, userId: actorId },
        });
      }

      const normalizedMembers = await this.normalizeMembers(tx, channelId);

      await eventService.create(
        {
          organizationId: channel.organizationId,
          scopeType: "channel",
          scopeId: channelId,
          eventType: "channel_member_added",
          payload: {
            userId: actorId,
            channel: { id: channel.id, name: channel.name, type: channel.type, members: normalizedMembers },
          },
          actorType,
          actorId,
        },
        tx,
      );
    });

    return prisma.channel.findUniqueOrThrow({
      where: { id: channelId },
      include: { members: { where: { leftAt: null } } },
    });
  }

  async leave(channelId: string, actorType: ActorType, actorId: string) {
    await prisma.$transaction(async (tx) => {
      const channel = await tx.channel.findUniqueOrThrow({
        where: { id: channelId },
        select: { id: true, name: true, type: true, organizationId: true },
      });

      // Verify current membership
      const membership = await tx.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId: actorId } },
      });

      if (!membership || membership.leftAt !== null) {
        throw new Error("You are not a member of this channel");
      }

      await tx.channelMember.update({
        where: { channelId_userId: { channelId, userId: actorId } },
        data: { leftAt: new Date() },
      });

      const normalizedMembers = await this.normalizeMembers(tx, channelId);

      await eventService.create(
        {
          organizationId: channel.organizationId,
          scopeType: "channel",
          scopeId: channelId,
          eventType: "channel_member_removed",
          payload: {
            userId: actorId,
            channel: { id: channel.id, name: channel.name, type: channel.type, members: normalizedMembers },
          },
          actorType,
          actorId,
        },
        tx,
      );
    });

    return prisma.channel.findUniqueOrThrow({
      where: { id: channelId },
      include: { members: { where: { leftAt: null } } },
    });
  }

  async sendMessage(
    channelId: string,
    text: string,
    parentId: string | null,
    actorType: ActorType,
    actorId: string,
  ) {
    const channel = await prisma.channel.findUniqueOrThrow({
      where: { id: channelId },
      select: { organizationId: true },
    });

    return eventService.create({
      organizationId: channel.organizationId,
      scopeType: "channel",
      scopeId: channelId,
      eventType: "message_sent",
      payload: { text },
      actorType,
      actorId,
      parentId: parentId ?? undefined,
    });
  }
}

export const channelService = new ChannelService();
