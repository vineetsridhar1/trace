import type { ActorType } from "@trace/gql";
import type {
  Event,
  OrchestratorEpisode,
  OrchestratorEpisodeStatus,
  Prisma,
  ProjectRunStatus,
} from "@prisma/client";
import { createHash } from "crypto";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { processedEventService } from "./processed-event.js";
import { sessionService, type SessionService, type StartSessionServiceInput } from "./session.js";
import { assertActorOrgAccess } from "./actor-auth.js";
import { playbookService } from "./playbook.js";

const PROJECT_ORCHESTRATOR_CONSUMER = "project-orchestrator";
const PROJECT_ORCHESTRATOR_ACTOR_ID = "project-orchestrator";
const NON_STARTING_RUN_STATUSES = new Set<ProjectRunStatus>([
  "paused",
  "completed",
  "cancelled",
]);

const STARTABLE_FAILED_STATUSES = new Set<OrchestratorEpisodeStatus>(["pending", "failed"]);

type JsonRecord = Record<string, unknown>;

type TriggerEvent = Pick<
  Event,
  "id" | "organizationId" | "scopeType" | "scopeId" | "eventType" | "payload" | "actorType" | "actorId"
>;

type ProjectRunForEpisode = {
  id: string;
  organizationId: string;
  projectId: string;
  status: ProjectRunStatus;
  initialGoal: string;
  planSummary: string | null;
  executionConfig: Prisma.JsonValue;
  project: { id: string; name: string; repoId: string | null };
};

