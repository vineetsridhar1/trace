import type { CreateChatInput, ActorType } from "@trace/gql";
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
import { visibleChannelWhere, visibleSessionWhere } from "./access.js";

/**
 * Upper bound on how many (most recently active) sessions the event search
 * scans. Keeps the unindexed `payload::text ILIKE` scan and the `scopeId IN (…)`
 * clause bounded regardless of how many sessions an org accumulates.
 */
const MAX_SEARCH_SESSIONS = 500;

/** A search hit spanning both chat/channel messages and session conversation events. */
export interface MessageSearchHit {
  id: string;
  text: string;
  createdAt: Date;
  actorType: string;
  actorId: string;
  chatId: string | null;
  channelId: string | null;
  sessionId: string | null;
  sessionGroupId: string | null;
  /** Coding tool of the source session, used to label agent hits (e.g. "Claude Code"). */
  agentTool: string | null;
}

/** Pull the human-readable text out of a session conversation event payload. */
function extractSessionEventText(eventType: string, payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (eventType === "message_sent") {
    return typeof p.text === "string" ? p.text : null;
  }
  // Assistant output: { type: "assistant", message: { content: [{ type: "text", text }] } }
  const message = p.message;
  if (message && typeof message === "object") {
    const content = (message as Record<string, unknown>).content;
    if (Array.isArray(content)) {
      const parts = content
        .filter(
          (c): c is { text: string } =>
            !!c &&
            typeof c === "object" &&
            (c as Record<string, unknown>).type === "text" &&
            typeof (c as Record<string, unknown>).text === "string",
        )
        .map((c) => c.text);
      if (parts.length) return parts.join("\n");
    }
  }
  return null;
}

function buildMemberKey(...userIds: string[]) {
  return userIds.sort().join(":");
}

function assertMatchingMessageRequest(
  message: {
    chatId: string | null;
    text: string;
    html: string | null;
    parentMessageId: string | null;
  },
  request: { chatId: string; text: string; html: string | null; parentMessageId: string | null },
) {
  if (
    message.chatId !== request.chatId ||
    message.text !== request.text ||
    message.html !== request.html ||
    message.parentMessageId !== request.parentMessageId
  ) {
    throw new ValidationError("clientMutationId was already used for a different message");
  }
}

