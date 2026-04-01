import type { CreateChannelInput, UpdateChannelInput, ActorType } from "@trace/gql";
import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { NotFoundError, AuthorizationError, ValidationError } from "../lib/errors.js";
import { eventService } from "./event.js";
import { participantService } from "./participant.js";
import {
  normalizeMessageInput,
  buildMessageEventPayload,
  hydrateMessages,
  type MessageWithSummary,
} from "./message-utils.js";
import { normalizeMembers } from "./member-utils.js";

export class ChannelService {
  async listChannels(
    organizationId: string,
    userId: string,
    options?: { projectId?: string; memberOnly?: boolean },
  ) {
    const where: Record<string, unknown> = { organizationId };

    if (options?.projectId) {
      where.projects = { some: { projectId: options.projectId } };
    }

    if (options?.memberOnly) {
      where.members = { some: { userId, leftAt: null } };
    }

    return prisma.channel.findMany({ where, include: { repo: true } });
  }

  async getChannel(channelId: string, userId: string) {
    await prisma.channel.findFirstOrThrow({
      where: { id: channelId, members: { some: { userId, leftAt: null } } },
      select: { id: true },
    });

    return prisma.channel.findUnique({ where: { id: channelId }, include: { repo: true } });
  }

  async getMembers(channelId: string) {
    const members = await prisma.channelMember.findMany({
      where: { channelId, leftAt: null },
      include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
    });
    return members.map((member) => ({ user: member.user, joinedAt: member.joinedAt }));
  }

  async create(input: CreateChannelInput, actorType: ActorType, actorId: string) {
    const [channel, _event] = await prisma.$transaction(async (tx) => {
      await tx.orgMember.findUniqueOrThrow({
        where: { userId_organizationId: { userId: actorId, organizationId: input.organizationId } },
      });

      const channelType = input.type ?? "coding";
      if (channelType === "coding" && !input.repoId) {
        throw new ValidationError("repoId is required for coding channels");
      }
      let repoName: string | null = null;
      if (input.repoId) {
        const repo = await tx.repo.findFirst({
          where: { id: input.repoId, organizationId: input.organizationId },
          select: { name: true },
        });
        if (!repo) throw new NotFoundError("Repo", input.repoId!);
        repoName = repo.name;
      }

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
          type: channelType,
          position,
          organizationId: input.organizationId,
          groupId: input.groupId ?? null,
          repoId: input.repoId ?? null,
          baseBranch: input.baseBranch ?? null,
          ...(input.projectIds?.length && {
            projects: { create: input.projectIds.map((projectId) => ({ projectId })) },
          }),
        },
      });

      await tx.channelMember.create({ data: { channelId: channel.id, userId: actorId } });
      const normalizedMembers = await normalizeMembers(tx, { type: "channel", id: channel.id });

      const event = await eventService.create({
        organizationId: input.organizationId,
        scopeType: "channel",
        scopeId: channel.id,
        eventType: "channel_created",
        payload: {
          channel: {
            id: channel.id, name: channel.name, type: channel.type, position: channel.position,
            groupId: channel.groupId, repoId: channel.repoId, baseBranch: channel.baseBranch,
            ...(channel.repoId && repoName ? { repo: { id: channel.repoId, name: repoName } } : {}),
            members: normalizedMembers,
          },
        },
        actorType,
        actorId,
      }, tx);

