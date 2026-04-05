import { githubService } from "../services/github.js";
import type { Context } from "../context.js";

export const githubQueries = {
  githubRepoInfo: async (
    _: unknown,
    args: { repoId: string; branch?: string | null },
    ctx: Context,
  ) => {
    return githubService.getRepoInfo(args.repoId, ctx.userId, args.branch);
  },
};
