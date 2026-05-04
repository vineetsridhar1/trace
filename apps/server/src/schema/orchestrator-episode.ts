import type { Context } from "../context.js";
import { requireOrgContext } from "../lib/require-org.js";
import { orchestratorEpisodeService } from "../services/orchestrator-episode.js";

export const orchestratorEpisodeQueries = {
  orchestratorEpisodes: (_: unknown, args: { projectRunId: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return orchestratorEpisodeService.listForProjectRun(
      args.projectRunId,
      orgId,
      ctx.actorType,
      ctx.userId,
    );
  },
};

export const orchestratorEpisodeMutations = {
  startOrchestratorEpisode: (_: unknown, args: { triggerEventId: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return orchestratorEpisodeService.startForLifecycleEvent({
      triggerEventId: args.triggerEventId,
      organizationId: orgId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
};

export const orchestratorEpisodeTypeResolvers = {
  ProjectRun: {
    orchestratorEpisodes: (
      projectRun: { id: string; organizationId: string; orchestratorEpisodes?: unknown[] },
      _args: unknown,
      ctx: Context,
    ) => {
      if (projectRun.orchestratorEpisodes) return projectRun.orchestratorEpisodes;
      return orchestratorEpisodeService.listForProjectRun(
        projectRun.id,
        projectRun.organizationId,
        ctx.actorType,
        ctx.userId,
      );
    },
  },
};
