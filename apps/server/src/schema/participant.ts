import type { Context } from "../context.js";
import { prisma } from "../lib/db.js";
import { participantService } from "../services/participant.js";

export const participantQueries = {
  participants: (_: unknown, args: { scopeType: string; scopeId: string }) => {
    return participantService.getParticipants(args.scopeType, args.scopeId);
  },
};

export const participantMutations = {
  subscribe: (_: unknown, args: { scopeType: string; scopeId: string }, ctx: Context) => {
    return participantService.subscribe({
      userId: ctx.userId,
      scopeType: args.scopeType,
      scopeId: args.scopeId,
      organizationId: ctx.organizationId,
    });
  },
  unsubscribe: async (_: unknown, args: { scopeType: string; scopeId: string }, ctx: Context) => {
    await participantService.unsubscribe({
      userId: ctx.userId,
      scopeType: args.scopeType,
      scopeId: args.scopeId,
    });
    return true;
  },
  muteScope: (_: unknown, args: { scopeType: string; scopeId: string }, ctx: Context) => {
    return participantService.mute({
      userId: ctx.userId,
      scopeType: args.scopeType,
      scopeId: args.scopeId,
    });
  },
  unmuteScope: (_: unknown, args: { scopeType: string; scopeId: string }, ctx: Context) => {
    return participantService.unmute({
      userId: ctx.userId,
      scopeType: args.scopeType,
      scopeId: args.scopeId,
    });
  },
};

export const participantTypeResolvers = {
  Participant: {
    user: (participant: { userId: string }) => {
      return prisma.user.findUniqueOrThrow({ where: { id: participant.userId } });
    },
    muted: (participant: { mutedAt: Date | null }) => {
      return participant.mutedAt !== null;
    },
  },
};
