import type { Context } from "../context.js";
import { bridgeAuthService } from "../services/bridge-auth.js";
import { requireOrgContext } from "../lib/require-org.js";

export const bridgeAuthMutations = {
  createBridgeAccessChallenge: async (
    _: unknown,
    args: {
      runtimeId: string;
      sessionId?: string | null;
      action: string;
      promptPreview?: string | null;
    },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);
    const user = await ctx.userLoader.load(ctx.userId);
    return bridgeAuthService.createChallenge({
      runtimeId: args.runtimeId,
      requesterId: ctx.userId,
      requesterName: user?.name ?? "Unknown user",
      organizationId: orgId,
      action: args.action,
      sessionId: args.sessionId ?? undefined,
      promptPreview: args.promptPreview ?? undefined,
    });
  },

  verifyBridgeAccessCode: async (
    _: unknown,
    args: { challengeId: string; code: string },
    ctx: Context,
  ) => {
    return bridgeAuthService.verifyChallenge(args.challengeId, args.code, ctx.userId);
  },
};