      return [channel, event] as const;
    });

    return channel;
  }

  async update(channelId: string, input: UpdateChannelInput, actorType: ActorType, actorId: string) {
    const channel = await prisma.$transaction(async (tx) => {
      const existing = await tx.channel.findUniqueOrThrow({
        where: { id: channelId },
        select: { organizationId: true },
      });

      await tx.orgMember.findUniqueOrThrow({
        where: { userId_organizationId: { userId: actorId, organizationId: existing.organizationId } },
      });

      const data: Record<string, unknown> = {};
      if (input.name !== undefined && input.name !== null) data.name = input.name;
      if (input.baseBranch !== undefined) data.baseBranch = input.baseBranch || null;

      if (Object.keys(data).length === 0) {
        return tx.channel.findUniqueOrThrow({ where: { id: channelId } });
      }

      const updated = await tx.channel.update({ where: { id: channelId }, data });

      await eventService.create({
        organizationId: existing.organizationId,
        scopeType: "system",
        scopeId: existing.organizationId,
        eventType: "channel_updated",
        payload: {
          channel: {
            id: updated.id, name: updated.name, type: updated.type,
            position: updated.position, groupId: updated.groupId,
            repoId: updated.repoId, baseBranch: updated.baseBranch,
          },
        },
        actorType,
        actorId,
      }, tx);

      return updated;
    });

    return channel;
  }

  async join(channelId: string, actorType: ActorType, actorId: string) {
    await prisma.$transaction(async (tx) => {
      const channel = await tx.channel.findUniqueOrThrow({
        where: { id: channelId },
        select: {
          id: true,
          name: true,
          type: true,
          position: true,
          groupId: true,
          organizationId: true,
          repoId: true,
          baseBranch: true,
          repo: { select: { name: true } },
        },
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

      const normalizedMembers = await normalizeMembers(tx, { type: "channel", id: channelId });

      await eventService.create({
        organizationId: channel.organizationId,
        scopeType: "channel",
        scopeId: channelId,
        eventType: "channel_member_added",
        payload: {
          userId: actorId,
          channel: {
            id: channel.id,
            name: channel.name,
            type: channel.type,
            position: channel.position,
            groupId: channel.groupId,
            repoId: channel.repoId,
            baseBranch: channel.baseBranch,
            ...(channel.repoId && channel.repo ? { repo: { id: channel.repoId, name: channel.repo.name } } : {}),
            members: normalizedMembers,
          },
        },
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
        select: {
          id: true,
          name: true,
          type: true,
          position: true,
          groupId: true,
          organizationId: true,
          repoId: true,
          baseBranch: true,
          repo: { select: { name: true } },
        },
      });

      const membership = await tx.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId: actorId } },
      });

      if (!membership || membership.leftAt !== null) {
        throw new AuthorizationError("You are not a member of this channel");
      }

      await tx.channelMember.update({
        where: { channelId_userId: { channelId, userId: actorId } },
        data: { leftAt: new Date() },
      });

      const normalizedMembers = await normalizeMembers(tx, { type: "channel", id: channelId });

      await eventService.create({
        organizationId: channel.organizationId,
        scopeType: "channel",
        scopeId: channelId,
        eventType: "channel_member_removed",
        payload: {
          userId: actorId,
          channel: {
            id: channel.id,
            name: channel.name,
            type: channel.type,
            position: channel.position,
            groupId: channel.groupId,
            repoId: channel.repoId,
            baseBranch: channel.baseBranch,
            ...(channel.repoId && channel.repo ? { repo: { id: channel.repoId, name: channel.repo.name } } : {}),
            members: normalizedMembers,
          },
        },
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

    // Agents can post to any channel in their org without membership
    const memberFilter = actorType === "agent"
      ? {}
      : { members: { some: { userId: actorId, leftAt: null } } };

    const channel = await prisma.channel.findFirstOrThrow({
      where: { id: channelId, ...memberFilter },
      select: { id: true, organizationId: true, type: true },
    });

    if (channel.type !== "text") {
      throw new ValidationError("Channel messages are only supported for text channels");
    }

    const message = await prisma.$transaction(async (tx) => {
      let validatedParentId: string | null = null;
      if (parentId) {
        const parentMessage = await tx.message.findUniqueOrThrow({
          where: { id: parentId },
          select: { id: true, channelId: true, parentMessageId: true },
        });
        if (parentMessage.channelId !== channel.id) {
          throw new ValidationError("Thread parent must belong to this channel");
        }
        if (parentMessage.parentMessageId) {
          throw new ValidationError("Thread replies must target the root message");
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
      throw new AuthorizationError("Only the original author can edit this message");
    }
    if (existing.deletedAt) {
      throw new ValidationError("Deleted messages cannot be edited");
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
      throw new ValidationError("Message is not a channel message");
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
      throw new AuthorizationError("Only the original author can delete this message");
    }
    if (existing.deletedAt) {
      const [hydrated] = await hydrateMessages([existing]);
      return hydrated;
    }

    const channelId = existing.channelId;
    if (!channelId) {
      throw new ValidationError("Message is not a channel message");
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
    // Agents can post to any channel in their org without membership
    const memberFilter = actorType === "agent"
      ? {}
      : { members: { some: { userId: actorId, leftAt: null } } };

    const channel = await prisma.channel.findFirstOrThrow({
      where: { id: channelId, type: "coding", ...memberFilter },
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
