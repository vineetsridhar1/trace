import { createHash } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

function localEmailForName(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const digest = createHash("sha256").update(name.toLowerCase()).digest("hex").slice(0, 24);
  return `${slug}-${digest}@trace.local`;
}

const USERS = [
  {
    id: "10000000-0000-4000-a000-000000000001",
    email: localEmailForName("DM Seed Alice"),
    name: "DM Seed Alice",
  },
  {
    id: "10000000-0000-4000-a000-000000000002",
    email: localEmailForName("DM Seed Bob"),
    name: "DM Seed Bob",
  },
  {
    id: "10000000-0000-4000-a000-000000000003",
    email: localEmailForName("DM Seed Cara"),
    name: "DM Seed Cara",
  },
] as const;

const CHAT_FIXTURES = [
  { peerIndex: 1, messageCount: 10_000, unreadForAlice: 12 },
  { peerIndex: 2, messageCount: 80, unreadForAlice: 3 },
] as const;

const MESSAGE_BATCH_SIZE = 500;

function memberKey(firstId: string, secondId: string) {
  return [firstId, secondId].sort().join(":");
}

function fixtureMessage(
  chatId: string,
  chatIndex: number,
  index: number,
  startedAt: Date,
): Prisma.MessageCreateManyInput {
  const actor = index % 2 === 0 ? USERS[0] : USERS[CHAT_FIXTURES[chatIndex].peerIndex];
  const createdAt = new Date(startedAt.getTime() + index * 30_000);
  const text =
    index % 19 === 0
      ? `Performance fixture ${index + 1}: a longer message that exercises measured virtual rows without rendering the entire history at once.`
      : `Performance fixture message ${index + 1}`;
  return {
    id: `20000000-0000-4000-${String(chatIndex + 1).padStart(4, "0")}-${String(index + 1).padStart(12, "0")}`,
    chatId,
    actorType: "user",
    actorId: actor.id,
    text,
    html: `<p>${text}</p>`,
    clientMutationId: `dm-seed-${chatIndex}-${index}`,
    createdAt,
    updatedAt: createdAt,
  };
}

async function createInBatches<T>(
  rows: T[],
  createMany: (batch: T[]) => Promise<unknown>,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += MESSAGE_BATCH_SIZE) {
    await createMany(rows.slice(offset, offset + MESSAGE_BATCH_SIZE));
  }
}

async function main() {
  const organization = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!organization) {
    throw new Error("Run pnpm --filter @trace/server db:seed before seeding direct messages");
  }

  for (const user of USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      create: user,
      update: { name: user.name },
    });
    await prisma.orgMember.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: organization.id,
        },
      },
      create: { userId: user.id, organizationId: organization.id, role: "member" },
      update: {},
    });
  }

  for (let chatIndex = 0; chatIndex < CHAT_FIXTURES.length; chatIndex++) {
    const fixture = CHAT_FIXTURES[chatIndex];
    const peer = USERS[fixture.peerIndex];
    const dmKey = memberKey(USERS[0].id, peer.id);
    const chat = await prisma.chat.upsert({
      where: { organizationId_dmKey: { organizationId: organization.id, dmKey } },
      create: {
        id: `30000000-0000-4000-a000-00000000000${chatIndex + 1}`,
        organizationId: organization.id,
        type: "dm",
        dmKey,
        createdById: USERS[0].id,
      },
      update: {},
    });

    const participants = [USERS[0].id, peer.id];
    for (const userId of participants) {
      await prisma.chatMember.upsert({
        where: { chatId_userId: { chatId: chat.id, userId } },
        create: { chatId: chat.id, userId },
        update: { leftAt: null },
      });
      await prisma.participant.upsert({
        where: {
          userId_scopeType_scopeId: { userId, scopeType: "chat", scopeId: chat.id },
        },
        create: { userId, scopeType: "chat", scopeId: chat.id },
        update: {},
      });
    }

    const startedAt = new Date(Date.UTC(2026, 0, chatIndex + 1));
    const messages = Array.from({ length: fixture.messageCount }, (_, index) =>
      fixtureMessage(chat.id, chatIndex, index, startedAt),
    );
    await createInBatches(messages, (batch) =>
      prisma.message.createMany({ data: batch, skipDuplicates: true }),
    );

    const events: Prisma.EventCreateManyInput[] = messages.map((message) => ({
      id: `40000000-0000-4000-${String(chatIndex + 1).padStart(4, "0")}-${message.id.slice(-12)}`,
      organizationId: organization.id,
      scopeType: "chat",
      scopeId: chat.id,
      eventType: "message_sent",
      payload: {
        messageId: message.id,
        chatId: chat.id,
        text: message.text,
        parentMessageId: null,
        clientMutationId: message.clientMutationId,
        createdAt: message.createdAt?.toISOString(),
      },
      actorType: "user",
      actorId: message.actorId,
      timestamp: message.createdAt,
    }));
    await createInBatches(events, (batch) =>
      prisma.event.createMany({ data: batch, skipDuplicates: true }),
    );

    const lastMessage = messages.at(-1);
    if (!lastMessage?.createdAt) continue;
    await prisma.chat.update({
      where: { id: chat.id },
      data: { lastMessageId: lastMessage.id, lastMessageAt: lastMessage.createdAt },
    });

    // Messages alternate Alice/peer. Put Alice's cursor far enough back that the
    // unread projection equals the number of peer-authored messages after it.
    const readIndex = Math.max(0, messages.length - fixture.unreadForAlice * 2 - 1);
    const aliceReadMessage = messages[readIndex];
    await prisma.chatMember.update({
      where: { chatId_userId: { chatId: chat.id, userId: USERS[0].id } },
      data: {
        lastReadMessageId: aliceReadMessage.id,
        lastReadAt: aliceReadMessage.createdAt,
        unreadCount: fixture.unreadForAlice,
      },
    });
    await prisma.chatMember.update({
      where: { chatId_userId: { chatId: chat.id, userId: peer.id } },
      data: {
        lastReadMessageId: lastMessage.id,
        lastReadAt: lastMessage.createdAt,
        unreadCount: 0,
      },
    });
  }

  console.log(
    `Seeded ${CHAT_FIXTURES.length} organization DMs and ${CHAT_FIXTURES.reduce((sum, fixture) => sum + fixture.messageCount, 0).toLocaleString()} messages in "${organization.name}".`,
  );
  console.log('Use local login name "DM Seed Alice" to inspect unread and large-history behavior.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
