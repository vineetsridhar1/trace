import type {
  ApproveProjectPlanInput,
  ActorType,
  RecordProjectPlanningDecisionInput,
  RecordProjectPlanningMessageInput,
  RecordProjectPlanningRiskInput,
  UpdateProjectPlanSummaryInput,
} from "@trace/gql";
import type { Prisma, ProjectTicketGenerationAttempt } from "@prisma/client";
import { asJsonObject } from "@trace/shared";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { assertActorOrgAccess } from "./actor-auth.js";
import { projectRunPayload } from "./project-run.js";
import { TICKET_INCLUDE, ticketPayload, type TicketWithRelations } from "./ticket.js";

type ProjectRunContext = {
  id: string;
  organizationId: string;
  projectId: string;
};

type ProjectRunApprovalContext = {
  id: string;
  organizationId: string;
  projectId: string;
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

function generationAttemptPayload(
  attempt: ProjectTicketGenerationAttempt,
): Prisma.InputJsonObject {
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
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function draftKey(index: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
  return `${String(index + 1).padStart(3, "0")}-${slug || "ticket"}`;
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
  const rawTickets = Array.isArray(root?.tickets) ? root.tickets : Array.isArray(value) ? value : [];
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

const TICKET_SOURCE_HEADING_RE =
  /^(implementation\s+(order|plan|steps?)|ticket\s+(drafts?|plan)|tickets?|work\s+items?|milestones?)$/i;
const TEST_HEADING_RE = /^(test(ing)?|acceptance\s+criteria|validation)$/i;
const HEADING_RE = /^#{1,6}\s+(.+?)\s*#*\s*$/;
const ORDERED_ITEM_RE = /^\s*\d+[\.)]\s+(.+?)\s*$/;
const TASK_ITEM_RE = /^\s*[-*]\s+\[[ xX]\]\s+(.+?)\s*$/;
const BULLET_ITEM_RE = /^\s*[-*]\s+(.+?)\s*$/;

function synthesizeTicketDraftsFromPlan(plan: string): TicketDraft[] {
  const lines = plan.split(/\r?\n/);
  const workItems = extractPlanItems(lines, TICKET_SOURCE_HEADING_RE, true);
  const fallbackItems = workItems.length > 0 ? workItems : extractPlanItems(lines, null, true);
  const acceptanceCriteria = extractPlanItems(lines, TEST_HEADING_RE, false).slice(0, 5);

  return fallbackItems.slice(0, 12).map((item, index) => {
    const title = ticketTitleFromPlanItem(item, index);
    return {
      title,
      description: [
        `Implement approved-plan step ${index + 1}: ${item}`,
        "",
        "Scope comes from the approved project plan. Keep changes limited to this step.",
      ].join("\n"),
      priority: "medium",
      labels: ["project-plan"],
      acceptanceCriteria:
        acceptanceCriteria.length > 0
          ? acceptanceCriteria
          : [
              "The approved-plan step is implemented.",
              "Relevant tests or validation for this step pass.",
            ],
    };
  });
}

function extractPlanItems(
  lines: string[],
  headingPattern: RegExp | null,
  allowGlobalFallback: boolean,
): string[] {
  const items: string[] = [];
  let inTargetSection = headingPattern === null;
  let sawTargetSection = headingPattern === null;

  for (const line of lines) {
    const heading = HEADING_RE.exec(line.trim());
    if (heading) {
      const headingText = heading[1]?.trim() ?? "";
      inTargetSection = headingPattern ? headingPattern.test(headingText) : true;
      sawTargetSection = sawTargetSection || inTargetSection;
      continue;
    }

    if (!inTargetSection) continue;

    const item =
      ORDERED_ITEM_RE.exec(line)?.[1] ??
      TASK_ITEM_RE.exec(line)?.[1] ??
      (!headingPattern || sawTargetSection ? BULLET_ITEM_RE.exec(line)?.[1] : undefined);
    if (item) {
      const cleaned = cleanPlanItem(item);
      if (cleaned) items.push(cleaned);
    }
  }

  if (items.length > 0 || !allowGlobalFallback || headingPattern === null || sawTargetSection) {
    return dedupePlanItems(items);
  }

  return extractPlanItems(lines, null, false);
}

function cleanPlanItem(value: string): string {
  return value
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.;]\s*$/, "")
    .trim();
}

