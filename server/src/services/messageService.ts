import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';

const USER_SESSION_ID = 'user-manual-input';

type MessageWithThreads = Prisma.MessageGetPayload<{
  include: { threads: true };
}>;

type FeedMessage = Prisma.MessageGetPayload<{
  include: {
    session: { select: { sessionId: true; cwd: true; status: true } };
    _count: { select: { threads: true } };
  };
}>;

function buildUserPromptPayload(text: string) {
  return {
    hook_event_name: 'UserPromptSubmit',
    prompt: text,
    source: 'ui',
  };
}

async function ensureManualInputSession() {
  const session = await prisma.session.findUnique({ where: { sessionId: USER_SESSION_ID } });
  if (session) {
    return session;
  }
  return prisma.session.create({
    data: { sessionId: USER_SESSION_ID, status: 'active' },
  });
}

async function ensureMessageHasThread(message: MessageWithThreads): Promise<MessageWithThreads> {
  if (message.threads.length > 0) {
    return message;
  }

  const thread = await prisma.thread.create({
    data: { messageId: message.id },
  });

  return {
    ...message,
    threads: [thread],
  };
}

export async function getMessageByIdForFeed(messageId: string): Promise<FeedMessage | null> {
  return prisma.message.findUnique({
    where: { id: messageId },
    include: {
      session: { select: { sessionId: true, cwd: true, status: true } },
      _count: { select: { threads: true } },
    },
  });
}

export async function getMessageByIdWithThreads(messageId: string): Promise<MessageWithThreads | null> {
  return prisma.message.findUnique({
    where: { id: messageId },
    include: { threads: { orderBy: { createdAt: 'asc' } } },
  });
}

export async function getMessagesByChannel(
  channelId: string,
  options: { limit?: number; offset?: number } = {},
) {
  const { limit = 50, offset = 0 } = options;

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      include: {
        session: { select: { sessionId: true, cwd: true, status: true } },
        _count: { select: { threads: true } },
      },
    }),
    prisma.message.count({ where: { channelId } }),
  ]);

  return { messages, total, limit, offset };
}

export async function getOrCreateMessageForSession(channelId: string, sessionId: string) {
  let message = await prisma.message.findFirst({
    where: { channelId, sessionId },
    include: { threads: { orderBy: { createdAt: 'asc' } } },
  });

  if (!message) {
    message = await prisma.message.create({
      data: {
        channelId,
        sessionId,
        threads: {
          create: {},
        },
      },
      include: { threads: true },
    });
  }

  return ensureMessageHasThread(message);
}

export async function updateMessagePreviewAndImportance(
  messageId: string,
  preview: string | null,
  importance: string,
) {
  return prisma.message.update({
    where: { id: messageId },
    data: {
      ...(preview !== null ? { preview } : {}),
      importance,
    },
  });
}

export async function createUserMessage(channelId: string, text: string) {
  await ensureManualInputSession();

  const created = await prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        channelId,
        sessionId: USER_SESSION_ID,
        preview: text,
        importance: 'important',
      },
    });

    const thread = await tx.thread.create({
      data: { messageId: message.id },
    });

    const event = await tx.event.create({
      data: {
        sessionId: USER_SESSION_ID,
        hookEventName: 'UserPromptSubmit',
        rawPayload: buildUserPromptPayload(text),
        threadId: thread.id,
        importance: 'important',
      },
    });

    return { messageId: message.id, thread, event };
  });

  const message = await getMessageByIdForFeed(created.messageId);
  if (!message) {
    throw new Error(`Failed to load created message ${created.messageId}`);
  }

  return {
    message,
    thread: created.thread,
    event: created.event,
  };
}

export async function appendPromptToMessageThread(
  channelId: string,
  messageId: string,
  text: string,
) {
  const created = await prisma.$transaction(async (tx) => {
    const message = await tx.message.findFirst({
      where: { id: messageId, channelId },
      include: { threads: { orderBy: { createdAt: 'asc' } } },
    });

    if (!message) {
      return null;
    }

    const thread =
      message.threads[0] ??
      (await tx.thread.create({
        data: { messageId: message.id },
      }));

    const event = await tx.event.create({
      data: {
        sessionId: message.sessionId,
        hookEventName: 'UserPromptSubmit',
        rawPayload: buildUserPromptPayload(text),
        threadId: thread.id,
        importance: 'important',
      },
    });

    await tx.message.update({
      where: { id: message.id },
      data: {
        preview: text,
        importance: 'important',
      },
    });

    return {
      messageId: message.id,
      thread,
      event,
    };
  });

  if (!created) {
    return null;
  }

  const message = await getMessageByIdForFeed(created.messageId);
  if (!message) {
    throw new Error(`Failed to load updated message ${created.messageId}`);
  }

  return {
    message,
    thread: created.thread,
    event: created.event,
  };
}

export async function getThreadsByMessage(messageId: string) {
  return prisma.thread.findMany({
    where: { messageId },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { events: true } } },
  });
}

export async function getEventsByThread(
  threadId: string,
  options: { limit?: number; offset?: number; after?: string } = {},
) {
  const { limit = 50, offset = 0, after } = options;

  const where: Record<string, unknown> = { threadId };
  if (after) where.timestamp = { gt: new Date(after) };

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      skip: offset,
      take: limit,
    }),
    prisma.event.count({ where }),
  ]);

  return { events, total, limit, offset };
}
