import type { Prisma } from "@prisma/client";
import type { UserRole } from "@trace/gql";

export type NormalizedMember = {
  user: { id: string; name: string | null; avatarUrl: string | null };
  joinedAt: string;
};

export type NormalizedProjectMember = {
  user: { id: string; email: string; name: string | null; avatarUrl: string | null };
  role: UserRole;
  joinedAt: string;
  leftAt: string | null;
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

  const userIds = members.map((m: { userId: string }) => m.userId);
  const users = await tx.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, avatarUrl: true },
  });
  const userMap = new Map(
    users.map(
      (u: { id: string; name: string | null; avatarUrl: string | null }) => [u.id, u] as const,
    ),
  );

  return members.map((m: { userId: string; joinedAt: Date }) => ({
    user: userMap.get(m.userId) ?? { id: m.userId, name: "Unknown", avatarUrl: null },
    joinedAt: m.joinedAt.toISOString(),
  }));
}

export async function normalizeProjectMembers(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<NormalizedProjectMember[]> {
  const members = await tx.projectMember.findMany({ where: { projectId, leftAt: null } });
  const userIds = members.map((member: { userId: string }) => member.userId);
  const users = await tx.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true, avatarUrl: true },
  });
  const userMap = new Map(
    users.map(
      (user: { id: string; email: string; name: string | null; avatarUrl: string | null }) =>
        [user.id, user] as const,
    ),
  );

  return members.map(
    (member: { userId: string; role: UserRole; joinedAt: Date; leftAt: Date | null }) => ({
      user: userMap.get(member.userId) ?? {
        id: member.userId,
        email: "",
        name: "Unknown",
        avatarUrl: null,
      },
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
      leftAt: member.leftAt ? member.leftAt.toISOString() : null,
    }),
  );
}
