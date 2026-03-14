import type { CreateChannelInput, ActorType } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";

export class ChannelService {
  async create(input: CreateChannelInput, actorType: ActorType, actorId: string) {
    const [channel, _event] = await prisma.$transaction(async (tx) => {
      const channel = await tx.channel.create({
        data: {
          name: input.name,
          type: input.type ?? "default",
          organizationId: input.organizationId,
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
        payload: { channelId: channel.id, name: channel.name, type: channel.type },
        actorType,
        actorId,
      }, tx);

      return [channel, event] as const;
    });

    return channel;
  }

  async sendMessage(
    _channelId: string,
    _text: string,
    _parentId: string | null,
    _actorType: ActorType,
    _actorId: string,
  ) {
    throw new Error("Not implemented");
  }
}

export const channelService = new ChannelService();
