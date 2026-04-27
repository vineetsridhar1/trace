import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { sanitizeHtml, extractMentions, stripHtml } from "./mention.js";
import { resolveActors, type ActorSummary } from "./actor.js";

export type DbMessage = Prisma.MessageGetPayload<Record<string, never>>;

export type MessageWithSummary = DbMessage & {
  replyCount: number;
  latestReplyAt: Date | null;
  threadRepliers: ActorSummary[];
};

const MAX_MESSAGE_LENGTH = 65536; // 64KB

export function normalizeMessageInput(text?: string, html?: string) {
  if (!text && !html) {
    throw new Error("Either text or html must be provided");
  }

  if (text && text.length > MAX_MESSAGE_LENGTH) {
    throw new Error("Message text exceeds maximum length");
  }
  if (html && html.length > MAX_MESSAGE_LENGTH) {
    throw new Error("Message HTML exceeds maximum length");
  }

  if (html) {
    const cleanHtml = sanitizeHtml(html);
    return {
      text: text || stripHtml(cleanHtml),
      html: cleanHtml,
      mentions: extractMentions(cleanHtml),
    };
  }

  return {
    text: text!,
    html: null,
    mentions: [] as Array<{ userId: string; name: string }>,
  };
}

export function buildMessageEventPayload(message: DbMessage, clientMutationId?: string) {
  return {
    messageId: message.id,
    chatId: message.chatId,
    channelId: message.channelId,
    parentMessageId: message.parentMessageId,
    text: message.text,
    html: message.html,
    mentions: message.mentions,
    ...(clientMutationId ? { clientMutationId } : {}),
  };
}

/**
 * Resolve the organizationId to use for event storage.
 * Chat events are not org-scoped, but the Event model requires an orgId.
 * We use the actor's first org membership as a storage key.
 */
export async function resolveEventOrgId(actorId: string): Promise<string> {
  const membership = await prisma.orgMember.findFirst({
    where: { userId: actorId },
    orderBy: { joinedAt: "asc" },
    select: { organizationId: true },
  });
  if (!membership) {
    throw new Error("Actor must belong to at least one organization");
  }
  return membership.organizationId;
}

/**
 * Hydrate root messages with thread summaries (replyCount, latestReplyAt, threadRepliers).
 */
export async function hydrateMessages(messages: DbMessage[]): Promise<MessageWithSummary[]> {
  if (messages.length === 0) return [];

  const rootIds = messages.filter((m) => !m.parentMessageId).map((m) => m.id);
  const replies = rootIds.length
    ? await prisma.message.findMany({
        where: { parentMessageId: { in: rootIds } },
        orderBy: { createdAt: "desc" },
        select: { parentMessageId: true, actorType: true, actorId: true, createdAt: true },
      })
    : [];

  const actorMap = await resolveActors(
    replies.map((r: { actorType: string; actorId: string }) => ({
      actorType: r.actorType,
      actorId: r.actorId,
    })),
  );

  const summaries = new Map<
    string,
    {
      replyCount: number;
      latestReplyAt: Date | null;
      threadRepliers: ActorSummary[];
      seenActors: Set<string>;
    }
  >();

  for (const reply of replies) {
    if (!reply.parentMessageId) continue;
    let summary = summaries.get(reply.parentMessageId);
    if (!summary) {
      summary = { replyCount: 0, latestReplyAt: null, threadRepliers: [], seenActors: new Set() };
      summaries.set(reply.parentMessageId, summary);
    }
    summary.replyCount += 1;
    if (!summary.latestReplyAt) summary.latestReplyAt = reply.createdAt;

    const actorKey = `${reply.actorType}:${reply.actorId}`;
    if (!summary.seenActors.has(actorKey) && summary.threadRepliers.length < 3) {
      summary.seenActors.add(actorKey);
      summary.threadRepliers.push(
        actorMap.get(actorKey) ?? {
          type: reply.actorType,
          id: reply.actorId,
          name: null,
          avatarUrl: null,
        },
      );
    }
  }

  return messages.map((m) => {
    const summary = m.parentMessageId ? null : summaries.get(m.id);
    return {
      ...m,
      replyCount: summary?.replyCount ?? 0,
      latestReplyAt: summary?.latestReplyAt ?? null,
      threadRepliers: summary?.threadRepliers ?? [],
    };
  });
}
