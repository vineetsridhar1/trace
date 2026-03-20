import type { CreateChatInput, ActorType } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { participantService } from "./participant.js";

export class ChatService {
  async create(input: CreateChatInput, actorType: ActorType, actorId: string) {
    const memberIds = input.memberIds;
    const isDM = memberIds.length === 1;

    // DM deduplication: check for existing DM between creator and target
    if (isDM) {
      const targetId = memberIds[0];
      if (actorId === targetId) {
        throw new Error("Cannot create a DM with yourself");
      }
      const existing = await prisma.chat.findFirst({
        where: {
          type: "dm",
          organizationId: input.organizationId,
          members: {
            every: {
              userId: { in: [actorId, targetId] },
              leftAt: null,
            },
          },
          AND: [
            { members: { some: { userId: actorId, leftAt: null } } },
            { members: { some: { userId: targetId, leftAt: null } } },
          ],
        },
        include: {
          members: {
            where: { leftAt: null },
            include: { chat: false },
          },
        },
      });

      if (existing) return existing;
    }

    const allMemberIds = isDM
      ? [actorId, memberIds[0]]
      : [actorId, ...memberIds.filter((id) => id !== actorId)];

    const [chat, _event] = await prisma.$transaction(async (tx) => {
      const chat = await tx.chat.create({
        data: {
          type: isDM ? "dm" : "group",
          name: isDM ? null : (input.name ?? null),
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
      const membersWithUsers = await tx.chatMember.findMany({
        where: { chatId: chat.id },
        include: { chat: false },
      });

      // Look up user info for each member
      const userIds = membersWithUsers.map((m) => m.userId);
      const users = await tx.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, avatarUrl: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));

      const normalizedMembers = membersWithUsers.map((m) => ({
        user: userMap.get(m.userId) ?? { id: m.userId, name: "Unknown", avatarUrl: null },
        joinedAt: m.joinedAt.toISOString(),
      }));

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
    });

    return chat;
  }

  async sendMessage({
    chatId,
    text,
    parentId,
    actorType,
    actorId,
  }: {
    chatId: string;
    text: string;
    parentId?: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const chat = await prisma.chat.findUniqueOrThrow({
      where: { id: chatId },
      select: { organizationId: true },
    });

    // Verify actor is active member (not left)
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: actorId } },
    });
    if (!member || member.leftAt) {
      throw new Error("Not an active member of this chat");
    }

    const event = await eventService.create({
      organizationId: chat.organizationId,
      scopeType: "chat",
      scopeId: chatId,
      eventType: "message_sent",
      payload: { text },
      actorType,
      actorId,
      parentId,
    });

    // Auto-subscribe to thread if this is a reply
    if (parentId) {
      await participantService.subscribe({
        userId: actorId,
        scopeType: "thread",
        scopeId: parentId,
        organizationId: chat.organizationId,
      });
    }

    return event;
  }

  async addMember(chatId: string, userId: string, actorType: ActorType, actorId: string) {
    const chat = await prisma.chat.findUniqueOrThrow({
      where: { id: chatId },
      select: { type: true, organizationId: true },
    });

    if (chat.type !== "group") {
      throw new Error("Cannot add members to a DM");
    }

    await prisma.$transaction(async (tx) => {
      await tx.chatMember.create({
        data: { chatId, userId },
      });

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
        update: {},
      });

      // Fetch updated members with user data for the event payload
      const updatedMembers = await tx.chatMember.findMany({
        where: { chatId, leftAt: null },
      });
      const memberUserIds = updatedMembers.map((m) => m.userId);
      const users = await tx.user.findMany({
        where: { id: { in: memberUserIds } },
        select: { id: true, name: true, avatarUrl: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));
      const normalizedMembers = updatedMembers.map((m) => ({
        user: userMap.get(m.userId) ?? { id: m.userId, name: "Unknown", avatarUrl: null },
        joinedAt: m.joinedAt.toISOString(),
      }));

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

    return prisma.chat.findUniqueOrThrow({
      where: { id: chatId },
      include: { members: { where: { leftAt: null } } },
    });
  }

  async leave(chatId: string, actorType: ActorType, actorId: string) {
    const chat = await prisma.chat.findUniqueOrThrow({
      where: { id: chatId },
      select: { type: true, organizationId: true },
    });

    if (chat.type !== "group") {
      throw new Error("Cannot leave a DM");
    }

    await prisma.$transaction(async (tx) => {
      await tx.chatMember.update({
        where: { chatId_userId: { chatId, userId: actorId } },
        data: { leftAt: new Date() },
      });

      await tx.participant.deleteMany({
        where: { userId: actorId, scopeType: "chat", scopeId: chatId },
      });

      // Fetch remaining members with user data for the event payload
      const remainingMembers = await tx.chatMember.findMany({
        where: { chatId, leftAt: null },
      });
      const memberUserIds = remainingMembers.map((m) => m.userId);
      const users = await tx.user.findMany({
        where: { id: { in: memberUserIds } },
        select: { id: true, name: true, avatarUrl: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));
      const normalizedMembers = remainingMembers.map((m) => ({
        user: userMap.get(m.userId) ?? { id: m.userId, name: "Unknown", avatarUrl: null },
        joinedAt: m.joinedAt.toISOString(),
      }));

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

    return prisma.chat.findUniqueOrThrow({
      where: { id: chatId },
      include: { members: { where: { leftAt: null } } },
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

  async getChat(chatId: string) {
    return prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        members: {
          where: { leftAt: null },
        },
      },
    });
  }
}

export const chatService = new ChatService();
