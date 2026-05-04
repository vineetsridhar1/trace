/**
 * Project domain actions — create, update, linkEntity, get, planning runtime
 */

import type {
  AgentActionRegistration,
  ActionDispatcher,
  EntityType,
  AgentContext,
} from "./types.js";
import type { ProjectRunStatus } from "@trace/gql";
import { actorInfo, type ServiceContainer } from "./types.js";

// ---------------------------------------------------------------------------
// Action registrations
// ---------------------------------------------------------------------------

export const projectActions: AgentActionRegistration[] = [
  {
    name: "project.create",
    service: "organizationService",
    method: "createProject",
    description:
      "Create a new project in the organization. Projects group related channels, tickets, and sessions.",
    catalogDescription: "Create/add/make a new project (name, repoId)",
    risk: "medium",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        name: { type: "string", description: "Project name", required: true },
        repoId: { type: "string", description: "Repository to associate the project with" },
      },
    },
    scopes: ["project", "channel", "chat", "system"],
  },
  {
    name: "project.linkEntity",
    service: "organizationService",
    method: "linkEntityToProject",
    description:
      "Link an entity (channel, ticket, or session) to a project for organizational grouping.",
    catalogDescription: "Link/associate an entity to a project (entityType, entityId, projectId)",
    risk: "low",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        entityType: {
          type: "string",
          description: "Type of entity to link",
          required: true,
          enum: ["channel", "ticket", "session"],
        },
        entityId: { type: "string", description: "ID of the entity to link", required: true },
        projectId: { type: "string", description: "Project to link the entity to", required: true },
      },
    },
    scopes: ["project", "channel", "ticket", "session"],
  },
  {
    name: "project.update",
    service: "organizationService",
    method: "updateProject",
    description: "Update project metadata such as name, repository, autonomy mode, or soul file.",
    catalogDescription: "Update/edit/rename a project (projectId, name, repoId, aiMode, soulFile)",
    risk: "medium",
    suggestable: true,
    tier: "extended",
    parameters: {
      fields: {
        projectId: { type: "string", description: "The project to update", required: true },
        name: { type: "string", description: "New project name" },
        repoId: { type: "string", description: "Repository to associate with the project" },
        aiMode: {
          type: "string",
          description: "Project-level autonomy mode",
          enum: ["observe", "suggest", "act"],
        },
        soulFile: { type: "string", description: "Project soul file path" },
      },
    },
    scopes: ["project"],
  },
  {
    name: "project.get",
    service: "organizationService",
    method: "getProject",
    description: "Get details about a specific project including linked entities.",
    catalogDescription: "Fetch/read/view project details (projectId)",
    risk: "low",
    suggestable: false,
    tier: "extended",
    parameters: {
      fields: {
        projectId: { type: "string", description: "The project to look up", required: true },
      },
    },
    scopes: ["project", "channel", "ticket", "session", "chat"],
  },
  {
    name: "project.askQuestion",
    service: "projectPlanningService",
    method: "askQuestion",
    description:
      "Ask a clarifying planning question for the current project run. Emits project_question_asked.",
    risk: "low",
    suggestable: false,
    tier: "core",
    parameters: {
      fields: {
        projectRunId: { type: "string", description: "Current project run", required: true },
        message: { type: "string", description: "Clarifying question to ask", required: true },
      },
    },
    scopes: ["project"],
  },
  {
    name: "project.recordAnswer",
    service: "projectPlanningService",
    method: "recordAnswer",
    description:
      "Record a user-provided answer for the current project run. Emits project_answer_recorded.",
    risk: "low",
    suggestable: false,
    tier: "core",
    parameters: {
      fields: {
        projectRunId: { type: "string", description: "Current project run", required: true },
        message: { type: "string", description: "Answer text to record", required: true },
      },
    },
    scopes: ["project"],
  },
  {
    name: "project.recordDecision",
    service: "projectPlanningService",
    method: "recordDecision",
    description:
      "Record a durable planning decision for the current project run. Emits project_decision_recorded.",
    risk: "low",
    suggestable: false,
    tier: "core",
    parameters: {
      fields: {
        projectRunId: { type: "string", description: "Current project run", required: true },
        decision: { type: "string", description: "Decision text to record", required: true },
      },
    },
    scopes: ["project"],
  },
  {
    name: "project.recordRisk",
    service: "projectPlanningService",
    method: "recordRisk",
    description:
      "Record a durable planning risk for the current project run. Emits project_risk_recorded.",
    risk: "low",
    suggestable: false,
    tier: "core",
    parameters: {
      fields: {
        projectRunId: { type: "string", description: "Current project run", required: true },
        risk: { type: "string", description: "Risk text to record", required: true },
      },
    },
    scopes: ["project"],
  },
  {
    name: "project.summarizePlan",
    service: "projectPlanningService",
    method: "updatePlanSummary",
    description:
      "Update the current project run's durable plan summary. Cannot create tickets. Emits project_plan_summary_updated.",
    risk: "low",
    suggestable: false,
    tier: "core",
    parameters: {
      fields: {
        projectRunId: { type: "string", description: "Current project run", required: true },
        planSummary: { type: "string", description: "Updated plan summary", required: true },
        status: {
          type: "string",
          description: "Optional run status after summary update",
          enum: ["draft", "interviewing", "planning", "ready", "running", "needs_human", "paused"],
        },
      },
    },
    scopes: ["project"],
  },
];

