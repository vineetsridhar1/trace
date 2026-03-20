import type { Context } from "../context.js";
import { prisma } from "../lib/db.js";
import { participantService } from "../services/participant.js";
import { assertScopeAccess, assertThreadAccess } from "../services/access.js";

export const participantQueries = {
  participants: async (_: unknown, args: { scopeType: string; scopeId: string }, ctx: Context) => {
    if (args.scopeType === "thread") {
      await assertThreadAccess(args.scopeId, ctx.userId, ctx.organizationId);
    } else {
      await assertScopeAccess(args.scopeType, args.scopeId, ctx.userId, ctx.organizationId);
    }

    return participantService.getParticipants(args.scopeType, args.scopeId, ctx.organizationId);
  },
};

export const participantMutations = {
  subscribe: async (_: unknown, args: { scopeType: string; scopeId: string }, ctx: Context) => {
    if (args.scopeType === "thread") {
      await assertThreadAccess(args.scopeId, ctx.userId, ctx.organizationId);
    } else {
      await assertScopeAccess(args.scopeType, args.scopeId, ctx.userId, ctx.organizationId);
    }

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
      organizationId: ctx.organizationId,
    });
    return true;
  },
  muteScope: async (_: unknown, args: { scopeType: string; scopeId: string }, ctx: Context) => {
    if (args.scopeType === "thread") {
      await assertThreadAccess(args.scopeId, ctx.userId, ctx.organizationId);
    } else {
      await assertScopeAccess(args.scopeType, args.scopeId, ctx.userId, ctx.organizationId);
    }

    return participantService.mute({
      userId: ctx.userId,
      scopeType: args.scopeType,
      scopeId: args.scopeId,
      organizationId: ctx.organizationId,
    });
  },
  unmuteScope: async (_: unknown, args: { scopeType: string; scopeId: string }, ctx: Context) => {
    if (args.scopeType === "thread") {
      await assertThreadAccess(args.scopeId, ctx.userId, ctx.organizationId);
    } else {
      await assertScopeAccess(args.scopeType, args.scopeId, ctx.userId, ctx.organizationId);
    }

    return participantService.unmute({
      userId: ctx.userId,
      scopeType: args.scopeType,
      scopeId: args.scopeId,
      organizationId: ctx.organizationId,
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
