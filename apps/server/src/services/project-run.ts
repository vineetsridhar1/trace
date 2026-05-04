import type {
  ActorType,
  CreateProjectRunInput,
  ProjectRunStatus,
  UpdateProjectRunInput,
} from "@trace/gql";
import type { Prisma } from "@prisma/client";
import { asJsonObject } from "@trace/shared";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { assertActorOrgAccess } from "./actor-auth.js";

const ACTIVE_PROJECT_RUN_STATUSES: ProjectRunStatus[] = [
  "draft",
  "interviewing",
  "planning",
  "ready",
  "running",
  "needs_human",
  "paused",
];

const PROJECT_RUN_INCLUDE = {
  project: true,
} as const;

type ProjectRunWithProject = Prisma.ProjectRunGetPayload<{ include: typeof PROJECT_RUN_INCLUDE }>;

function dateToJson(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeExecutionConfig(value: unknown): Prisma.InputJsonObject {
  const object = asJsonObject(value);
  if (object) return object as Prisma.InputJsonObject;
  if (value == null) return {};
  throw new Error("Execution config must be an object");
}

function projectRunPayload(projectRun: ProjectRunWithProject): Prisma.InputJsonObject {
  return {
    id: projectRun.id,
    organizationId: projectRun.organizationId,
    projectId: projectRun.projectId,
    status: projectRun.status,
    initialGoal: projectRun.initialGoal,
    planSummary: projectRun.planSummary,
    activeGateId: projectRun.activeGateId,
    latestControllerSummaryId: projectRun.latestControllerSummaryId,
    latestControllerSummaryText: projectRun.latestControllerSummaryText,
    executionConfig: normalizeExecutionConfig(projectRun.executionConfig),
    createdAt: dateToJson(projectRun.createdAt),
    updatedAt: dateToJson(projectRun.updatedAt),
  };
}

export class ProjectRunService {
  async listProjectRuns(projectId: string, organizationId: string) {
    await prisma.project.findFirstOrThrow({
      where: { id: projectId, organizationId },
      select: { id: true },
    });

    return prisma.projectRun.findMany({
      where: { projectId, organizationId },
      orderBy: { updatedAt: "desc" },
      include: PROJECT_RUN_INCLUDE,
    });
  }

  async getProjectRunsForProject(projectId: string) {
    return prisma.projectRun.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
      include: PROJECT_RUN_INCLUDE,
    });
  }

  async createProjectRun(input: CreateProjectRunInput, actorType: ActorType, actorId: string) {
    const initialGoal = input.initialGoal.trim();
    if (!initialGoal) {
      throw new Error("Initial goal is required");
    }

    const [projectRun] = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const project = await tx.project.findUniqueOrThrow({
        where: { id: input.projectId },
        select: { id: true, organizationId: true },
      });
      await assertActorOrgAccess(tx, project.organizationId, actorType, actorId);
      await this.assertNoActiveRun(tx, project.id);

      const projectRun = await tx.projectRun.create({
        data: {
          projectId: project.id,
          organizationId: project.organizationId,
          status: "interviewing",
          initialGoal,
          executionConfig: normalizeExecutionConfig(input.executionConfig),
        },
        include: PROJECT_RUN_INCLUDE,
      });

      await eventService.create(
        {
          organizationId: project.organizationId,
          scopeType: "project",
          scopeId: project.id,
          eventType: "project_run_created",
          payload: { projectRun: projectRunPayload(projectRun) },
          actorType,
          actorId,
        },
        tx,
      );

      await eventService.create(
        {
          organizationId: project.organizationId,
          scopeType: "project",
          scopeId: project.id,
          eventType: "project_goal_submitted",
          payload: { projectRun: projectRunPayload(projectRun), goal: initialGoal },
          actorType,
          actorId,
        },
        tx,
      );

      return [projectRun] as const;
    });

    return projectRun;
  }

  async updateProjectRun(
    id: string,
    organizationId: string,
    input: UpdateProjectRunInput,
    actorType: ActorType,
    actorId: string,
  ) {
    const [projectRun] = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.projectRun.findFirstOrThrow({
        where: { id, organizationId },
        select: { id: true, projectId: true, organizationId: true },
      });
      await assertActorOrgAccess(tx, organizationId, actorType, actorId);

      if (input.status && ACTIVE_PROJECT_RUN_STATUSES.includes(input.status)) {
        await this.assertNoActiveRun(tx, existing.projectId, existing.id);
      }

      const data: Prisma.ProjectRunUncheckedUpdateInput = {};
      if (input.status != null) data.status = input.status;
      if (input.planSummary !== undefined) data.planSummary = input.planSummary;
      if (input.activeGateId !== undefined) data.activeGateId = input.activeGateId;
      if (input.latestControllerSummaryId !== undefined) {
        data.latestControllerSummaryId = input.latestControllerSummaryId;
      }
      if (input.latestControllerSummaryText !== undefined) {
        data.latestControllerSummaryText = input.latestControllerSummaryText;
      }
      if (input.executionConfig !== undefined) {
        data.executionConfig = normalizeExecutionConfig(input.executionConfig);
      }

      const projectRun = await tx.projectRun.update({
        where: { id: existing.id },
        data,
        include: PROJECT_RUN_INCLUDE,
      });

      await eventService.create(
        {
          organizationId,
          scopeType: "project",
          scopeId: projectRun.projectId,
          eventType: "project_run_updated",
          payload: { projectRun: projectRunPayload(projectRun) },
          actorType,
          actorId,
        },
        tx,
      );

      return [projectRun] as const;
    });

    return projectRun;
  }

  private async assertNoActiveRun(
    tx: Prisma.TransactionClient,
    projectId: string,
    excludingRunId?: string,
  ) {
    const existing = await tx.projectRun.findFirst({
      where: {
        projectId,
        status: { in: ACTIVE_PROJECT_RUN_STATUSES },
        ...(excludingRunId ? { id: { not: excludingRunId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new Error("Project already has an active run");
    }
  }
}

export const projectRunService = new ProjectRunService();
