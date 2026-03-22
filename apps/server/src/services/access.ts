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

export async function isActiveChatMember(chatId: string, userId: string) {
  const member = await prisma.chatMember.findFirst({
    where: { chatId, userId, leftAt: null },
    select: { chatId: true },
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
      if (!organizationId) throw new Error("Organization context required for channel access");
      await assertOrgEntityExists("channel", scopeId, organizationId);
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
      parentMessageId: true,
    },
  });

  if (rootMessage.parentMessageId) {
    throw new Error("Thread root must be a top-level message");
  }

  await assertChatAccess(rootMessage.chatId, userId);

  return rootMessage;
}
