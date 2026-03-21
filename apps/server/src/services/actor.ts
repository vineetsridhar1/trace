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
    const agentIdentity = await prisma.agentIdentity.findUnique({
      where: { id: ref.actorId },
      select: { name: true },
    });
    actor.name = agentIdentity?.name ?? "Trace AI";
  }
  return actor;
}

/** Batch-resolve a list of actor references, deduplicating by actorType:actorId */
export async function resolveActors(
  refs: Array<{ actorType: string; actorId: string }>,
): Promise<Map<string, ActorSummary>> {
  const userIds = [...new Set(refs.filter((ref) => ref.actorType === "user").map((ref) => ref.actorId))];
  const agentIds = [...new Set(refs.filter((ref) => ref.actorType === "agent").map((ref) => ref.actorId))];

  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, avatarUrl: true },
      })
    : [];

  const agents = agentIds.length
    ? await prisma.agentIdentity.findMany({
        where: { id: { in: agentIds } },
        select: { id: true, name: true },
      })
    : [];

  const userMap = new Map(users.map((user) => [user.id, user]));
  const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
  const actorMap = new Map<string, ActorSummary>();

  for (const ref of refs) {
    const key = `${ref.actorType}:${ref.actorId}`;
    if (actorMap.has(key)) continue;

    if (ref.actorType === "user") {
      const user = userMap.get(ref.actorId);
      actorMap.set(key, {
        type: ref.actorType,
        id: ref.actorId,
        name: user?.name ?? null,
        avatarUrl: user?.avatarUrl ?? null,
      });
    } else if (ref.actorType === "agent") {
      const agent = agentMap.get(ref.actorId);
      actorMap.set(key, {
        type: ref.actorType,
        id: ref.actorId,
        name: agent?.name ?? "Trace AI",
        avatarUrl: null,
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
