import path from 'node:path';
import prisma from '../lib/prisma';
import { getOriginRemoteUrl } from './gitService';

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
    const repoPath = path.resolve(process.cwd(), '..');
    const githubUrl = await getOriginRemoteUrl(repoPath);
    channel = await prisma.channel.create({
      data: { name: 'general', baseBranch: 'main', githubUrl },
    });
  }
  defaultChannelId = channel.id;
  return defaultChannelId;
}

export async function createChannel(data: { name: string; baseBranch?: string | null; githubUrl?: string | null }) {
  return prisma.channel.create({ data });
}

export async function updateChannel(id: string, data: { name?: string; baseBranch?: string | null; githubUrl?: string | null }) {
  return prisma.channel.update({ where: { id }, data });
}
