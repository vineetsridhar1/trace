import type { ActorType, ChannelType } from "@trace/gql";
import type { Prisma } from "@prisma/client";
import { TRACE_AI_USER_ID } from "../lib/ai-user.js";
import { normalizeMembers } from "./member-utils.js";

export type CreateChannelInTransactionInput = {
  organizationId: string;
  name: string;
  type: ChannelType;
  actorType: ActorType;
  actorId: string;
  position?: number | null;
  groupId?: string | null;
  repo?: { id: string; name: string } | null;
  baseBranch?: string | null;
  projectIds?: string[];
};

export async function createChannelInTransaction(
  tx: Prisma.TransactionClient,
  input: CreateChannelInTransactionInput,
) {
  let position = input.position ?? null;
  if (position === null) {
    if (input.groupId) {
      const lastInGroup = await tx.channel.findFirst({
        where: { groupId: input.groupId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      position = (lastInGroup?.position ?? -1) + 1;
    } else {
      const lastUngroupedChannel = await tx.channel.findFirst({
        where: { organizationId: input.organizationId, groupId: null },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const lastGroup = await tx.channelGroup.findFirst({
        where: { organizationId: input.organizationId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const maxPos = Math.max(lastUngroupedChannel?.position ?? -1, lastGroup?.position ?? -1);
      position = maxPos + 1;
    }
  }

  const channel = await tx.channel.create({
    data: {
      name: input.name,
      type: input.type,
      position,
      organizationId: input.organizationId,
      groupId: input.groupId ?? null,
      repoId: input.repo?.id ?? null,
      baseBranch: input.baseBranch ?? null,
      ...(input.projectIds?.length && {
        projects: { create: input.projectIds.map((projectId: string) => ({ projectId })) },
      }),
    },
  });

  if (input.actorType !== "system") {
    await tx.channelMember.create({ data: { channelId: channel.id, userId: input.actorId } });
  }

  if (input.actorId !== TRACE_AI_USER_ID) {
    const aiOrgMember = await tx.orgMember.findUnique({
      where: {
        userId_organizationId: {
          userId: TRACE_AI_USER_ID,
          organizationId: input.organizationId,
        },
      },
      select: { userId: true },
    });
    if (aiOrgMember) {
      await tx.channelMember.create({
        data: { channelId: channel.id, userId: TRACE_AI_USER_ID },
      });
    }
  }

  const normalizedMembers = await normalizeMembers(tx, { type: "channel", id: channel.id });
  const channelPayload = {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    position: channel.position,
    groupId: channel.groupId,
    repoId: channel.repoId,
    baseBranch: channel.baseBranch,
    ...(input.repo ? { repo: input.repo } : {}),
    members: normalizedMembers,
  };

  return { channel, channelPayload };
}
