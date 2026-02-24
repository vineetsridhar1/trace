import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import prisma from '../lib/prisma';
import { getOriginRemoteUrl } from './gitService';

let defaultChannelId: string | null = null;

/**
 * Ensure the default channel has an entry in the local config file
 * (~/.trace/local-config.json) so that startup scripts and @ searches work.
 */
function ensureDefaultChannelLocalConfig(channelId: string, repoPath: string): void {
  const configDir = path.join(os.homedir(), '.trace');
  const configPath = path.join(configDir, 'local-config.json');

  let config: { channels: Record<string, { localRepoPath: string }> } = { channels: {} };
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(raw);
  } catch {
    // File doesn't exist or is invalid — start fresh
  }

  if (config.channels[channelId]?.localRepoPath) return;

  if (!config.channels[channelId]) {
    config.channels[channelId] = { localRepoPath: repoPath };
  } else {
    config.channels[channelId].localRepoPath = repoPath;
  }

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

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
  const repoPath = path.resolve(process.cwd(), '..');
  let channel = await prisma.channel.findFirst({ where: { name: 'general' } });
  if (!channel) {
    const githubUrl = await getOriginRemoteUrl(repoPath);
    channel = await prisma.channel.create({
      data: { name: 'general', baseBranch: 'main', githubUrl },
    });
  }
  ensureDefaultChannelLocalConfig(channel.id, repoPath);
  defaultChannelId = channel.id;
  return defaultChannelId;
}

export async function createChannel(data: { name: string; baseBranch?: string | null; githubUrl?: string | null }) {
  return prisma.channel.create({ data });
}

export async function updateChannel(id: string, data: { name?: string; baseBranch?: string | null; githubUrl?: string | null }) {
  return prisma.channel.update({ where: { id }, data });
}
