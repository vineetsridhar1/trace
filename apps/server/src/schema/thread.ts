import { threadService } from "../services/thread.js";

export const threadQueries = {
  threadReplies: (_: unknown, args: { rootEventId: string; after?: string; limit?: number }) => {
    return threadService.getReplies(args.rootEventId, {
      after: args.after ? new Date(args.after) : undefined,
      limit: args.limit,
    });
  },
  threadSummary: (_: unknown, args: { rootEventId: string }) => {
    return threadService.getSummary(args.rootEventId);
  },
};
