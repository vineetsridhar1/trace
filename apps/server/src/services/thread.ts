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
    const replies = await prisma.message.findMany({
      where: { parentMessageId: rootMessageId },
      orderBy: { createdAt: "desc" },
      select: { actorType: true, actorId: true, createdAt: true },
    });

    const replyCount = replies.length;
    const lastReplyAt = replies[0]?.createdAt ?? null;

    // Deduplicate actors, keep first 3
    const seen = new Set<string>();
    const participantRefs: Array<{ actorType: string; actorId: string }> = [];
    for (const reply of replies) {
      const key = `${reply.actorType}:${reply.actorId}`;
      if (!seen.has(key)) {
        seen.add(key);
        participantRefs.push(reply);
        if (seen.size >= 3) break;
      }
    }

    return { replyCount, lastReplyAt, participantRefs };
  }
}

export const threadService = new ThreadService();