// ---------------------------------------------------------------------------
// Dispatchers
// ---------------------------------------------------------------------------

export const projectDispatchers: Record<string, ActionDispatcher> = {
  "project.create": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.organizationService.createProject(
      {
        name: args.name as string,
        organizationId: ctx.organizationId,
        repoId: args.repoId as string | undefined,
      },
      actorType,
      actorId,
    );
  },

  "project.linkEntity": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.organizationService.linkEntityToProject(
      args.entityType as EntityType,
      args.entityId as string,
      args.projectId as string,
      actorType,
      actorId,
    );
  },

  "project.update": (services, args, ctx) => {
    const { actorType, actorId } = actorInfo(ctx);
    return services.organizationService.updateProject(
      args.projectId as string,
      ctx.organizationId,
      {
        ...(args.name !== undefined && { name: args.name as string }),
        ...(args.repoId !== undefined && { repoId: args.repoId as string }),
        ...(args.aiMode !== undefined && { aiMode: args.aiMode as "observe" | "suggest" | "act" }),
        ...(args.soulFile !== undefined && { soulFile: args.soulFile as string }),
      },
      actorType,
      actorId,
    );
  },

  "project.get": (services, args, ctx) => {
    if (ctx.scopeType === "project" && ctx.scopeId && args.projectId !== ctx.scopeId) {
      throw new Error("Project action is outside the scoped project");
    }
    return services.organizationService.getProject(args.projectId as string, ctx.organizationId);
  },

  "project.askQuestion": async (services, args, ctx) => {
    await assertPlanningScope(services, args.projectRunId as string, ctx);
    const { actorType, actorId } = actorInfo(ctx);
    const event = await requireProjectPlanningService(services).askQuestion(
      { projectRunId: args.projectRunId as string, message: args.message as string },
      ctx.organizationId,
      actorType,
      actorId,
    );
    return eventResult(event, args.projectRunId as string);
  },

  "project.recordAnswer": async (services, args, ctx) => {
    await assertPlanningScope(services, args.projectRunId as string, ctx);
    const { actorType, actorId } = actorInfo(ctx);
    const event = await requireProjectPlanningService(services).recordAnswer(
      { projectRunId: args.projectRunId as string, message: args.message as string },
      ctx.organizationId,
      actorType,
      actorId,
    );
    return eventResult(event, args.projectRunId as string);
  },

  "project.recordDecision": async (services, args, ctx) => {
    await assertPlanningScope(services, args.projectRunId as string, ctx);
    const { actorType, actorId } = actorInfo(ctx);
    const event = await requireProjectPlanningService(services).recordDecision(
      { projectRunId: args.projectRunId as string, decision: args.decision as string },
      ctx.organizationId,
      actorType,
      actorId,
    );
    return eventResult(event, args.projectRunId as string);
  },

  "project.recordRisk": async (services, args, ctx) => {
    await assertPlanningScope(services, args.projectRunId as string, ctx);
    const { actorType, actorId } = actorInfo(ctx);
    const event = await requireProjectPlanningService(services).recordRisk(
      { projectRunId: args.projectRunId as string, risk: args.risk as string },
      ctx.organizationId,
      actorType,
      actorId,
    );
    return eventResult(event, args.projectRunId as string);
  },

  "project.summarizePlan": async (services, args, ctx) => {
    await assertPlanningScope(services, args.projectRunId as string, ctx);
    const { actorType, actorId } = actorInfo(ctx);
    const projectRun = await requireProjectPlanningService(services).updatePlanSummary(
      {
        projectRunId: args.projectRunId as string,
        planSummary: args.planSummary as string,
        ...(args.status !== undefined && { status: args.status as ProjectRunStatus }),
      },
      ctx.organizationId,
      actorType,
      actorId,
    );
    return {
      projectRun: {
        id: projectRun.id,
        projectId: projectRun.projectId,
        status: projectRun.status,
        planSummary: projectRun.planSummary,
      },
    };
  },
};

function requireProjectPlanningService(services: ServiceContainer) {
  if (!services.projectPlanningService) {
    throw new Error("Project planning service is unavailable");
  }
  return services.projectPlanningService;
}

async function assertPlanningScope(
  services: ServiceContainer,
  projectRunId: string,
  ctx: AgentContext,
): Promise<void> {
  if (ctx.scopeType !== "project" || !ctx.scopeId) {
    throw new Error("Project planning actions require a project scope");
  }
  const { actorType, actorId } = actorInfo(ctx);
  const planningContext = await requireProjectPlanningService(services).getContext(
    projectRunId,
    ctx.organizationId,
    actorType,
    actorId,
  );
  if (planningContext.project.id !== ctx.scopeId) {
    throw new Error("Project run is outside the scoped project");
  }
}

function eventResult(event: unknown, projectRunId: string): Record<string, unknown> {
  if (typeof event === "object" && event !== null) {
    const record = event as Record<string, unknown>;
    return {
      eventId: record.id,
      eventType: record.eventType,
      projectRunId,
    };
  }
  return { projectRunId };
}
