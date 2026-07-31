import type { Context } from "../context.js";
import { requireOrgContext } from "../lib/require-org.js";
import { toGraphQLError } from "../lib/errors.js";
import { artifactService } from "../services/artifact.js";
import { sessionService } from "../services/session.js";

export const artifactQueries = {
  artifacts: async (
    _: unknown,
    args: { sessionId: string; type?: string | null; key?: string | null },
    ctx: Context,
  ) => {
    const organizationId = requireOrgContext(ctx);
    await sessionService.get(args.sessionId, organizationId, ctx.userId);
    return artifactService.list({
      organizationId,
      sessionId: args.sessionId,
      type: args.type ?? undefined,
      key: args.key ?? undefined,
    });
  },
};

export const artifactMutations = {
  approveArtifact: async (_: unknown, args: { artifactId: string }, ctx: Context) => {
    try {
      return await artifactService.approve({
        artifactId: args.artifactId,
        organizationId: requireOrgContext(ctx),
        actorId: ctx.userId,
      });
    } catch (error) {
      throw toGraphQLError(error);
    }
  },
};

export const artifactTypeResolvers = {
  Artifact: {
    createdBy: (
      artifact: { createdBy?: unknown; createdById: string },
      _args: unknown,
      ctx: Context,
    ) => artifact.createdBy ?? ctx.userLoader.load(artifact.createdById),
  },
};
