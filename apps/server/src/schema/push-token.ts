import type { Context } from "../context.js";
import type { PushPlatform } from "@trace/gql";
import { pushTokenService } from "../services/pushTokenService.js";

export const pushTokenMutations = {
  registerPushToken: (_: unknown, args: { token: string; platform: PushPlatform }, ctx: Context) =>
    pushTokenService.register({
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      token: args.token,
      platform: args.platform,
    }),
  unregisterPushToken: (_: unknown, args: { token: string }, ctx: Context) =>
    pushTokenService.unregister({ userId: ctx.userId, token: args.token }),
};
