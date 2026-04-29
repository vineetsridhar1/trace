import type { ActorType, StartUltraplanInput, UltraplanHumanGateResolution } from "@trace/gql";
import { Prisma, type InboxItemStatus, type InboxItemType } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { assertActorOrgAccess } from "./actor-auth.js";
import {
  ultraplanControllerRunService,
  validateControllerConfig,
  type ControllerConfig,
} from "./ultraplan-controller-run.js";
import { sessionService } from "./session.js";
import { inboxService } from "./inbox.js";
import type {
  BridgeGitDiffSummary,
  BridgeGitIntegrationCommand,
  BridgeGitIntegrationResultPayload,
} from "@trace/shared";

type TxClient = Prisma.TransactionClient;

type StartUltraplanServiceInput = StartUltraplanInput & {
  organizationId: string;
  actorType: ActorType;
  actorId: string;
};

export type RequestHumanGateInput = {
  ultraplanId: string;
  organizationId: string;
  actorType: ActorType;
  actorId: string;
  itemType: InboxItemType;
  title: string;
  summary?: string | null;
  gateReason?: string | null;
  payload?: Record<string, unknown> | null;
  controllerRunId?: string | null;
  controllerRunSessionId?: string | null;
  ticketId?: string | null;
  ticketExecutionId?: string | null;
  workerSessionId?: string | null;
  branchName?: string | null;
  checkpointSha?: string | null;
  recommendedAction?: string | null;
  qaChecklist?: readonly string[] | null;
  controllerRunUrl?: string | null;
  workerSessionUrl?: string | null;
  diffUrl?: string | null;
  prUrl?: string | null;
};

export type ResolveHumanGateInput = {
  inboxItemId: string;
  organizationId: string;
  actorType: ActorType;
  actorId: string;
  resolution: UltraplanHumanGateResolution;
  response?: Record<string, unknown> | null;
};

const ULTRAPLAN_INCLUDE = {
  sessionGroup: { include: { repo: true } },
  ownerUser: true,
  activeInboxItem: true,
  lastControllerRun: true,
  tickets: true,
  ticketExecutions: true,
  controllerRuns: true,
} satisfies Prisma.UltraplanInclude;

const ACTIVE_STATUSES: readonly string[] = [
  "draft",
  "waiting",
  "planning",
  "running",
  "needs_human",
  "integrating",
  "paused",
] as const;

const ACTIVE_CONTROLLER_RUN_STATUSES = ["queued", "running"] as const;

function buildControllerRunPrompt(input: {
  goal: string;
  ultraplanId: string;
  runId: string;
  sessionGroupId: string;
}): string {
  return [
    "You are the Ultraplan controller for this Trace session group.",
    "",
    "Goal:",
    input.goal,
    "",
    "Trace context:",
    `- Ultraplan id: ${input.ultraplanId}`,
    `- Controller run id: ${input.runId}`,
    `- Session group id: ${input.sessionGroupId}`,
    "",
    "For this controller run, inspect the current repository and session context, then produce a concise ordered plan for completing the goal. Do not mutate files, commit, push, or create tickets directly from this controller chat unless a Trace-provided controller action explicitly asks you to.",
  ].join("\n");
}

function serializeUltraplan(ultraplan: Record<string, unknown>) {
  return {
    id: ultraplan.id,
    organizationId: ultraplan.organizationId,
    sessionGroupId: ultraplan.sessionGroupId,
    ownerUserId: ultraplan.ownerUserId,
    status: ultraplan.status,
    integrationBranch: ultraplan.integrationBranch,
    integrationWorkdir: ultraplan.integrationWorkdir ?? null,
    playbookId: ultraplan.playbookId ?? null,
    playbookConfig: ultraplan.playbookConfig ?? null,
    planSummary: ultraplan.planSummary ?? null,
    customInstructions: ultraplan.customInstructions ?? null,
    activeInboxItemId: ultraplan.activeInboxItemId ?? null,
    lastControllerRunId: ultraplan.lastControllerRunId ?? null,
    lastControllerSummary: ultraplan.lastControllerSummary ?? null,
    createdAt: ultraplan.createdAt,
    updatedAt: ultraplan.updatedAt,
  };
}

