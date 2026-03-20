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
    const replies = await prisma.event.findMany({
      where: { parentId: rootEventId },
      select: { actorId: true, timestamp: true },
      orderBy: { timestamp: "desc" },
    });

    const participantIds = [...new Set(replies.map((r) => r.actorId))];

    return {
      rootEventId,
      replyCount: replies.length,
      lastReplyAt: replies.length > 0 ? replies[0].timestamp.toISOString() : null,
      participantIds,
    };
  }
}

export const threadService = new ThreadService();
