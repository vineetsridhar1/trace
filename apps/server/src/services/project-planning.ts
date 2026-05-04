import type {
  ApproveProjectPlanInput,
  ActorType,
  RecordProjectPlanningDecisionInput,
  RecordProjectPlanningMessageInput,
  RecordProjectPlanningRiskInput,
  UpdateProjectPlanSummaryInput,
} from "@trace/gql";
import type { Prisma, ProjectTicketGenerationAttempt } from "@prisma/client";
import { asJsonObject, type BridgeTraceActionContext } from "@trace/shared";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { assertActorOrgAccess } from "./actor-auth.js";
import { projectRunPayload } from "./project-run.js";
import { TICKET_INCLUDE, ticketPayload, type TicketWithRelations } from "./ticket.js";
import { sessionService } from "./session.js";
import { createProjectTicketGenerationActionToken } from "../lib/session-action-token.js";

type ProjectRunContext = {
  id: string;
  organizationId: string;
  projectId: string;
};

type ProjectRunApprovalContext = {
  id: string;
  organizationId: string;
  projectId: string;
  planningSessionId: string | null;
  initialGoal: string;
  planSummary: string | null;
  executionConfig: Prisma.JsonValue;
  project: { id: string; name: string; repoId: string | null };
};

type TicketDraft = {
  title: string;
  description: string;
  priority: "urgent" | "high" | "medium" | "low";
  labels: string[];
  acceptanceCriteria: string[];
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

function dateToJson(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function generationAttemptPayload(attempt: ProjectTicketGenerationAttempt): Prisma.InputJsonObject {
  return {
    id: attempt.id,
    organizationId: attempt.organizationId,
    projectId: attempt.projectId,
    projectRunId: attempt.projectRunId,
    status: attempt.status,
    approvedPlan: attempt.approvedPlan,
    draftCount: attempt.draftCount,
    createdTicketIds: attempt.createdTicketIds,
    error: attempt.error,
    retryCount: attempt.retryCount,
    startedAt: dateToJson(attempt.startedAt),
    completedAt: dateToJson(attempt.completedAt),
    failedAt: dateToJson(attempt.failedAt),
    createdAt: dateToJson(attempt.createdAt),
    updatedAt: dateToJson(attempt.updatedAt),
  };
}

function priorityFromUnknown(value: unknown): TicketDraft["priority"] {
  return value === "urgent" || value === "high" || value === "low" ? value : "medium";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function singleDraftKey(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
  return slug || "ticket";
}

function descriptionWithAcceptanceCriteria(draft: TicketDraft): string {
  if (draft.acceptanceCriteria.length === 0) return draft.description;
  return [
    draft.description,
    "",
    "Acceptance criteria:",
    ...draft.acceptanceCriteria.map((criterion) => `- ${criterion}`),
  ].join("\n");
}

function normalizeTicketDrafts(value: unknown): { drafts: TicketDraft[]; errors: string[] } {
  const root = asJsonObject(value);
  const rawTickets = Array.isArray(root?.tickets)
    ? root.tickets
    : Array.isArray(value)
      ? value
      : [];
  const drafts: TicketDraft[] = [];
  const errors: string[] = [];

  rawTickets.forEach((raw, index) => {
    const object = asJsonObject(raw);
    const title = typeof object?.title === "string" ? object.title.trim() : "";
    const description = typeof object?.description === "string" ? object.description.trim() : "";
    if (!title || !description) {
      errors.push(`Draft ${index + 1} must include title and description.`);
      return;
    }

    drafts.push({
      title,
      description,
      priority: priorityFromUnknown(object?.priority),
      labels: stringList(object?.labels),
      acceptanceCriteria: stringList(object?.acceptanceCriteria),
    });
  });

  if (drafts.length === 0 && errors.length === 0) {
    errors.push("Ticket generation returned no drafts.");
  }

  return { drafts, errors };
}

function snapshotTicketDrafts(value: Prisma.JsonValue): TicketDraft[] {
  const root = asJsonObject(value);
  const rawTickets = Array.isArray(root?.tickets) ? root.tickets : [];
  const normalized = normalizeTicketDrafts({ tickets: rawTickets });
  return normalized.drafts;
}

function getServerUrl(): string {
  const configured = process.env.TRACE_SERVER_URL ?? process.env.TRACE_API_URL;
  if (configured?.trim()) return configured.trim().replace(/\/+$/, "");
  const port = Number(process.env.PORT) || 4000 + Number(process.env.TRACE_PORT || 0);
  return `http://localhost:${port}`;
}

function buildTicketGenerationPrompt(input: {
  plan: string;
  goal: string;
  projectName: string;
  cliRelativePath: string;
}): string {
  return [
    "The project plan has been approved. Create Trace tickets now by running the injected CLI.",
    "",
    "This is an execution instruction, not a planning request.",
    "- Do not write another plan.",
    "- Do not ask for confirmation.",
    "- Do not edit repository files.",
    "- Do not claim tickets were created unless the CLI returns ok.",
    "- Your next actions must be shell commands that call the injected Trace CLI.",
    "- Create one ticket per meaningful implementation step.",
    "- Each ticket must have a concise title, a detailed description, priority, labels, and acceptanceCriteria.",
    "- After creating the last ticket, run the complete command.",
    "",
    "CLI commands:",
    `node ${input.cliRelativePath} create '{"title":"...","description":"...","priority":"medium","labels":["project-plan"],"acceptanceCriteria":["..."]}'`,
    `node ${input.cliRelativePath} complete`,
    "",
    `Project: ${input.projectName}`,
    `Goal: ${input.goal}`,
    "",
    "Approved plan:",
    input.plan,
  ].join("\n");
}

export class ProjectPlanningService {
  getGenerationAttemptForRun(projectRunId: string) {
    return prisma.projectTicketGenerationAttempt.findUnique({ where: { projectRunId } });
  }

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
        } else if (
          event.eventType === "project_risk_recorded" &&
          typeof payload.risk === "string"
        ) {
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

  async approvePlanAndGenerateTickets(
    input: ApproveProjectPlanInput,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ): Promise<ProjectTicketGenerationAttempt> {
    const approvedPlan = normalizeText(input.planSummary, "Plan summary");
    const started = await this.beginGenerationAttempt(
      input.projectRunId,
      organizationId,
      approvedPlan,
      actorType,
      actorId,
      Boolean(input.retryFailed),
      true,
    );

    if (started.attempt.status === "completed") return started.attempt;
    if (!started.shouldGenerate) return started.attempt;

    try {
      await this.dispatchTicketGenerationPrompt({
        projectRun: started.projectRun,
        attempt: started.attempt,
        approvedPlan,
        actorType,
        actorId,
      });
      return started.attempt;
    } catch (error) {
      return this.failGenerationAttempt({
        attemptId: started.attempt.id,
        projectRun: started.projectRun,
        error: error instanceof Error ? error.message : String(error),
        actorType,
        actorId,
      });
    }
  }

  async createGeneratedTicketFromDraft(input: {
    organizationId: string;
    projectId: string;
    projectRunId: string;
    generationAttemptId: string;
    draft: unknown;
    actorType: ActorType;
    actorId: string;
  }): Promise<TicketWithRelations> {
    const normalized = normalizeTicketDrafts({ tickets: [input.draft] });
    if (normalized.errors.length > 0 || normalized.drafts.length !== 1) {
      throw new Error(normalized.errors[0] ?? "Ticket draft is invalid.");
    }
    const draft = normalized.drafts[0];
    if (!draft) throw new Error("Ticket draft is invalid.");

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertActorOrgAccess(tx, input.organizationId, input.actorType, input.actorId);
      const attempt = await tx.projectTicketGenerationAttempt.findFirstOrThrow({
        where: {
          id: input.generationAttemptId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          projectRunId: input.projectRunId,
        },
      });
      if (attempt.status === "completed") {
        throw new Error("Ticket generation is already completed.");
      }
      if (attempt.status === "failed" || attempt.status === "partial_failed") {
        throw new Error("Ticket generation has failed. Retry the plan approval first.");
      }

      const projectRun = await tx.projectRun.findFirstOrThrow({
        where: {
          id: input.projectRunId,
          organizationId: input.organizationId,
          projectId: input.projectId,
        },
        select: { id: true, organizationId: true, projectId: true },
      });
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectRun.id}))`;

      const key = singleDraftKey(draft.title);
      const existing = await tx.ticket.findUnique({
        where: {
          generationAttemptId_generationDraftKey: {
            generationAttemptId: attempt.id,
            generationDraftKey: key,
          },
        },
        include: TICKET_INCLUDE,
      });
      if (existing) return existing;

      const ticket = await tx.ticket.create({
        data: {
          title: draft.title,
          description: descriptionWithAcceptanceCriteria(draft),
          priority: draft.priority,
          labels: Array.from(new Set(["project-plan", ...draft.labels])),
          organizationId: projectRun.organizationId,
          createdById: input.actorId,
          sourceProjectRunId: projectRun.id,
          generationAttemptId: attempt.id,
          generationDraftKey: key,
          projects: { create: { projectId: projectRun.projectId } },
        },
        include: TICKET_INCLUDE,
      });

      const createdTicketIds = Array.from(new Set([...attempt.createdTicketIds, ticket.id]));
      const previousDrafts = snapshotTicketDrafts(attempt.draftSnapshot);
      const updatedAttempt = await tx.projectTicketGenerationAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "running",
          startedAt: attempt.startedAt ?? new Date(),
          draftCount: Math.max(attempt.draftCount, createdTicketIds.length),
          createdTicketIds,
          draftSnapshot: { tickets: [...previousDrafts, draft] },
        },
      });

      await eventService.create(
        {
          organizationId: projectRun.organizationId,
          scopeType: "ticket",
          scopeId: ticket.id,
          eventType: "ticket_created",
          payload: {
            ticket: ticketPayload(ticket),
            ticketId: ticket.id,
            projectIds: [projectRun.projectId],
            projectRunId: projectRun.id,
            generationAttemptId: attempt.id,
          },
          actorType: input.actorType,
          actorId: input.actorId,
        },
        tx,
      );

      await eventService.create(
        {
          organizationId: projectRun.organizationId,
          scopeType: "project",
          scopeId: projectRun.projectId,
          eventType: "project_ticket_generation_started",
          payload: {
            generationAttempt: generationAttemptPayload(updatedAttempt),
            projectRunId: projectRun.id,
          },
          actorType: input.actorType,
          actorId: input.actorId,
        },
        tx,
      );

      return ticket;
    });
  }

  async completeGeneratedTicketAttempt(input: {
    organizationId: string;
    projectId: string;
    projectRunId: string;
    generationAttemptId: string;
    actorType: ActorType;
    actorId: string;
  }): Promise<ProjectTicketGenerationAttempt> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertActorOrgAccess(tx, input.organizationId, input.actorType, input.actorId);
      const attempt = await tx.projectTicketGenerationAttempt.findFirstOrThrow({
        where: {
          id: input.generationAttemptId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          projectRunId: input.projectRunId,
        },
      });
      if (attempt.status === "completed") return attempt;
      if (attempt.createdTicketIds.length === 0) {
        throw new Error("Ticket generation cannot complete before at least one ticket is created.");
      }

      const projectRun = await tx.projectRun.findFirstOrThrow({
        where: {
          id: input.projectRunId,
          organizationId: input.organizationId,
          projectId: input.projectId,
        },
        include: { project: true },
      });
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectRun.id}))`;

      const tickets = await tx.ticket.findMany({
        where: { id: { in: attempt.createdTicketIds }, organizationId: input.organizationId },
        include: TICKET_INCLUDE,
        orderBy: { createdAt: "asc" },
      });
      const ticketIds = tickets.map((ticket) => ticket.id);
      const updatedAttempt = await tx.projectTicketGenerationAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "completed",
          draftCount: Math.max(attempt.draftCount, ticketIds.length),
          createdTicketIds: ticketIds,
          error: null,
          completedAt: new Date(),
          failedAt: null,
        },
      });
      const updatedRun = await tx.projectRun.update({
        where: { id: projectRun.id },
        data: { status: "ready", planSummary: attempt.approvedPlan },
        include: { project: true },
      });

      await eventService.create(
        {
          organizationId: projectRun.organizationId,
          scopeType: "project",
          scopeId: projectRun.projectId,
          eventType: "project_ticket_generation_completed",
          payload: {
            projectRun: projectRunPayload(updatedRun),
            generationAttempt: generationAttemptPayload(updatedAttempt),
            tickets: tickets.map(ticketPayload),
          },
          actorType: input.actorType,
          actorId: input.actorId,
        },
        tx,
      );

      return updatedAttempt;
    });
  }

  async failGeneratedTicketAttempt(input: {
    organizationId: string;
    projectId: string;
    projectRunId: string;
    generationAttemptId: string;
    error: string;
    actorType: ActorType;
    actorId: string;
  }): Promise<ProjectTicketGenerationAttempt> {
    const projectRun = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const run = await tx.projectRun.findFirstOrThrow({
        where: {
          id: input.projectRunId,
          organizationId: input.organizationId,
          projectId: input.projectId,
        },
        select: {
          id: true,
          organizationId: true,
          projectId: true,
          planningSessionId: true,
          initialGoal: true,
          planSummary: true,
          executionConfig: true,
          project: { select: { id: true, name: true, repoId: true } },
        },
      });
      await assertActorOrgAccess(tx, input.organizationId, input.actorType, input.actorId);
      return run;
    });
    return this.failGenerationAttempt({
      attemptId: input.generationAttemptId,
      projectRun,
      error: normalizeText(input.error, "Error"),
      actorType: input.actorType,
      actorId: input.actorId,
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

  private async beginGenerationAttempt(
    projectRunId: string,
    organizationId: string,
    approvedPlan: string,
    actorType: ActorType,
    actorId: string,
    retryFailed: boolean,
    hasStructuredDrafts: boolean,
  ): Promise<{
    attempt: ProjectTicketGenerationAttempt;
    projectRun: ProjectRunApprovalContext;
    shouldGenerate: boolean;
  }> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const projectRun = await tx.projectRun.findFirstOrThrow({
        where: { id: projectRunId, organizationId },
        select: {
          id: true,
          organizationId: true,
          projectId: true,
          planningSessionId: true,
          initialGoal: true,
          planSummary: true,
          executionConfig: true,
          project: { select: { id: true, name: true, repoId: true } },
        },
      });
      await assertActorOrgAccess(tx, organizationId, actorType, actorId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectRun.id}))`;

      const existing = await tx.projectTicketGenerationAttempt.findUnique({
        where: { projectRunId: projectRun.id },
      });
      if (existing?.status === "completed") {
        return { attempt: existing, projectRun, shouldGenerate: false };
      }
      if (
        existing &&
        (existing.status === "pending" || existing.status === "running") &&
        !hasStructuredDrafts &&
        !retryFailed
      ) {
        return { attempt: existing, projectRun, shouldGenerate: false };
      }
      if (
        existing &&
        (existing.status === "failed" || existing.status === "partial_failed") &&
        !hasStructuredDrafts &&
        !retryFailed
      ) {
        return { attempt: existing, projectRun, shouldGenerate: false };
      }

      await tx.projectRun.update({
        where: { id: projectRun.id },
        data: { planSummary: approvedPlan, status: "planning" },
      });

      const now = new Date();
      const status = hasStructuredDrafts ? "running" : "pending";
      const attempt = existing
        ? await tx.projectTicketGenerationAttempt.update({
            where: { id: existing.id },
            data: {
              status,
              approvedPlan,
              error: null,
              failedAt: null,
              completedAt: null,
              startedAt: hasStructuredDrafts ? now : existing.startedAt,
              retryCount: { increment: 1 },
            },
          })
        : await tx.projectTicketGenerationAttempt.create({
            data: {
              organizationId,
              projectId: projectRun.projectId,
              projectRunId: projectRun.id,
              status,
              approvedPlan,
              startedAt: hasStructuredDrafts ? now : undefined,
              retryCount: 1,
            },
          });

      await eventService.create(
        {
          organizationId,
          scopeType: "project",
          scopeId: projectRun.projectId,
          eventType: "project_ticket_generation_started",
          payload: { generationAttempt: generationAttemptPayload(attempt), projectRunId },
          actorType,
          actorId,
        },
        tx,
      );

      return { attempt, projectRun, shouldGenerate: hasStructuredDrafts };
    });
  }

  private async dispatchTicketGenerationPrompt(input: {
    projectRun: ProjectRunApprovalContext;
    attempt: ProjectTicketGenerationAttempt;
    approvedPlan: string;
    actorType: ActorType;
    actorId: string;
  }): Promise<void> {
    const sessionId = input.projectRun.planningSessionId;
    if (!sessionId) {
      throw new Error("Approved project run does not have a planning session to generate tickets.");
    }

    const cliRelativePath = ".trace/trace-project-ticket.mjs";
    const token = createProjectTicketGenerationActionToken({
      tokenType: "project_ticket_generation_action",
      organizationId: input.projectRun.organizationId,
      projectId: input.projectRun.projectId,
      projectRunId: input.projectRun.id,
      generationAttemptId: input.attempt.id,
      sessionId,
      actorType: input.actorType,
      actorId: input.actorId,
    });
    const traceAction: BridgeTraceActionContext = {
      type: "project_ticket_generation",
      serverUrl: getServerUrl(),
      token,
      projectRunId: input.projectRun.id,
      generationAttemptId: input.attempt.id,
      cliRelativePath,
    };

    await sessionService.sendMessage({
      sessionId,
      text: buildTicketGenerationPrompt({
        plan: input.approvedPlan,
        goal: input.projectRun.initialGoal,
        projectName: input.projectRun.project.name,
        cliRelativePath,
      }),
      actorType: input.actorType,
      actorId: input.actorId,
      interactionMode: "code",
      clientSource: "project_ticket_generation",
      traceAction,
    });
  }

  private async failGenerationAttempt(input: {
    attemptId: string;
    projectRun: ProjectRunApprovalContext;
    error: string;
    actorType: ActorType;
    actorId: string;
  }): Promise<ProjectTicketGenerationAttempt> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const failed = await tx.projectTicketGenerationAttempt.update({
        where: { id: input.attemptId },
        data: {
          status: "failed",
          error: input.error,
          failedAt: new Date(),
        },
      });

      await eventService.create(
        {
          organizationId: input.projectRun.organizationId,
          scopeType: "project",
          scopeId: input.projectRun.projectId,
          eventType: "project_ticket_generation_failed",
          payload: {
            generationAttempt: generationAttemptPayload(failed),
            projectRunId: input.projectRun.id,
            error: input.error,
          },
          actorType: input.actorType,
          actorId: input.actorId,
        },
        tx,
      );

      return failed;
    });
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
