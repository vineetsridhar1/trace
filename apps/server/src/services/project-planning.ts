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

function normalizeText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

export class ProjectPlanningService {
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
}

export const projectPlanningService = new ProjectPlanningService();
