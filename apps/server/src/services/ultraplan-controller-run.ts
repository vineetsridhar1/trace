import type { ActorType } from "@trace/gql";
import { Prisma } from "@prisma/client";
import { getDefaultModel, isSupportedModel } from "@trace/shared";
import { prisma } from "../lib/db.js";
import { sessionRouter } from "../lib/session-router.js";
import { runtimeAccessService } from "./runtime-access.js";
import { eventService } from "./event.js";

type TxClient = Prisma.TransactionClient;

const CONTROLLER_TOOLS = ["claude_code", "codex", "custom"] as const;
type ControllerTool = (typeof CONTROLLER_TOOLS)[number];

type RuntimePolicy = {
  hosting?: "cloud" | "local";
  runtimeInstanceId?: string;
};

type UltraplanForRun = {
  id: string;
  organizationId: string;
  sessionGroupId: string;
  ownerUserId: string;
  integrationBranch: string;
  integrationWorkdir: string | null;
  sessionGroup: {
    id: string;
    name: string;
    channelId: string | null;
    repoId: string | null;
    branch: string | null;
    workdir: string | null;
    connection: Prisma.JsonValue | null;
    repo: { id: string; name: string; remoteUrl: string; defaultBranch: string } | null;
  };
};

export type ControllerConfig = {
  provider: ControllerTool;
  model: string | null;
  runtimePolicy: RuntimePolicy;
};

export type CreateControllerRunInput = {
  ultraplan: UltraplanForRun;
  triggerType: string;
  inputSummary?: string | null;
  controller: ControllerConfig;
  actorType: ActorType;
  actorId: string;
  triggerEventId?: string | null;
};

export type CompleteControllerRunInput = {
  summaryTitle?: string | null;
  summary?: string | null;
  summaryPayload?: Prisma.InputJsonValue | null;
};

export function validateControllerConfig(input: {
  controllerProvider: string;
  controllerModel?: string | null;
  controllerRuntimePolicy?: unknown;
}): ControllerConfig {
  const provider = input.controllerProvider.trim();
  if (!CONTROLLER_TOOLS.includes(provider as ControllerTool)) {
    throw new Error(`Unsupported controller provider "${provider}"`);
  }

  const model = input.controllerModel?.trim() || getDefaultModel(provider);
  if (model && !isSupportedModel(provider, model)) {
    throw new Error(`Unsupported model "${model}" for controller provider "${provider}"`);
  }

  const runtimePolicy = parseRuntimePolicy(input.controllerRuntimePolicy);

  return {
    provider: provider as ControllerTool,
    model: model ?? null,
    runtimePolicy,
  };
}

function parseRuntimePolicy(raw: unknown): RuntimePolicy {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("controllerRuntimePolicy must be an object");
  }

  const value = raw as Record<string, unknown>;
  const policy: RuntimePolicy = {};

  if (value.hosting !== undefined) {
    if (value.hosting !== "cloud" && value.hosting !== "local") {
      throw new Error("controllerRuntimePolicy.hosting must be cloud or local");
    }
    policy.hosting = value.hosting;
  }

  if (value.runtimeInstanceId !== undefined) {
    if (typeof value.runtimeInstanceId !== "string" || !value.runtimeInstanceId.trim()) {
      throw new Error("controllerRuntimePolicy.runtimeInstanceId must be a non-empty string");
    }
    policy.runtimeInstanceId = value.runtimeInstanceId.trim();
  }

  return policy;
}

function defaultConnection(runtime?: { id: string; label: string | null }): Prisma.InputJsonValue {
  return {
    state: "connected",
    retryCount: 0,
    canRetry: true,
    canMove: true,
    ...(runtime ? { runtimeInstanceId: runtime.id, runtimeLabel: runtime.label ?? undefined } : {}),
  };
}

function serializeRun(run: Record<string, unknown>) {
  return {
    id: run.id,
    organizationId: run.organizationId,
    ultraplanId: run.ultraplanId,
    sessionGroupId: run.sessionGroupId,
    sessionId: run.sessionId ?? null,
    triggerEventId: run.triggerEventId ?? null,
    triggerType: run.triggerType,
    status: run.status,
    inputSummary: run.inputSummary ?? null,
    summaryTitle: run.summaryTitle ?? null,
    summary: run.summary ?? null,
    summaryPayload: run.summaryPayload ?? null,
    error: run.error ?? null,
    createdAt: run.createdAt,
    startedAt: run.startedAt ?? null,
    completedAt: run.completedAt ?? null,
  };
}

