import type { Context } from "../context.js";
import { threadService } from "../services/thread.js";
import { assertThreadAccess } from "../services/access.js";

export const threadQueries = {
  threadReplies: async (
    _: unknown,
    args: { rootMessageId: string; after?: string; limit?: number },
    ctx: Context,
  ) => {
    await assertThreadAccess(args.rootMessageId, ctx.userId);
    return threadService.getReplies(args.rootMessageId, ctx.userId, {
      after: args.after ? new Date(args.after) : undefined,
      limit: args.limit,
    });
  },
  threadSummary: async (_: unknown, args: { rootMessageId: string }, ctx: Context) => {
    await assertThreadAccess(args.rootMessageId, ctx.userId);
    return threadService.getSummary(args.rootMessageId);
  },
};
