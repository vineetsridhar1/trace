import { prisma } from "../lib/db.js";

export async function assertSessionInOrg(sessionId: string, organizationId: string) {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, organizationId },
    select: { id: true },
  });
  if (!session) throw new Error("Not authorized for this session");
}

export async function assertTicketInOrg(ticketId: string, organizationId: string) {
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, organizationId },
    select: { id: true },
  });
  if (!ticket) throw new Error("Not authorized for this ticket");
}

async function assertOrgEntityExists(
  model: "channel" | "session" | "ticket",
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
  }

  if (!entity) {
    throw new Error("Not authorized for this scope");
  }
}

export async function isActiveChatMember(chatId: string, userId: string) {
  const member = await prisma.chatMember.findFirst({
    where: { chatId, userId, leftAt: null },
    select: { chatId: true },
  });

  return member !== null;
}

export async function isActiveChannelMember(channelId: string, userId: string) {
  const member = await prisma.channelMember.findFirst({
    where: { channelId, userId, leftAt: null },
    select: { channelId: true },
  });

  return member !== null;
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

export async function assertChannelAccess(channelId: string, userId: string) {
  const isMember = await isActiveChannelMember(channelId, userId);

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
      await assertChannelAccess(scopeId, userId);
      return;
    case "session":
      if (!organizationId) throw new Error("Organization context required for session access");
      await assertOrgEntityExists("session", scopeId, organizationId);
      return;
    case "ticket":
      if (!organizationId) throw new Error("Organization context required for ticket access");
      await assertOrgEntityExists("ticket", scopeId, organizationId);
      return;
    default:
      throw new Error(`Unsupported scope type: ${scopeType}`);
  }
}

export async function assertThreadAccess(
  rootMessageId: string,
  userId: string,
) {
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
