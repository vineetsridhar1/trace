import type { CreateChannelInput, ActorType } from "@trace/gql";
import { prisma } from "../lib/db.js";

export class ChannelService {
  async create(input: CreateChannelInput) {
    const channel = await prisma.channel.create({
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