type EpisodeServiceSession = Pick<SessionService, "start">;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function dateToJson(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function episodePayload(episode: OrchestratorEpisode): Prisma.InputJsonObject {
  return {
    id: episode.id,
    organizationId: episode.organizationId,
    projectId: episode.projectId,
    projectRunId: episode.projectRunId,
    triggerEventId: episode.triggerEventId,
    sessionId: episode.sessionId,
    status: episode.status,
    playbookVersionId: episode.playbookVersionId,
    playbookSnapshot: asRecord(episode.playbookSnapshot) as Prisma.InputJsonObject,
    contextHash: episode.contextHash,
    contextSnapshot: asRecord(episode.contextSnapshot) as Prisma.InputJsonObject,
    actionResults: (Array.isArray(episode.actionResults)
      ? episode.actionResults
      : []) as Prisma.InputJsonArray,
    decisionSummary: episode.decisionSummary,
    retryCount: episode.retryCount,
    lastError: episode.lastError,
    startedAt: dateToJson(episode.startedAt),
    completedAt: dateToJson(episode.completedAt),
    failedAt: dateToJson(episode.failedAt),
    createdAt: dateToJson(episode.createdAt),
    updatedAt: dateToJson(episode.updatedAt),
  };
}

function projectRunIdFromEvent(event: TriggerEvent): string {
  const payload = asRecord(event.payload);
  const direct = optionalString(payload.projectRunId);
  if (direct) return direct;

  const projectRun = asRecord(payload.projectRun);
  const nested = optionalString(projectRun.id);
  if (nested) return nested;

  throw new Error("Lifecycle event payload must include projectRunId");
}

function resolveCodingTool(config: JsonRecord): StartSessionServiceInput["tool"] {
  const value = optionalString(config.codingTool) ?? optionalString(config.tool);
  if (value === "claude_code" || value === "codex" || value === "custom") return value;
  return "claude_code";
}

function resolveHosting(config: JsonRecord): StartSessionServiceInput["hosting"] | undefined {
  const value = optionalString(config.hosting);
  if (value === "cloud" || value === "local") return value;
  return undefined;
}

function buildContextSnapshot(
  event: TriggerEvent,
  projectRun: ProjectRunForEpisode,
  playbook: { versionId: string; snapshot: Prisma.InputJsonObject; content: string },
) {
  const payload = asRecord(event.payload);
  const executionConfig = asRecord(projectRun.executionConfig);
  return {
    kind: "project_orchestrator_episode_v1",
    triggerEvent: {
      id: event.id,
      eventType: event.eventType,
      scopeType: event.scopeType,
      scopeId: event.scopeId,
      payload,
    },
    projectRun: {
      id: projectRun.id,
      projectId: projectRun.projectId,
      status: projectRun.status,
      initialGoal: projectRun.initialGoal,
      planSummary: projectRun.planSummary,
    },
    project: projectRun.project,
    executionConfig,
    playbook: {
      versionId: playbook.versionId,
      snapshot: playbook.snapshot,
      content: playbook.content,
    },
  };
}

function hashSnapshot(snapshot: unknown): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function buildEpisodePrompt(snapshot: unknown): string {
  return [
    "You are the Trace project orchestrator for one lifecycle event.",
    "Use the provided project/run/event context, decide the next action allowed by the playbook, execute through Trace service-backed actions, record a short decision summary, then stop.",
    "",
    "Context packet:",
    JSON.stringify(snapshot, null, 2),
  ].join("\n");
}

export class OrchestratorEpisodeService {
  constructor(private readonly sessions: EpisodeServiceSession = sessionService) {}

  async listForProjectRun(
    projectRunId: string,
    organizationId: string,
    actorType: ActorType = "system",
    actorId: string = "system",
  ) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertActorOrgAccess(tx, organizationId, actorType, actorId);
      await tx.projectRun.findFirstOrThrow({
        where: { id: projectRunId, organizationId },
        select: { id: true },
      });
    });

    return prisma.orchestratorEpisode.findMany({
      where: { projectRunId, organizationId },
      orderBy: { createdAt: "asc" },
    });
  }

  async handleLifecycleEvent(input: {
    triggerEventId: string;
    organizationId: string;
  }): Promise<OrchestratorEpisode> {
    const alreadyProcessed = await processedEventService.isProcessed(
      PROJECT_ORCHESTRATOR_CONSUMER,
      input.triggerEventId,
    );
    if (alreadyProcessed) {
      return prisma.orchestratorEpisode.findUniqueOrThrow({
        where: { triggerEventId: input.triggerEventId },
      });
    }

    const episode = await this.startForLifecycleEvent({
      ...input,
      actorType: "system",
      actorId: "system",
    });

    if (episode.sessionId) {
      await processedEventService.markProcessed({
        consumerName: PROJECT_ORCHESTRATOR_CONSUMER,
        eventId: input.triggerEventId,
        organizationId: input.organizationId,
        resultHash: episode.id,
      });
    }

    return episode;
  }

  async startForLifecycleEvent(input: {
    triggerEventId: string;
    organizationId: string;
    actorType: ActorType;
    actorId: string;
  }): Promise<OrchestratorEpisode> {
    const event = await this.loadTriggerEvent(input.triggerEventId, input.organizationId);
    if (event.scopeType !== "project") {
      throw new Error("Orchestrator episodes require project-scoped lifecycle events");
    }

    const projectRunId = projectRunIdFromEvent(event);
    const projectRun = await this.loadProjectRun(projectRunId, input.organizationId);
    if (projectRun.projectId !== event.scopeId) {
      throw new Error("Lifecycle event project scope does not match project run");
    }
    if (NON_STARTING_RUN_STATUSES.has(projectRun.status)) {
      throw new Error(`Project run is ${projectRun.status}`);
    }

    const playbook = await playbookService.snapshotForProjectRun(
      projectRun.id,
      input.organizationId,
      input.actorType,
      input.actorId,
    );
    const snapshot = buildContextSnapshot(event, projectRun, playbook);
    const contextHash = hashSnapshot(snapshot);
    const episode = await this.ensureEpisode({
      event,
      projectRun,
      playbook,
      snapshot,
      contextHash,
      actorType: input.actorType,
      actorId: input.actorId,
    });

    if (episode.sessionId || !STARTABLE_FAILED_STATUSES.has(episode.status)) {
      return episode;
    }

    return this.startEpisodeSession({ episode, event, projectRun, snapshot, contextHash });
  }

  private async loadTriggerEvent(triggerEventId: string, organizationId: string): Promise<TriggerEvent> {
    return prisma.event.findFirstOrThrow({
      where: { id: triggerEventId, organizationId },
      select: {
        id: true,
        organizationId: true,
        scopeType: true,
        scopeId: true,
        eventType: true,
        payload: true,
        actorType: true,
        actorId: true,
      },
    });
  }

  private async loadProjectRun(
    projectRunId: string,
    organizationId: string,
  ): Promise<ProjectRunForEpisode> {
    return prisma.projectRun.findFirstOrThrow({
      where: { id: projectRunId, organizationId },
      select: {
        id: true,
        organizationId: true,
        projectId: true,
        status: true,
        initialGoal: true,
        planSummary: true,
        executionConfig: true,
        project: { select: { id: true, name: true, repoId: true } },
      },
    });
  }

  private async ensureEpisode(input: {
    event: TriggerEvent;
    projectRun: ProjectRunForEpisode;
    playbook: { versionId: string; snapshot: Prisma.InputJsonObject; content: string };
    snapshot: unknown;
    contextHash: string;
    actorType: ActorType;
    actorId: string;
  }): Promise<OrchestratorEpisode> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertActorOrgAccess(tx, input.event.organizationId, input.actorType, input.actorId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.projectRun.id}))`;

      const existing = await tx.orchestratorEpisode.findUnique({
        where: { triggerEventId: input.event.id },
      });
      if (existing) return existing;

      const episode = await tx.orchestratorEpisode.create({
        data: {
          organizationId: input.event.organizationId,
          projectId: input.projectRun.projectId,
          projectRunId: input.projectRun.id,
          triggerEventId: input.event.id,
          status: "pending",
          contextHash: input.contextHash,
          contextSnapshot: input.snapshot as Prisma.InputJsonValue,
          playbookVersionId: input.playbook.versionId,
          playbookSnapshot: input.playbook.snapshot,
          actionResults: [],
        },
      });

      await eventService.create(
        {
          organizationId: input.event.organizationId,
          scopeType: "project",
          scopeId: input.projectRun.projectId,
          eventType: "orchestrator_episode_created",
          payload: { orchestratorEpisode: episodePayload(episode) },
          actorType: input.actorType,
          actorId: input.actorId,
        },
        tx,
      );

      return episode;
    });
  }

  private async startEpisodeSession(input: {
    episode: OrchestratorEpisode;
    event: TriggerEvent;
    projectRun: ProjectRunForEpisode;
    snapshot: unknown;
    contextHash: string;
  }): Promise<OrchestratorEpisode> {
    const startedAt = new Date();
    const starting = await this.claimEpisodeForStart(input.episode, {
      startedAt,
      contextHash: input.contextHash,
      contextSnapshot: input.snapshot as Prisma.InputJsonValue,
    });
    if (!starting) {
      return prisma.orchestratorEpisode.findUniqueOrThrow({ where: { id: input.episode.id } });
    }

    try {
      const creatorUserId = await this.resolveCreatorUserId(input.projectRun, input.event);
      const orchestratorActor = await this.resolveOrchestratorActor(input.event.organizationId);
      const config = asRecord(input.projectRun.executionConfig);
      const session = await this.sessions.start({
        organizationId: input.event.organizationId,
        createdById: creatorUserId,
        actorType: orchestratorActor.actorType,
        actorId: orchestratorActor.actorId,
        tool: resolveCodingTool(config),
        hosting: resolveHosting(config),
        repoId: input.projectRun.project.repoId ?? undefined,
        projectId: input.projectRun.projectId,
        prompt: buildEpisodePrompt(input.snapshot),
        interactionMode: "orchestrator",
      });

      return this.updateEpisode(starting.id, {
        status: "running",
        sessionId: session.id,
        decisionSummary: "Started orchestrator episode session.",
        lastError: null,
      });
    } catch (error) {
      return this.updateEpisode(starting.id, {
        status: "failed",
        lastError: error instanceof Error ? error.message : String(error),
        failedAt: new Date(),
      });
    }
  }

  private async updateEpisode(
    episodeId: string,
    data: Prisma.OrchestratorEpisodeUncheckedUpdateInput,
  ): Promise<OrchestratorEpisode> {
    const episode = await prisma.orchestratorEpisode.update({
      where: { id: episodeId },
      data,
    });
    await eventService.create({
      organizationId: episode.organizationId,
      scopeType: "project",
      scopeId: episode.projectId,
      eventType: "orchestrator_episode_updated",
      payload: { orchestratorEpisode: episodePayload(episode) },
      actorType: "system",
      actorId: "system",
    });
    return episode;
  }

  private async claimEpisodeForStart(
    episode: OrchestratorEpisode,
    input: {
      startedAt: Date;
      contextHash: string;
      contextSnapshot: Prisma.InputJsonValue;
    },
  ): Promise<OrchestratorEpisode | null> {
    const claimed = await prisma.orchestratorEpisode.updateMany({
      where: {
        id: episode.id,
        sessionId: null,
        status: { in: ["pending", "failed"] },
      },
      data: {
        status: "starting",
        retryCount: { increment: 1 },
        lastError: null,
        startedAt: input.startedAt,
        failedAt: null,
        contextHash: input.contextHash,
        contextSnapshot: input.contextSnapshot,
      },
    });
    if (claimed.count === 0) return null;

    const starting = await prisma.orchestratorEpisode.findUniqueOrThrow({
      where: { id: episode.id },
    });
    await eventService.create({
      organizationId: starting.organizationId,
      scopeType: "project",
      scopeId: starting.projectId,
      eventType: "orchestrator_episode_updated",
      payload: { orchestratorEpisode: episodePayload(starting) },
      actorType: "system",
      actorId: "system",
    });
    return starting;
  }

  private async resolveCreatorUserId(
    projectRun: ProjectRunForEpisode,
    event: TriggerEvent,
  ): Promise<string> {
    if (event.actorType === "user") {
      const membership = await prisma.orgMember.findUnique({
        where: {
          userId_organizationId: {
            userId: event.actorId,
            organizationId: event.organizationId,
          },
        },
        select: { userId: true },
      });
      if (membership) return membership.userId;
    }

    const projectMembers = await prisma.projectMember.findMany({
      where: { projectId: projectRun.projectId, leftAt: null },
      select: { userId: true },
      orderBy: { joinedAt: "asc" },
      take: 1,
    });
    const projectMember = projectMembers[0];
    if (projectMember) return projectMember.userId;

    const orgMembers = await prisma.orgMember.findMany({
      where: { organizationId: event.organizationId },
      select: { userId: true },
      orderBy: { joinedAt: "asc" },
      take: 1,
    });
    const orgMember = orgMembers[0];
    if (orgMember) return orgMember.userId;

    throw new Error("No user is available to own the orchestrator session");
  }

  private async resolveOrchestratorActor(
    organizationId: string,
  ): Promise<{ actorType: ActorType; actorId: string }> {
    const agentIdentity = await prisma.agentIdentity.findUnique({
      where: { organizationId },
      select: { id: true },
    });
    if (agentIdentity) return { actorType: "agent", actorId: agentIdentity.id };
    return { actorType: "system", actorId: PROJECT_ORCHESTRATOR_ACTOR_ID };
  }
}

export const orchestratorEpisodeService = new OrchestratorEpisodeService();
