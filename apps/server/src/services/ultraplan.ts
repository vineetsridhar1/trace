import type { ActorType, StartUltraplanInput } from "@trace/gql";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { assertActorOrgAccess } from "./actor-auth.js";
import {
  ultraplanControllerRunService,
  validateControllerConfig,
  type ControllerConfig,
} from "./ultraplan-controller-run.js";

type TxClient = Prisma.TransactionClient;

type StartUltraplanServiceInput = StartUltraplanInput & {
  organizationId: string;
  actorType: ActorType;
  actorId: string;
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

  async start(input: StartUltraplanServiceInput) {
    const controller = validateControllerConfig(input);

    return prisma.$transaction(async (tx: TxClient) => {
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
        return existing;
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

      return updated;
    });
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
    const ultraplan = await prisma.ultraplan.findUniqueOrThrow({
      where: { id },
      include: ULTRAPLAN_INCLUDE,
    });
    await assertActorOrgAccess(prisma, ultraplan.organizationId, actorType, actorId);
    if (["completed", "failed", "cancelled"].includes(ultraplan.status)) {
      throw new Error("Cannot run controller for an inactive Ultraplan");
    }

    const controller = validateControllerConfig({
      controllerProvider: "claude_code",
      controllerModel: null,
      controllerRuntimePolicy: null,
    });

    return prisma.$transaction(async (tx: TxClient) => {
      const run = await this.createInitialRun(tx, ultraplan, controller, {
        goal: "Manual controller run",
        actorType,
        actorId,
      });
      await tx.ultraplan.update({
        where: { id: ultraplan.id },
        data: { status: "planning", lastControllerRunId: run.id },
      });
      return run;
    });
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
    return ultraplanControllerRunService.createRun(
      {
        ultraplan,
        triggerType: "initial",
        inputSummary: input.goal,
        controller,
        actorType: input.actorType,
        actorId: input.actorId,
      },
      tx,
    );
  }
}

export const ultraplanService = new UltraplanService();
