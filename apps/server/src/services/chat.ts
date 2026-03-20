import type { CreateChatInput, ActorType } from "@trace/gql";
import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { participantService } from "./participant.js";
import { sanitizeHtml, extractMentions, stripHtml } from "./mention.js";
import { resolveActors, type ActorSummary } from "./actor.js";

function buildMemberKey(...userIds: string[]) {
  return userIds.sort().join(":");
}

type DbMessage = Prisma.MessageGetPayload<Record<string, never>>;

type MessageWithSummary = DbMessage & {
  replyCount: number;
  latestReplyAt: Date | null;
  threadRepliers: ActorSummary[];
};

const MAX_MESSAGE_LENGTH = 65536; // 64KB

function normalizeMessageInput(text?: string, html?: string) {
  if (!text && !html) {
    throw new Error("Either text or html must be provided");
  }

  if (text && text.length > MAX_MESSAGE_LENGTH) {
    throw new Error("Message text exceeds maximum length");
  }
  if (html && html.length > MAX_MESSAGE_LENGTH) {
    throw new Error("Message HTML exceeds maximum length");
  }

  if (html) {
    const cleanHtml = sanitizeHtml(html);
    return {
      text: text || stripHtml(cleanHtml),
      html: cleanHtml,
      mentions: extractMentions(cleanHtml),
    };
  }

  return {
    text: text!,
    html: null,
    mentions: [] as Array<{ userId: string; name: string }>,
  };
}

function buildMessageEventPayload(message: DbMessage) {
  return {
    messageId: message.id,
    parentMessageId: message.parentMessageId,
    text: message.text,
    html: message.html,
    mentions: message.mentions,
  };
}