function eventPayload(ultraplan: Record<string, unknown>): Prisma.InputJsonValue {
  return {
    ultraplan: serializeUltraplan(ultraplan),
    ultraplanId: ultraplan.id,
    sessionGroupId: ultraplan.sessionGroupId,
  } as Prisma.InputJsonValue;
}

function serializeTicketExecution(execution: Record<string, unknown>) {
  return {
    id: execution.id,
    organizationId: execution.organizationId,
    ultraplanId: execution.ultraplanId,
    ticketId: execution.ticketId,
    sessionGroupId: execution.sessionGroupId,
    workerSessionId: execution.workerSessionId ?? null,
    branch: execution.branch,
    workdir: execution.workdir ?? null,
    status: execution.status,
    integrationStatus: execution.integrationStatus,
    baseCheckpointSha: execution.baseCheckpointSha ?? null,
    headCheckpointSha: execution.headCheckpointSha ?? null,
    integrationCheckpointSha: execution.integrationCheckpointSha ?? null,
    activeInboxItemId: execution.activeInboxItemId ?? null,
    lastReviewSummary: execution.lastReviewSummary ?? null,
    attempt: execution.attempt,
    createdAt: execution.createdAt,
    updatedAt: execution.updatedAt,
  };
}

function optionalTrimmed(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function runtimePolicyFromSessionConnection(
  hosting: string,
  connection: Prisma.JsonValue | null,
): Record<string, unknown> {
  const policy: Record<string, unknown> = {};
  if (hosting === "cloud" || hosting === "local") {
    policy.hosting = hosting;
  }
  if (connection && typeof connection === "object" && !Array.isArray(connection)) {
    const runtimeInstanceId = (connection as Record<string, unknown>).runtimeInstanceId;
    if (typeof runtimeInstanceId === "string" && runtimeInstanceId.trim()) {
      policy.runtimeInstanceId = runtimeInstanceId;
    }
  }
  return policy;
}

export class UltraplanService {
  async get(id: string, organizationId: string) {
    return prisma.ultraplan.findFirst({
      where: { id, organizationId },
      include: ULTRAPLAN_INCLUDE,
    });
  }

  async getForSessionGroup(sessionGroupId: string, organizationId: string) {
    return prisma.ultraplan.findFirst({
      where: { sessionGroupId, organizationId },
      include: ULTRAPLAN_INCLUDE,
    });
  }

  async getBranchDiff(input: {
    ultraplanId: string;
    organizationId: string;
    userId: string;
    baseRef?: string | null;
    headRef?: string | null;
    includePatch?: boolean;
    maxPatchBytes?: number;
    maxFiles?: number;
  }): Promise<BridgeGitDiffSummary> {
    const ultraplan = await prisma.ultraplan.findFirst({
      where: { id: input.ultraplanId, organizationId: input.organizationId },
      select: { sessionGroupId: true },
    });
    if (!ultraplan) throw new Error("Ultraplan not found");
    return sessionService.branchDiffSummary(
      ultraplan.sessionGroupId,
      input.organizationId,
      input.userId,
      {
        baseRef: input.baseRef,
        headRef: input.headRef,
        includePatch: input.includePatch,
        maxPatchBytes: input.maxPatchBytes,
        maxFiles: input.maxFiles,
      },
    );
  }

  async getCommitDiff(input: {
    ultraplanId: string;
    organizationId: string;
    userId: string;
    commitRef?: string | null;
    includePatch?: boolean;
    maxPatchBytes?: number;
    maxFiles?: number;
  }): Promise<BridgeGitDiffSummary> {
    const ultraplan = await prisma.ultraplan.findFirst({
      where: { id: input.ultraplanId, organizationId: input.organizationId },
      select: { sessionGroupId: true },
    });
    if (!ultraplan) throw new Error("Ultraplan not found");
    return sessionService.commitDiff(ultraplan.sessionGroupId, input.organizationId, input.userId, {
      commitRef: input.commitRef,
      includePatch: input.includePatch,
      maxPatchBytes: input.maxPatchBytes,
      maxFiles: input.maxFiles,
    });
  }

  async runServiceOwnedGitIntegration(input: {
    ultraplanId: string;
    organizationId: string;
    userId: string;
    actorType?: ActorType;
    actorId?: string;
    operation: BridgeGitIntegrationCommand["operation"];
    sourceRef?: string | null;
    targetRef?: string | null;
    commitRef?: string | null;
    branchRef?: string | null;
    ontoRef?: string | null;
  }): Promise<BridgeGitIntegrationResultPayload> {
    const ultraplan = await prisma.ultraplan.findFirst({
      where: { id: input.ultraplanId, organizationId: input.organizationId },
      include: ULTRAPLAN_INCLUDE,
    });
    if (!ultraplan) throw new Error("Ultraplan not found");
    const result = await sessionService.runServiceOwnedGitIntegration(
      ultraplan.sessionGroupId,
      input.organizationId,
      input.userId,
      {
        operation: input.operation,
        sourceRef: input.sourceRef,
        targetRef: input.targetRef,
        commitRef: input.commitRef,
        branchRef: input.branchRef,
        ontoRef: input.ontoRef,
      },
    );
    const basePayload = eventPayload(
      ultraplan as unknown as Record<string, unknown>,
    ) as unknown as Record<string, unknown>;
    await eventService.create({
      organizationId: input.organizationId,
      scopeType: "ultraplan",
      scopeId: ultraplan.id,
      eventType: "ultraplan_updated",
      payload: {
        ...basePayload,
        type: "git_integration",
        operation: input.operation,
        sourceRef: input.sourceRef ?? null,
        targetRef: input.targetRef ?? null,
        commitRef: input.commitRef ?? null,
        branchRef: input.branchRef ?? null,
        ontoRef: input.ontoRef ?? null,
        result,
      } as unknown as Prisma.InputJsonValue,
      actorType: input.actorType ?? "user",
      actorId: input.actorId ?? input.userId,
    });
    return result;
  }

  async requestHumanGate(input: RequestHumanGateInput) {
    return prisma.$transaction(async (tx: TxClient) => {
      const ultraplan = await tx.ultraplan.findFirstOrThrow({
        where: { id: input.ultraplanId, organizationId: input.organizationId },
        include: ULTRAPLAN_INCLUDE,
      });
      await assertActorOrgAccess(tx, input.organizationId, input.actorType, input.actorId);

      const ticketExecution = input.ticketExecutionId
        ? await tx.ticketExecution.findFirstOrThrow({
            where: {
              id: input.ticketExecutionId,
              organizationId: input.organizationId,
              ultraplanId: ultraplan.id,
            },
          })
        : null;

      const sourceType = ticketExecution ? "ticket_execution" : "ultraplan";
      const sourceId = ticketExecution?.id ?? ultraplan.id;
      const gateReason = optionalTrimmed(input.gateReason) ?? input.itemType;
      const existingGate = await tx.inboxItem.findMany({
        where: {
          organizationId: input.organizationId,
          sourceType,
          sourceId,
          itemType: input.itemType,
          status: "active",
          AND: [{ payload: { path: ["gateReason"], equals: gateReason } }],
        },
        take: 1,
      });
      if (existingGate[0]) {
        return existingGate[0];
      }
      if (ultraplan.activeInboxItemId) {
        throw new Error("Ultraplan already has an active human gate");
      }
      if (ticketExecution?.activeInboxItemId) {
        throw new Error("Ticket execution already has an active human gate");
      }

      const gatePayload = {
        ...(input.payload ?? {}),
        ultraplanId: ultraplan.id,
        sessionGroupId: ultraplan.sessionGroupId,
        gateReason,
        controllerRunId: input.controllerRunId ?? null,
        controllerRunSessionId: input.controllerRunSessionId ?? null,
        ticketId: input.ticketId ?? ticketExecution?.ticketId ?? null,
        ticketExecutionId: ticketExecution?.id ?? null,
        workerSessionId: input.workerSessionId ?? ticketExecution?.workerSessionId ?? null,
        branchName: input.branchName ?? ticketExecution?.branch ?? null,
        checkpointSha:
          input.checkpointSha ??
          ticketExecution?.headCheckpointSha ??
          ticketExecution?.baseCheckpointSha ??
          null,
        summary: input.summary ?? null,
        recommendedAction: input.recommendedAction ?? null,
        qaChecklist: input.qaChecklist ?? [],
        links: {
          controllerRunUrl: input.controllerRunUrl ?? null,
          workerSessionUrl: input.workerSessionUrl ?? null,
          diffUrl: input.diffUrl ?? null,
          prUrl: input.prUrl ?? null,
        },
      };

      const inboxItem = await inboxService.createItem(
        {
          orgId: input.organizationId,
          userId: ultraplan.ownerUserId,
          itemType: input.itemType,
          title: input.title,
          summary: input.summary ?? undefined,
          payload: gatePayload as unknown as Prisma.InputJsonValue,
          sourceType,
          sourceId,
          actorType: input.actorType,
          actorId: input.actorId,
        },
        tx,
      );

      const updatedUltraplan = await tx.ultraplan.update({
        where: { id: ultraplan.id },
        data: {
          status: "needs_human",
          activeInboxItemId: inboxItem.id,
        },
        include: ULTRAPLAN_INCLUDE,
      });

      const updatedExecution = ticketExecution
        ? await tx.ticketExecution.update({
            where: { id: ticketExecution.id },
            data: {
              status: "needs_human",
              activeInboxItemId: inboxItem.id,
            },
          })
        : null;

      await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "system",
          scopeId: input.organizationId,
          eventType: "inbox_item_created",
          payload: { inboxItem } as unknown as Prisma.InputJsonValue,
          actorType: input.actorType,
          actorId: input.actorId,
        },
        tx,
      );

      await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "ultraplan",
          scopeId: ultraplan.id,
          eventType: "ultraplan_human_gate_requested",
          payload: {
            ultraplan: serializeUltraplan(updatedUltraplan as unknown as Record<string, unknown>),
            ultraplanId: updatedUltraplan.id,
            sessionGroupId: updatedUltraplan.sessionGroupId,
            inboxItem,
            ticketExecution: updatedExecution
              ? serializeTicketExecution(updatedExecution as unknown as Record<string, unknown>)
              : null,
          } as unknown as Prisma.InputJsonValue,
          actorType: input.actorType,
          actorId: input.actorId,
        },
        tx,
      );

      return inboxItem;
    });
  }

  async resolveHumanGate(input: ResolveHumanGateInput) {
    const targetStatus: InboxItemStatus =
      input.resolution === "dismissed" || input.resolution === "cancelled"
        ? "dismissed"
        : "resolved";

    const result = await prisma.$transaction(async (tx: TxClient) => {
      const item = await tx.inboxItem.findFirstOrThrow({
        where: {
          id: input.inboxItemId,
          organizationId: input.organizationId,
          userId: input.actorId,
          status: "active",
          sourceType: { in: ["ultraplan", "ticket_execution"] },
        },
      });
      await assertActorOrgAccess(tx, input.organizationId, input.actorType, input.actorId);

      const payload = (item.payload ?? {}) as Record<string, unknown>;
      const ultraplanId =
        typeof payload.ultraplanId === "string" ? payload.ultraplanId : item.sourceId;
      const ticketExecutionId =
        typeof payload.ticketExecutionId === "string" ? payload.ticketExecutionId : null;

      const existingUltraplan = await tx.ultraplan.findFirstOrThrow({
        where: { id: ultraplanId, organizationId: input.organizationId },
        include: ULTRAPLAN_INCLUDE,
      });

      const updatedPayload = {
        ...payload,
        resolution: input.resolution,
        response: input.response ?? null,
      };

      const updatedItem = await inboxService.resolveItem(
        {
          id: item.id,
          organizationId: input.organizationId,
          status: targetStatus,
          resolution: input.resolution,
          payload: updatedPayload as unknown as Prisma.InputJsonValue,
          actorType: input.actorType,
          actorId: input.actorId,
        },
        tx,
      );

      const updatedUltraplan = await tx.ultraplan.update({
        where: { id: existingUltraplan.id },
        data: {
          activeInboxItemId:
            existingUltraplan.activeInboxItemId === item.id
              ? null
              : existingUltraplan.activeInboxItemId,
          status:
            existingUltraplan.activeInboxItemId === item.id &&
            existingUltraplan.status === "needs_human"
              ? "waiting"
              : existingUltraplan.status,
        },
        include: ULTRAPLAN_INCLUDE,
      });

      const existingExecution = ticketExecutionId
        ? await tx.ticketExecution.findFirst({
            where: {
              id: ticketExecutionId,
              organizationId: input.organizationId,
              ultraplanId: existingUltraplan.id,
            },
          })
        : null;

      const updatedExecution = existingExecution
        ? await tx.ticketExecution.update({
            where: { id: existingExecution.id },
            data: {
              activeInboxItemId:
                existingExecution.activeInboxItemId === item.id
                  ? null
                  : existingExecution.activeInboxItemId,
              status:
                existingExecution.activeInboxItemId === item.id &&
                existingExecution.status === "needs_human"
                  ? "reviewing"
                  : existingExecution.status,
            },
          })
        : null;

      await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "ultraplan",
          scopeId: updatedUltraplan.id,
          eventType: "ultraplan_updated",
          payload: eventPayload(updatedUltraplan as unknown as Record<string, unknown>),
          actorType: input.actorType,
          actorId: input.actorId,
        },
        tx,
      );

      if (updatedExecution) {
        await eventService.create(
          {
            organizationId: input.organizationId,
            scopeType: "ultraplan",
            scopeId: updatedUltraplan.id,
            eventType: "ticket_execution_updated",
            payload: {
              ticketExecution: serializeTicketExecution(
                updatedExecution as unknown as Record<string, unknown>,
              ),
              ultraplanId: updatedUltraplan.id,
              sessionGroupId: updatedUltraplan.sessionGroupId,
            } as unknown as Prisma.InputJsonValue,
            actorType: input.actorType,
            actorId: input.actorId,
          },
          tx,
        );
      }

      const shouldWakeController = !["paused", "completed", "failed", "cancelled"].includes(
        updatedUltraplan.status,
      );

      return {
        inboxItem: updatedItem,
        ultraplanId: updatedUltraplan.id,
        shouldWakeController,
      };
    });

    if (result.shouldWakeController) {
      await this.runControllerNow(result.ultraplanId, input.actorType, input.actorId);
    }

    return result.inboxItem;
  }

  async start(input: StartUltraplanServiceInput) {
    const controller = validateControllerConfig(input);

    const result = await prisma.$transaction(async (tx: TxClient) => {
      const sessionGroup = await tx.sessionGroup.findFirst({
        where: { id: input.sessionGroupId, organizationId: input.organizationId },
        include: { repo: true },
      });
      if (!sessionGroup) {
        throw new Error("Session group not found");
      }

      await assertActorOrgAccess(tx, input.organizationId, input.actorType, input.actorId);

      const existing = await tx.ultraplan.findFirst({
        where: { sessionGroupId: input.sessionGroupId, organizationId: input.organizationId },
        include: ULTRAPLAN_INCLUDE,
      });

      if (existing && ACTIVE_STATUSES.includes(existing.status)) {
        return { ultraplan: existing, controllerRun: null };
      }

      const integrationBranch = sessionGroup.branch ?? sessionGroup.repo?.defaultBranch ?? "main";
      const integrationWorkdir = sessionGroup.workdir ?? null;

      const ultraplan = existing
        ? await tx.ultraplan.update({
            where: { id: existing.id },
            data: {
              status: "planning",
              ownerUserId: input.actorId,
              integrationBranch,
              integrationWorkdir,
              playbookId: input.playbookId ?? null,
              playbookConfig: input.playbookConfig ?? Prisma.JsonNull,
              planSummary: input.goal,
              customInstructions: input.customInstructions ?? null,
              activeInboxItemId: null,
              lastControllerRunId: null,
              lastControllerSummary: null,
            },
            include: ULTRAPLAN_INCLUDE,
          })
        : await tx.ultraplan.create({
            data: {
              organizationId: input.organizationId,
              sessionGroupId: input.sessionGroupId,
              ownerUserId: input.actorId,
              status: "planning",
              integrationBranch,
              integrationWorkdir,
              playbookId: input.playbookId ?? undefined,
              playbookConfig: input.playbookConfig ?? undefined,
              planSummary: input.goal,
              customInstructions: input.customInstructions ?? undefined,
            },
            include: ULTRAPLAN_INCLUDE,
          });

      await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "ultraplan",
          scopeId: ultraplan.id,
          eventType: existing ? "ultraplan_updated" : "ultraplan_created",
          payload: eventPayload(ultraplan as unknown as Record<string, unknown>),
          actorType: input.actorType,
          actorId: input.actorId,
        },
        tx,
      );

      const run = await this.createInitialRun(tx, ultraplan, controller, input);

      const updated = await tx.ultraplan.update({
        where: { id: ultraplan.id },
        data: { lastControllerRunId: run.id },
        include: ULTRAPLAN_INCLUDE,
      });

      await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "ultraplan",
          scopeId: updated.id,
          eventType: "ultraplan_updated",
          payload: eventPayload(updated as unknown as Record<string, unknown>),
          actorType: input.actorType,
          actorId: input.actorId,
        },
        tx,
      );

      return { ultraplan: updated, controllerRun: run };
    });

    if (result.controllerRun?.sessionId) {
      await this.launchControllerRun({
        runId: result.controllerRun.id,
        sessionId: result.controllerRun.sessionId,
        goal: input.goal,
        ultraplanId: result.ultraplan.id,
        sessionGroupId: input.sessionGroupId,
        actorType: input.actorType,
        actorId: input.actorId,
        organizationId: input.organizationId,
      });
    }

    return result.ultraplan;
  }

  async pause(id: string, actorType: ActorType, actorId: string) {
    return this.setStatus(id, "paused", "ultraplan_paused", actorType, actorId, {
      idempotentStatuses: ["paused", "completed", "failed", "cancelled"],
    });
  }

  async resume(id: string, actorType: ActorType, actorId: string) {
    return this.setStatus(id, "waiting", "ultraplan_resumed", actorType, actorId, {
      idempotentStatuses: ["waiting", "planning", "running", "completed", "failed", "cancelled"],
      requireCurrentStatus: "paused",
    });
  }

  async cancel(id: string, actorType: ActorType, actorId: string) {
    return this.setStatus(id, "cancelled", "ultraplan_failed", actorType, actorId, {
      idempotentStatuses: ["cancelled", "completed", "failed"],
    });
  }

  async runControllerNow(id: string, actorType: ActorType, actorId: string) {
    return this.runControllerWithTrigger({
      id,
      actorType,
      actorId,
      triggerType: "manual",
      inputSummary: "Manual controller run",
    });
  }

  async runControllerForEvent(input: {
    id: string;
    actorType: ActorType;
    actorId: string;
    triggerEventId: string;
    triggerType: string;
    inputSummary: string;
  }) {
    return this.runControllerWithTrigger(input);
  }

  private async runControllerWithTrigger(input: {
    id: string;
    actorType: ActorType;
    actorId: string;
    triggerEventId?: string | null;
    triggerType: string;
    inputSummary: string;
  }) {
    const ultraplan = await prisma.ultraplan.findUniqueOrThrow({
      where: { id: input.id },
      include: ULTRAPLAN_INCLUDE,
    });
    await assertActorOrgAccess(prisma, ultraplan.organizationId, input.actorType, input.actorId);
    if (["completed", "failed", "cancelled"].includes(ultraplan.status)) {
      throw new Error("Cannot run controller for an inactive Ultraplan");
    }

    if (input.triggerEventId) {
      const existingTriggeredRun = await prisma.ultraplanControllerRun.findFirst({
        where: {
          organizationId: ultraplan.organizationId,
          ultraplanId: ultraplan.id,
          triggerEventId: input.triggerEventId,
        },
        include: { session: true, generatedTickets: true },
      });
      if (existingTriggeredRun) {
        return existingTriggeredRun;
      }
    }

    let activeControllerRun = await prisma.ultraplanControllerRun.findFirst({
      where: {
        organizationId: ultraplan.organizationId,
        ultraplanId: ultraplan.id,
        status: { in: [...ACTIVE_CONTROLLER_RUN_STATUSES] },
      },
      orderBy: { createdAt: "desc" },
      include: { session: true, generatedTickets: true },
    });
    if (
      activeControllerRun?.status === "queued" &&
      activeControllerRun.session?.agentStatus === "failed"
    ) {
      await ultraplanControllerRunService.failRun(
        activeControllerRun.id,
        activeControllerRun.session.connection &&
          typeof activeControllerRun.session.connection === "object" &&
          "lastError" in activeControllerRun.session.connection &&
          typeof activeControllerRun.session.connection.lastError === "string"
          ? activeControllerRun.session.connection.lastError
          : "Controller session failed before starting",
        input.actorType,
        input.actorId,
      );
      activeControllerRun = null;
    }
    if (activeControllerRun) {
      if (activeControllerRun.status === "queued" && activeControllerRun.sessionId) {
        await this.launchControllerRun({
          runId: activeControllerRun.id,
          sessionId: activeControllerRun.sessionId,
          goal: activeControllerRun.inputSummary ?? input.inputSummary,
          ultraplanId: ultraplan.id,
          sessionGroupId: ultraplan.sessionGroupId,
          actorType: input.actorType,
          actorId: input.actorId,
          organizationId: ultraplan.organizationId,
        });
        return prisma.ultraplanControllerRun.findUniqueOrThrow({
          where: { id: activeControllerRun.id },
          include: { session: true, generatedTickets: true },
        });
      }
      return activeControllerRun;
    }

    const lastControllerRun = ultraplan.lastControllerRunId
      ? await prisma.ultraplanControllerRun.findUnique({
          where: { id: ultraplan.lastControllerRunId },
          include: { session: true },
        })
      : null;
    const lastControllerSession = lastControllerRun?.session ?? null;
    const controller = validateControllerConfig({
      controllerProvider: lastControllerSession?.tool ?? "claude_code",
      controllerModel: lastControllerSession?.model ?? null,
      controllerRuntimePolicy: lastControllerSession
        ? runtimePolicyFromSessionConnection(
            lastControllerSession.hosting,
            lastControllerSession.connection,
          )
        : null,
    });

    const result = await prisma.$transaction(async (tx: TxClient) => {
      const run = await this.createControllerRun(tx, ultraplan, controller, {
        triggerType: input.triggerType,
        triggerEventId: input.triggerEventId ?? null,
        inputSummary: input.inputSummary,
        actorType: input.actorType,
        actorId: input.actorId,
      });
      const updated = await tx.ultraplan.update({
        where: { id: ultraplan.id },
        include: ULTRAPLAN_INCLUDE,
        data: { status: "planning", lastControllerRunId: run.id },
      });
      await eventService.create(
        {
          organizationId: updated.organizationId,
          scopeType: "ultraplan",
          scopeId: updated.id,
          eventType: "ultraplan_updated",
          payload: eventPayload(updated as unknown as Record<string, unknown>),
          actorType: input.actorType,
          actorId: input.actorId,
        },
        tx,
      );
      return { run, ultraplan: updated };
    });

    if (result.run.sessionId) {
      await this.launchControllerRun({
        runId: result.run.id,
        sessionId: result.run.sessionId,
        goal: input.inputSummary,
        ultraplanId: result.ultraplan.id,
        sessionGroupId: result.ultraplan.sessionGroupId,
        actorType: input.actorType,
        actorId: input.actorId,
        organizationId: result.ultraplan.organizationId,
      });
    }

    return result.run;
  }

  private async setStatus(
    id: string,
    status: "paused" | "waiting" | "cancelled",
    eventType: "ultraplan_paused" | "ultraplan_resumed" | "ultraplan_failed",
    actorType: ActorType,
    actorId: string,
    options: {
      idempotentStatuses: readonly string[];
      requireCurrentStatus?: string;
    },
  ) {
    return prisma.$transaction(async (tx: TxClient) => {
      const existing = await tx.ultraplan.findUniqueOrThrow({
        where: { id },
        include: ULTRAPLAN_INCLUDE,
      });
      await assertActorOrgAccess(tx, existing.organizationId, actorType, actorId);

      if (options.idempotentStatuses.includes(existing.status)) {
        return existing;
      }
      if (options.requireCurrentStatus && existing.status !== options.requireCurrentStatus) {
        return existing;
      }

      const updated = await tx.ultraplan.update({
        where: { id },
        data: { status },
        include: ULTRAPLAN_INCLUDE,
      });

      await eventService.create(
        {
          organizationId: updated.organizationId,
          scopeType: "ultraplan",
          scopeId: updated.id,
          eventType,
          payload: eventPayload(updated as unknown as Record<string, unknown>),
          actorType,
          actorId,
        },
        tx,
      );

      return updated;
    });
  }

  private async createInitialRun(
    tx: TxClient,
    ultraplan: Prisma.UltraplanGetPayload<{ include: typeof ULTRAPLAN_INCLUDE }>,
    controller: ControllerConfig,
    input: { goal: string; actorType: ActorType; actorId: string },
  ) {
    return this.createControllerRun(tx, ultraplan, controller, {
      triggerType: "initial",
      inputSummary: input.goal,
      actorType: input.actorType,
      actorId: input.actorId,
    });
  }

  private async createControllerRun(
    tx: TxClient,
    ultraplan: Prisma.UltraplanGetPayload<{ include: typeof ULTRAPLAN_INCLUDE }>,
    controller: ControllerConfig,
    input: {
      triggerType: string;
      inputSummary: string;
      actorType: ActorType;
      actorId: string;
      triggerEventId?: string | null;
    },
  ) {
    return ultraplanControllerRunService.createRun(
      {
        ultraplan,
        triggerType: input.triggerType,
        inputSummary: input.inputSummary,
        controller,
        actorType: input.actorType,
        actorId: input.actorId,
        triggerEventId: input.triggerEventId ?? null,
      },
      tx,
    );
  }

  private async launchControllerRun(input: {
    runId: string;
    sessionId: string;
    goal: string;
    ultraplanId: string;
    sessionGroupId: string;
    actorType: ActorType;
    actorId: string;
    organizationId: string;
  }) {
    await sessionService.prepareUltraplanControllerSessionForLaunch(input.sessionId);

    const session = await sessionService.run(
      input.sessionId,
      buildControllerRunPrompt(input),
      "plan",
      {
        userId: input.actorId,
        organizationId: input.organizationId,
        clientSource: "ultraplan_controller",
      },
    );

    if (session.agentStatus === "active") {
      await ultraplanControllerRunService.markStarted(input.runId, input.actorType, input.actorId);
    }
  }
}

export const ultraplanService = new UltraplanService();
