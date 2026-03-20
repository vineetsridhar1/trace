import { prisma } from "../lib/db.js";

export class ThreadService {
  async getReplies(
    rootEventId: string,
    opts?: { after?: Date; limit?: number },
  ) {
    return prisma.event.findMany({
      where: {
        parentId: rootEventId,
        ...(opts?.after ? { timestamp: { gt: opts.after } } : {}),
      },
      orderBy: { timestamp: "asc" },
      take: opts?.limit ?? 200,
    });
  }

  async getSummary(rootEventId: string) {
    const [replyCount, lastReply, participants] = await Promise.all([
      prisma.event.count({ where: { parentId: rootEventId } }),
      prisma.event.findFirst({
        where: { parentId: rootEventId },
        orderBy: { timestamp: "desc" },
        select: { timestamp: true },
      }),
      prisma.event.findMany({
        where: { parentId: rootEventId },
        select: { actorId: true },
        distinct: ["actorId"],
      }),
    ]);

    return {
      rootEventId,
      replyCount,
      lastReplyAt: lastReply ? lastReply.timestamp.toISOString() : null,
      participantIds: participants.map((p) => p.actorId),
    };
  }
}

export const threadService = new ThreadService();
