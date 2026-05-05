import type { ActorType, StartProjectTicketExecutionInput } from "@trace/gql";
import type {
  AgentStatus,
  Prisma,
  ProjectTicketExecution,
  ProjectTicketExecutionStatus,
  SessionStatus,
} from "@prisma/client";
import { asJsonObject } from "@trace/shared";
import { prisma } from "../lib/db.js";
import { assertActorOrgAccess } from "./actor-auth.js";
import { eventService } from "./event.js";

const ACTIVE_EXECUTION_STATUSES: ProjectTicketExecutionStatus[] = [
  "queued",
  "ready",
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
  executionConfig: Prisma.JsonValue;
  planningSession: {
    tool: string;
    model: string | null;
    reasoningEffort: string | null;
    hosting: string;
  } | null;
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

  async handleImplementationSessionTerminated(input: {
    sessionId: string;
    organizationId: string;
    agentStatus: AgentStatus;
    sessionStatus: SessionStatus;
    reason?: string | null;
    actorType: ActorType;
    actorId: string;
  }): Promise<ProjectTicketExecution | null> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.projectTicketExecution.findFirst({
        where: {
          organizationId: input.organizationId,
          implementationSessionId: input.sessionId,
          status: { in: ACTIVE_EXECUTION_STATUSES },
        },
      });
      if (!current) return null;

      const nextStatus = mapTerminatedSessionToExecutionStatus(
        input.agentStatus,
        input.sessionStatus,
        input.reason,
      );
      if (current.status === nextStatus) return current;

      const now = new Date();
      const updated = await tx.projectTicketExecution.update({
        where: { id: current.id },
        data: {
          previousStatus: current.status,
          status: nextStatus,
          ...(nextStatus === "completed" ? { completedAt: now } : {}),
          ...(nextStatus === "failed" ? { failedAt: now, lastError: input.reason ?? null } : {}),
          ...(nextStatus === "cancelled" ? { cancelledAt: now } : {}),
        },
      });

      const lifecycleEvent = await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "project",
          scopeId: current.projectId,
          eventType: "project_ticket_lifecycle_event",
          payload: {
            projectRunId: current.projectRunId,
            ticketId: current.ticketId,
            executionId: current.id,
            previousStatus: current.status,
            nextStatus: updated.status,
            linkedSessionIds: [input.sessionId],
            reason: input.reason ?? null,
            projectTicketExecution: projectTicketExecutionPayload(updated),
          },
          actorType: input.actorType,
          actorId: input.actorId,
        },
        tx,
      );

      const withLifecycle = await tx.projectTicketExecution.update({
        where: { id: updated.id },
        data: { lastLifecycleEventId: lifecycleEvent.id },
      });

      await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "project",
          scopeId: current.projectId,
          eventType: "project_ticket_execution_updated",
          payload: {
            projectTicketExecution: projectTicketExecutionPayload(withLifecycle),
            projectRunId: current.projectRunId,
            ticketId: current.ticketId,
          },
          actorType: input.actorType,
          actorId: input.actorId,
        },
        tx,
      );

      return withLifecycle;
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
          executionConfig: true,
          planningSession: {
            select: {
              tool: true,
              model: true,
              reasoningEffort: true,
              hosting: true,
            },
          },
          project: { select: { id: true, name: true, repoId: true } },
        },
      });
      await assertActorOrgAccess(tx, organizationId, actorType, actorId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${projectRun.id}))`;

      const ticket = await this.resolveTicket(
        tx,
        projectRun.projectId,
        projectRun.id,
        input.ticketId,
      );
      const existing = await tx.projectTicketExecution.findUnique({
        where: { projectRunId_ticketId: { projectRunId: projectRun.id, ticketId: ticket.id } },
      });
      if (existing?.implementationSessionId) {
        return { projectRun, ticket, execution: existing, shouldStart: false };
      }
      if (existing && ACTIVE_EXECUTION_STATUSES.includes(existing.status)) {
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
      const execution = existing
        ? existing
        : await tx.projectTicketExecution.create({
            data: {
              organizationId,
              projectId: projectRun.projectId,
              projectRunId: projectRun.id,
              ticketId: ticket.id,
              status: "ready",
              sequence,
            },
          });

      if (!existing) {
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
      }

      return { projectRun, ticket, execution, shouldStart: true };
    });

    if (!prepared.shouldStart) return prepared.execution;

    const session = await this.startImplementationSession({
      input,
      organizationId,
      actorId,
      actorType,
      prepared,
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
    projectRunId: string,
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
        ticket: {
          status: { notIn: ["done", "cancelled"] },
          projectExecutions: { none: { projectRunId } },
        },
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

  private async startImplementationSession(input: {
    input: StartProjectTicketExecutionInput;
    organizationId: string;
    actorId: string;
    actorType: ActorType;
    prepared: {
      projectRun: ProjectRunForExecution;
      ticket: TicketForExecution;
      execution: ProjectTicketExecution;
    };
  }): Promise<{ id: string }> {
    const config = resolveExecutionSessionConfig(input.input, input.prepared.projectRun);
    try {
      return await this.sessions.start({
        organizationId: input.organizationId,
        createdById: input.actorId,
        actorType: input.actorType,
        actorId: input.actorId,
        tool: config.tool,
        model: config.model,
        reasoningEffort: config.reasoningEffort,
        hosting: config.hosting,
        repoId: input.prepared.projectRun.project.repoId ?? undefined,
        projectId: input.prepared.projectRun.projectId,
        ticketId: input.prepared.ticket.id,
        prompt: buildImplementationPrompt(input.prepared.projectRun, input.prepared.ticket),
        interactionMode: "code",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.markStartFailed(
        input.prepared,
        input.organizationId,
        input.actorType,
        input.actorId,
        message,
      );
      throw error;
    }
  }

  private async markStartFailed(
    prepared: {
      projectRun: ProjectRunForExecution;
      ticket: TicketForExecution;
      execution: ProjectTicketExecution;
    },
    organizationId: string,
    actorType: ActorType,
    actorId: string,
    message: string,
  ): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.projectTicketExecution.findUnique({
        where: { id: prepared.execution.id },
      });
      if (!current || current.implementationSessionId || current.status === "failed") return;

      const updated = await tx.projectTicketExecution.update({
        where: { id: current.id },
        data: {
          previousStatus: current.status,
          status: "failed",
          failedAt: new Date(),
          lastError: message,
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
            linkedSessionIds: [],
            reason: message,
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
    });
  }
}

type SessionTool = "claude_code" | "codex" | "custom";
type SessionHosting = "cloud" | "local";

type ExecutionSessionConfig = {
  tool: SessionTool;
  model: string | null;
  reasoningEffort: string | null;
  hosting: SessionHosting | null;
};

function resolveExecutionSessionConfig(
  input: StartProjectTicketExecutionInput,
  projectRun: ProjectRunForExecution,
): ExecutionSessionConfig {
  const config = asJsonObject(projectRun.executionConfig) ?? {};
  const planningSession = projectRun.planningSession;
  const tool =
    readSessionTool(input.tool) ??
    readConfigTool(config, "executionTool") ??
    readConfigTool(config, "tool") ??
    readSessionTool(planningSession?.tool) ??
    "claude_code";

  return {
    tool,
    model:
      readNonEmptyString(input.model) ??
      readConfigString(config, "executionModel") ??
      readConfigString(config, "model") ??
      readNonEmptyString(planningSession?.model) ??
      null,
    reasoningEffort:
      readNonEmptyString(input.reasoningEffort) ??
      readConfigString(config, "executionReasoningEffort") ??
      readConfigString(config, "reasoningEffort") ??
      readNonEmptyString(planningSession?.reasoningEffort) ??
      null,
    hosting:
      readSessionHosting(input.hosting) ??
      readConfigHosting(config, "executionHosting") ??
      readConfigHosting(config, "hosting") ??
      readSessionHosting(planningSession?.hosting) ??
      null,
  };
}

function readConfigTool(config: Record<string, unknown>, key: string): SessionTool | null {
  return readSessionTool(config[key]);
}

function readSessionTool(value: unknown): SessionTool | null {
  return value === "claude_code" || value === "codex" || value === "custom" ? value : null;
}

function readConfigHosting(config: Record<string, unknown>, key: string): SessionHosting | null {
  return readSessionHosting(config[key]);
}

function readSessionHosting(value: unknown): SessionHosting | null {
  return value === "cloud" || value === "local" ? value : null;
}

function readConfigString(config: Record<string, unknown>, key: string): string | null {
  return readNonEmptyString(config[key]);
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
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

function mapTerminatedSessionToExecutionStatus(
  agentStatus: AgentStatus,
  sessionStatus: SessionStatus,
  reason?: string | null,
): ProjectTicketExecutionStatus {
  if (sessionStatus === "needs_input") return "needs_human";
  if (agentStatus === "failed" || reason === "workspace_failed") return "failed";
  if (agentStatus === "stopped" || reason === "manual_stop") return "cancelled";
  return "completed";
}

export const projectTicketExecutionService = new ProjectTicketExecutionService();
