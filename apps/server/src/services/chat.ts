import type { CreateChatInput, ActorType } from "@trace/gql";
import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { participantService } from "./participant.js";
import {
  normalizeMessageInput,
  buildMessageEventPayload,
  resolveEventOrgId,
  hydrateMessages,
  type MessageWithSummary,
} from "./message-utils.js";

function buildMemberKey(...userIds: string[]) {
  return userIds.sort().join(":");
}

export class ChatService {
  private async normalizeMembers(
    tx: Prisma.TransactionClient,
    chatId: string,
  ): Promise<
    Array<{ user: { id: string; name: string | null; avatarUrl: string | null }; joinedAt: string }>
  > {
    const members = await tx.chatMember.findMany({
      where: { chatId, leftAt: null },
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

  async create(input: CreateChatInput, actorType: ActorType, actorId: string) {
    const memberIds = [...new Set(input.memberIds)];
    if (memberIds.length === 0) {
      throw new Error("Chats must include at least one other member");
    }

    const isDM = memberIds.length === 1;
    const allMemberIds = isDM
      ? [actorId, memberIds[0]]
      : [actorId, ...memberIds.filter((id) => id !== actorId)];

    // Validate all members exist (any user can chat with any user)
    const validMembers = await prisma.user.findMany({
      where: { id: { in: allMemberIds } },
      select: { id: true, name: true },
    });
    if (validMembers.length !== allMemberIds.length) {
      throw new Error("One or more users not found");
    }

    // Deduplication: check for existing chat with the same members
    const memberKey = buildMemberKey(...allMemberIds);

    if (isDM) {
      const targetId = memberIds[0];
      if (actorId === targetId) {
        throw new Error("Cannot create a DM with yourself");
      }
    }

    const existing = await prisma.chat.findFirst({
      where: {
        type: isDM ? "dm" : "group",
        dmKey: memberKey,
      },
      include: {
        members: {
          where: { leftAt: null },
        },
      },
    });

    if (existing) return existing;

    // Default group name: comma-separated member names
    const groupName = isDM
      ? null
      : (input.name ?? validMembers.map((m) => m.name ?? "Unknown").join(", "));

    const eventOrgId = await resolveEventOrgId(actorId);

    const createChatInTx = async (tx: Prisma.TransactionClient) => {
      const chat = await tx.chat.create({
        data: {
          type: isDM ? "dm" : "group",
          name: groupName,
          dmKey: memberKey,
          createdById: actorId,
          members: {
            create: allMemberIds.map((userId) => ({ userId })),
          },
        },
        include: {
          members: true,
        },
      });

      // Auto-subscribe all members as participants (no org for chat participants)
      for (const userId of allMemberIds) {
        await tx.participant.create({
          data: {
            userId,
            scopeType: "chat",
            scopeId: chat.id,
          },
        });
      }

      // Fetch members with user data for the event payload
      const normalizedMembers = await this.normalizeMembers(tx, chat.id);

      const event = await eventService.create(
        {
          organizationId: eventOrgId,
          scopeType: "chat",
          scopeId: chat.id,
          eventType: "chat_created",
          payload: {
            chat: {
              id: chat.id,
              type: chat.type,
              name: chat.name,
              members: normalizedMembers,
              createdAt: chat.createdAt.toISOString(),
              updatedAt: chat.updatedAt.toISOString(),
            },
          },
          actorType,
          actorId,
        },
        tx,
      );

      return [chat, event] as const;
    };

    let result: readonly [Awaited<ReturnType<typeof prisma.chat.create>>, unknown];
    try {
      result = await prisma.$transaction(createChatInTx);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return prisma.chat.findFirstOrThrow({
          where: {
            type: isDM ? "dm" : "group",
            dmKey: memberKey,
          },
          include: {
            members: {
              where: { leftAt: null },
            },
          },
        });
      }
      throw error;
    }

    const [chat, _event] = result;

    return chat;
  }

  async sendMessage({
    chatId,
    text,
    html,
    parentId,
    clientMutationId,
    actorType,
    actorId,
  }: {
    chatId: string;
    text?: string;
    html?: string;
    parentId?: string;
    clientMutationId?: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const normalized = normalizeMessageInput(text, html);

    const eventOrgId = await resolveEventOrgId(actorId);

    const message = await prisma.$transaction(async (tx) => {
      const chat = await tx.chat.findFirstOrThrow({
        where: {
          id: chatId,
          members: { some: { userId: actorId, leftAt: null } },
        },
        select: { id: true },
      });

      let validatedParentId: string | null = null;
      if (parentId) {
        const parentMessage = await tx.message.findUniqueOrThrow({
          where: { id: parentId },
          select: {
            id: true,
            chatId: true,
            parentMessageId: true,
          },
        });

        if (parentMessage.chatId !== chat.id) {
          throw new Error("Thread parent must belong to this chat");
        }

        if (parentMessage.parentMessageId) {
          throw new Error("Thread replies must target the root message");
        }

        validatedParentId = parentMessage.id;
      }

      const createdMessage = await tx.message.create({
        data: {
          chatId: chat.id,
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

      await tx.chat.update({
        where: { id: chat.id },
        data: { updatedAt: createdMessage.createdAt },
      });

      await eventService.create(
        {
          organizationId: eventOrgId,
          scopeType: "chat",
          scopeId: chat.id,
          eventType: "message_sent",
          payload: buildMessageEventPayload(
            createdMessage,
            clientMutationId,
          ) as unknown as PrismaTypes.InputJsonValue,
          actorType,
          actorId,
        },
        tx,
      );

      return createdMessage;
    });

    if (message.parentMessageId) {
      await participantService.subscribe({
        userId: actorId,
        scopeType: "thread",
        scopeId: message.parentMessageId,
      });
    }

    // New messages have no replies yet — hydrate inline to avoid extra queries
    return {
      ...message,
      replyCount: 0,
      latestReplyAt: null,
      threadRepliers: [],
    } satisfies MessageWithSummary;
  }

  async editMessage({
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
        chat: {
          members: { some: { userId: actorId, leftAt: null } },
        },
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
      const [hydratedExisting] = await hydrateMessages([existing]);
      return hydratedExisting;
    }

    const chatId = existing.chatId;
    if (!chatId) {
      throw new Error("Message is not a chat message");
    }

    const eventOrgId = await resolveEventOrgId(actorId);
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

      await tx.chat.update({
        where: { id: chatId },
        data: { updatedAt: editedAt },
      });

      await eventService.create(
        {
          organizationId: eventOrgId,
          scopeType: "chat",
          scopeId: chatId,
          eventType: "message_edited",
          payload: buildMessageEventPayload(
            updatedMessage,
          ) as unknown as PrismaTypes.InputJsonValue,
          actorType,
          actorId,
        },
        tx,
      );

      return updatedMessage;
    });

    const [hydratedMessage] = await hydrateMessages([updated]);
    return hydratedMessage;
  }

  async deleteMessage({
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
        chat: {
          members: { some: { userId: actorId, leftAt: null } },
        },
      },
    });

    if (existing.actorType !== actorType || existing.actorId !== actorId) {
      throw new Error("Only the original author can delete this message");
    }

    if (existing.deletedAt) {
      const [hydratedExisting] = await hydrateMessages([existing]);
      return hydratedExisting;
    }

    const chatId = existing.chatId;
    if (!chatId) {
      throw new Error("Message is not a chat message");
    }

    const eventOrgId = await resolveEventOrgId(actorId);
    const deletedAt = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const deletedMessage = await tx.message.update({
        where: { id: messageId },
        data: {
          text: "",
          html: null,
          mentions: Prisma.DbNull,
          deletedAt,
        },
      });

      await tx.chat.update({
        where: { id: chatId },
        data: { updatedAt: deletedAt },
      });

      await eventService.create(
        {
          organizationId: eventOrgId,
          scopeType: "chat",
          scopeId: chatId,
          eventType: "message_deleted",
          payload: {
            messageId: deletedMessage.id,
            chatId: deletedMessage.chatId,
            parentMessageId: deletedMessage.parentMessageId,
            deletedAt: deletedMessage.deletedAt?.toISOString() ?? null,
          } as PrismaTypes.InputJsonValue,
          actorType,
          actorId,
        },
        tx,
      );

      return deletedMessage;
    });

    const [hydratedMessage] = await hydrateMessages([updated]);
    return hydratedMessage;
  }

