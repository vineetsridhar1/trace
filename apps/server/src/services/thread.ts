import { prisma } from "../lib/db.js";
import { chatService } from "./chat.js";

export class ThreadService {
  async getReplies(
    rootMessageId: string,
    organizationId: string,
    userId: string,
    opts?: { after?: Date; limit?: number },
  ) {
    return chatService.getReplies(rootMessageId, organizationId, userId, opts);
  }

  async getSummary(rootMessageId: string) {
    const [replyCount, lastReply, participants] = await Promise.all([
      prisma.message.count({ where: { parentMessageId: rootMessageId } }),
      prisma.message.findFirst({
        where: { parentMessageId: rootMessageId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.message.findMany({
        where: { parentMessageId: rootMessageId },
        select: { actorId: true },
        distinct: ["actorId"],
      }),
    ]);

    return {
      rootMessageId,
      replyCount,
      lastReplyAt: lastReply ? lastReply.createdAt.toISOString() : null,
      participantIds: participants.map((p) => p.actorId),
    };
  }
}

export const threadService = new ThreadService();
