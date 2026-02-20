import prisma from '../lib/prisma';

let defaultChannelId: string | null = null;

export async function listChannels() {
  return prisma.channel.findMany({ orderBy: { createdAt: 'asc' } });
}

export async function getChannel(id: string) {
  return prisma.channel.findUnique({
    where: { id },
    include: { _count: { select: { messages: true } } },
  });
}

export async function getDefaultChannel() {
  if (defaultChannelId) {
    return defaultChannelId;
  }
  let channel = await prisma.channel.findFirst({ where: { name: 'general' } });
  if (!channel) {
    channel = await prisma.channel.create({ data: { name: 'general' } });
  }
  defaultChannelId = channel.id;
  return defaultChannelId;
}
