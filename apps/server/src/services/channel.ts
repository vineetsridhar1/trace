import type { CreateChannelInput, ActorType } from "@trace/gql";
import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { participantService } from "./participant.js";
import {
  normalizeMessageInput,
  buildMessageEventPayload,
  hydrateMessages,
  type MessageWithSummary,
} from "./message-utils.js";

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
      await tx.orgMember.findUniqueOrThrow({
        where: { userId_organizationId: { userId: actorId, organizationId: input.organizationId } },
      });

      let position = input.position ?? null;
      if (position === null) {
        if (input.groupId) {
          const lastInGroup = await tx.channel.findFirst({
            where: { groupId: input.groupId },
            orderBy: { position: "desc" },
            select: { position: true },
          });
          position = (lastInGroup?.position ?? -1) + 1;
        } else {
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
            projects: { create: input.projectIds.map((projectId) => ({ projectId })) },
          }),
        },
      });

      await tx.channelMember.create({ data: { channelId: channel.id, userId: actorId } });
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

      await tx.orgMember.findUniqueOrThrow({
        where: { userId_organizationId: { userId: actorId, organizationId: channel.organizationId } },
      });

      const existingMembership = await tx.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId: actorId } },
      });

      if (existingMembership?.leftAt === null) return;

      if (existingMembership) {
        await tx.channelMember.update({
          where: { channelId_userId: { channelId, userId: actorId } },
          data: { leftAt: null, joinedAt: new Date() },
        });
      } else {
        await tx.channelMember.create({ data: { channelId, userId: actorId } });
      }

      const normalizedMembers = await this.normalizeMembers(tx, channelId);

      await eventService.create({
        organizationId: channel.organizationId,
        scopeType: "channel",
        scopeId: channelId,
        eventType: "channel_member_added",
        payload: { userId: actorId, channel: { id: channel.id, name: channel.name, type: channel.type, members: normalizedMembers } },
        actorType,
        actorId,
      }, tx);
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

      await eventService.create({
        organizationId: channel.organizationId,
        scopeType: "channel",
        scopeId: channelId,
        eventType: "channel_member_removed",
        payload: { userId: actorId, channel: { id: channel.id, name: channel.name, type: channel.type, members: normalizedMembers } },
        actorType,
        actorId,
      }, tx);
    });

    return prisma.channel.findUniqueOrThrow({
      where: { id: channelId },
      include: { members: { where: { leftAt: null } } },
    });
  }

  // --- Channel Messages (Message model, for text channels) ---

  async sendChannelMessage({
    channelId,
    text,
    html,
    parentId,
    actorType,
    actorId,
  }: {
    channelId: string;
    text?: string;
    html?: string;
    parentId?: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const normalized = normalizeMessageInput(text, html);

    const channel = await prisma.channel.findFirstOrThrow({
      where: { id: channelId, members: { some: { userId: actorId, leftAt: null } } },
      select: { id: true, organizationId: true, type: true },
    });

    if (channel.type !== "text") {
      throw new Error("Channel messages are only supported for text channels");
    }

    const message = await prisma.$transaction(async (tx) => {
      let validatedParentId: string | null = null;
      if (parentId) {
        const parentMessage = await tx.message.findUniqueOrThrow({
          where: { id: parentId },
          select: { id: true, channelId: true, parentMessageId: true },
        });
        if (parentMessage.channelId !== channel.id) {
          throw new Error("Thread parent must belong to this channel");
        }
        if (parentMessage.parentMessageId) {
          throw new Error("Thread replies must target the root message");
        }
        validatedParentId = parentMessage.id;
      }

      const createdMessage = await tx.message.create({
        data: {
          channelId: channel.id,
          actorType,
          actorId,
          text: normalized.text,
          html: normalized.html,
          mentions: normalized.mentions.length
            ? (normalized.mentions as unknown as PrismaTypes.InputJsonValue)
            : Prisma.DbNull,
          parentMessageId: validatedParentId,
        },
      });

      await tx.channel.update({
        where: { id: channel.id },
        data: { updatedAt: createdMessage.createdAt },
      });

      await eventService.create({
        organizationId: channel.organizationId,
        scopeType: "channel",
        scopeId: channel.id,
        eventType: "message_sent",
        payload: buildMessageEventPayload(createdMessage) as unknown as PrismaTypes.InputJsonValue,
        actorType,
        actorId,
      }, tx);

      return createdMessage;
    });

    if (message.parentMessageId) {
      await participantService.subscribe({
        userId: actorId,
        scopeType: "thread",
        scopeId: message.parentMessageId,
      });
    }

    return {
      ...message,
      replyCount: 0,
      latestReplyAt: null,
      threadRepliers: [],
    } satisfies MessageWithSummary;
  }

  async editChannelMessage({
    messageId,
    html,
    actorType,
    actorId,
  }: {
    messageId: string;
    html: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const normalized = normalizeMessageInput(undefined, html);

    const existing = await prisma.message.findFirstOrThrow({
      where: {
        id: messageId,
        channelId: { not: null },
        channel: { type: "text", members: { some: { userId: actorId, leftAt: null } } },
      },
    });

    if (existing.actorType !== actorType || existing.actorId !== actorId) {
      throw new Error("Only the original author can edit this message");
    }
    if (existing.deletedAt) {
      throw new Error("Deleted messages cannot be edited");
    }

    if (
      existing.text === normalized.text &&
      existing.html === normalized.html &&
      JSON.stringify(existing.mentions ?? null) === JSON.stringify(normalized.mentions)
    ) {
      const [hydrated] = await hydrateMessages([existing]);
      return hydrated;
    }

    const channelId = existing.channelId;
    if (!channelId) {
      throw new Error("Message is not a channel message");
    }

    const channel = await prisma.channel.findUniqueOrThrow({
      where: { id: channelId },
      select: { organizationId: true },
    });

    const editedAt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const updatedMessage = await tx.message.update({
        where: { id: messageId },
        data: {
          text: normalized.text,
          html: normalized.html,
          mentions: normalized.mentions.length
            ? (normalized.mentions as unknown as PrismaTypes.InputJsonValue)
            : Prisma.DbNull,
          editedAt,
        },
      });

      await tx.channel.update({
        where: { id: channelId },
        data: { updatedAt: editedAt },
      });

      await eventService.create({
        organizationId: channel.organizationId,
        scopeType: "channel",
        scopeId: channelId,
        eventType: "message_edited",
        payload: buildMessageEventPayload(updatedMessage) as unknown as PrismaTypes.InputJsonValue,
        actorType,
        actorId,
      }, tx);

      return updatedMessage;
    });

    const [hydrated] = await hydrateMessages([updated]);
    return hydrated;
  }

  async deleteChannelMessage({
    messageId,
    actorType,
    actorId,
  }: {
    messageId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const existing = await prisma.message.findFirstOrThrow({
      where: {
        id: messageId,
        channelId: { not: null },
        channel: { type: "text", members: { some: { userId: actorId, leftAt: null } } },
      },
    });

    if (existing.actorType !== actorType || existing.actorId !== actorId) {
      throw new Error("Only the original author can delete this message");
    }
    if (existing.deletedAt) {
      const [hydrated] = await hydrateMessages([existing]);
      return hydrated;
    }

    const channelId = existing.channelId;
    if (!channelId) {
      throw new Error("Message is not a channel message");
    }

    const channel = await prisma.channel.findUniqueOrThrow({
      where: { id: channelId },
      select: { organizationId: true },
    });

    const deletedAt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const deletedMessage = await tx.message.update({
        where: { id: messageId },
        data: { text: "", html: null, mentions: Prisma.DbNull, deletedAt },
      });

      await tx.channel.update({
        where: { id: channelId },
        data: { updatedAt: deletedAt },
      });

      await eventService.create({
        organizationId: channel.organizationId,
        scopeType: "channel",
        scopeId: channelId,
        eventType: "message_deleted",
        payload: {
          messageId: deletedMessage.id,
          channelId: deletedMessage.channelId,
          parentMessageId: deletedMessage.parentMessageId,
          deletedAt: deletedMessage.deletedAt?.toISOString() ?? null,
        } as PrismaTypes.InputJsonValue,
        actorType,
        actorId,
      }, tx);

      return deletedMessage;
    });

    const [hydrated] = await hydrateMessages([updated]);
    return hydrated;
  }

  async getChannelMessages(
    channelId: string,
    userId: string,
    opts?: { after?: Date; before?: Date; limit?: number },
  ) {
    await prisma.channel.findFirstOrThrow({
      where: { id: channelId, type: "text", members: { some: { userId, leftAt: null } } },
      select: { id: true },
    });

    const createdAtFilter: Record<string, Date> = {};
    if (opts?.after) createdAtFilter.gt = opts.after;
    if (opts?.before) createdAtFilter.lt = opts.before;
    const isBefore = !!opts?.before && !opts.after;

    const messages = await prisma.message.findMany({
      where: {
        channelId,
        parentMessageId: null,
        ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
      },
      orderBy: { createdAt: isBefore ? "desc" : "asc" },
      take: opts?.limit ?? 200,
    });

    const orderedMessages = isBefore ? messages.reverse() : messages;
    return hydrateMessages(orderedMessages);
  }

  async getChannelThreadReplies(
    rootMessageId: string,
    userId: string,
    opts?: { after?: Date; limit?: number },
  ) {
    const rootMessage = await prisma.message.findFirstOrThrow({
      where: {
        id: rootMessageId,
        channelId: { not: null },
        channel: { type: "text", members: { some: { userId, leftAt: null } } },
      },
      select: { id: true },
    });

    const createdAtFilter: Record<string, Date> = {};
    if (opts?.after) createdAtFilter.gt = opts.after;

    const replies = await prisma.message.findMany({
      where: {
        parentMessageId: rootMessage.id,
        ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: opts?.limit ?? 200,
    });

    return hydrateMessages(replies);
  }

  // --- Legacy event-based sendMessage (used by coding channels) ---

  async sendMessage(
    channelId: string,
    text: string,
    parentId: string | null,
    actorType: ActorType,
    actorId: string,
  ) {
    const channel = await prisma.channel.findFirstOrThrow({
      where: { id: channelId, type: "coding", members: { some: { userId: actorId, leftAt: null } } },
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
