import type { ParticipantScope } from "@prisma/client";
import type { Context } from "../context.js";
import { participantService } from "../services/participant.js";
import { assertScopeAccess, assertThreadAccess } from "../services/access.js";

const VALID_SCOPES = new Set<string>(["channel", "chat", "session", "ticket", "thread", "system"]);

function validateScope(scopeType: string): ParticipantScope {
  if (!VALID_SCOPES.has(scopeType)) {
    throw new Error(`Invalid scope type: ${scopeType}`);
  }
  return scopeType as ParticipantScope;
}

export const participantQueries = {
  participants: async (_: unknown, args: { scopeType: string; scopeId: string }, ctx: Context) => {
    const scopeType = validateScope(args.scopeType);
    if (scopeType === "thread") {
      await assertThreadAccess(args.scopeId, ctx.userId, ctx.organizationId);
    } else {
      await assertScopeAccess(args.scopeType, args.scopeId, ctx.userId, ctx.organizationId);
    }

    return participantService.getParticipants(scopeType, args.scopeId, ctx.organizationId);
  },
};

export const participantMutations = {
  subscribe: async (_: unknown, args: { scopeType: string; scopeId: string }, ctx: Context) => {
    const scopeType = validateScope(args.scopeType);
    if (scopeType === "thread") {
      await assertThreadAccess(args.scopeId, ctx.userId, ctx.organizationId);
    } else {
      await assertScopeAccess(args.scopeType, args.scopeId, ctx.userId, ctx.organizationId);
    }

    return participantService.subscribe({
      userId: ctx.userId,
      scopeType,
      scopeId: args.scopeId,
      organizationId: ctx.organizationId,
    });
  },
  unsubscribe: async (_: unknown, args: { scopeType: string; scopeId: string }, ctx: Context) => {
    const scopeType = validateScope(args.scopeType);
    await participantService.unsubscribe({
      userId: ctx.userId,
      scopeType,
      scopeId: args.scopeId,
      organizationId: ctx.organizationId,
    });
    return true;
  },
  muteScope: async (_: unknown, args: { scopeType: string; scopeId: string }, ctx: Context) => {
    const scopeType = validateScope(args.scopeType);
    if (scopeType === "thread") {
      await assertThreadAccess(args.scopeId, ctx.userId, ctx.organizationId);
    } else {
      await assertScopeAccess(args.scopeType, args.scopeId, ctx.userId, ctx.organizationId);
    }

    return participantService.mute({
      userId: ctx.userId,
      scopeType,
      scopeId: args.scopeId,
      organizationId: ctx.organizationId,
    });
  },
  unmuteScope: async (_: unknown, args: { scopeType: string; scopeId: string }, ctx: Context) => {
    const scopeType = validateScope(args.scopeType);
    if (scopeType === "thread") {
      await assertThreadAccess(args.scopeId, ctx.userId, ctx.organizationId);
    } else {
      await assertScopeAccess(args.scopeType, args.scopeId, ctx.userId, ctx.organizationId);
    }

    return participantService.unmute({
      userId: ctx.userId,
      scopeType,
      scopeId: args.scopeId,
      organizationId: ctx.organizationId,
    });
  },
};

export const participantTypeResolvers = {
  Participant: {
    user: async (participant: { userId: string }, _args: unknown, ctx: Context) => {
      const user = await ctx.userLoader.load(participant.userId);
      if (!user) throw new Error("User not found");
      return user;
    },
    muted: (participant: { mutedAt: Date | null }) => {
      return participant.mutedAt !== null;
    },
  },
};
