import type {
  ActorType,
  RecordProjectPlanningDecisionInput,
  RecordProjectPlanningMessageInput,
  RecordProjectPlanningRiskInput,
  UpdateProjectPlanSummaryInput,
} from "@trace/gql";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { assertActorOrgAccess } from "./actor-auth.js";
import { projectRunPayload } from "./project-run.js";

type ProjectRunContext = {
  id: string;
  organizationId: string;
  projectId: string;
};

export type ProjectPlanningContext = {
  project: {
    id: string;
    name: string;
    organizationId: string;
    repo: { id: string; name: string; remoteUrl: string; defaultBranch: string } | null;
    members: Array<{ id: string; name: string | null; role: string }>;
  };
  projectRun: {
    id: string;
    organizationId: string;
    projectId: string;
    status: string;
    initialGoal: string;
    planSummary: string | null;
    executionConfig: Record<string, unknown>;
  };
  questions: Array<{ eventId: string; message: string; actorType: string; actorId: string }>;
  answers: Array<{ eventId: string; message: string; actorType: string; actorId: string }>;
  decisions: Array<{ eventId: string; decision: string; actorType: string; actorId: string }>;
  risks: Array<{ eventId: string; risk: string; actorType: string; actorId: string }>;
};

const ACTIVE_PROJECT_RUN_STATUSES = [
  "draft",
  "interviewing",
  "planning",
  "ready",
  "running",
  "needs_human",
  "paused",
] as const;

function normalizeText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

export class ProjectPlanningService {
  async getContext(
    projectRunId: string,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ): Promise<ProjectPlanningContext> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const projectRun = await tx.projectRun.findFirstOrThrow({
        where: { id: projectRunId, organizationId },
        include: {
          project: {
            include: {
              repo: { select: { id: true, name: true, remoteUrl: true, defaultBranch: true } },
              members: {
                where: { leftAt: null },
                include: { user: { select: { id: true, name: true } } },
              },
            },
          },
        },
      });
      await assertActorOrgAccess(tx, organizationId, actorType, actorId);

      const events = await tx.event.findMany({
        where: {
          organizationId,
          scopeType: "project",
          scopeId: projectRun.projectId,
          eventType: {
            in: [
              "project_question_asked",
              "project_answer_recorded",
              "project_decision_recorded",
              "project_risk_recorded",
            ],
          },
        },
        orderBy: { timestamp: "asc" },
        take: 80,
      });

      const questions: ProjectPlanningContext["questions"] = [];
      const answers: ProjectPlanningContext["answers"] = [];
      const decisions: ProjectPlanningContext["decisions"] = [];
      const risks: ProjectPlanningContext["risks"] = [];

      for (const event of events) {
        const payload =
          typeof event.payload === "object" && event.payload !== null
            ? (event.payload as Record<string, unknown>)
            : {};
        if (payload.projectRunId !== projectRun.id) continue;

        if (event.eventType === "project_question_asked" && typeof payload.message === "string") {
          questions.push({
            eventId: event.id,
            message: payload.message,
            actorType: event.actorType,
            actorId: event.actorId,
          });
        } else if (
          event.eventType === "project_answer_recorded" &&
          typeof payload.message === "string"
        ) {
          answers.push({
            eventId: event.id,
            message: payload.message,
            actorType: event.actorType,
            actorId: event.actorId,
          });
        } else if (
          event.eventType === "project_decision_recorded" &&
          typeof payload.decision === "string"
        ) {
          decisions.push({
            eventId: event.id,
            decision: payload.decision,
            actorType: event.actorType,
            actorId: event.actorId,
          });
        } else if (event.eventType === "project_risk_recorded" && typeof payload.risk === "string") {
          risks.push({
            eventId: event.id,
            risk: payload.risk,
            actorType: event.actorType,
            actorId: event.actorId,
          });
        }
      }

