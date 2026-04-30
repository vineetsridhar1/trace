import type { ActorType } from "@trace/gql";
import type { Prisma } from "@prisma/client";

export async function assertActorOrgAccess(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorType: ActorType,
  actorId: string,
): Promise<void> {
  if (actorType === "system") return;

  if (actorType === "agent") {
    await tx.agentIdentity.findUniqueOrThrow({
      where: { organizationId },
      select: { id: true },
    });
    return;
  }

  await tx.orgMember.findUniqueOrThrow({
    where: {
      userId_organizationId: {
        userId: actorId,
        organizationId,
      },
    },
    select: { userId: true },
  });
}

export async function assertActorOrgAdmin(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actorType: ActorType,
  actorId: string,
): Promise<void> {
  if (actorType === "system") return;

  if (actorType === "agent") {
    throw new Error("Only admins can perform this action");
  }

  const membership = await tx.orgMember.findUniqueOrThrow({
    where: {
      userId_organizationId: {
        userId: actorId,
        organizationId,
      },
    },
    select: { userId: true, role: true },
  });
  if (membership.role !== "admin") {
    throw new Error("Only admins can perform this action");
  }
}
