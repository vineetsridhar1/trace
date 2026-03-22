import type { CreateChannelInput, ActorType } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";

export class ChannelService {
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
          type: input.type ?? "default",
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

      const event = await eventService.create({
        organizationId: input.organizationId,
        scopeType: "channel",
        scopeId: channel.id,
        eventType: "channel_created",
        payload: { channel: { id: channel.id, name: channel.name, type: channel.type, position: channel.position, groupId: channel.groupId } },
        actorType,
        actorId,
      }, tx);

      return [channel, event] as const;
    });

    return channel;
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
