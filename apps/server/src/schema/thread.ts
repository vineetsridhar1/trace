import type { Context } from "../context.js";
import { threadService } from "../services/thread.js";
import { assertThreadAccess } from "../services/access.js";

export const threadQueries = {
  threadReplies: async (
    _: unknown,
    args: { rootEventId: string; after?: string; limit?: number },
    ctx: Context,
  ) => {
    await assertThreadAccess(args.rootEventId, ctx.userId, ctx.organizationId);
    return threadService.getReplies(args.rootEventId, {
      after: args.after ? new Date(args.after) : undefined,
      limit: args.limit,
    });
  },
  threadSummary: async (_: unknown, args: { rootEventId: string }, ctx: Context) => {
    await assertThreadAccess(args.rootEventId, ctx.userId, ctx.organizationId);
    return threadService.getSummary(args.rootEventId);
  },
};
