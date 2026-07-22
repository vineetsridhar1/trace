import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

process.env.TRACE_LOCAL_MODE = "1";

const prisma = new PrismaClient();

async function main() {
  const [{ ChatService }, { pubsub, topics }] = await Promise.all([
    import("../src/services/chat.js"),
    import("../src/lib/pubsub.js"),
  ]);
  const service = new ChatService();
  const alice = await prisma.user.findFirstOrThrow({ where: { name: "DM Seed Alice" } });
  const bob = await prisma.user.findFirstOrThrow({ where: { name: "DM Seed Bob" } });
  const membership = await prisma.orgMember.findFirstOrThrow({
    where: { userId: alice.id },
    select: { organizationId: true },
  });
  const organizationId = membership.organizationId;

  const chats = await service.getChats(alice.id, organizationId);
  const chat = chats.find((candidate) =>
    candidate.members.some((member) => member.userId === bob.id),
  );
  if (!chat) throw new Error("Seeded Alice/Bob DM was not found");
  if (chat.organizationId !== organizationId) throw new Error("DM escaped its organization");

  const iterator = pubsub.asyncIterator<{
    userEvents: { eventType: string; payload: unknown };
  }>(topics.userEvents(organizationId, alice.id));
  const clientMutationId = `dm-e2e-${randomUUID()}`;
  const text = `E2E realtime message ${clientMutationId}`;
  const beforeCount = await prisma.message.count({ where: { chatId: chat.id } });
  const sent = await service.sendMessage({
    chatId: chat.id,
    text,
    clientMutationId,
    organizationId,
    actorType: "user",
    actorId: bob.id,
  });

  const realtimeResult = await Promise.race([
    iterator.next(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timed out waiting for private user event")), 2_000),
    ),
  ]);
  await iterator.return?.();
  if (realtimeResult.done || realtimeResult.value.userEvents.eventType !== "message_sent") {
    throw new Error("Private realtime delivery did not contain message_sent");
  }
  const payload = realtimeResult.value.userEvents.payload as Record<string, unknown>;
  if (payload.messageId !== sent.id || payload.text !== text.slice(0, 160)) {
    throw new Error("Private realtime envelope did not contain the expected projection");
  }

  const duplicate = await service.sendMessage({
    chatId: chat.id,
    text,
    clientMutationId,
    organizationId,
    actorType: "user",
    actorId: bob.id,
  });
  const afterCount = await prisma.message.count({ where: { chatId: chat.id } });
  if (duplicate.id !== sent.id || afterCount !== beforeCount + 1) {
    throw new Error("Idempotent send created a duplicate message");
  }

  const aliceChat = (await service.getChats(alice.id, organizationId)).find(
    (candidate) => candidate.id === chat.id,
  );
  if (!aliceChat || aliceChat.lastMessageId !== sent.id || aliceChat.viewerUnreadCount < 1) {
    throw new Error("Latest-message or unread projection was not updated");
  }

  const page = await service.getMessages(chat.id, alice.id, organizationId, {
    before: new Date(Date.now() + 1_000),
    limit: 100,
  });
  if (page.length !== 100 || page.at(-1)?.id !== sent.id) {
    throw new Error("Backward message pagination did not return the newest bounded page");
  }

  await service.markRead(chat.id, sent.id, organizationId, alice.id);
  const readChat = (await service.getChats(alice.id, organizationId)).find(
    (candidate) => candidate.id === chat.id,
  );
  if (!readChat || readChat.viewerUnreadCount !== 0) {
    throw new Error("Durable read cursor did not clear the unread projection");
  }

  console.log(
    JSON.stringify({
      organizationId,
      chatId: chat.id,
      seededMessages: beforeCount,
      pageSize: page.length,
      realtime: true,
      idempotentSend: true,
      unreadAfterRead: readChat.viewerUnreadCount,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