      return {
        project: {
          id: projectRun.project.id,
          name: projectRun.project.name,
          organizationId: projectRun.project.organizationId,
          repo: projectRun.project.repo,
          members: projectRun.project.members.map((member) => ({
            id: member.user.id,
            name: member.user.name,
            role: member.role,
          })),
        },
        projectRun: {
          id: projectRun.id,
          organizationId: projectRun.organizationId,
          projectId: projectRun.projectId,
          status: projectRun.status,
          initialGoal: projectRun.initialGoal,
          planSummary: projectRun.planSummary,
          executionConfig: normalizeExecutionConfig(projectRun.executionConfig),
        },
        questions,
        answers,
        decisions,
        risks,
      };
    });
  }

  askQuestion(
    input: RecordProjectPlanningMessageInput,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    return this.recordMessage(
      input,
      organizationId,
      actorType,
      actorId,
      "project_question_asked",
      "Question",
    );
  }

  recordAnswer(
    input: RecordProjectPlanningMessageInput,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    return this.recordMessage(
      input,
      organizationId,
      actorType,
      actorId,
      "project_answer_recorded",
      "Answer",
    );
  }

  async recordDecision(
    input: RecordProjectPlanningDecisionInput,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    const decision = normalizeText(input.decision, "Decision");
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const projectRun = await this.getProjectRunContext(
        tx,
        input.projectRunId,
        organizationId,
        actorType,
        actorId,
      );
      return eventService.create(
        {
          organizationId,
          scopeType: "project",
          scopeId: projectRun.projectId,
          eventType: "project_decision_recorded",
          payload: { projectRunId: projectRun.id, decision },
          actorType,
          actorId,
        },
        tx,
      );
    });
  }

  async recordRisk(
    input: RecordProjectPlanningRiskInput,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    const risk = normalizeText(input.risk, "Risk");
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const projectRun = await this.getProjectRunContext(
        tx,
        input.projectRunId,
        organizationId,
        actorType,
        actorId,
      );
      return eventService.create(
        {
          organizationId,
          scopeType: "project",
          scopeId: projectRun.projectId,
          eventType: "project_risk_recorded",
          payload: { projectRunId: projectRun.id, risk },
          actorType,
          actorId,
        },
        tx,
      );
    });
  }

  async updatePlanSummary(
    input: UpdateProjectPlanSummaryInput,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    const planSummary = normalizeText(input.planSummary, "Plan summary");
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await this.getProjectRunContext(
        tx,
        input.projectRunId,
        organizationId,
        actorType,
        actorId,
      );
      if (
        input.status &&
        (ACTIVE_PROJECT_RUN_STATUSES as readonly string[]).includes(input.status)
      ) {
        await this.assertNoActiveRun(tx, existing.projectId, existing.id);
      }

      const projectRun = await tx.projectRun.update({
        where: { id: existing.id },
        data: {
          planSummary,
          ...(input.status != null ? { status: input.status } : {}),
        },
        include: { project: true },
      });

      await eventService.create(
        {
          organizationId,
          scopeType: "project",
          scopeId: projectRun.projectId,
          eventType: "project_plan_summary_updated",
          payload: { projectRun: projectRunPayload(projectRun) },
          actorType,
          actorId,
        },
        tx,
      );

      return projectRun;
    });
  }

  private async recordMessage(
    input: RecordProjectPlanningMessageInput,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
    eventType: "project_question_asked" | "project_answer_recorded",
    label: string,
  ) {
    const message = normalizeText(input.message, label);
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const projectRun = await this.getProjectRunContext(
        tx,
        input.projectRunId,
        organizationId,
        actorType,
        actorId,
      );
      return eventService.create(
        {
          organizationId,
          scopeType: "project",
          scopeId: projectRun.projectId,
          eventType,
          payload: { projectRunId: projectRun.id, message },
          actorType,
          actorId,
        },
        tx,
      );
    });
  }

  private async getProjectRunContext(
    tx: Prisma.TransactionClient,
    projectRunId: string,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ): Promise<ProjectRunContext> {
    const projectRun = await tx.projectRun.findFirstOrThrow({
      where: { id: projectRunId, organizationId },
      select: { id: true, organizationId: true, projectId: true },
    });
    await assertActorOrgAccess(tx, organizationId, actorType, actorId);
    return projectRun;
  }

  private async assertNoActiveRun(
    tx: Prisma.TransactionClient,
    projectId: string,
    excludingRunId: string,
  ) {
    const existing = await tx.projectRun.findFirst({
      where: {
        projectId,
        status: { in: [...ACTIVE_PROJECT_RUN_STATUSES] },
        id: { not: excludingRunId },
      },
      select: { id: true },
    });
    if (existing) {
      throw new Error("Project already has an active run");
    }
  }
}

export const projectPlanningService = new ProjectPlanningService();

function normalizeExecutionConfig(value: Prisma.JsonValue): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
