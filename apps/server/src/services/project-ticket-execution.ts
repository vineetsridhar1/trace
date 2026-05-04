import type { ActorType, StartProjectTicketExecutionInput } from "@trace/gql";
import type { Prisma, ProjectTicketExecution, ProjectTicketExecutionStatus } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { assertActorOrgAccess } from "./actor-auth.js";
import { eventService } from "./event.js";

const ACTIVE_EXECUTION_STATUSES: ProjectTicketExecutionStatus[] = [
  "running",
  "reviewing",
  "fixing",
  "needs_human",
  "blocked",
];

function dateToJson(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function projectTicketExecutionPayload(
  execution: ProjectTicketExecution,
): Prisma.InputJsonObject {
  return {
    id: execution.id,
    organizationId: execution.organizationId,
    projectId: execution.projectId,
    projectRunId: execution.projectRunId,
    ticketId: execution.ticketId,
    status: execution.status,
    sequence: execution.sequence,
    implementationSessionId: execution.implementationSessionId,
    reviewSessionId: execution.reviewSessionId,
    fixSessionId: execution.fixSessionId,
    previousStatus: execution.previousStatus,
    lastLifecycleEventId: execution.lastLifecycleEventId,
    lastError: execution.lastError,
    startedAt: dateToJson(execution.startedAt),
    completedAt: dateToJson(execution.completedAt),
    failedAt: dateToJson(execution.failedAt),
    cancelledAt: dateToJson(execution.cancelledAt),
    createdAt: dateToJson(execution.createdAt),
    updatedAt: dateToJson(execution.updatedAt),
  };
}

type ProjectRunForExecution = {
  id: string;
  organizationId: string;
  projectId: string;
  initialGoal: string;
  planSummary: string | null;
  project: { id: string; name: string; repoId: string | null };
};

type TicketForExecution = {
  id: string;
  title: string;
  description: string;
};

export class ProjectTicketExecutionService {
  constructor(
    private readonly sessions: {
      start(input: {
        organizationId: string;
        createdById: string;
        actorType?: ActorType;
        actorId?: string;
        tool: "claude_code" | "codex" | "custom";
        model?: string | null;
        reasoningEffort?: string | null;
        hosting?: "cloud" | "local" | null;
        repoId?: string;
        projectId?: string;
        ticketId?: string;
        prompt?: string;
        interactionMode?: string;
      }): Promise<{ id: string }>;
    } = {
      start: async (input) => {
        const { sessionService } = await import("./session.js");
        return sessionService.start(input);
      },
    },
  ) {}

  listForRun(projectRunId: string) {
    return prisma.projectTicketExecution.findMany({
      where: { projectRunId },
      orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
    });
  }

  async startNextOrTicket(
    input: StartProjectTicketExecutionInput,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ): Promise<ProjectTicketExecution> {
    const prepared = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const projectRun = await tx.projectRun.findFirstOrThrow({
        where: { id: input.projectRunId, organizationId },
        select: {
          id: true,
          organizationId: true,
          projectId: true,
          initialGoal: true,
          planSummary: true,
          project: { select: { id: true, name: true, repoId: true } },
        },
      });
      await assertActorOrgAccess(tx, organizationId, actorType, actorId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectRun.id}))`;

      const ticket = await this.resolveTicket(tx, projectRun.projectId, input.ticketId);
      const existing = await tx.projectTicketExecution.findUnique({
        where: { projectRunId_ticketId: { projectRunId: projectRun.id, ticketId: ticket.id } },
      });
      if (existing?.implementationSessionId) {
        return { projectRun, ticket, execution: existing, shouldStart: false };
      }

      const active = await tx.projectTicketExecution.findFirst({
        where: {
          projectRunId: projectRun.id,
          status: { in: ACTIVE_EXECUTION_STATUSES },
          ...(existing ? { id: { not: existing.id } } : {}),
        },
      });
      if (active) {
        throw new Error("Project run already has an active ticket execution");
      }

      const sequence = await this.nextSequence(tx, projectRun.id);
      const execution =
        existing ??
        (await tx.projectTicketExecution.create({
          data: {
            organizationId,
            projectId: projectRun.projectId,
            projectRunId: projectRun.id,
            ticketId: ticket.id,
            status: "ready",
            sequence,
          },
        }));

      await eventService.create(
        {
          organizationId,
          scopeType: "project",
          scopeId: projectRun.projectId,
          eventType: "project_ticket_execution_created",
          payload: {
            projectTicketExecution: projectTicketExecutionPayload(execution),
            projectRunId: projectRun.id,
            ticketId: ticket.id,
          },
          actorType,
          actorId,
        },
        tx,
      );

      return { projectRun, ticket, execution, shouldStart: true };
    });

    if (!prepared.shouldStart) return prepared.execution;

    const session = await this.sessions.start({
      organizationId,
      createdById: actorId,
      actorType,
      actorId,
      tool: input.tool ?? "claude_code",
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      hosting: input.hosting,
      repoId: prepared.projectRun.project.repoId ?? undefined,
      projectId: prepared.projectRun.projectId,
      ticketId: prepared.ticket.id,
      prompt: buildImplementationPrompt(prepared.projectRun, prepared.ticket),
      interactionMode: "code",
    });

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.projectTicketExecution.findUniqueOrThrow({
        where: { id: prepared.execution.id },
      });
      if (current.implementationSessionId) return current;

      const updated = await tx.projectTicketExecution.update({
        where: { id: current.id },
        data: {
          previousStatus: current.status,
          status: "running",
          implementationSessionId: session.id,
          startedAt: new Date(),
        },
      });

      const lifecycleEvent = await eventService.create(
        {
          organizationId,
          scopeType: "project",
          scopeId: prepared.projectRun.projectId,
          eventType: "project_ticket_lifecycle_event",
          payload: {
            projectRunId: prepared.projectRun.id,
            ticketId: prepared.ticket.id,
            executionId: updated.id,
            previousStatus: current.status,
            nextStatus: updated.status,
            linkedSessionIds: [session.id],
            projectTicketExecution: projectTicketExecutionPayload(updated),
          },
          actorType,
          actorId,
        },
        tx,
      );

      const withLifecycle = await tx.projectTicketExecution.update({
        where: { id: updated.id },
        data: { lastLifecycleEventId: lifecycleEvent.id },
      });

      await eventService.create(
        {
          organizationId,
          scopeType: "project",
          scopeId: prepared.projectRun.projectId,
          eventType: "project_ticket_execution_updated",
          payload: {
            projectTicketExecution: projectTicketExecutionPayload(withLifecycle),
            projectRunId: prepared.projectRun.id,
            ticketId: prepared.ticket.id,
          },
          actorType,
          actorId,
        },
        tx,
      );

      return withLifecycle;
    });
  }

  private async resolveTicket(
    tx: Prisma.TransactionClient,
    projectId: string,
    ticketId?: string | null,
  ): Promise<TicketForExecution> {
    if (ticketId) {
      const link = await tx.ticketProject.findMany({
        where: { projectId, ticketId },
        include: { ticket: true },
        take: 1,
      });
      const ticket = link[0]?.ticket;
      if (!ticket) throw new Error("Ticket is not linked to this project");
      return ticket;
    }

    const links = await tx.ticketProject.findMany({
      where: {
        projectId,
        ticket: { status: { notIn: ["done", "cancelled"] } },
      },
      include: { ticket: true },
      orderBy: { ticket: { createdAt: "asc" } },
      take: 1,
    });
    const ticket = links[0]?.ticket;
    if (!ticket) throw new Error("No runnable project tickets found");
    return ticket;
  }

  private async nextSequence(tx: Prisma.TransactionClient, projectRunId: string): Promise<number> {
    const executions = await tx.projectTicketExecution.findMany({
      where: { projectRunId },
      select: { sequence: true },
      orderBy: { sequence: "desc" },
      take: 1,
    });
    return (executions[0]?.sequence ?? 0) + 1;
  }
}

function buildImplementationPrompt(
  projectRun: ProjectRunForExecution,
  ticket: TicketForExecution,
): string {
  return [
    `Implement ticket: ${ticket.title}`,
    "",
    `Project: ${projectRun.project.name}`,
    `Project run id: ${projectRun.id}`,
    `Ticket id: ${ticket.id}`,
    "",
    "Approved plan:",
    projectRun.planSummary ?? projectRun.initialGoal,
    "",
    "Ticket description:",
    ticket.description,
  ].join("\n");
}

export const projectTicketExecutionService = new ProjectTicketExecutionService();
