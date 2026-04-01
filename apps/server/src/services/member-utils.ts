import type { Prisma } from "@prisma/client";

export type NormalizedMember = {
  user: { id: string; name: string | null; avatarUrl: string | null };
  joinedAt: string;
};

/**
 * Fetches members of a chat or channel and normalizes them with user data.
 * Abstracts the shared pattern of: query members -> batch-load users -> merge.
 */
export async function normalizeMembers(
  tx: Prisma.TransactionClient,
  scope: { type: "chat"; id: string } | { type: "channel"; id: string },
): Promise<NormalizedMember[]> {
  const members =
    scope.type === "chat"
      ? await tx.chatMember.findMany({ where: { chatId: scope.id, leftAt: null } })
      : await tx.channelMember.findMany({ where: { channelId: scope.id, leftAt: null } });

  const userIds = members.map((m) => m.userId);
  const users = await tx.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, avatarUrl: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return members.map((m) => ({
    user: userMap.get(m.userId) ?? { id: m.userId, name: "Unknown", avatarUrl: null },
    joinedAt: m.joinedAt.toISOString(),
  }));
}