export class ChatService {
  async create(
    input: CreateChatInput,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    if (actorType !== "user") {
      throw new AuthorizationError("Only users can create direct messages");
    }

    const memberIds: string[] = [...new Set(input.memberIds as string[])];
    if (memberIds.length === 0) {
      throw new ValidationError("Chats must include at least one other member");
    }
    if (memberIds.length !== 1) {
      throw new ValidationError("Direct messages support exactly one other member");
    }

    const allMemberIds = [actorId, memberIds[0]];
    if (actorId === memberIds[0]) {
      throw new ValidationError("Cannot create a DM with yourself");
    }

    // Validate all active chat members belong to the active organization.
    const validMemberRows = await prisma.orgMember.findMany({
      where: { organizationId, userId: { in: allMemberIds } },
      include: { user: { select: { id: true, name: true } } },
    });
    if (validMemberRows.length !== allMemberIds.length) {
      throw new ValidationError("One or more users are not in this organization");
    }
    const memberKey = buildMemberKey(...allMemberIds);

    const existing = await prisma.chat.findFirst({
      where: {
        organizationId,
        type: "dm",
        dmKey: memberKey,
      },
      include: {
        members: {
          where: { leftAt: null },
        },
      },
    });

    if (existing) return existing;

    const createChatInTx = async (tx: Prisma.TransactionClient) => {
      const chat = await tx.chat.create({
        data: {
          organizationId,
          type: "dm",
          name: null,
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
      const normalizedMembers = await normalizeMembers(tx, { type: "chat", id: chat.id });

      const event = await eventService.create(
        {
          organizationId,
          scopeType: "chat",
          scopeId: chat.id,
          eventType: "chat_created",
          payload: {
            chat: {
              id: chat.id,
              type: chat.type,
              name: chat.name,
              organizationId,
              members: normalizedMembers,
              lastMessage: null,
              lastMessageAt: null,
              viewerUnreadCount: 0,
              createdAt: chat.createdAt.toISOString(),
              updatedAt: chat.updatedAt.toISOString(),
            },
          },
          actorType,
          actorId,
          deferPublish: true,
        },
        tx,
      );

      return [chat, event] as const;
    };

    let result: readonly [
      Awaited<ReturnType<typeof prisma.chat.create>>,
      Awaited<ReturnType<typeof eventService.create>>,
    ];
    try {
      result = await prisma.$transaction(createChatInTx);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error as Prisma.PrismaClientKnownRequestError).code === "P2002"
      ) {
        return prisma.chat.findFirstOrThrow({
          where: {
            organizationId,
            type: "dm",
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

    const [chat, event] = result;
    eventService.publishCreated(event, allMemberIds);

    return chat;
  }

  async sendMessage({
    chatId,
    text,
    html,
    parentId,
    clientMutationId,
    organizationId,
    actorType,
    actorId,
  }: {
    chatId: string;
    text?: string;
    html?: string;
    parentId?: string;
    clientMutationId?: string;
    organizationId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    if (actorType !== "user") {
      throw new AuthorizationError("Only users can send direct messages");
    }
    if (!clientMutationId) {
      throw new ValidationError("clientMutationId is required");
    }

    const normalized = normalizeMessageInput(text, html);
    const requestedParentId = parentId ?? null;

    const execute = async () =>
      prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const duplicate = await tx.message.findFirst({
          where: { actorType, actorId, clientMutationId },
        });
        if (duplicate) {
          assertMatchingMessageRequest(duplicate, {
            chatId,
            text: normalized.text,
            html: normalized.html,
            parentMessageId: requestedParentId,
          });
          return { message: duplicate, event: null, memberIds: [] as string[] };
        }

        const chat = await tx.chat.findFirstOrThrow({
          where: {
            id: chatId,
            organizationId,
            type: "dm",
            members: { some: { userId: actorId, leftAt: null } },
          },
          select: {
            id: true,
            members: { where: { leftAt: null }, select: { userId: true } },
          },
        });

        let validatedParentId: string | null = null;
        if (parentId) {
          const parentMessage = await tx.message.findUniqueOrThrow({
            where: { id: parentId },
            select: { id: true, chatId: true, parentMessageId: true },
          });
          if (parentMessage.chatId !== chat.id) {
            throw new ValidationError("Thread parent must belong to this chat");
          }
          if (parentMessage.parentMessageId) {
            throw new ValidationError("Thread replies must target the root message");
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
            clientMutationId,
          },
        });

        await tx.chat.update({
          where: { id: chat.id },
          data: {
            lastMessageId: createdMessage.id,
            lastMessageAt: createdMessage.createdAt,
          },
        });
        await tx.chatMember.update({
          where: { chatId_userId: { chatId: chat.id, userId: actorId } },
          data: {
            lastReadMessageId: createdMessage.id,
            lastReadAt: createdMessage.createdAt,
            unreadCount: 0,
          },
        });
        await tx.chatMember.updateMany({
          where: { chatId: chat.id, userId: { not: actorId }, leftAt: null },
          data: { unreadCount: { increment: 1 } },
        });

        const event = await eventService.create(
          {
            organizationId,
            scopeType: "chat",
            scopeId: chat.id,
            eventType: "message_sent",
            payload: buildMessageEventPayload(
              createdMessage,
              clientMutationId,
            ) as unknown as PrismaTypes.InputJsonValue,
            actorType,
            actorId,
            deferPublish: true,
          },
          tx,
        );

        return {
          message: createdMessage,
          event,
          memberIds: chat.members.map((member) => member.userId),
        };
      });

    let result: Awaited<ReturnType<typeof execute>>;
    try {
      result = await execute();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const duplicate = await prisma.message.findFirstOrThrow({
          where: { actorType, actorId, clientMutationId },
        });
        assertMatchingMessageRequest(duplicate, {
          chatId,
          text: normalized.text,
          html: normalized.html,
          parentMessageId: requestedParentId,
        });
        result = { message: duplicate, event: null, memberIds: [] };
      } else {
        throw error;
      }
    }

    const { message, event, memberIds } = result;
    if (event) eventService.publishCreated(event, memberIds);

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
        chat: {
          organizationId,
          members: { some: { userId: actorId, leftAt: null } },
        },
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
      const [hydratedExisting] = await hydrateMessages([existing]);
      return hydratedExisting;
    }

    const chatId = existing.chatId;
    if (!chatId) {
      throw new ValidationError("Message is not a chat message");
    }

    const editedAt = new Date();
    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      const event = await eventService.create(
        {
          organizationId,
          scopeType: "chat",
          scopeId: chatId,
          eventType: "message_edited",
          payload: buildMessageEventPayload(
            updatedMessage,
          ) as unknown as PrismaTypes.InputJsonValue,
          actorType,
          actorId,
          deferPublish: true,
        },
        tx,
      );

      return { updatedMessage, event };
    });

    const memberIds = (await this.getMembers(chatId)).map((member) => member.userId);
    eventService.publishCreated(updated.event, memberIds);
    const [hydratedMessage] = await hydrateMessages([updated.updatedMessage]);
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
        chat: {
          organizationId,
          members: { some: { userId: actorId, leftAt: null } },
        },
      },
    });

    if (existing.actorType !== actorType || existing.actorId !== actorId) {
      throw new AuthorizationError("Only the original author can delete this message");
    }

    if (existing.deletedAt) {
      const [hydratedExisting] = await hydrateMessages([existing]);
      return hydratedExisting;
    }

    const chatId = existing.chatId;
    if (!chatId) {
      throw new ValidationError("Message is not a chat message");
    }

    const deletedAt = new Date();
    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      const event = await eventService.create(
        {
          organizationId,
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
          deferPublish: true,
        },
        tx,
      );

      return { deletedMessage, event };
    });

    const memberIds = (await this.getMembers(chatId)).map((member) => member.userId);
    eventService.publishCreated(updated.event, memberIds);
    const [hydratedMessage] = await hydrateMessages([updated.deletedMessage]);
    return hydratedMessage;
  }

  async getMessages(
    chatId: string,
    userId: string,
    organizationId: string,
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
        parentMessageId: null,
        ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
      },
      orderBy: { createdAt: isBefore ? "desc" : "asc" },
      take: opts?.limit ?? 200,
    });

    const orderedMessages = isBefore ? messages.reverse() : messages;
    return hydrateMessages(orderedMessages);
  }

  /**
   * Full-text-ish search over everything the user can read: chat/channel messages
   * (the Message table) and session conversation events (user prompts + assistant
   * output). Used by the command palette and the search results page.
   */
  async searchMessages(
    query: string,
    userId: string,
    organizationId: string,
    limit?: number,
  ): Promise<MessageSearchHit[]> {
    const trimmed = query.trim().slice(0, 200);
    if (trimmed.length < 2) return [];

    const take = Math.min(Math.max(limit ?? 20, 1), 100);
    const [messageHits, sessionHits] = await Promise.all([
      this.searchMessageTable(trimmed, userId, organizationId, take),
      this.searchSessionEvents(trimmed, userId, organizationId, take),
    ]);

    return [...messageHits, ...sessionHits]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, take);
  }

  private async searchMessageTable(
    trimmed: string,
    userId: string,
    organizationId: string,
    take: number,
  ): Promise<MessageSearchHit[]> {
    const messages = await prisma.message.findMany({
      where: {
        deletedAt: null,
        text: { contains: trimmed, mode: "insensitive" },
        OR: [
          {
            chat: {
              organizationId,
              members: { some: { userId, leftAt: null } },
            },
          },
          {
            channel: { organizationId, ...visibleChannelWhere(userId) },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take,
    });

    return messages.map((m) => ({
      id: m.id,
      text: m.text,
      createdAt: m.createdAt,
      actorType: m.actorType,
      actorId: m.actorId,
      chatId: m.chatId,
      channelId: m.channelId,
      sessionId: null,
      sessionGroupId: null,
      agentTool: null,
    }));
  }

  private async searchSessionEvents(
    trimmed: string,
    userId: string,
    organizationId: string,
    take: number,
  ): Promise<MessageSearchHit[]> {
    // Scope to sessions the user can view, then match the query against the raw
    // event payload (case-insensitive). ILIKE can over-match on JSON structure,
    // so we re-check the extracted display text below.
    //
    // NOTE: the event scan uses `payload::text ILIKE` with no full-text index, so
    // it is inherently a sequential scan. To keep it bounded we only consider the
    // most recently active sessions (older sessions' output is excluded from
    // search). Replace with a real search index if this list needs to grow.
    const sessions = await prisma.session.findMany({
      where: { organizationId, ...visibleSessionWhere(userId) },
      select: { id: true, sessionGroupId: true, tool: true },
      orderBy: { updatedAt: "desc" },
      take: MAX_SEARCH_SESSIONS,
    });
    if (sessions.length === 0) return [];

    const groupBySession = new Map(sessions.map((s) => [s.id, s.sessionGroupId]));
    const toolBySession = new Map(sessions.map((s) => [s.id, s.tool]));
    const sessionIds = sessions.map((s) => s.id);

    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        eventType: string;
        actorType: string;
        actorId: string;
        scopeId: string;
        timestamp: Date;
        payload: unknown;
      }>
    >(Prisma.sql`
      SELECT id, "eventType", "actorType", "actorId", "scopeId", "timestamp", payload
      FROM "Event"
      WHERE "organizationId" = ${organizationId}
        AND "scopeType" = 'session'
        AND "eventType" IN ('message_sent', 'session_output')
        AND "scopeId" IN (${Prisma.join(sessionIds)})
        AND payload::text ILIKE ${`%${trimmed}%`}
      ORDER BY "timestamp" DESC
      LIMIT ${take * 4}
    `);

    const needle = trimmed.toLowerCase();
    const hits: MessageSearchHit[] = [];
    for (const row of rows) {
      const text = extractSessionEventText(row.eventType, row.payload);
      if (!text || !text.toLowerCase().includes(needle)) continue;
      hits.push({
        id: row.id,
        text,
        createdAt: row.timestamp,
        // Assistant output is persisted with a "system" actor; surface it as the
        // agent so it can be labeled by coding tool rather than showing "Unknown".
        actorType: row.eventType === "session_output" ? "agent" : row.actorType,
        actorId: row.actorId,
        chatId: null,
        channelId: null,
        sessionId: row.scopeId,
        sessionGroupId: groupBySession.get(row.scopeId) ?? null,
        agentTool: toolBySession.get(row.scopeId) ?? null,
      });
      if (hits.length >= take) break;
    }
    return hits;
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
      throw new ValidationError("Thread root must be a top-level message");
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

  async addMember(
    chatId: string,
    userId: string,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const chat = await tx.chat.findFirstOrThrow({
        where: {
          id: chatId,
          organizationId,
          members: { some: { userId: actorId, leftAt: null } },
        },
        select: { type: true },
      });

      if (chat.type !== "group") {
        throw new ValidationError("Cannot add members to a DM");
      }

      // Validate target user is in this organization
      const targetUser = await tx.orgMember.findFirst({
        where: { userId, organizationId },
        select: { userId: true },
      });
      if (!targetUser) {
        throw new NotFoundError("User", userId);
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
      const normalizedMembers = await normalizeMembers(tx, { type: "chat", id: chatId });

      await eventService.create(
        {
          organizationId,
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
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const chat = await tx.chat.findFirstOrThrow({
        where: {
          id: chatId,
          organizationId,
          members: { some: { userId: actorId, leftAt: null } },
        },
        select: { type: true },
      });

      if (chat.type !== "group") {
        throw new ValidationError("Cannot leave a DM");
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
      const normalizedMembers = await normalizeMembers(tx, { type: "chat", id: chatId });

      await eventService.create(
        {
          organizationId,
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
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const chat = await tx.chat.findFirstOrThrow({
        where: {
          id: chatId,
          organizationId,
          members: { some: { userId: actorId, leftAt: null } },
        },
        select: { type: true },
      });

      if (chat.type !== "group") {
        throw new ValidationError("Cannot rename a DM");
      }

      const updated = await tx.chat.update({
        where: { id: chatId },
        data: { name },
        include: { members: { where: { leftAt: null } } },
      });

      await eventService.create(
        {
          organizationId,
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

  async markRead(chatId: string, throughMessageId: string, organizationId: string, userId: string) {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.chat.findFirstOrThrow({
        where: {
          id: chatId,
          organizationId,
          type: "dm",
          members: { some: { userId, leftAt: null } },
        },
        select: { id: true },
      });
      const message = await tx.message.findFirstOrThrow({
        where: { id: throughMessageId, chatId },
        select: { id: true, createdAt: true },
      });
      const membership = await tx.chatMember.findUniqueOrThrow({
        where: { chatId_userId: { chatId, userId } },
      });

      if (
        membership.lastReadAt &&
        (membership.lastReadAt > message.createdAt ||
          (membership.lastReadAt.getTime() === message.createdAt.getTime() &&
            membership.lastReadMessageId !== null &&
            membership.lastReadMessageId >= message.id))
      ) {
        return null;
      }

      const unreadCount = await tx.message.count({
        where: {
          chatId,
          actorId: { not: userId },
          deletedAt: null,
          OR: [
            { createdAt: { gt: message.createdAt } },
            { createdAt: message.createdAt, id: { gt: message.id } },
          ],
        },
      });
      await tx.chatMember.update({
        where: { chatId_userId: { chatId, userId } },
        data: {
          lastReadMessageId: message.id,
          lastReadAt: message.createdAt,
          unreadCount,
        },
      });
      const event = await eventService.create(
        {
          organizationId,
          scopeType: "system",
          scopeId: userId,
          eventType: "chat_read",
          payload: {
            chatId,
            throughMessageId: message.id,
            lastReadAt: message.createdAt.toISOString(),
            unreadCount,
          },
          actorType: "user",
          actorId: userId,
          deferPublish: true,
        },
        tx,
      );
      return event;
    });

    if (!result) return false;
    eventService.publishPrivateUserEvent(result, [userId]);
    return true;
  }

  async getChats(userId: string, organizationId: string) {
    const chats = await prisma.chat.findMany({
      where: {
        organizationId,
        type: "dm",
        members: { some: { userId, leftAt: null } },
      },
      include: {
        members: { where: { leftAt: null } },
        lastMessage: true,
      },
      orderBy: [
        { lastMessageAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: 50,
    });
    return chats.map((chat) => ({
      ...chat,
      viewerUnreadCount:
        chat.members.find((member) => member.userId === userId)?.unreadCount ?? 0,
    }));
  }

  async getChat(chatId: string, userId: string, organizationId: string) {
    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        organizationId,
        members: { some: { userId, leftAt: null } },
      },
      include: {
        members: { where: { leftAt: null } },
        lastMessage: true,
      },
    });
    if (!chat) return null;
    return {
      ...chat,
      viewerUnreadCount:
        chat.members.find((member) => member.userId === userId)?.unreadCount ?? 0,
    };
  }

  async getMembers(chatId: string) {
    return prisma.chatMember.findMany({
      where: { chatId, leftAt: null },
    });
  }
}

export const chatService = new ChatService();
