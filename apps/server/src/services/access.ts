import { prisma } from "../lib/db.js";

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

export async function isActiveChatMember(chatId: string, userId: string, organizationId: string) {
  const member = await prisma.chatMember.findFirst({
    where: { chatId, userId, organizationId, leftAt: null },
    select: { chatId: true },
  });

  return member !== null;
}

export async function assertChatAccess(chatId: string, userId: string, organizationId: string) {
  const chat = await prisma.chat.findFirst({
    where: {
      id: chatId,
      organizationId,
      members: { some: { userId, leftAt: null } },
    },
    select: { id: true, organizationId: true },
  });

  if (!chat) {
    throw new Error("Not authorized for this chat");
  }

  return chat;
}

export async function assertScopeAccess(
  scopeType: string,
  scopeId: string,
  userId: string,
  organizationId: string,
) {
  switch (scopeType) {
    case "chat":
      await assertChatAccess(scopeId, userId, organizationId);
      return;
    case "channel":
      await assertOrgEntityExists("channel", scopeId, organizationId);
      return;
    case "session":
      await assertOrgEntityExists("session", scopeId, organizationId);
      return;
    case "ticket":
      await assertOrgEntityExists("ticket", scopeId, organizationId);
      return;
    default:
      throw new Error(`Unsupported scope type: ${scopeType}`);
  }
}

export async function assertThreadAccess(
  rootMessageId: string,
  userId: string,
  organizationId: string,
) {
  const rootMessage = await prisma.message.findUniqueOrThrow({
    where: { id: rootMessageId },
    select: {
      id: true,
      organizationId: true,
      chatId: true,
      parentMessageId: true,
    },
  });

  if (rootMessage.organizationId !== organizationId) {
    throw new Error("Not authorized for this thread");
  }

  if (rootMessage.parentMessageId) {
    throw new Error("Thread root must be a top-level message");
  }

  await assertChatAccess(rootMessage.chatId, userId, organizationId);

  return rootMessage;
}
