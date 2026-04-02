import DataLoader from "dataloader";
import { prisma } from "./db.js";

export function createUserLoader() {
  return new DataLoader<string, { id: string; name: string | null; avatarUrl: string | null } | null>(
    async (ids: readonly string[]) => {
      const users = await prisma.user.findMany({
        where: { id: { in: [...ids] } },
        select: { id: true, name: true, avatarUrl: true },
      });
      const userMap = new Map(users.map((u: { id: string; name: string | null; avatarUrl: string | null }) => [u.id, u]));
      return ids.map((id: string) => userMap.get(id) ?? null);
    },
  );
}

function createPrismaLoader<T extends { id: string }>(
  findMany: (args: { where: { id: { in: string[] } } }) => Promise<T[]>,
) {
  return new DataLoader<string, T | null>(async (ids: readonly string[]) => {
    const items = await findMany({ where: { id: { in: [...ids] } } });
    const map = new Map(items.map((item: T) => [item.id, item]));
    return ids.map((id: string) => map.get(id) ?? null);
  });
}

function createPrismaLoaderWithInclude<T extends { id: string }>(
  findMany: (args: { where: { id: { in: string[] } }; include: Record<string, unknown> }) => Promise<T[]>,
  include: Record<string, unknown>,
) {
  return new DataLoader<string, T | null>(async (ids: readonly string[]) => {
    const items = await findMany({ where: { id: { in: [...ids] } }, include });
    const map = new Map(items.map((item: T) => [item.id, item]));
    return ids.map((id: string) => map.get(id) ?? null);
  });
}

export function createSessionLoader() {
  return createPrismaLoaderWithInclude(
    prisma.session.findMany.bind(prisma.session) as unknown as Parameters<typeof createPrismaLoaderWithInclude>[0],
    {
      createdBy: true,
      repo: true,
      channel: true,
      sessionGroup: true,
    },
  );
}

export function createSessionGroupLoader() {
  return createPrismaLoaderWithInclude(
    prisma.sessionGroup.findMany.bind(prisma.sessionGroup) as unknown as Parameters<typeof createPrismaLoaderWithInclude>[0],
    {
      channel: true,
      repo: true,
      sessions: {
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        include: {
          createdBy: true,
          repo: true,
          channel: true,
          sessionGroup: true,
        },
      },
    },
  );
}

export function createRepoLoader() {
  return createPrismaLoader(
    prisma.repo.findMany.bind(prisma.repo) as unknown as Parameters<typeof createPrismaLoader>[0],
  );
}

export function createEventLoader() {
  return createPrismaLoader(
    prisma.event.findMany.bind(prisma.event) as unknown as Parameters<typeof createPrismaLoader>[0],
  );
}

export function createConversationLoader() {
  return createPrismaLoader(
    prisma.aiConversation.findMany.bind(prisma.aiConversation) as unknown as Parameters<typeof createPrismaLoader>[0],
  );
}

export function createBranchLoader() {
  return createPrismaLoader(
    prisma.aiBranch.findMany.bind(prisma.aiBranch) as unknown as Parameters<typeof createPrismaLoader>[0],
  );
}

export function createTurnLoader() {
  return createPrismaLoader(
    prisma.aiTurn.findMany.bind(prisma.aiTurn) as unknown as Parameters<typeof createPrismaLoader>[0],
  );
}

/** Batch-load chat members by chatId */
export function createChatMembersLoader() {
  return new DataLoader<string, Array<{ userId: string; joinedAt: Date }>>(async (chatIds: readonly string[]) => {
    const members = await prisma.chatMember.findMany({
      where: { chatId: { in: [...chatIds] }, leftAt: null },
    });
    const byChat = new Map<string, Array<{ userId: string; joinedAt: Date }>>();
    for (const m of members) {
      const list = byChat.get(m.chatId) ?? [];
      list.push(m);
      byChat.set(m.chatId, list);
    }
    return chatIds.map((id: string) => byChat.get(id) ?? []);
  });
}

/** Batch-load tickets linked to sessions by sessionId */
export function createSessionTicketsLoader() {
  return new DataLoader<string, unknown[]>(async (sessionIds: readonly string[]) => {
    const links = await prisma.ticketLink.findMany({
      where: {
        entityType: "session",
        entityId: { in: [...sessionIds] },
      },
      select: { entityId: true, ticketId: true },
    });
    const ticketIds = [...new Set(links.map((l: { ticketId: string }) => l.ticketId))];
    const tickets = ticketIds.length > 0
      ? await prisma.ticket.findMany({
          where: { id: { in: ticketIds } },
          include: {
            assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
            links: true,
          },
        })
      : [];
    const ticketMap = new Map(tickets.map((t: { id: string }) => [t.id, t]));
    const bySession = new Map<string, unknown[]>();
    for (const link of links) {
      const ticket = ticketMap.get(link.ticketId);
      if (!ticket) continue;
      const list = bySession.get(link.entityId) ?? [];
      list.push(ticket);
      bySession.set(link.entityId, list);
    }
    return sessionIds.map((id: string) => bySession.get(id) ?? []);
  });
}

/** Batch-check channel membership for a specific user */
export function createChannelMembershipLoader(userId: string) {
  return new DataLoader<string, boolean>(
    async (channelIds: readonly string[]) => {
      const members = await prisma.channelMember.findMany({
        where: { channelId: { in: [...channelIds] }, userId, leftAt: null },
        select: { channelId: true },
      });
      const memberSet = new Set(members.map((m: { channelId: string }) => m.channelId));
      return channelIds.map((id: string) => memberSet.has(id));
    },
  );
}

/** Batch-check chat membership for a specific user */
export function createChatMembershipLoader(userId: string) {
  return new DataLoader<string, boolean>(
    async (chatIds: readonly string[]) => {
      const members = await prisma.chatMember.findMany({
        where: { chatId: { in: [...chatIds] }, userId, leftAt: null },
        select: { chatId: true },
      });
      const memberSet = new Set(members.map((m: { chatId: string }) => m.chatId));
      return chatIds.map((id: string) => memberSet.has(id));
    },
  );
}
