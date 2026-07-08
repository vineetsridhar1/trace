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

function chatInOrganizationWhere(organizationId: string): PrismaTypes.ChatWhereInput {
  return {
    AND: [
      {
        members: {
          every: {
            OR: [
              { leftAt: { not: null } },
              { user: { orgMemberships: { some: { organizationId } } } },
            ],
          },
        },
      },
    ],
  };
}

export class ChatService {
  async create(
    input: CreateChatInput,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    const memberIds: string[] = [...new Set(input.memberIds as string[])];
    if (memberIds.length === 0) {
      throw new ValidationError("Chats must include at least one other member");
    }

    const isDM = memberIds.length === 1;
    const allMemberIds = isDM
      ? [actorId, memberIds[0]]
      : [actorId, ...memberIds.filter((id) => id !== actorId)];

    // Validate all active chat members belong to the active organization.
    const validMemberRows = await prisma.orgMember.findMany({
      where: { organizationId, userId: { in: allMemberIds } },
      include: { user: { select: { id: true, name: true } } },
    });
    if (validMemberRows.length !== allMemberIds.length) {
      throw new ValidationError("One or more users are not in this organization");
    }
    const validMembers = validMemberRows.map((row) => row.user);

    // Deduplication: check for existing chat with the same members
    const memberKey = buildMemberKey(...allMemberIds);

    if (isDM) {
      const targetId = memberIds[0];
      if (actorId === targetId) {
        throw new ValidationError("Cannot create a DM with yourself");
      }
    }

    const existing = await prisma.chat.findFirst({
      where: {
        type: isDM ? "dm" : "group",
        dmKey: memberKey,
        ...chatInOrganizationWhere(organizationId),
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
          .map((m: { id: string; name: string | null }) => m.name ?? "Unknown")
          .join(", "));

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
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error as Prisma.PrismaClientKnownRequestError).code === "P2002"
      ) {
        return prisma.chat.findFirstOrThrow({
          where: {
            type: isDM ? "dm" : "group",
            dmKey: memberKey,
            ...chatInOrganizationWhere(organizationId),
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
    const normalized = normalizeMessageInput(text, html);

    const message = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const chat = await tx.chat.findFirstOrThrow({
        where: {
          id: chatId,
          members: { some: { userId: actorId, leftAt: null } },
          ...chatInOrganizationWhere(organizationId),
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
        },
      });

      await tx.chat.update({
        where: { id: chat.id },
        data: { updatedAt: createdMessage.createdAt },
      });

      await eventService.create(
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
          members: { some: { userId: actorId, leftAt: null } },
          ...chatInOrganizationWhere(organizationId),
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

      await eventService.create(
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
          members: { some: { userId: actorId, leftAt: null } },
          ...chatInOrganizationWhere(organizationId),
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

      await eventService.create(
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
    organizationId: string,
    opts?: { after?: Date; before?: Date; limit?: number },
  ) {
    await prisma.chat.findFirstOrThrow({
      where: {
        id: chatId,
        members: { some: { userId, leftAt: null } },
        ...chatInOrganizationWhere(organizationId),
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
              ...chatInOrganizationWhere(organizationId),
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
          members: { some: { userId: actorId, leftAt: null } },
          ...chatInOrganizationWhere(organizationId),
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
      where: { id: chatId, ...chatInOrganizationWhere(organizationId) },
      include: { members: { where: { leftAt: null } } },
    });
  }

  async leave(chatId: string, organizationId: string, actorType: ActorType, actorId: string) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const chat = await tx.chat.findFirstOrThrow({
        where: {
          id: chatId,
          members: { some: { userId: actorId, leftAt: null } },
          ...chatInOrganizationWhere(organizationId),
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
      where: { id: chatId, ...chatInOrganizationWhere(organizationId) },
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
          members: { some: { userId: actorId, leftAt: null } },
          ...chatInOrganizationWhere(organizationId),
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

  async getChats(userId: string, organizationId: string) {
    return prisma.chat.findMany({
      where: {
        members: { some: { userId, leftAt: null } },
        ...chatInOrganizationWhere(organizationId),
      },
      include: {
        members: {
          where: { leftAt: null },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getChat(chatId: string, userId: string, organizationId: string) {
    return prisma.chat.findFirst({
      where: {
        id: chatId,
        members: { some: { userId, leftAt: null } },
        ...chatInOrganizationWhere(organizationId),
      },
      include: {
        members: {
          where: { leftAt: null },
        },
      },
    });
  }

  async getMembers(chatId: string) {
    return prisma.chatMember.findMany({
      where: { chatId, leftAt: null },
    });
  }
}

export const chatService = new ChatService();
