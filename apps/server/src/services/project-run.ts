import type {
  ActorType,
  CreateProjectFromGoalInput,
  CreateProjectRunInput,
  ProjectRunStatus,
  UpdateProjectRunInput,
  UserRole,
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

const USER_SELECT = { id: true, email: true, name: true, avatarUrl: true } as const;

const PROMPT_PROJECT_INCLUDE = {
  repo: true,
  channels: { include: { channel: { include: { repo: true } } } },
  sessions: {
    include: { session: { include: { createdBy: { select: USER_SELECT }, repo: true } } },
  },
  tickets: {
    include: {
      ticket: {
        include: {
          createdBy: { select: USER_SELECT },
          assignees: { include: { user: { select: USER_SELECT } } },
          links: true,
        },
      },
    },
  },
  members: {
    where: { leftAt: null },
    include: { user: { select: USER_SELECT } },
  },
  runs: { include: PROJECT_RUN_INCLUDE },
} as const;

type ProjectRunWithProject = Prisma.ProjectRunGetPayload<{ include: typeof PROJECT_RUN_INCLUDE }>;
type PromptProjectWithRelations = Prisma.ProjectGetPayload<{
  include: typeof PROMPT_PROJECT_INCLUDE;
}>;
type PromptProjectUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};
type PromptProjectMemberWithUser = {
  userId: string;
  role: UserRole;
  joinedAt: Date;
  leftAt: Date | null;
  user: PromptProjectUser;
};

function dateToJson(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeExecutionConfig(value: unknown): Prisma.InputJsonObject {
  const object = asJsonObject(value);
  if (object) return object as Prisma.InputJsonObject;
  if (value == null) return {};
  throw new Error("Execution config must be an object");
}

function userPayload(user: PromptProjectUser): Prisma.InputJsonObject {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? "",
    avatarUrl: user.avatarUrl,
    organizations: [],
  };
}

function repoPayload(
  repo: NonNullable<PromptProjectWithRelations["repo"]>,
): Prisma.InputJsonObject {
  return {
    id: repo.id,
    name: repo.name,
    remoteUrl: repo.remoteUrl,
    defaultBranch: repo.defaultBranch,
    webhookActive: Boolean(repo.webhookId),
    projects: [],
    sessions: [],
  };
}

function projectMemberPayload(member: PromptProjectMemberWithUser): Prisma.InputJsonObject {
  return {
    user: userPayload(member.user),
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
    leftAt: member.leftAt ? member.leftAt.toISOString() : null,
  };
}

function promptProjectPayload(project: PromptProjectWithRelations): Prisma.InputJsonObject {
  return {
    id: project.id,
    name: project.name,
    organizationId: project.organizationId,
    repoId: project.repoId,
    repo: project.repo ? repoPayload(project.repo) : null,
    aiMode: project.aiMode,
    soulFile: project.soulFile,
    members: project.members.map(projectMemberPayload),
    channels: [],
    sessions: [],
    tickets: [],
    runs: project.runs.map(projectRunPayload),
    createdAt: dateToJson(project.createdAt),
    updatedAt: dateToJson(project.updatedAt),
  };
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
  async createProjectFromGoal(
    input: CreateProjectFromGoalInput,
    actorType: ActorType,
    actorId: string,
  ) {
    const initialGoal = input.goal.trim();
    if (!initialGoal) {
      throw new Error("Initial goal is required");
    }

    const projectName = (input.name?.trim() || deriveProjectName(initialGoal)).trim();
    if (!projectName) {
      throw new Error("Project name is required");
    }

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertActorOrgAccess(tx, input.organizationId, actorType, actorId);
      if (input.repoId) {
        await tx.repo.findFirstOrThrow({
          where: { id: input.repoId, organizationId: input.organizationId },
          select: { id: true },
        });
      }

      const project = await tx.project.create({
        data: {
          name: projectName,
          organizationId: input.organizationId,
          ...(input.repoId && { repoId: input.repoId }),
          ...(actorType === "user" && {
            members: { create: { userId: actorId, role: "admin" } },
          }),
        },
        include: PROMPT_PROJECT_INCLUDE,
      });

      await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "project",
          scopeId: project.id,
          eventType: "project_created",
          payload: { project: promptProjectPayload(project) },
          actorType,
          actorId,
        },
        tx,
      );

      await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "system",
          scopeId: project.id,
          eventType: "entity_linked",
          payload: { type: "project_created", projectId: project.id, name: projectName },
          actorType,
          actorId,
        },
        tx,
      );

      const projectRun = await tx.projectRun.create({
        data: {
          projectId: project.id,
          organizationId: input.organizationId,
          status: "interviewing",
          initialGoal,
          executionConfig: normalizeExecutionConfig(input.executionConfig),
        },
        include: PROJECT_RUN_INCLUDE,
      });

      await eventService.create(
        {
          organizationId: input.organizationId,
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
          organizationId: input.organizationId,
          scopeType: "project",
          scopeId: project.id,
          eventType: "project_goal_submitted",
          payload: { projectRun: projectRunPayload(projectRun), goal: initialGoal },
          actorType,
          actorId,
        },
        tx,
      );

      return tx.project.findUniqueOrThrow({
        where: { id: project.id },
        include: PROMPT_PROJECT_INCLUDE,
      });
    });
  }

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

function deriveProjectName(goal: string): string {
  const normalized = goal.trim().replace(/\s+/g, " ");
  return normalized.length > 64 ? `${normalized.slice(0, 61)}...` : normalized;
}

export const projectRunService = new ProjectRunService();
