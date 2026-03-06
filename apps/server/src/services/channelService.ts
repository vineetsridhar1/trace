import prisma from '../lib/prisma';

function withTeamIds<T extends { teamLinks?: { teamId: string }[] }>(channel: T): T & { teamIds: string[] } {
  const { teamLinks, ...rest } = channel;
  return { ...rest, teamIds: teamLinks?.map((l) => l.teamId) ?? [] } as T & { teamIds: string[] };
}

export async function listChannels() {
  const channels = await prisma.channel.findMany({
    orderBy: { createdAt: 'asc' },
    include: { teamLinks: { select: { teamId: true } } },
  });
  return channels.map(withTeamIds);
}

export async function getChannel(id: string) {
  const channel = await prisma.channel.findUnique({
    where: { id },
    include: {
      _count: { select: { workspaces: true } },
      teamLinks: { select: { teamId: true } },
    },
  });
  return channel ? withTeamIds(channel) : null;
}

export async function createChannel(data: {
  name: string;
  serverId: string;
  type?: string;
  workspacesEnabled?: boolean;
  teamIds?: string[];
  baseBranch?: string | null;
  githubUrl?: string | null;
  defaultSetupScript?: string | null;
  defaultRunScript?: string | null;
  defaultTeardownScript?: string | null;
}) {
  const { teamIds, ...channelData } = data;
  const channel = await prisma.channel.create({
    data: {
      ...channelData,
      teamLinks: teamIds?.length
        ? { create: teamIds.map((teamId) => ({ teamId })) }
        : undefined,
    },
    include: { teamLinks: { select: { teamId: true } } },
  });
  return withTeamIds(channel);
}

export async function deleteChannel(id: string) {
  // Delete in dependency order — not all child relations have onDelete: Cascade
  const workspaceIds = (await prisma.workspace.findMany({
    where: { channelId: id },
    select: { id: true },
  })).map((w) => w.id);

  await prisma.$transaction([
    // Events → sessions → workspaces (no cascade)
    prisma.event.deleteMany({
      where: { session: { workspaceId: { in: workspaceIds } } },
    }),
    // Sessions → workspaces (no cascade)
    prisma.session.deleteMany({
      where: { workspaceId: { in: workspaceIds } },
    }),
    // Workspaces (tickets + dependencies cascade from workspace/column)
    prisma.workspace.deleteMany({ where: { channelId: id } }),
    // Kanban columns (cascade handled)
    prisma.kanbanColumn.deleteMany({ where: { channelId: id } }),
    // Team associations
    prisma.channelTeam.deleteMany({
      where: { OR: [{ channelId: id }, { teamId: id }] },
    }),
    // Members
    prisma.channelMember.deleteMany({ where: { channelId: id } }),
    // Channel
    prisma.channel.delete({ where: { id } }),
  ]);
}

export async function joinChannel(channelId: string, userId: string) {
  await prisma.channelMember.upsert({
    where: { channelId_userId: { channelId, userId } },
    create: { channelId, userId },
    update: {},
  });
}

export async function listChannelsForUser(serverId: string, userId: string) {
  const channels = await prisma.channel.findMany({
    where: {
      serverId,
      members: { some: { userId } },
    },
    orderBy: { createdAt: 'asc' },
    include: { teamLinks: { select: { teamId: true } } },
  });
  return channels.map(withTeamIds);
}

export async function updateChannel(id: string, data: {
  name?: string;
  workspacesEnabled?: boolean;
  teamIds?: string[];
  baseBranch?: string | null;
  githubUrl?: string | null;
  defaultRepoPath?: string | null;
  defaultSetupScript?: string | null;
  defaultRunScript?: string | null;
  defaultTeardownScript?: string | null;
}) {
  const { teamIds, ...channelData } = data;

  if (teamIds !== undefined) {
    await prisma.channelTeam.deleteMany({ where: { channelId: id } });
    if (teamIds.length > 0) {
      await prisma.channelTeam.createMany({
        data: teamIds.map((teamId) => ({ channelId: id, teamId })),
      });
    }
  }

  const channel = await prisma.channel.update({
    where: { id },
    data: channelData,
    include: { teamLinks: { select: { teamId: true } } },
  });
  return withTeamIds(channel);
}