export class ChatService {
  private async normalizeMembers(
    tx: Prisma.TransactionClient,
    chatId: string,
    organizationId: string,
  ): Promise<Array<{ user: { id: string; name: string | null; avatarUrl: string | null }; joinedAt: string }>> {
    const members = await tx.chatMember.findMany({
      where: { chatId, organizationId, leftAt: null },
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

    const validMembers = await prisma.user.findMany({
      where: {
        id: { in: allMemberIds },
        organizationId: input.organizationId,
      },
      select: { id: true, name: true },
    });
    if (validMembers.length !== allMemberIds.length) {
      throw new Error("All chat members must belong to the organization");
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
        organizationId: input.organizationId,
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
      : (input.name ??
          validMembers
            .map((m) => m.name ?? "Unknown")
            .join(", "));

    const createChatInTx = async (tx: Prisma.TransactionClient) => {
      const chat = await tx.chat.create({
        data: {
          type: isDM ? "dm" : "group",
          name: groupName,
          dmKey: memberKey,
          organizationId: input.organizationId,
          createdById: actorId,
          members: {
            create: allMemberIds.map((userId) => ({ userId })),
          },
        },
        include: {
          members: true,
        },
      });

      // Auto-subscribe all members as participants
      for (const userId of allMemberIds) {
        await tx.participant.create({
          data: {
            userId,
            scopeType: "chat",
            scopeId: chat.id,
            organizationId: input.organizationId,
          },
        });
      }

      // Fetch members with user data for the event payload
      const normalizedMembers = await this.normalizeMembers(tx, chat.id, input.organizationId);

      const event = await eventService.create(
        {
          organizationId: input.organizationId,
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
            organizationId: input.organizationId,
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

  private async hydrateMessages(messages: DbMessage[]): Promise<MessageWithSummary[]> {
    if (messages.length === 0) return [];

    const rootIds = messages.filter((message) => !message.parentMessageId).map((message) => message.id);
    const replies = rootIds.length
      ? await prisma.message.findMany({
          where: { parentMessageId: { in: rootIds } },
          orderBy: { createdAt: "desc" },
          select: {
            parentMessageId: true,
            actorType: true,
            actorId: true,
            createdAt: true,
          },
        })
      : [];

    const actorMap = await resolveActors(replies.map((reply) => ({
      actorType: reply.actorType,
      actorId: reply.actorId,
    })));

    const summaries = new Map<string, {
      replyCount: number;
      latestReplyAt: Date | null;
      threadRepliers: ActorSummary[];
      seenActors: Set<string>;
    }>();

    for (const reply of replies) {
      if (!reply.parentMessageId) continue;

      let summary = summaries.get(reply.parentMessageId);
      if (!summary) {
        summary = {
          replyCount: 0,
          latestReplyAt: null,
          threadRepliers: [],
          seenActors: new Set<string>(),
        };
        summaries.set(reply.parentMessageId, summary);
      }

      summary.replyCount += 1;
      if (!summary.latestReplyAt) {
        summary.latestReplyAt = reply.createdAt;
      }

      const actorKey = `${reply.actorType}:${reply.actorId}`;
      if (summary.seenActors.has(actorKey) || summary.threadRepliers.length >= 3) {
        continue;
      }

      summary.seenActors.add(actorKey);
      summary.threadRepliers.push(
        actorMap.get(actorKey) ?? {
          type: reply.actorType,
          id: reply.actorId,
          name: null,
          avatarUrl: null,
        },
      );
    }

    return messages.map((message) => {
      const summary = message.parentMessageId ? null : summaries.get(message.id);
      return {
        ...message,
        replyCount: summary?.replyCount ?? 0,
        latestReplyAt: summary?.latestReplyAt ?? null,
        threadRepliers: summary?.threadRepliers ?? [],
      };
    });
  }

  async sendMessage({
    chatId,
    organizationId,
    text,
    html,
    parentId,
    actorType,
    actorId,
  }: {
    chatId: string;
    organizationId: string;
    text?: string;
    html?: string;
    parentId?: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const normalized = normalizeMessageInput(text, html);

    const message = await prisma.$transaction(async (tx) => {
      const chat = await tx.chat.findFirstOrThrow({
        where: {
          id: chatId,
          organizationId,
          members: { some: { userId: actorId, leftAt: null } },
        },
        select: { id: true, organizationId: true },
      });

      let validatedParentId: string | null = null;
      if (parentId) {
        const parentMessage = await tx.message.findUniqueOrThrow({
          where: { id: parentId },
          select: {
            id: true,
            organizationId: true,
            chatId: true,
            parentMessageId: true,
          },
        });

        if (
          parentMessage.organizationId !== chat.organizationId ||
          parentMessage.chatId !== chat.id
        ) {
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
          organizationId: chat.organizationId,
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
          organizationId: chat.organizationId,
          scopeType: "chat",
          scopeId: chat.id,
          eventType: "message_sent",
          payload: buildMessageEventPayload(createdMessage) as unknown as PrismaTypes.InputJsonValue,
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
        organizationId: message.organizationId,
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
    organizationId,
    actorType,
    actorId,
  }: {
    messageId: string;
    html: string;
    organizationId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const normalized = normalizeMessageInput(undefined, html);

    const existing = await prisma.message.findFirstOrThrow({
      where: {
        id: messageId,
        organizationId,
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
      const [hydratedExisting] = await this.hydrateMessages([existing]);
      return hydratedExisting;
    }

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
        where: { id: updatedMessage.chatId },
        data: { updatedAt: editedAt },
      });

      await eventService.create(
        {
          organizationId: updatedMessage.organizationId,
          scopeType: "chat",
          scopeId: updatedMessage.chatId,
          eventType: "message_edited",
          payload: buildMessageEventPayload(updatedMessage) as unknown as PrismaTypes.InputJsonValue,
          actorType,
          actorId,
        },
        tx,
      );

      return updatedMessage;
    });

    const [hydratedMessage] = await this.hydrateMessages([updated]);
    return hydratedMessage;
  }

  async deleteMessage({
    messageId,
    organizationId,
    actorType,
    actorId,
  }: {
    messageId: string;
    organizationId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const existing = await prisma.message.findFirstOrThrow({
      where: {
        id: messageId,
        organizationId,
        chat: {
          members: { some: { userId: actorId, leftAt: null } },
        },
      },
    });

    if (existing.actorType !== actorType || existing.actorId !== actorId) {
      throw new Error("Only the original author can delete this message");
    }

    if (existing.deletedAt) {
      const [hydratedExisting] = await this.hydrateMessages([existing]);
      return hydratedExisting;
    }

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
        where: { id: deletedMessage.chatId },
        data: { updatedAt: deletedAt },
      });

      await eventService.create(
        {
          organizationId: deletedMessage.organizationId,
          scopeType: "chat",
          scopeId: deletedMessage.chatId,
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

    const [hydratedMessage] = await this.hydrateMessages([updated]);
    return hydratedMessage;
  }

  async getMessages(
    chatId: string,
    organizationId: string,
    userId: string,
    opts?: { after?: Date; before?: Date; limit?: number },
  ) {
    await prisma.chat.findFirstOrThrow({
      where: {
        id: chatId,
        organizationId,
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
        organizationId,
        parentMessageId: null,
        ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
      },
      orderBy: { createdAt: isBefore ? "desc" : "asc" },
      take: opts?.limit ?? 200,
    });

    const orderedMessages = isBefore ? messages.reverse() : messages;
    return this.hydrateMessages(orderedMessages);
  }

  async getReplies(
    rootMessageId: string,
    organizationId: string,
    userId: string,
    opts?: { after?: Date; limit?: number },
  ) {
    const rootMessage = await prisma.message.findFirstOrThrow({
      where: {
        id: rootMessageId,
        organizationId,
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

    return this.hydrateMessages(replies);
  }

  async addMember(
    chatId: string,
    userId: string,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    await prisma.$transaction(async (tx) => {
      const chat = await tx.chat.findFirstOrThrow({
        where: {
          id: chatId,
          organizationId,
          members: { some: { userId: actorId, leftAt: null } },
        },
        select: { type: true, organizationId: true },
      });

      if (chat.type !== "group") {
        throw new Error("Cannot add members to a DM");
      }

      const targetUser = await tx.user.findFirst({
        where: { id: userId, organizationId: chat.organizationId },
        select: { id: true },
      });
      if (!targetUser) {
        throw new Error("User must belong to the chat organization");
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
          data: { organizationId: chat.organizationId, leftAt: null, joinedAt: new Date() },
        });
      } else {
        await tx.chatMember.create({
          data: { chatId, userId, organizationId: chat.organizationId },
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
          organizationId: chat.organizationId,
        },
        update: { organizationId: chat.organizationId },
      });

      // Fetch updated members with user data for the event payload
      const normalizedMembers = await this.normalizeMembers(tx, chatId, chat.organizationId);

      await eventService.create(
        {
          organizationId: chat.organizationId,
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
      where: { id: chatId, organizationId },
      include: { members: { where: { leftAt: null } } },
    });
  }

  async leave(chatId: string, organizationId: string, actorType: ActorType, actorId: string) {
    await prisma.$transaction(async (tx) => {
      const chat = await tx.chat.findFirstOrThrow({
        where: {
          id: chatId,
          organizationId,
          members: { some: { userId: actorId, leftAt: null } },
        },
        select: { type: true, organizationId: true },
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
          organizationId: chat.organizationId,
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
      const normalizedMembers = await this.normalizeMembers(tx, chatId, chat.organizationId);

      await eventService.create(
        {
          organizationId: chat.organizationId,
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
      where: { id: chatId, organizationId },
      include: { members: { where: { leftAt: null } } },
    });
  }

  async rename(
    chatId: string,
    name: string,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const chat = await tx.chat.findFirstOrThrow({
        where: {
          id: chatId,
          organizationId,
          members: { some: { userId: actorId, leftAt: null } },
        },
        select: { type: true, organizationId: true },
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
          organizationId: chat.organizationId,
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

  async getChats(organizationId: string, userId: string) {
    return prisma.chat.findMany({
      where: {
        organizationId,
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

  async getChat(chatId: string, organizationId: string, userId: string) {
    return prisma.chat.findFirst({
      where: {
        id: chatId,
        organizationId,
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