function dedupePlanItems(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function ticketTitleFromPlanItem(item: string, index: number): string {
  const withoutPrefix = item.replace(/^(add|build|create|implement|wire|update)\s+/i, "");
  const base = withoutPrefix || item || `Project plan step ${index + 1}`;
  const title = base.charAt(0).toUpperCase() + base.slice(1);
  return title.length > 120 ? `${title.slice(0, 117).trimEnd()}...` : title;
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

  async approvePlanAndGenerateTickets(
    input: ApproveProjectPlanInput,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ): Promise<ProjectTicketGenerationAttempt> {
    const approvedPlan = normalizeText(input.planSummary, "Plan summary");
    const draftSource = input.structuredDrafts?.length
      ? input.structuredDrafts
      : synthesizeTicketDraftsFromPlan(approvedPlan);
    const hasStructuredDrafts = draftSource.length > 0;
    const started = await this.beginGenerationAttempt(
      input.projectRunId,
      organizationId,
      approvedPlan,
      actorType,
      actorId,
      Boolean(input.retryFailed),
      hasStructuredDrafts,
    );

    if (started.attempt.status === "completed") return started.attempt;
    if (!hasStructuredDrafts) {
      return this.failGenerationAttempt({
        attemptId: started.attempt.id,
        projectRun: started.projectRun,
        error:
          "Approved plan does not contain an Implementation Order, ticket list, or work-item list that Trace can turn into tickets.",
        actorType,
        actorId,
      });
    }
    if (!started.shouldGenerate) return started.attempt;

    try {
      const rawDrafts = { tickets: draftSource };
      const normalized = normalizeTicketDrafts(rawDrafts);
      return this.persistGeneratedTickets({
        attemptId: started.attempt.id,
        projectRun: started.projectRun,
        approvedPlan,
        drafts: normalized.drafts,
        validationErrors: normalized.errors,
        actorType,
        actorId,
      });
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

  private async persistGeneratedTickets(input: {
    attemptId: string;
    projectRun: ProjectRunApprovalContext;
    approvedPlan: string;
    drafts: TicketDraft[];
    validationErrors: string[];
    actorType: ActorType;
    actorId: string;
  }): Promise<ProjectTicketGenerationAttempt> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.projectRun.id}))`;
      const attempt = await tx.projectTicketGenerationAttempt.findUniqueOrThrow({
        where: { id: input.attemptId },
      });
      if (attempt.status === "completed") return attempt;

      const createdTickets: TicketWithRelations[] = [];
      for (const [index, draft] of input.drafts.entries()) {
        const key = draftKey(index, draft.title);
        const existing = await tx.ticket.findUnique({
          where: {
            generationAttemptId_generationDraftKey: {
              generationAttemptId: attempt.id,
              generationDraftKey: key,
            },
          },
          include: TICKET_INCLUDE,
        });
        if (existing) {
          createdTickets.push(existing);
          continue;
        }

        const ticket = await tx.ticket.create({
          data: {
            title: draft.title,
            description: descriptionWithAcceptanceCriteria(draft),
            priority: draft.priority,
            labels: Array.from(new Set(["project-plan", ...draft.labels])),
            organizationId: input.projectRun.organizationId,
            createdById: input.actorId,
            sourceProjectRunId: input.projectRun.id,
            generationAttemptId: attempt.id,
            generationDraftKey: key,
            projects: { create: { projectId: input.projectRun.projectId } },
          },
          include: TICKET_INCLUDE,
        });
        createdTickets.push(ticket);

        await eventService.create(
          {
            organizationId: input.projectRun.organizationId,
            scopeType: "ticket",
            scopeId: ticket.id,
            eventType: "ticket_created",
            payload: {
              ticket: ticketPayload(ticket),
              ticketId: ticket.id,
              projectIds: [input.projectRun.projectId],
              projectRunId: input.projectRun.id,
              generationAttemptId: attempt.id,
            },
            actorType: input.actorType,
            actorId: input.actorId,
          },
          tx,
        );
      }

      const status = input.validationErrors.length > 0 ? "partial_failed" : "completed";
      const completedAt = status === "completed" ? new Date() : null;
      const failedAt = status === "partial_failed" ? new Date() : null;
      const updatedAttempt = await tx.projectTicketGenerationAttempt.update({
        where: { id: attempt.id },
        data: {
          status,
          approvedPlan: input.approvedPlan,
          draftCount: input.drafts.length + input.validationErrors.length,
          createdTicketIds: createdTickets.map((ticket) => ticket.id),
          draftSnapshot: {
            tickets: input.drafts,
            validationErrors: input.validationErrors,
          },
          error: input.validationErrors.length > 0 ? input.validationErrors.join("\n") : null,
          completedAt,
          failedAt,
        },
      });

      const updatedRun = await tx.projectRun.update({
        where: { id: input.projectRun.id },
        data: { planSummary: input.approvedPlan, status: "ready" },
        include: { project: true },
      });

      await eventService.create(
        {
          organizationId: input.projectRun.organizationId,
          scopeType: "project",
          scopeId: input.projectRun.projectId,
          eventType:
            status === "completed"
              ? "project_ticket_generation_completed"
              : "project_ticket_generation_failed",
          payload: {
            projectRun: projectRunPayload(updatedRun),
            generationAttempt: generationAttemptPayload(updatedAttempt),
            tickets: createdTickets.map(ticketPayload),
          },
          actorType: input.actorType,
          actorId: input.actorId,
        },
        tx,
      );

      return updatedAttempt;
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
