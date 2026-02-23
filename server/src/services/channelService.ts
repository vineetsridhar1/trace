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

export async function updateChannel(id: string, data: { name?: string; cwd?: string | null }) {
  return prisma.channel.update({ where: { id }, data });
}

export async function listStartupScripts(channelId: string) {
  return prisma.startupScript.findMany({
    where: { channelId },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function createStartupScript(
  channelId: string,
  data: { name: string; command: string; scriptType?: string },
) {
  const scriptType = data.scriptType ?? 'startup';
  const maxOrder = await prisma.startupScript.aggregate({
    where: { channelId },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;
  return prisma.startupScript.create({
    data: { channelId, name: data.name, command: data.command, scriptType, sortOrder },
  });
}

export async function updateStartupScript(
  id: string,
  data: { name?: string; command?: string; scriptType?: string; sortOrder?: number },
) {
  return prisma.startupScript.update({ where: { id }, data });
}

export async function deleteStartupScript(id: string) {
  return prisma.startupScript.delete({ where: { id } });
}
