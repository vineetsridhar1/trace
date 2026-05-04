import type { Context } from "../context.js";
import { requireOrgContext } from "../lib/require-org.js";
import { orchestratorEpisodeService } from "../services/orchestrator-episode.js";
import { projectPlanningService } from "../services/project-planning.js";
import { projectTicketExecutionService } from "../services/project-ticket-execution.js";
import { ticketService } from "../services/ticket.js";

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
  ProjectTicketExecution: {
    ticket: (execution: { ticketId: string; organizationId: string }) => {
      return ticketService.get(execution.ticketId, execution.organizationId);
    },
  },
  ProjectRun: {
    ticketGenerationAttempt: (projectRun: { id: string }) => {
      return projectPlanningService.getGenerationAttemptForRun(projectRun.id);
    },
    ticketExecutions: (projectRun: { id: string }) => {
      return projectTicketExecutionService.listForRun(projectRun.id);
    },
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