export class UltraplanControllerRunService {
  async get(id: string, organizationId: string) {
    return prisma.ultraplanControllerRun.findFirst({
      where: { id, organizationId },
      include: { session: true, generatedTickets: true },
    });
  }

  async listForUltraplan(ultraplanId: string, organizationId: string) {
    return prisma.ultraplanControllerRun.findMany({
      where: { ultraplanId, organizationId },
      orderBy: { createdAt: "desc" },
      include: { session: true, generatedTickets: true },
    });
  }

  async createRun(input: CreateControllerRunInput, tx: TxClient = prisma) {
    const runtime = await this.resolveRuntime(input);
    const hosting = runtime?.hosting ?? input.controller.runtimePolicy.hosting ?? "cloud";

    const session = await tx.session.create({
      data: {
        name: `Ultraplan controller: ${input.ultraplan.sessionGroup.name}`.slice(0, 80),
        role: "ultraplan_controller_run",
        agentStatus: "not_started",
        sessionStatus: "in_progress",
        tool: input.controller.provider,
        model: input.controller.model ?? undefined,
        hosting,
        organizationId: input.ultraplan.organizationId,
        createdById: input.actorId,
        repoId: input.ultraplan.sessionGroup.repoId ?? undefined,
        branch: input.ultraplan.integrationBranch,
        workdir: input.ultraplan.integrationWorkdir ?? undefined,
        channelId: input.ultraplan.sessionGroup.channelId ?? undefined,
        sessionGroupId: input.ultraplan.sessionGroupId,
        connection:
          input.ultraplan.sessionGroup.connection ??
          defaultConnection(runtime ? { id: runtime.id, label: runtime.label } : undefined),
        worktreeDeleted: false,
      },
    });

    if (runtime) {
      sessionRouter.bindSession(session.id, runtime.id);
    }

    const run = await tx.ultraplanControllerRun.create({
      data: {
        organizationId: input.ultraplan.organizationId,
        ultraplanId: input.ultraplan.id,
        sessionGroupId: input.ultraplan.sessionGroupId,
        sessionId: session.id,
        triggerEventId: input.triggerEventId ?? undefined,
        triggerType: input.triggerType,
        status: "queued",
        inputSummary: input.inputSummary ?? undefined,
      },
    });

    const updatedRun = await tx.ultraplanControllerRun.update({
      where: { id: run.id },
      data: {},
      include: { session: true, generatedTickets: true },
    });

    await eventService.create(
      {
        organizationId: input.ultraplan.organizationId,
        scopeType: "ultraplan",
        scopeId: input.ultraplan.id,
        eventType: "ultraplan_controller_run_created",
          payload: {
            ultraplanId: input.ultraplan.id,
            controllerRun: serializeRun(updatedRun as unknown as Record<string, unknown>),
            sessionId: session.id,
          runtimeActionScope: {
            organizationId: input.ultraplan.organizationId,
            ultraplanId: input.ultraplan.id,
            controllerRunId: run.id,
            sessionGroupId: input.ultraplan.sessionGroupId,
            sessionId: session.id,
          },
          } as unknown as Prisma.InputJsonValue,
        actorType: input.actorType,
        actorId: input.actorId,
      },
      tx,
    );

    return updatedRun;
  }

  async markStarted(id: string, actorType: ActorType, actorId: string) {
    return prisma.$transaction(async (tx: TxClient) => {
      const existing = await tx.ultraplanControllerRun.findUniqueOrThrow({
        where: { id },
        include: { ultraplan: true },
      });
      if (existing.status === "running") return existing;

      const run = await tx.ultraplanControllerRun.update({
        where: { id },
        data: { status: "running", startedAt: existing.startedAt ?? new Date() },
        include: { session: true, generatedTickets: true },
      });

      await eventService.create(
        {
          organizationId: run.organizationId,
          scopeType: "ultraplan",
          scopeId: run.ultraplanId,
          eventType: "ultraplan_controller_run_started",
          payload: {
            ultraplanId: run.ultraplanId,
            controllerRun: serializeRun(run as unknown as Record<string, unknown>),
          } as unknown as Prisma.InputJsonValue,
          actorType,
          actorId,
        },
        tx,
      );

      return run;
    });
  }

