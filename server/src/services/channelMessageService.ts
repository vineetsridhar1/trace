import prisma from '../lib/prisma';
import { pubsub, TOPICS } from './pubsub';

export async function getChannelMessages(
  channelId: string,
  options: { limit?: number; offset?: number } = {},
) {
  const { limit = 50, offset = 0 } = options;

  const where = { channelId };

  const [messages, total] = await Promise.all([
    prisma.channelMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip: offset,
      take: limit,
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
    prisma.channelMessage.count({ where }),
  ]);

  return { messages, total, limit, offset };
}

export async function createChannelMessage(
  channelId: string,
  userId: string,
  content: string,
) {
  const message = await prisma.channelMessage.create({
    data: {
      channelId,
      userId,
      content,
    },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  pubsub.publish(TOPICS.CHANNEL_MESSAGE_CREATED(channelId), {
    channelMessageCreated: message,
  });

  return message;
}
