import type DataLoader from "dataloader";
import { prisma } from "../lib/db.js";

export type ActorSummary = {
  type: string;
  id: string;
  name: string | null;
  avatarUrl: string | null;
};

/** Resolve a single actor reference to an ActorSummary */
export async function resolveActor(
  ref: { actorType: string; actorId: string },
  userLoader?: DataLoader<string, { id: string; name: string | null; avatarUrl: string | null } | null>,
): Promise<ActorSummary> {
  const actor: ActorSummary = {
    type: ref.actorType,
    id: ref.actorId,
    name: null,
    avatarUrl: null,
  };
  if (ref.actorType === "user") {
    const user = userLoader
      ? await userLoader.load(ref.actorId)
      : await prisma.user.findUnique({
          where: { id: ref.actorId },
          select: { name: true, avatarUrl: true },
        });
    actor.name = user?.name ?? null;
    actor.avatarUrl = user?.avatarUrl ?? null;
  } else if (ref.actorType === "agent") {
    // The agent's actorId is the AI User ID — look it up from User table
    const user = await prisma.user.findUnique({
      where: { id: ref.actorId },
      select: { name: true, avatarUrl: true },
    });
    if (user) {
      actor.name = user.name;
      actor.avatarUrl = user.avatarUrl;
    } else {
      actor.name = "Trace AI";
    }
  }
  return actor;
}

/** Batch-resolve a list of actor references, deduplicating by actorType:actorId */
export async function resolveActors(
  refs: Array<{ actorType: string; actorId: string }>,
): Promise<Map<string, ActorSummary>> {
  const userIds = [...new Set(refs.filter((ref) => ref.actorType === "user").map((ref) => ref.actorId))];
  const agentIds = [...new Set(refs.filter((ref) => ref.actorType === "agent").map((ref) => ref.actorId))];

  // Agents are now User rows — fetch all user + agent IDs together
  const allUserIds = [...new Set([...userIds, ...agentIds])];

  const users = allUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: allUserIds } },
        select: { id: true, name: true, avatarUrl: true },
      })
    : [];

  type UserRecord = { id: string; name: string | null; avatarUrl: string | null };
  const userMap = new Map<string, UserRecord>(users.map((user: UserRecord) => [user.id, user]));
  const actorMap = new Map<string, ActorSummary>();

  for (const ref of refs) {
    const key = `${ref.actorType}:${ref.actorId}`;
    if (actorMap.has(key)) continue;

    if (ref.actorType === "user" || ref.actorType === "agent") {
      const user = userMap.get(ref.actorId);
      actorMap.set(key, {
        type: ref.actorType,
        id: ref.actorId,
        name: user?.name ?? (ref.actorType === "agent" ? "Trace AI" : null),
        avatarUrl: user?.avatarUrl ?? null,
      });
    } else {
      actorMap.set(key, {
        type: ref.actorType,
        id: ref.actorId,
        name: null,
        avatarUrl: null,
      });
    }
  }

  return actorMap;
}