  async completeRun(
    id: string,
    input: CompleteControllerRunInput,
    actorType: ActorType,
    actorId: string,
  ) {
    return prisma.$transaction(async (tx: TxClient) => {
      const existing = await tx.ultraplanControllerRun.findUniqueOrThrow({ where: { id } });
      if (existing.status === "completed") return existing;

      const run = await tx.ultraplanControllerRun.update({
        where: { id },
        data: {
          status: "completed",
          completedAt: existing.completedAt ?? new Date(),
          summaryTitle: input.summaryTitle ?? undefined,
          summary: input.summary ?? undefined,
          summaryPayload: input.summaryPayload ?? undefined,
          error: null,
        },
        include: { session: true, generatedTickets: true },
      });

      await tx.ultraplan.update({
        where: { id: run.ultraplanId },
        data: {
          lastControllerRunId: run.id,
          lastControllerSummary: run.summary ?? run.summaryTitle ?? null,
          status: "waiting",
        },
      });

      await eventService.create(
        {
          organizationId: run.organizationId,
          scopeType: "ultraplan",
          scopeId: run.ultraplanId,
          eventType: "ultraplan_controller_run_completed",
          payload: {
            ultraplanId: run.ultraplanId,
            controllerRun: serializeRun(run as unknown as Record<string, unknown>),
          } as unknown as Prisma.InputJsonValue,
          actorType,
          actorId,
        },
        tx,
      );

      return run;
    });
  }

  async failRun(id: string, error: string, actorType: ActorType, actorId: string) {
    return prisma.$transaction(async (tx: TxClient) => {
      const existing = await tx.ultraplanControllerRun.findUniqueOrThrow({ where: { id } });
      if (existing.status === "failed") return existing;

      const run = await tx.ultraplanControllerRun.update({
        where: { id },
        data: {
          status: "failed",
          completedAt: existing.completedAt ?? new Date(),
          error,
        },
        include: { session: true, generatedTickets: true },
      });

      await tx.ultraplan.update({
        where: { id: run.ultraplanId },
        data: { lastControllerRunId: run.id, status: "failed" },
      });

      await eventService.create(
        {
          organizationId: run.organizationId,
          scopeType: "ultraplan",
          scopeId: run.ultraplanId,
          eventType: "ultraplan_controller_run_failed",
          payload: {
            ultraplanId: run.ultraplanId,
            controllerRun: serializeRun(run as unknown as Record<string, unknown>),
            error,
          } as unknown as Prisma.InputJsonValue,
          actorType,
          actorId,
        },
        tx,
      );

      return run;
    });
  }

  private async resolveRuntime(input: CreateControllerRunInput) {
    const runtimeInstanceId = input.controller.runtimePolicy.runtimeInstanceId;
    if (!runtimeInstanceId) return null;

    await runtimeAccessService.assertAccess({
      userId: input.actorId,
      organizationId: input.ultraplan.organizationId,
      runtimeInstanceId,
      sessionGroupId: input.ultraplan.sessionGroupId,
      capability: "session",
    });

    const runtime = sessionRouter.getRuntime(runtimeInstanceId);
    if (!runtime) {
      throw new Error("Requested controller runtime not found");
    }

    if (!runtime.supportedTools.includes(input.controller.provider)) {
      throw new Error("Requested controller runtime does not support this provider");
    }

    const repoId = input.ultraplan.sessionGroup.repoId;
    if (runtime.hostingMode === "local" && repoId && !runtime.registeredRepoIds.includes(repoId)) {
      throw new Error("Requested controller runtime does not have this repo linked");
    }

    return { id: runtime.id, label: runtime.label, hosting: runtime.hostingMode };
  }
}

export const ultraplanControllerRunService = new UltraplanControllerRunService();
