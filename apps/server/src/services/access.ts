import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { AuthorizationError } from "../lib/errors.js";

async function assertOrgEntityExists(
  model: "channel" | "session" | "ticket" | "project",
  id: string,
  organizationId: string,
) {
  let entity: { id: string } | null = null;

  switch (model) {
    case "channel":
      entity = await prisma.channel.findFirst({
        where: { id, organizationId },
        select: { id: true },
      });
      break;
    case "session":
      entity = await prisma.session.findFirst({
        where: { id, organizationId },
        select: { id: true },
      });
      break;
    case "ticket":
      entity = await prisma.ticket.findFirst({
        where: { id, organizationId },
        select: { id: true },
      });
      break;
    case "project":
      entity = await prisma.project.findFirst({
        where: { id, organizationId },
        select: { id: true },
      });
      break;
  }

  if (!entity) {
    throw new Error("Not authorized for this scope");
  }
}

export function visibleSessionGroupWhere(userId: string): Prisma.SessionGroupWhereInput {
  return {
    OR: [{ visibility: "public" }, { ownerUserId: userId }],
  };
}

export function visibleSessionWhere(userId: string): Prisma.SessionWhereInput {
  return {
    OR: [
      { sessionGroupId: null },
      {
        sessionGroup: {
          is: visibleSessionGroupWhere(userId),
        },
      },
    ],
  };
}

export function canViewSessionGroup(
  group: { visibility?: string | null; ownerUserId?: string | null },
  userId: string,
): boolean {
  return group.visibility == null || group.visibility === "public" || group.ownerUserId === userId;
}

export async function assertCanManageSessionGroup(
  group: { ownerUserId: string },
  organizationId: string,
  userId: string,
  action = "manage applications",
) {
  if (group.ownerUserId === userId) return;
  const member = await prisma.orgMember.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { role: true },
  });
  if (member?.role !== "admin") {
    throw new AuthorizationError(`Only the session owner or an org admin can ${action}`);
  }
}

export async function assertSessionGroupAccess(
  sessionGroupId: string,
  userId: string,
  organizationId: string,
) {
  const group = await prisma.sessionGroup.findFirst({
    where: { id: sessionGroupId, organizationId },
    select: { id: true, visibility: true, ownerUserId: true },
  });

  if (!group || !canViewSessionGroup(group, userId)) {
    throw new Error("Not authorized for this session group");
  }

  return group;
}

export async function assertSessionAccess(
  sessionId: string,
  userId: string,
  organizationId: string,
) {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, organizationId },
    select: {
      id: true,
      sessionGroup: {
        select: {
          visibility: true,
          ownerUserId: true,
        },
      },
    },
  });

  if (!session) {
    throw new Error("Not authorized for this scope");
  }
  if (session.sessionGroup && !canViewSessionGroup(session.sessionGroup, userId)) {
    throw new Error("Not authorized for this scope");
  }

  return session;
}

export async function isActiveChatMember(chatId: string, userId: string) {
  const member = await prisma.chatMember.findFirst({
    where: { chatId, userId, leftAt: null },
    select: { chatId: true },
  });

  return member !== null;
}

export async function isActiveChannelMember(
  channelId: string,
  userId: string,
  organizationId?: string,
) {
  const member = await prisma.channelMember.findFirst({
    where: {
      channelId,
      userId,
      leftAt: null,
      ...(organizationId ? { channel: { organizationId } } : {}),
    },
    select: { channelId: true },
  });

  return member !== null;
}

export function visibleChannelWhere(userId: string): Prisma.ChannelWhereInput {
  return {
    OR: [
      { visibility: "public" },
      { ownerId: userId },
      { members: { some: { userId, leftAt: null } } },
    ],
  };
}

export function canViewChannel(
  channel: {
    visibility?: string | null;
    ownerId?: string | null;
    members?: Array<{ userId: string }>;
  },
  userId: string,
): boolean {
  return (
    channel.visibility == null ||
    channel.visibility === "public" ||
    channel.ownerId === userId ||
    !!channel.members?.some((member) => member.userId === userId)
  );
}

export async function assertChannelVisible(channelId: string, userId: string) {
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, ...visibleChannelWhere(userId) },
    select: { id: true },
  });

  if (!channel) {
    throw new Error("Not authorized for this channel");
  }

  return channel;
}

export async function assertChatAccess(chatId: string, userId: string) {
  const chat = await prisma.chat.findFirst({
    where: {
      id: chatId,
      members: { some: { userId, leftAt: null } },
    },
    select: { id: true },
  });

  if (!chat) {
    throw new Error("Not authorized for this chat");
  }

  return chat;
}

export async function assertChannelAccess(
  channelId: string,
  userId: string,
  organizationId?: string,
) {
  const isMember = await isActiveChannelMember(channelId, userId, organizationId);

  if (!isMember) {
    throw new Error("Not authorized for this channel");
  }

  return { id: channelId };
}

export async function assertScopeAccess(
  scopeType: string,
  scopeId: string,
  userId: string,
  organizationId: string | null,
) {
  switch (scopeType) {
    case "chat":
      await assertChatAccess(scopeId, userId);
      return;
    case "channel":
      await assertChannelAccess(scopeId, userId, organizationId ?? undefined);
      return;
    case "session":
      if (!organizationId) throw new Error("Organization context required for session access");
      await assertSessionAccess(scopeId, userId, organizationId);
      return;
    case "ticket":
      if (!organizationId) throw new Error("Organization context required for ticket access");
      await assertOrgEntityExists("ticket", scopeId, organizationId);
      return;
    case "project":
      if (!organizationId) throw new Error("Organization context required for project access");
      await assertOrgEntityExists("project", scopeId, organizationId);
      return;
    default:
      throw new Error(`Unsupported scope type: ${scopeType}`);
  }
}

export async function assertThreadAccess(rootMessageId: string, userId: string) {
  const rootMessage = await prisma.message.findUniqueOrThrow({
    where: { id: rootMessageId },
    select: {
      id: true,
      chatId: true,
      channelId: true,
      parentMessageId: true,
    },
  });

  if (rootMessage.parentMessageId) {
    throw new Error("Thread root must be a top-level message");
  }

  if (rootMessage.chatId) {
    await assertChatAccess(rootMessage.chatId, userId);
  } else if (rootMessage.channelId) {
    await assertChannelAccess(rootMessage.channelId, userId);
  } else {
    throw new Error("Thread root must belong to a chat or channel");
  }

  return rootMessage;
}
