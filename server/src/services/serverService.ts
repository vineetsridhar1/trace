import prisma from '../lib/prisma';

let defaultServerId: string | null = null;

export async function listServers() {
  return prisma.server.findMany({ orderBy: { createdAt: 'asc' } });
}

export async function createServer(data: { name: string; avatarUrl?: string | null }) {
  return prisma.server.create({
    data: {
      ...data,
      channels: {
        create: { name: 'general' },
      },
    },
    include: { channels: true },
  });
}

export async function getOrCreateDefaultServer(): Promise<string> {
  if (defaultServerId) return defaultServerId;
  let server = await prisma.server.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!server) {
    server = await prisma.server.create({ data: { name: 'Trace' } });
  }
  defaultServerId = server.id;
  return defaultServerId;
}