  async getMessages(
    chatId: string,
    userId: string,
    opts?: { after?: Date; before?: Date; limit?: number },
  ) {
    await prisma.chat.findFirstOrThrow({
      where: {
        id: chatId,
        members: { some: { userId, leftAt: null } },
      },
      select: { id: true },
    });

    const createdAtFilter: Record<string, Date> = {};
    if (opts?.after) createdAtFilter.gt = opts.after;
    if (opts?.before) createdAtFilter.lt = opts.before;
    const isBefore = !!opts?.before && !opts.after;

    const messages = await prisma.message.findMany({
      where: {
        chatId,
        parentMessageId: null,
        ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
      },
      orderBy: { createdAt: isBefore ? "desc" : "asc" },
      take: opts?.limit ?? 200,
    });

    const orderedMessages = isBefore ? messages.reverse() : messages;
    return hydrateMessages(orderedMessages);
  }

  async getReplies(rootMessageId: string, userId: string, opts?: { after?: Date; limit?: number }) {
    const rootMessage = await prisma.message.findFirstOrThrow({
      where: {
        id: rootMessageId,
        chat: {
          members: { some: { userId, leftAt: null } },
        },
      },
      select: {
        id: true,
        parentMessageId: true,
      },
    });

    if (rootMessage.parentMessageId) {
      throw new Error("Thread root must be a top-level message");
    }

    const replies = await prisma.message.findMany({
      where: {
        parentMessageId: rootMessageId,
        ...(opts?.after ? { createdAt: { gt: opts.after } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: opts?.limit ?? 200,
    });

    return hydrateMessages(replies);
  }

  async addMember(chatId: string, userId: string, actorType: ActorType, actorId: string) {
    const eventOrgId = await resolveEventOrgId(actorId);

    await prisma.$transaction(async (tx) => {
      const chat = await tx.chat.findFirstOrThrow({
        where: {
          id: chatId,
          members: { some: { userId: actorId, leftAt: null } },
        },
        select: { type: true },
      });

      if (chat.type !== "group") {
        throw new Error("Cannot add members to a DM");
      }

      // Validate target user exists
      const targetUser = await tx.user.findFirst({
        where: { id: userId },
        select: { id: true },
      });
      if (!targetUser) {
        throw new Error("User not found");
      }

      const existingMembership = await tx.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
      });

      if (existingMembership?.leftAt === null) {
        return;
      }

      if (existingMembership) {
        await tx.chatMember.update({
          where: { chatId_userId: { chatId, userId } },
          data: { leftAt: null, joinedAt: new Date() },
        });
      } else {
        await tx.chatMember.create({
          data: { chatId, userId },
        });
      }

      await tx.participant.upsert({
        where: {
          userId_scopeType_scopeId: { userId, scopeType: "chat", scopeId: chatId },
        },
        create: {
          userId,
          scopeType: "chat",
          scopeId: chatId,
        },
        update: {},
      });

      // Fetch updated members with user data for the event payload
      const normalizedMembers = await this.normalizeMembers(tx, chatId);

      await eventService.create(
        {
          organizationId: eventOrgId,
          scopeType: "chat",
          scopeId: chatId,
          eventType: "chat_member_added",
          payload: { userId, members: normalizedMembers },
          actorType,
          actorId,
        },
        tx,
      );
    });

    return prisma.chat.findFirstOrThrow({
      where: { id: chatId },
      include: { members: { where: { leftAt: null } } },
    });
  }

  async leave(chatId: string, actorType: ActorType, actorId: string) {
    const eventOrgId = await resolveEventOrgId(actorId);

    await prisma.$transaction(async (tx) => {
      const chat = await tx.chat.findFirstOrThrow({
        where: {
          id: chatId,
          members: { some: { userId: actorId, leftAt: null } },
        },
        select: { type: true },
      });

      if (chat.type !== "group") {
        throw new Error("Cannot leave a DM");
      }

      await tx.chatMember.update({
        where: { chatId_userId: { chatId, userId: actorId } },
        data: { leftAt: new Date() },
      });

      await tx.participant.deleteMany({
        where: {
          userId: actorId,
          scopeType: "chat",
          scopeId: chatId,
        },
      });

      // Clean up thread subscriptions for threads in this chat
      await tx.$executeRaw`
        DELETE FROM "Participant"
        WHERE "userId" = ${actorId}
          AND "scopeType" = 'thread'::"ParticipantScope"
          AND "scopeId" IN (
            SELECT id FROM "Message" WHERE "chatId" = ${chatId} AND "parentMessageId" IS NULL
          )
      `;

      // Fetch remaining members with user data for the event payload
      const normalizedMembers = await this.normalizeMembers(tx, chatId);

      await eventService.create(
        {
          organizationId: eventOrgId,
          scopeType: "chat",
          scopeId: chatId,
          eventType: "chat_member_removed",
          payload: { userId: actorId, members: normalizedMembers },
          actorType,
          actorId,
        },
        tx,
      );
    });

    return prisma.chat.findFirstOrThrow({
      where: { id: chatId },
      include: { members: { where: { leftAt: null } } },
    });
  }

  async rename(chatId: string, name: string, actorType: ActorType, actorId: string) {
    const eventOrgId = await resolveEventOrgId(actorId);

    return prisma.$transaction(async (tx) => {
      const chat = await tx.chat.findFirstOrThrow({
        where: {
          id: chatId,
          members: { some: { userId: actorId, leftAt: null } },
        },
        select: { type: true },
      });

      if (chat.type !== "group") {
        throw new Error("Cannot rename a DM");
      }

      const updated = await tx.chat.update({
        where: { id: chatId },
        data: { name },
        include: { members: { where: { leftAt: null } } },
      });

      await eventService.create(
        {
          organizationId: eventOrgId,
          scopeType: "chat",
          scopeId: chatId,
          eventType: "chat_renamed",
          payload: { name },
          actorType,
          actorId,
        },
        tx,
      );

      return updated;
    });
  }

  async getChats(userId: string) {
    return prisma.chat.findMany({
      where: {
        members: { some: { userId, leftAt: null } },
      },
      include: {
        members: {
          where: { leftAt: null },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getChat(chatId: string, userId: string) {
    return prisma.chat.findFirst({
      where: {
        id: chatId,
        members: { some: { userId, leftAt: null } },
      },
      include: {
        members: {
          where: { leftAt: null },
        },
      },
    });
  }
}

export const chatService = new ChatService();
