import type { StartSessionInput, ActorType } from "@trace/gql";
import type { SessionStatus, EventType, CodingTool } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { getDefaultModel, hasQuestionBlock, hasPlanBlock, isSupportedModel } from "@trace/shared";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { sessionRouter, type DeliveryResult } from "../lib/session-router.js";
import { inboxService } from "./inbox.js";
import { runtimeDebug } from "../lib/runtime-debug.js";
import { terminalRelay } from "../lib/terminal-relay.js";

export type StartSessionServiceInput = StartSessionInput & {
  sessionGroupId?: string | null;
  sourceSessionId?: string | null;
  organizationId: string;
  createdById: string;
};

/** Shape of Session.connection JSON stored in the DB */
export type SessionConnectionData = {
  state: "connected" | "degraded" | "disconnected";
  runtimeInstanceId?: string;
  runtimeLabel?: string;
  lastSeen?: string;
  lastError?: string;
  lastDeliveryFailureAt?: string;
  retryCount: number;
  canRetry: boolean;
  canMove: boolean;
  [key: string]: unknown;
};

type PendingSessionCommand =
  | {
      type: "run";
      prompt?: string | null;
      interactionMode?: string | null;
    }
  | {
      type: "send";
      prompt: string;
      interactionMode?: string | null;
    };

type GroupWorkspaceStatePatch = {
  workdir?: string | null;
  connection?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | null;
  prUrl?: string | null;
  worktreeDeleted?: boolean;
  repoId?: string | null;
  branch?: string | null;
};

function defaultConnection(overrides?: Partial<SessionConnectionData>): SessionConnectionData {
  return {
    state: "connected",
    retryCount: 0,
    canRetry: true,
    canMove: true,
    ...overrides,
  };
}

/** Cast connection data to Prisma-compatible JSON */
function connJson(data: SessionConnectionData): Prisma.InputJsonValue {
  return data as unknown as Prisma.InputJsonValue;
}

const SESSION_GROUP_SUMMARY_SELECT = {
  id: true,
  name: true,
  channelId: true,
  channel: true,
  repoId: true,
  repo: true,
  branch: true,
  workdir: true,
  connection: true,
  prUrl: true,
  worktreeDeleted: true,
  createdAt: true,
  updatedAt: true,
} as const;

const SESSION_INCLUDE = {
  createdBy: true,
  repo: true,
  channel: true,
  sessionGroup: { select: SESSION_GROUP_SUMMARY_SELECT },
} as const;

const SESSION_GROUP_INCLUDE = {
  channel: true,
  repo: true,
  sessions: {
    orderBy: [
      { updatedAt: "desc" },
      { createdAt: "desc" },
    ] as Prisma.SessionOrderByWithRelationInput[],
    include: SESSION_INCLUDE,
  },
} satisfies Prisma.SessionGroupInclude;

function serializeSession(
  session: {
    id: string;
    name: string;
    status: SessionStatus;
    tool: string;
    model: string | null;
    hosting: string;
    createdBy: unknown;
    repo: unknown;
    repoId?: string | null;
    branch: string | null;
    workdir?: string | null;
    channel: unknown;
    channelId?: string | null;
    sessionGroup: unknown;
    connection: Prisma.JsonValue | null;
    worktreeDeleted?: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
) {
  return {
    id: session.id,
    name: session.name,
    status: session.status,
    tool: session.tool,
    model: session.model,
    hosting: session.hosting,
    createdBy: session.createdBy,
    repo: session.repo ?? null,
    repoId: session.repoId ?? null,
    branch: session.branch ?? null,
    workdir: session.workdir ?? null,
    channel: session.channel ?? null,
    channelId: session.channelId ?? null,
    sessionGroupId:
      session.sessionGroup && typeof session.sessionGroup === "object" && "id" in session.sessionGroup
        ? (session.sessionGroup as { id: string }).id
        : null,
    sessionGroup: session.sessionGroup ?? null,
    connection: session.connection,
    worktreeDeleted: session.worktreeDeleted ?? false,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function sortSessionsByRecency<
  T extends {
    updatedAt: Date;
    createdAt: Date;
  },
>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => {
    const updatedDiff = b.updatedAt.getTime() - a.updatedAt.getTime();
    if (updatedDiff !== 0) return updatedDiff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

/** Instruction appended to the initial session prompt so the AI generates a title inline. */
const TITLE_INSTRUCTION = `\n\nIMPORTANT: At the very beginning of your first response, output a short title (5-8 words) for this task wrapped in XML tags like this: <session-title>Your title here</session-title>. Then continue with your normal response.`;

/** Instruction appended to every prompt for repo-based sessions so the AI auto-saves work. */
const AUTO_SAVE_INSTRUCTION = `\n\n<system-instruction>
After completing each task, silently save your work to the remote:
1. Stage all changes: git add -A
2. Commit with a short, descriptive message summarizing what changed (skip if nothing staged)
3. Push: git push origin HEAD
Do this silently — do not mention it to the user unless they ask or it fails.
If the user asks you to stop auto-saving or disable auto-save, stop doing this for the rest of the session.
</system-instruction>`;

function appendAutoSave(prompt: string, hasRepo: boolean): string {
  return hasRepo ? prompt + AUTO_SAVE_INSTRUCTION : prompt;
}

/** Regex to extract <session-title>…</session-title> from assistant output. */
const TITLE_TAG_RE = /<session-title>([\s\S]*?)<\/session-title>/;

/**
 * Build a conversation transcript from session events.
 * Includes user messages and assistant text (no tool calls).
 * Used to give a new coding tool context when switching mid-session.
 */
async function buildConversationContext(sessionId: string): Promise<string | null> {
  const events = await prisma.event.findMany({
    where: {
      scopeId: sessionId,
      scopeType: "session",
      eventType: { in: ["session_started", "message_sent", "session_output"] },
    },
    orderBy: { timestamp: "asc" },
  });

  const lines: string[] = [];

  for (const evt of events) {
    const payload = evt.payload as Record<string, unknown>;

    if (evt.eventType === "session_started") {
      const prompt = payload.prompt as string | undefined;
      if (prompt) lines.push(`[User]: ${prompt}`);
      continue;
    }

    if (evt.eventType === "message_sent") {
      const text = payload.text as string | undefined;
      if (text) lines.push(`[User]: ${text}`);
      continue;
    }

    // Assistant output — extract only text blocks, skip tool calls
    if (payload.type === "assistant") {
      const message = payload.message as Record<string, unknown> | undefined;
      const content = message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          lines.push(`[Assistant]: ${b.text}`);
        }
      }
    }
  }

  if (lines.length === 0) return null;
  return `<conversation-history>\nThe following is the conversation history from a previous coding tool in this session. Use it as context.\n\n${lines.join("\n\n")}\n</conversation-history>`;
}

function buildMigrationPrompt(context: string | null): string {
  if (!context) {
    return "Continue this session on the new runtime.";
  }
  return `${context}\n\nContinue this session on the new runtime.`;
}

async function getSessionStartMetadata(sessionId: string): Promise<{
  prompt: string | null;
  sourceSessionId: string | null;
}> {
  const startEvent = await prisma.event.findFirst({
    where: { scopeId: sessionId, scopeType: "session", eventType: "session_started" },
    orderBy: { timestamp: "asc" },
  });

  if (!startEvent) {
    return { prompt: null, sourceSessionId: null };
  }

  const payload = startEvent.payload as Record<string, unknown>;
  return {
    prompt: typeof payload.prompt === "string" ? payload.prompt : null,
    sourceSessionId: typeof payload.sourceSessionId === "string" ? payload.sourceSessionId : null,
  };
}

async function prependSourceSessionContext(
  sourceSessionId: string | null,
  prompt: string,
): Promise<string> {
  if (!sourceSessionId) return prompt;
  const context = await buildConversationContext(sourceSessionId);
  if (!context) return prompt;
  return `${context}\n\n${prompt}`;
}

function validateModelForTool(tool: string, model: string): string {
  if (!isSupportedModel(tool, model)) {
    throw new Error(`Unsupported model "${model}" for tool "${tool}"`);
  }
  return model;
}

const FULLY_UNLOADED_SESSION_STATUSES: readonly SessionStatus[] = ["failed", "merged"];

export function isFullyUnloadedSessionStatus(status: SessionStatus): boolean {
  return FULLY_UNLOADED_SESSION_STATUSES.includes(status);
}

export class SessionService {
  async listGroups(channelId: string, organizationId: string) {
    const groups = await prisma.sessionGroup.findMany({
      where: { channelId, organizationId },
      include: SESSION_GROUP_INCLUDE,
    });

    return groups
      .map((group) => ({ ...group, sessions: sortSessionsByRecency(group.sessions) }))
      .sort((a, b) => {
        const aLatest = a.sessions[0];
        const bLatest = b.sessions[0];
        const aTs = aLatest?.updatedAt ?? a.updatedAt;
        const bTs = bLatest?.updatedAt ?? b.updatedAt;
        return bTs.getTime() - aTs.getTime();
      });
  }

  async getGroup(id: string, organizationId: string) {
    const group = await prisma.sessionGroup.findFirst({
      where: { id, organizationId },
      include: SESSION_GROUP_INCLUDE,
    });

    if (!group) return null;
    return { ...group, sessions: sortSessionsByRecency(group.sessions) };
  }

  async list(
    organizationId: string,
    filters?: {
      status?: string | null;
      tool?: string | null;
      repoId?: string | null;
      channelId?: string | null;
    },
  ) {
    const where: Record<string, unknown> = { organizationId };
    if (filters?.status) where.status = filters.status;
    if (filters?.tool) where.tool = filters.tool;
    if (filters?.repoId) where.repoId = filters.repoId;
    if (filters?.channelId) where.channelId = filters.channelId;
    return prisma.session.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: SESSION_INCLUDE,
    });
  }

  async get(id: string) {
    return prisma.session.findUnique({ where: { id }, include: SESSION_INCLUDE });
  }

  async listByUser(organizationId: string, userId: string, status?: string | null) {
    const where: Record<string, unknown> = { organizationId, createdById: userId };
    if (status) where.status = status;
    return prisma.session.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: SESSION_INCLUDE,
    });
  }

  async start(input: StartSessionServiceInput) {
    const model = input.model
      ? validateModelForTool(input.tool, input.model)
      : getDefaultModel(input.tool);
    const name = input.prompt
      ? input.prompt.slice(0, 80)
      : `Session ${new Date().toLocaleString()}`;

    const sourceSession = input.sourceSessionId
      ? await prisma.session.findUnique({
          where: { id: input.sourceSessionId },
          select: {
            id: true,
            organizationId: true,
            sessionGroupId: true,
            repoId: true,
            branch: true,
            hosting: true,
            channelId: true,
            projects: {
              select: { projectId: true },
            },
            sessionGroup: {
              select: SESSION_GROUP_SUMMARY_SELECT,
            },
          },
        })
      : null;

    if (input.sourceSessionId && !sourceSession) {
      throw new Error("Source session not found");
    }
    if (sourceSession && sourceSession.organizationId !== input.organizationId) {
      throw new Error("Source session does not belong to this organization");
    }
    if (
      input.sessionGroupId
      && sourceSession?.sessionGroupId
      && input.sessionGroupId !== sourceSession.sessionGroupId
    ) {
      throw new Error("sourceSessionId must belong to the requested sessionGroupId");
    }

    const existingGroupId = input.sessionGroupId ?? sourceSession?.sessionGroupId ?? null;
    const existingGroup = existingGroupId
      ? await prisma.sessionGroup.findFirst({
          where: { id: existingGroupId, organizationId: input.organizationId },
          select: SESSION_GROUP_SUMMARY_SELECT,
        })
      : null;

    if (existingGroupId && !existingGroup) {
      throw new Error("Session group not found");
    }

    const resolvedGroup = existingGroup ?? sourceSession?.sessionGroup ?? null;

    const resolvedChannelId =
      input.channelId ?? resolvedGroup?.channelId ?? sourceSession?.channelId ?? undefined;
    const resolvedRepoId = input.repoId ?? resolvedGroup?.repoId ?? sourceSession?.repoId ?? undefined;
    const resolvedBranch = input.branch ?? resolvedGroup?.branch ?? sourceSession?.branch ?? undefined;
    const sharedWorkdir = resolvedGroup?.workdir ?? null;
    const sharedConnection = resolvedGroup?.connection ?? null;
    const sharedRuntimeInstanceId =
      sharedConnection && typeof sharedConnection === "object" && "runtimeInstanceId" in sharedConnection
        ? (sharedConnection as { runtimeInstanceId?: string | null }).runtimeInstanceId ?? null
        : null;
    const sourceProjectIds = sourceSession?.projects.map((project) => project.projectId) ?? [];
    const sourceTicketLinks = input.sourceSessionId
      ? await prisma.ticketLink.findMany({
          where: { entityType: "session", entityId: input.sourceSessionId },
          select: { ticketId: true },
        })
      : [];

    // Resolve hosting mode: if a runtime is specified, derive from it; otherwise use explicit value or default to cloud
    let hosting = input.hosting ?? sourceSession?.hosting ?? "cloud";
    let runtimeLabel: string | undefined;
    if (input.runtimeInstanceId) {
      const runtime = sessionRouter.getRuntime(input.runtimeInstanceId);
      runtimeDebug("startSession resolving requested runtime", {
        sessionId: "pending",
        runtimeInstanceId: input.runtimeInstanceId,
        requestedHosting: input.hosting ?? null,
        runtimeFoundInRouter: !!runtime,
      });
      if (runtime) {
        hosting = runtime.hostingMode;
        runtimeLabel = runtime.label;
      }
    }

    const needsRuntimeProvisioning =
      !sharedRuntimeInstanceId
      && !sharedWorkdir
      && (!!resolvedRepoId || hosting === "cloud");
    const initialConnection = sharedConnection
      ? sharedConnection
      : connJson(
          defaultConnection({
            ...(input.runtimeInstanceId && { runtimeInstanceId: input.runtimeInstanceId }),
            ...(runtimeLabel && { runtimeLabel }),
          }),
        );

    // New sessions can immediately reuse a group's existing workspace/runtime when present.
    const initialStatus = needsRuntimeProvisioning ? "creating" : "pending";

    const [session] = await prisma.$transaction(async (tx) => {
      const sessionGroup = existingGroup
        ? await (async () => {
            const nextGroupData: Prisma.SessionGroupUncheckedUpdateInput = {};
            if (resolvedChannelId !== undefined && existingGroup.channelId !== resolvedChannelId) {
              nextGroupData.channelId = resolvedChannelId;
            }
            if (resolvedRepoId !== undefined && existingGroup.repoId !== resolvedRepoId) {
              nextGroupData.repoId = resolvedRepoId;
            }
            if (resolvedBranch !== undefined && existingGroup.branch !== resolvedBranch) {
              nextGroupData.branch = resolvedBranch;
            }
            if (Object.keys(nextGroupData).length === 0) {
              return existingGroup;
            }
            return tx.sessionGroup.update({
              where: { id: existingGroup.id },
              data: nextGroupData,
              select: SESSION_GROUP_SUMMARY_SELECT,
            });
          })()
        : await tx.sessionGroup.create({
            data: {
              name,
              organizationId: input.organizationId,
              channelId: resolvedChannelId,
              repoId: resolvedRepoId ?? undefined,
              branch: resolvedBranch ?? undefined,
              connection: initialConnection,
            },
            select: SESSION_GROUP_SUMMARY_SELECT,
          });

      const projectIds =
        input.projectId != null
          ? [input.projectId]
          : sourceProjectIds;

      const session = await tx.session.create({
        data: {
          name,
          status: initialStatus,
          tool: input.tool,
          model: model ?? undefined,
          hosting,
          organizationId: input.organizationId,
          createdById: input.createdById,
          repoId: resolvedRepoId ?? undefined,
          branch: resolvedBranch ?? undefined,
          workdir: sessionGroup.workdir ?? undefined,
          channelId: resolvedChannelId,
          sessionGroupId: sessionGroup.id,
          connection: sessionGroup.connection ?? initialConnection,
          worktreeDeleted: sessionGroup.worktreeDeleted,
          ...(projectIds.length > 0 && {
            projects: {
              create: projectIds.map((projectId) => ({ projectId })),
            },
          }),
        },
        include: SESSION_INCLUDE,
      });

      if (sourceTicketLinks.length > 0) {
        await tx.ticketLink.createMany({
          data: sourceTicketLinks.map((ticketLink) => ({
            ticketId: ticketLink.ticketId,
            entityType: "session",
            entityId: session.id,
          })),
          skipDuplicates: true,
        });
      }

      const event = await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "session",
          scopeId: session.id,
          eventType: "session_started",
          payload: {
            session: serializeSession(session),
            sessionGroup,
            prompt: input.prompt ?? null,
            sourceSessionId: input.sourceSessionId ?? null,
          } as Prisma.InputJsonValue,
          actorType: "user",
          actorId: input.createdById,
        },
        tx,
      );

      return [session, event] as const;
    });

    // Reuse the group's runtime binding when a shared workspace already exists.
    const runtimeToBind = input.runtimeInstanceId ?? sharedRuntimeInstanceId ?? null;
    if (runtimeToBind) {
      sessionRouter.bindSession(session.id, runtimeToBind);
    }

    if (needsRuntimeProvisioning) {
      sessionRouter.createRuntime({
        sessionId: session.id,
        hosting: session.hosting as "cloud" | "local",
        tool: session.tool,
        model: session.model ?? undefined,
        repo: session.repo
          ? {
              id: session.repo.id,
              name: session.repo.name,
              remoteUrl: session.repo.remoteUrl,
              defaultBranch: session.repo.defaultBranch,
            }
          : null,
        branch: resolvedBranch ?? undefined,
        createdById: input.createdById,
        organizationId: input.organizationId,
        onFailed: (error) => this.workspaceFailed(session.id, error),
        onWorkspaceReady: (workdir) => this.workspaceReady(session.id, workdir),
      });
    }

    return session;
  }

  async run(id: string, prompt?: string | null, interactionMode?: string) {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id },
      include: SESSION_INCLUDE,
    });

    // If workspace is still being prepared, queue the run for later
    if (session.status === "creating") {
      const updated = await prisma.session.update({
        where: { id },
        data: {
          pendingRun: {
            type: "run",
            prompt: prompt ?? null,
            interactionMode: interactionMode ?? null,
          },
        },
        include: SESSION_INCLUDE,
      });
      return updated;
    }

    // Fully unloaded sessions cannot accept follow-up work.
    if (isFullyUnloadedSessionStatus(session.status)) {
      return session;
    }

    if (session.worktreeDeleted) {
      throw new Error("Cannot run session: worktree has been deleted");
    }

    // If no prompt provided, retrieve the original prompt from the session_started event
    let resolvedPrompt = prompt;
    const startMeta = !resolvedPrompt || !session.toolSessionId
      ? await getSessionStartMetadata(id)
      : null;
    if (!resolvedPrompt) {
      resolvedPrompt = startMeta?.prompt ?? null;
    }

    if (!session.toolSessionId && resolvedPrompt) {
      resolvedPrompt = await prependSourceSessionContext(
        startMeta?.sourceSessionId ?? null,
        resolvedPrompt,
      );
    }

    // If no tool session ID exists and this isn't the first run, prepend
    // conversation history so the new process has full context.
    if (!session.toolSessionId && resolvedPrompt) {
      const context = await buildConversationContext(id);
      if (context) {
        resolvedPrompt = `${context}\n\n${resolvedPrompt}`;
      }
    }

    // On the very first run, append instruction so the AI generates a session title inline
    const isFirstRun = !session.toolSessionId;
    if (isFirstRun && resolvedPrompt) {
      resolvedPrompt = resolvedPrompt + TITLE_INSTRUCTION;
    }

    // Append auto-save instruction for repo-based sessions
    if (resolvedPrompt) {
      resolvedPrompt = appendAutoSave(resolvedPrompt, !!session.repo);
    }

    const command = {
      type: "run" as const,
      sessionId: id,
      prompt: resolvedPrompt ?? undefined,
      tool: session.tool,
      model: session.model ?? undefined,
      interactionMode,
      cwd: session.workdir ?? undefined,
      toolSessionId: session.toolSessionId ?? undefined,
    };

    const deliveryResult = sessionRouter.send(id, command);

    if (deliveryResult !== "delivered") {
      await this.storePendingCommand(id, {
        type: "run",
        prompt: resolvedPrompt ?? null,
        interactionMode: interactionMode ?? null,
      });
      await this.persistConnectionFailure(id, session.organizationId, deliveryResult, "run");
      return prisma.session.findUniqueOrThrow({ where: { id }, include: SESSION_INCLUDE });
    }

    // Only transition to active after successful delivery
    // Persist the runtime binding so restoreSessionsForRuntime can recover it after restart
    const boundRuntime = sessionRouter.getRuntimeForSession(id);
    const updated = await prisma.session.update({
      where: { id },
      data: {
        status: "active",
        connection: this.mergeConnection(session.connection, {
          state: "connected",
          lastSeen: new Date().toISOString(),
          ...(boundRuntime && {
            runtimeInstanceId: boundRuntime.id,
            runtimeLabel: boundRuntime.label,
          }),
        }),
      },
      include: SESSION_INCLUDE,
    });
    const sessionGroup = await this.syncGroupWorkspaceState(updated.sessionGroupId, {
      connection: updated.connection as Prisma.InputJsonValue,
      worktreeDeleted: false,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: id,
      eventType: "session_resumed",
      payload: { sessionId: id, ...(sessionGroup ? { sessionGroup } : {}) },
      actorType: "user",
      actorId: session.createdById,
    });

    return updated;
  }

  async pause(id: string, actorType: ActorType = "system", actorId: string = "system") {
    return this.transition(id, "pause", "paused", "session_paused", actorType, actorId);
  }

  async resume(id: string, actorType: ActorType = "system", actorId: string = "system") {
    return this.transition(id, "resume", "active", "session_resumed", actorType, actorId);
  }

  async terminate(id: string, actorType: ActorType = "system", actorId: string = "system") {
    return this.terminateWithStatus(id, "completed", "Session stopped", actorType, actorId);
  }

  async dismiss(id: string, actorType: ActorType = "system", actorId: string = "system") {
    return this.terminateWithStatus(id, "completed", "Session dismissed", actorType, actorId);
  }

  private async terminateWithStatus(
    id: string,
    targetStatus: SessionStatus,
    resolution: string,
    actorType: ActorType,
    actorId: string,
  ) {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id },
      select: { organizationId: true },
    });
    await inboxService.resolveBySource({
      sourceType: "session",
      sourceId: id,
      orgId: session.organizationId,
      resolution,
    });
    return this.transition(id, "terminate", targetStatus, "session_terminated", actorType, actorId);
  }

  async delete(id: string, actorType: ActorType = "system", actorId: string = "system") {
    const session = await prisma.session.findUnique({
      where: { id },
      include: SESSION_INCLUDE,
    });
    if (!session) throw new Error("Session not found or already deleted");

    // Resolve any pending inbox items (plans/questions awaiting input)
    await inboxService.resolveBySource({
      sourceType: "session",
      sourceId: id,
      orgId: session.organizationId,
      resolution: "Session deleted",
    });

    const remainingCount = session.sessionGroupId
      ? await prisma.session.count({
          where: {
            sessionGroupId: session.sessionGroupId,
            id: { not: id },
          },
        })
      : 0;

    if (remainingCount === 0) {
      if (session.sessionGroupId) {
        terminalRelay.destroyAllForSessionGroup(session.sessionGroupId);
      } else {
        terminalRelay.destroyAllForSession(id);
      }
      await sessionRouter.destroyRuntime(id, session);
    } else {
      terminalRelay.destroyAllForSession(id);
      try {
        await sessionRouter.transitionRuntime(id, session.hosting, "terminate");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[session-service] failed to terminate session ${id} before delete: ${message}`);
      }
      sessionRouter.unbindSession(id);
    }

    let deletedSessionGroupId: string | null = null;
    await prisma.$transaction(async (tx) => {
      await tx.sessionProject.deleteMany({ where: { sessionId: id } });
      await tx.ticketLink.deleteMany({ where: { entityType: "session", entityId: id } });
      await tx.session.delete({ where: { id } });

      if (session.sessionGroupId && remainingCount === 0) {
          await tx.sessionGroup.delete({ where: { id: session.sessionGroupId } });
          deletedSessionGroupId = session.sessionGroupId;
      }
    });

    // Broadcast the deletion event (events are kept for audit trail)
    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: id,
      eventType: "session_deleted",
      payload: {
        sessionId: id,
        name: session.name,
        sessionGroupId: session.sessionGroupId ?? null,
        deletedSessionGroupId,
      },
      actorType,
      actorId,
    });

    return session;
  }

  private async transition(
    id: string,
    command: "pause" | "resume" | "terminate",
    newStatus: SessionStatus,
    eventType: EventType,
    actorType: ActorType,
    actorId: string,
  ) {
    const current = await prisma.session.findUniqueOrThrow({
      where: { id },
      select: { hosting: true, organizationId: true, status: true },
    });

    if (isFullyUnloadedSessionStatus(current.status)) {
      return prisma.session.findUniqueOrThrow({ where: { id }, include: SESSION_INCLUDE });
    }

    const deliveryResult = await sessionRouter.transitionRuntime(id, current.hosting, command);

    // For terminate, proceed regardless — we want the session marked as terminated
    // For pause/resume, only proceed if delivered or if terminating
    if (command !== "terminate" && deliveryResult !== "delivered") {
      await this.persistConnectionFailure(id, current.organizationId, deliveryResult, command);
      return prisma.session.findUniqueOrThrow({ where: { id }, include: SESSION_INCLUDE });
    }

    const session = await prisma.session.update({
      where: { id },
      data: { status: newStatus },
      include: SESSION_INCLUDE,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: id,
      eventType,
      payload: { sessionId: id, status: newStatus },
      actorType,
      actorId,
    });

    return session;
  }

  async updateConfig(
    sessionId: string,
    organizationId: string,
    config: { tool?: CodingTool; model?: string },
    actorType: ActorType,
    actorId: string,
  ) {
    const prev = await prisma.session.findFirstOrThrow({
      where: { id: sessionId, organizationId },
      select: { id: true, tool: true, model: true },
    });

    const toolChanged = config.tool != null && config.tool !== prev.tool;
    const nextTool = config.tool ?? prev.tool;
    const nextModel =
      config.model != null
        ? validateModelForTool(nextTool, config.model)
        : toolChanged
          ? (getDefaultModel(nextTool) ?? null)
          : undefined;

    const data: Record<string, unknown> = {};
    if (config.tool != null) data.tool = config.tool;
    if (nextModel !== undefined) data.model = nextModel;
    if (toolChanged) {
      data.toolChangedAt = new Date();
      data.toolSessionId = null;
    }

    const session = await prisma.session.update({
      where: { id: prev.id },
      data,
      include: SESSION_INCLUDE,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "config_changed",
        tool: config.tool ?? session.tool,
        model: nextModel !== undefined ? nextModel : session.model,
        toolChanged,
      },
      actorType,
      actorId,
    });

    return session;
  }

  async recordOutput(sessionId: string, data: Record<string, unknown>) {
    // Extract and strip <session-title> tags from assistant text before persisting
    const extractedTitle = this.extractAndStripTitle(data);

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { organizationId: true, status: true },
    });
    if (!session) return;

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: data as unknown as Prisma.InputJsonValue,
      actorType: "system",
      actorId: "system",
    });

    // If we found a title tag, update the session name
    if (extractedTitle) {
      await this.updateName(sessionId, extractedTitle);
    }

    // If this output contains a QuestionBlock or PlanBlock, transition to needs_input immediately.
    // Claude Code hangs waiting for stdin when AskUserQuestion/ExitPlanMode fires, so complete()
    // never runs — we detect it here instead.
    const needsInput = hasQuestionBlock(data) || hasPlanBlock(data);
    if (session.status === "active" && needsInput) {
      // Use status in the where clause to make this idempotent — if two
      // recordOutput calls race, only the first one that sees "active" wins.
      const updated = await prisma.session.updateMany({
        where: { id: sessionId, status: "active" },
        data: { status: "needs_input" },
      });

      // Only emit the pending event if we won the race — avoids duplicate events
      if (updated.count > 0) {
        // Emit as session_output with a status patch — matches the workspace_ready pattern.
        // The frontend's sessionPatchFromOutput picks up the status field.
        // Questions take precedence — they need immediate user interaction
        const pendingType = hasQuestionBlock(data) ? "question_pending" : "plan_pending";
        await eventService.create({
          organizationId: session.organizationId,
          scopeType: "session",
          scopeId: sessionId,
          eventType: "session_output",
          payload: { type: pendingType, status: "needs_input" },
          actorType: "system",
          actorId: "system",
        });

        // Create inbox item for the session creator
        const fullSession = await prisma.session.findUniqueOrThrow({
          where: { id: sessionId },
          select: { createdById: true, name: true },
        });

        await this.createInboxItemFromOutput({
          orgId: session.organizationId,
          userId: fullSession.createdById,
          sessionName: fullSession.name,
          sessionId,
          data,
        });
      }
    }
  }

  async updateName(sessionId: string, name: string) {
    const current = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        name: true,
        organizationId: true,
        sessionGroupId: true,
        sessionGroup: {
          select: { name: true },
        },
      },
    });

    const session = await prisma.session.update({
      where: { id: sessionId },
      data: { name },
      select: { organizationId: true },
    });

    const shouldSyncGroupName =
      current.sessionGroupId != null
      && current.sessionGroup?.name === current.name;
    const sessionGroup = shouldSyncGroupName && current.sessionGroupId
      ? await prisma.sessionGroup.update({
          where: { id: current.sessionGroupId },
          data: { name },
          select: SESSION_GROUP_SUMMARY_SELECT,
        })
      : null;

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "title_generated",
        name,
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId: "system",
    });
  }

  /**
   * Look for <session-title>…</session-title> in assistant text blocks.
   * If found, strip the tag from the text content (mutates data in place)
   * and return the extracted title. Returns null if no tag found.
   */
  private extractAndStripTitle(data: Record<string, unknown>): string | null {
    if (data.type !== "assistant") return null;

    const message = data.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (!Array.isArray(content)) return null;

    for (const block of content) {
      const b = block as Record<string, unknown>;
      if (b.type !== "text" || typeof b.text !== "string") continue;

      const match = TITLE_TAG_RE.exec(b.text);
      if (match) {
        const title = match[1].trim().slice(0, 80);
        // Strip the tag from the text so it doesn't show in the UI
        b.text = b.text.replace(TITLE_TAG_RE, "").trimStart();
        return title || null;
      }
    }

    return null;
  }

  async complete(id: string) {
    // Only transition from active — don't overwrite explicit user actions
    const current = await prisma.session.findUnique({ where: { id }, select: { status: true } });
    if (!current || current.status !== "active") return;

    // Find when the current run started (last session_resumed or session_started)
    const lastResume = await prisma.event.findFirst({
      where: {
        scopeId: id,
        scopeType: "session",
        eventType: { in: ["session_resumed", "session_started"] },
      },
      orderBy: { timestamp: "desc" },
    });

    // Only check session_output events from the current run
    const recentEvents = await prisma.event.findMany({
      where: {
        scopeId: id,
        scopeType: "session",
        eventType: "session_output",
        ...(lastResume && { timestamp: { gte: lastResume.timestamp } }),
      },
      orderBy: { timestamp: "desc" },
      take: 10,
    });

    const hasPendingPlan = recentEvents.some((evt) => {
      return hasPlanBlock(evt.payload as Record<string, unknown>);
    });

    // Safety net for adapters that exit cleanly after emitting a question
    // (Claude Code hangs on stdin so recordOutput handles it first, but other
    // adapters may reach complete() with a question still pending).
    const hasQuestion = recentEvents.some((evt) => {
      return hasQuestionBlock(evt.payload as Record<string, unknown>);
    });

    const newStatus = hasPendingPlan || hasQuestion ? "needs_input" : "completed";

    const session = await prisma.session.update({
      where: { id },
      data: { status: newStatus },
      select: { organizationId: true, createdById: true, name: true },
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: id,
      eventType: "session_terminated",
      payload: { sessionId: id, reason: "bridge_complete", status: newStatus },
      actorType: "system",
      actorId: "system",
    });

    // Create inbox item when complete() lands in needs_input
    if (newStatus === "needs_input") {
      // Find the event that triggered needs_input to extract question/plan data
      const triggerEvent = recentEvents.find((evt) => {
        const p = evt.payload as Record<string, unknown>;
        return hasQuestionBlock(p) || hasPlanBlock(p);
      });
      const triggerPayload = triggerEvent?.payload as Record<string, unknown> | undefined;

      if (triggerPayload) {
        await this.createInboxItemFromOutput({
          orgId: session.organizationId,
          userId: session.createdById,
          sessionName: session.name,
          sessionId: id,
          data: triggerPayload,
        });
      }
    }
  }

  async sendMessage(
    sessionId: string,
    text: string,
    actorType: ActorType,
    actorId: string,
    interactionMode?: string,
  ) {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        organizationId: true,
        status: true,
        tool: true,
        model: true,
        toolChangedAt: true,
        workdir: true,
        toolSessionId: true,
        repoId: true,
        connection: true,
        worktreeDeleted: true,
      },
    });

    if (isFullyUnloadedSessionStatus(session.status)) {
      throw new Error(`Cannot send follow-up messages to a ${session.status} session`);
    }

    if (session.worktreeDeleted) {
      throw new Error("Cannot send messages: session worktree has been deleted");
    }

    // If the tool was recently switched and no user message has been sent since,
    // prepend conversation history so the new coding tool has context.
    let prompt = text;
    if (session.toolChangedAt) {
      const msgSinceSwitch = await prisma.event.findFirst({
        where: {
          scopeId: sessionId,
          scopeType: "session",
          eventType: "message_sent",
          timestamp: { gt: session.toolChangedAt },
        },
      });
      if (!msgSinceSwitch) {
        const context = await buildConversationContext(sessionId);
        if (context) {
          prompt = `${context}\n\n${text}`;
        }
      }
    }

    if (!session.toolSessionId) {
      const startMeta = await getSessionStartMetadata(sessionId);
      prompt = await prependSourceSessionContext(startMeta.sourceSessionId, prompt);
    }

    // Append auto-save instruction for repo-based sessions
    prompt = appendAutoSave(prompt, !!session.repoId);

    // Attempt delivery before marking active
    const deliveryResult = sessionRouter.send(sessionId, {
      type: "send",
      sessionId,
      prompt,
      tool: session.tool,
      model: session.model ?? undefined,
      interactionMode,
      cwd: session.workdir ?? undefined,
      toolSessionId: session.toolSessionId ?? undefined,
    });

    if (deliveryResult !== "delivered") {
      await this.storePendingCommand(sessionId, {
        type: "send",
        prompt,
        interactionMode: interactionMode ?? null,
      });
      await this.persistConnectionFailure(
        sessionId,
        session.organizationId,
        deliveryResult,
        "send",
      );
      // Still record the message event so it's not lost
      const event = await eventService.create({
        organizationId: session.organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "message_sent",
        payload: { text, deliveryFailed: true },
        actorType,
        actorId,
      });
      return event;
    }

    // Only mark active after successful delivery
    // Persist the runtime binding so restoreSessionsForRuntime can recover it after restart
    const boundRuntime = sessionRouter.getRuntimeForSession(sessionId);
    const updatedSession = await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: "active",
        connection: this.mergeConnection(session.connection, {
          state: "connected",
          lastSeen: new Date().toISOString(),
          ...(boundRuntime && {
            runtimeInstanceId: boundRuntime.id,
            runtimeLabel: boundRuntime.label,
          }),
        }),
        pendingRun: Prisma.DbNull,
      },
      include: SESSION_INCLUDE,
    });
    const sessionGroup = await this.syncGroupWorkspaceState(updatedSession.sessionGroupId, {
      connection: updatedSession.connection as Prisma.InputJsonValue,
      worktreeDeleted: false,
    });

    // Resolve any inbox items for this session (leaving needs_input)
    await inboxService.resolveBySource({
      sourceType: "session",
      sourceId: sessionId,
      orgId: session.organizationId,
      resolution: text.slice(0, 200),
    });

    // Emit a resumed event so all clients see the status change
    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_resumed",
      payload: { sessionId, ...(sessionGroup ? { sessionGroup } : {}) },
      actorType,
      actorId,
    });

    const event = await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "message_sent",
      payload: { text },
      actorType,
      actorId,
    });

    return event;
  }

  async workspaceReady(sessionId: string, workdir: string, branch?: string) {
    // Read and clear pendingRun atomically in a transaction to prevent double-delivery
    const [session, pendingRun] = await prisma.$transaction(async (tx) => {
      const prev = await tx.session.findUniqueOrThrow({
        where: { id: sessionId },
        select: { pendingRun: true },
      });

      const updated = await tx.session.update({
        where: { id: sessionId },
        data: { status: "pending", workdir, ...(branch && { branch }), pendingRun: Prisma.DbNull },
        include: SESSION_INCLUDE,
      });

      return [updated, prev.pendingRun] as const;
    });
    const sessionGroup = await this.syncGroupWorkspaceState(session.sessionGroupId, {
      workdir,
      connection: session.connection as Prisma.InputJsonValue,
      worktreeDeleted: false,
      repoId: session.repoId ?? null,
      ...(branch !== undefined ? { branch } : {}),
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "workspace_ready",
        workdir,
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId: "system",
    });

    // If a run was queued while workspace was being prepared, execute it now
    if (pendingRun) {
      const replayResult = await this.deliverPendingCommand(sessionId, pendingRun);
      if (replayResult && replayResult !== "delivered") {
        await this.persistConnectionFailure(
          sessionId,
          session.organizationId,
          replayResult,
          "workspace_replay",
        );
      }
    }
  }

  async workspaceFailed(sessionId: string, error: string) {
    const session = await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: "failed",
        workdir: null,
        worktreeDeleted: true,
        pendingRun: Prisma.DbNull,
        connection: connJson(defaultConnection({ state: "disconnected", lastError: error })),
      },
      include: SESSION_INCLUDE,
    });
    const sessionGroup = await this.syncGroupWorkspaceState(session.sessionGroupId, {
      workdir: null,
      connection: session.connection as Prisma.InputJsonValue,
      worktreeDeleted: true,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_terminated",
      payload: {
        sessionId,
        reason: "workspace_failed",
        error,
        worktreeDeleted: true,
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId: "system",
    });
  }

  // ─── Connection Management ───

  async markConnectionLost(sessionId: string, reason: string, runtimeInstanceId?: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { organizationId: true, status: true, connection: true, sessionGroupId: true },
    });
    if (!session) return;

    // Fully unloaded sessions are excluded from reconnect/disconnect handling.
    if (isFullyUnloadedSessionStatus(session.status)) return;

    const conn = this.parseConnection(session.connection);
    const updated: SessionConnectionData = {
      ...conn,
      state: "disconnected",
      lastError: reason,
      runtimeInstanceId: runtimeInstanceId ?? conn.runtimeInstanceId,
      canRetry: true,
      canMove: true,
    };

    await prisma.session.update({
      where: { id: sessionId },
      data: { connection: connJson(updated) },
    });
    const sessionGroup = await this.syncGroupWorkspaceState(session.sessionGroupId, {
      connection: connJson(updated),
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "connection_lost",
        reason,
        runtimeInstanceId,
        connection: connJson(updated),
        sessionStatus: session.status,
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId: "system",
    });
  }

  async markConnectionRestored(sessionId: string, runtimeInstanceId: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { organizationId: true, connection: true, sessionGroupId: true },
    });
    if (!session) return;

    const conn = this.parseConnection(session.connection);
    const updated: SessionConnectionData = {
      ...conn,
      state: "connected",
      runtimeInstanceId,
      runtimeLabel: sessionRouter.getRuntime(runtimeInstanceId)?.label ?? conn.runtimeLabel,
      lastSeen: new Date().toISOString(),
      lastError: undefined,
      canRetry: true,
      canMove: true,
    };

    await prisma.session.update({
      where: { id: sessionId },
      data: { connection: connJson(updated) },
    });
    const sessionGroup = await this.syncGroupWorkspaceState(session.sessionGroupId, {
      connection: connJson(updated),
      worktreeDeleted: false,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "connection_restored",
        runtimeInstanceId,
        connection: connJson(updated),
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId: "system",
    });
  }

  /**
   * When a runtime connects, restore all sessions it previously owned except fully unloaded ones.
   * The DB (connection.runtimeInstanceId) is the single source of truth for ownership.
   * Excludes fully unloaded statuses (failed, merged).
   */
  async restoreSessionsForRuntime(runtimeId: string) {
    const runtime = sessionRouter.getRuntime(runtimeId);
    if (!runtime) return;
    runtimeDebug("restoreSessionsForRuntime begin", { runtimeId, runtimeLabel: runtime.label });

    const sessions = await prisma.session.findMany({
      where: {
        status: { notIn: [...FULLY_UNLOADED_SESSION_STATUSES] },
        connection: { path: ["runtimeInstanceId"], equals: runtimeId },
      },
      select: { id: true, connection: true },
    });

    runtimeDebug("restoreSessionsForRuntime loaded sessions", {
      runtimeId,
      sessionIds: sessions.map((session) => session.id),
    });

    for (const session of sessions) {
      sessionRouter.bindSession(session.id, runtimeId);

      // Only emit connection_restored for sessions that were disconnected
      const conn = this.parseConnection(session.connection);
      if (conn.state === "disconnected") {
        await this.markConnectionRestored(session.id, runtimeId);
      }
    }
  }

  async storeToolSessionId(sessionId: string, toolSessionId: string) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { toolSessionId },
    });
  }

  async retryConnection(
    sessionId: string,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    const session = await prisma.session.findFirstOrThrow({
      where: { id: sessionId, organizationId },
      include: SESSION_INCLUDE,
    });

    if (isFullyUnloadedSessionStatus(session.status)) {
      return session;
    }

    const conn = this.parseConnection(session.connection);

    // Emit retry requested event
    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: { type: "recovery_requested", retryCount: conn.retryCount + 1 },
      actorType,
      actorId,
    });

    // Try to find a runtime to bind to
    const runtime = conn.runtimeInstanceId
      ? (sessionRouter.getRuntimeForSession(sessionId) ?? sessionRouter.getDefaultRuntime())
      : sessionRouter.getDefaultRuntime();

    if (!runtime) {
      const failedConn: SessionConnectionData = {
        ...conn,
        state: "disconnected",
        retryCount: conn.retryCount + 1,
        lastError: "No runtime available",
        lastDeliveryFailureAt: new Date().toISOString(),
        canRetry: true,
        canMove: true,
      };
      await prisma.session.update({
        where: { id: sessionId },
        data: { connection: connJson(failedConn) },
      });
      const sessionGroup = await this.syncGroupWorkspaceState(session.sessionGroupId, {
        connection: connJson(failedConn),
      });

      await eventService.create({
        organizationId: session.organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "session_output",
        payload: {
          type: "recovery_failed",
          reason: "no_runtime",
          connection: connJson(failedConn),
          ...(sessionGroup ? { sessionGroup } : {}),
        },
        actorType: "system",
        actorId: "system",
      });

      return prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
        include: SESSION_INCLUDE,
      });
    }

    // Bind and attempt workspace setup if needed
    sessionRouter.bindSession(sessionId, runtime.id);

    if (session.repo) {
      // Re-run workspace preparation
      const prepResult = sessionRouter.send(sessionId, {
        type: "prepare",
        sessionId,
        repoId: session.repo.id,
        repoName: session.repo.name,
        repoRemoteUrl: session.repo.remoteUrl,
        defaultBranch: session.repo.defaultBranch,
        branch: session.branch ?? undefined,
      });

      if (prepResult !== "delivered") {
        await this.persistConnectionFailure(
          sessionId,
          session.organizationId,
          prepResult,
          "retry_prepare",
        );
        return prisma.session.findUniqueOrThrow({
          where: { id: sessionId },
          include: SESSION_INCLUDE,
        });
      }

      // Mark as creating — workspace_ready callback will transition to pending
      const restoredConn: SessionConnectionData = {
        ...conn,
        state: "connected",
        runtimeInstanceId: runtime.id,
        runtimeLabel: runtime.label,
        lastSeen: new Date().toISOString(),
        lastError: undefined,
        retryCount: conn.retryCount + 1,
      };

      const updated = await prisma.session.update({
        where: { id: sessionId },
        data: {
          status: "creating",
          connection: connJson(restoredConn),
        },
        include: SESSION_INCLUDE,
      });
      const sessionGroup = await this.syncGroupWorkspaceState(updated.sessionGroupId, {
        connection: connJson(restoredConn),
        worktreeDeleted: false,
      });

      await eventService.create({
        organizationId: session.organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "session_output",
        payload: {
          type: "connection_restored",
          runtimeInstanceId: runtime.id,
          connection: connJson(restoredConn),
          ...(sessionGroup ? { sessionGroup } : {}),
        },
        actorType: "system",
        actorId: "system",
      });

      return updated;
    }

    // No repo — just restore connection
    const restoredConn: SessionConnectionData = {
      ...conn,
      state: "connected",
      runtimeInstanceId: runtime.id,
      runtimeLabel: runtime.label,
      lastSeen: new Date().toISOString(),
      lastError: undefined,
      retryCount: conn.retryCount + 1,
    };

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: "pending",
        connection: connJson(restoredConn),
      },
      include: SESSION_INCLUDE,
    });
    const sessionGroup = await this.syncGroupWorkspaceState(updated.sessionGroupId, {
      connection: connJson(restoredConn),
      worktreeDeleted: false,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "connection_restored",
        runtimeInstanceId: runtime.id,
        connection: connJson(restoredConn),
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId: "system",
    });

    const pending = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { pendingRun: true },
    });
    if (pending?.pendingRun) {
      const replayResult = await this.deliverPendingCommand(sessionId, pending.pendingRun);
      if (replayResult && replayResult !== "delivered") {
        await this.persistConnectionFailure(
          sessionId,
          session.organizationId,
          replayResult,
          "retry_replay",
        );
      }
      return prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
        include: SESSION_INCLUDE,
      });
    }

    return updated;
  }

  private async completeRehomedSourceSession(params: {
    sessionId: string;
    hosting: "cloud" | "local";
    organizationId: string;
    actorType: ActorType;
    actorId: string;
  }) {
    const { sessionId, hosting, organizationId, actorType, actorId } = params;

    terminalRelay.destroyAllForSession(sessionId);

    try {
      await sessionRouter.transitionRuntime(sessionId, hosting, "terminate");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[session-service] failed to terminate rehomed session ${sessionId}: ${message}`);
    }

    sessionRouter.unbindSession(sessionId);

    await prisma.session.update({
      where: { id: sessionId },
      data: { status: "completed" },
    });

    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_terminated",
      payload: {
        sessionId,
        status: "completed",
      },
      actorType,
      actorId,
    });
  }

  async moveToRuntime(
    sessionId: string,
    runtimeInstanceId: string,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    const session = await prisma.session.findFirstOrThrow({
      where: { id: sessionId, organizationId },
      include: { ...SESSION_INCLUDE, projects: true },
    });

    // Fetch ticket links for this session
    const ticketLinks = await prisma.ticketLink.findMany({
      where: { entityType: "session", entityId: sessionId },
    });

    if (isFullyUnloadedSessionStatus(session.status)) {
      throw new Error(`Cannot move a ${session.status} session`);
    }
    const targetRuntime = sessionRouter.getRuntime(runtimeInstanceId);
    if (!targetRuntime || targetRuntime.ws.readyState !== targetRuntime.ws.OPEN) {
      throw new Error("Selected runtime is not available");
    }
    if (!targetRuntime.supportedTools.includes(session.tool)) {
      throw new Error("Selected runtime does not support this tool");
    }

    // Build conversation context from the old session
    const context = await buildConversationContext(sessionId);
    const bootstrapPrompt = buildMigrationPrompt(context);

    // Create child session and copy ticket links in a single transaction
    const childSession = await prisma.$transaction(async (tx) => {
      const child = await tx.session.create({
        data: {
          name: session.name,
          status: session.repoId ? "creating" : "pending",
          tool: session.tool,
          model: session.model ?? undefined,
          hosting: targetRuntime.hostingMode,
          organizationId: session.organizationId,
          createdById: actorId,
          repoId: session.repoId ?? undefined,
          branch: session.branch ?? undefined,
          channelId: session.channelId ?? undefined,
          sessionGroupId: session.sessionGroupId ?? undefined,
          workdir: session.repoId ? undefined : session.workdir ?? undefined,
          pendingRun: {
            type: "run",
            prompt: bootstrapPrompt,
            interactionMode: null,
          } satisfies PendingSessionCommand,
          connection: connJson(
            defaultConnection({
              runtimeInstanceId,
              runtimeLabel: targetRuntime.label,
            }),
          ),
          ...(session.projects.length > 0 && {
            projects: {
              create: session.projects.map((sp: { projectId: string }) => ({
                projectId: sp.projectId,
              })),
            },
          }),
        },
        include: SESSION_INCLUDE,
      });

      if (ticketLinks.length > 0) {
        await tx.ticketLink.createMany({
          data: ticketLinks.map((tl) => ({
            ticketId: tl.ticketId,
            entityType: "session",
            entityId: child.id,
          })),
          skipDuplicates: true,
        });
      }

      return child;
    });
    await this.syncGroupWorkspaceState(session.sessionGroupId, {
      workdir: childSession.repo ? null : session.workdir ?? null,
      connection: childSession.connection as Prisma.InputJsonValue,
      worktreeDeleted: false,
    });

    // Bind the child session to the target runtime
    sessionRouter.bindSession(childSession.id, runtimeInstanceId);

    // Emit session_started for the child
    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: childSession.id,
      eventType: "session_started",
      payload: {
        session: serializeSession(childSession),
        prompt: bootstrapPrompt,
        sourceSessionId: sessionId,
        movedFromSessionId: sessionId,
      } as Prisma.InputJsonValue,
      actorType,
      actorId,
    });

    // Provision the runtime on the target
    if (childSession.repo || targetRuntime.hostingMode === "cloud") {
      sessionRouter.createRuntime({
        sessionId: childSession.id,
        hosting: targetRuntime.hostingMode,
        tool: childSession.tool,
        model: childSession.model ?? undefined,
        repo: childSession.repo
          ? {
              id: childSession.repo.id,
              name: childSession.repo.name,
              remoteUrl: childSession.repo.remoteUrl,
              defaultBranch: childSession.repo.defaultBranch,
            }
          : null,
        branch: childSession.branch ?? undefined,
        createdById: actorId,
        organizationId: childSession.organizationId,
        onFailed: (error) => this.workspaceFailed(childSession.id, error),
        onWorkspaceReady: (workdir) => this.workspaceReady(childSession.id, workdir),
      });
    } else {
      const deliveryResult = await this.deliverPendingCommand(
        childSession.id,
        childSession.pendingRun,
      );
      if (deliveryResult && deliveryResult !== "delivered") {
        await this.persistConnectionFailure(
          childSession.id,
          childSession.organizationId,
          deliveryResult,
          "move_run",
        );
      }
    }

    // Emit rehome event on old session
    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "session_rehomed",
        newSessionId: childSession.id,
        runtimeInstanceId,
      },
      actorType,
      actorId,
    });

    await this.completeRehomedSourceSession({
      sessionId,
      hosting: session.hosting as "cloud" | "local",
      organizationId: session.organizationId,
      actorType,
      actorId,
    });

    return childSession;
  }

  /**
   * Move a session to a cloud runtime. Provisions a cloud machine on-demand
   * and creates a child session bound to it.
   */
  async moveToCloud(
    sessionId: string,
    organizationId: string,
    actorType: ActorType,
    actorId: string,
  ) {
    const session = await prisma.session.findFirstOrThrow({
      where: { id: sessionId, organizationId },
      include: { ...SESSION_INCLUDE, projects: true },
    });

    // Fetch ticket links for this session
    const ticketLinks = await prisma.ticketLink.findMany({
      where: { entityType: "session", entityId: sessionId },
    });

    if (isFullyUnloadedSessionStatus(session.status)) {
      throw new Error(`Cannot move a ${session.status} session`);
    }

    // Build conversation context from the old session
    const context = await buildConversationContext(sessionId);
    const bootstrapPrompt = buildMigrationPrompt(context);

    // Create child session and copy ticket links in a single transaction
    const childSession = await prisma.$transaction(async (tx) => {
      const child = await tx.session.create({
        data: {
          name: session.name,
          status: "creating",
          tool: session.tool,
          model: session.model ?? undefined,
          hosting: "cloud",
          organizationId: session.organizationId,
          createdById: actorId,
          repoId: session.repoId ?? undefined,
          branch: session.branch ?? undefined,
          channelId: session.channelId ?? undefined,
          sessionGroupId: session.sessionGroupId ?? undefined,
          workdir: session.repoId ? undefined : session.workdir ?? undefined,
          pendingRun: {
            type: "run",
            prompt: bootstrapPrompt,
            interactionMode: null,
          } satisfies PendingSessionCommand,
          connection: connJson(defaultConnection()),
          ...(session.projects.length > 0 && {
            projects: {
              create: session.projects.map((sp: { projectId: string }) => ({
                projectId: sp.projectId,
              })),
            },
          }),
        },
        include: SESSION_INCLUDE,
      });

      if (ticketLinks.length > 0) {
        await tx.ticketLink.createMany({
          data: ticketLinks.map((tl) => ({
            ticketId: tl.ticketId,
            entityType: "session",
            entityId: child.id,
          })),
          skipDuplicates: true,
        });
      }

      return child;
    });
    await this.syncGroupWorkspaceState(session.sessionGroupId, {
      workdir: childSession.repo ? null : session.workdir ?? null,
      connection: childSession.connection as Prisma.InputJsonValue,
      worktreeDeleted: false,
    });

    // Emit session_started for the child
    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: childSession.id,
      eventType: "session_started",
      payload: {
        session: serializeSession(childSession),
        prompt: bootstrapPrompt,
        sourceSessionId: sessionId,
        movedFromSessionId: sessionId,
      } as Prisma.InputJsonValue,
      actorType,
      actorId,
    });

    // Provision cloud runtime — the CloudAdapter handles VM creation,
    // waiting for bridge connection, and workspace setup.
    sessionRouter.createRuntime({
      sessionId: childSession.id,
      hosting: "cloud",
      tool: childSession.tool,
      model: childSession.model ?? undefined,
      repo: childSession.repo
        ? {
            id: childSession.repo.id,
            name: childSession.repo.name,
            remoteUrl: childSession.repo.remoteUrl,
            defaultBranch: childSession.repo.defaultBranch,
          }
        : null,
      branch: childSession.branch ?? undefined,
      createdById: actorId,
      organizationId: childSession.organizationId,
      onFailed: (error) => this.workspaceFailed(childSession.id, error),
      onWorkspaceReady: (workdir) => this.workspaceReady(childSession.id, workdir),
    });

    // Emit rehome event on old session
    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "session_rehomed",
        newSessionId: childSession.id,
        runtimeInstanceId: null,
      },
      actorType,
      actorId,
    });

    await this.completeRehomedSourceSession({
      sessionId,
      hosting: session.hosting as "cloud" | "local",
      organizationId: session.organizationId,
      actorType,
      actorId,
    });

    return childSession;
  }

  async listRuntimesForTool(tool: string, organizationId: string) {
    // Only return local runtimes — cloud is always offered as a single
    // "Cloud" option by the UI, and the adapter auto-provisions the
    // user's own cloud machine on demand.
    const diagnostics = sessionRouter.getRuntimeDiagnostics();
    runtimeDebug("availableRuntimes query received", {
      tool,
      organizationId,
      runtimeDiagnostics: diagnostics,
    });

    const allRuntimes = sessionRouter
      .listRuntimes()
      .filter(
        (runtime) => runtime.hostingMode === "local" && runtime.supportedTools.includes(tool),
      );

    const sessionIds = allRuntimes.flatMap((runtime) => [...runtime.boundSessions]);
    const sessions =
      sessionIds.length === 0
        ? []
        : await prisma.session.findMany({
            where: {
              id: { in: sessionIds },
              organizationId,
            },
            select: { id: true },
          });
    const orgSessionIds = new Set(sessions.map((session) => session.id));

    const result = allRuntimes.map((r) => ({
      id: r.id,
      label: r.label,
      hostingMode: r.hostingMode,
      supportedTools: r.supportedTools,
      connected: r.ws.readyState === r.ws.OPEN,
      sessionCount: [...r.boundSessions].filter((sessionId) => orgSessionIds.has(sessionId)).length,
      registeredRepoIds: r.registeredRepoIds,
    }));

    runtimeDebug("availableRuntimes query resolved", {
      tool,
      organizationId,
      result,
    });

    return result;
  }

  async listAvailableRuntimes(sessionId: string, organizationId: string) {
    const session = await prisma.session.findFirstOrThrow({
      where: { id: sessionId, organizationId },
      select: { tool: true },
    });
    return this.listRuntimesForTool(session.tool, organizationId);
  }

  /** List branches for a repo by delegating to the bridge runtime. */
  async listBranches(
    repoId: string,
    organizationId: string,
    runtimeInstanceId?: string,
  ): Promise<string[]> {
    const repo = await prisma.repo.findFirst({
      where: { id: repoId, organizationId },
      select: { id: true },
    });
    if (!repo) throw new Error("Repo not found");
    const runtimeId = runtimeInstanceId ?? sessionRouter.getRuntimeForRepo(repoId)?.id;
    if (!runtimeId) throw new Error("No connected runtime available for this repo");
    return sessionRouter.listBranches(runtimeId, repoId);
  }

  // ─── Helpers ───

  /**
   * Extract plan/question data from a session_output payload and create an inbox item.
   */
  private async createInboxItemFromOutput(params: {
    orgId: string;
    userId: string;
    sessionName: string;
    sessionId: string;
    data: Record<string, unknown>;
  }) {
    const { orgId, userId, sessionName, sessionId, data } = params;
    const messageContent = (data.message as Record<string, unknown> | undefined)?.content as
      | Array<Record<string, unknown>>
      | undefined;

    const isQuestion = hasQuestionBlock(data);

    const questionBlock = isQuestion
      ? (messageContent?.find((b) => b.type === "question") as
          | { questions: Array<Record<string, unknown>> }
          | undefined)
      : undefined;

    const planBlock = !isQuestion
      ? (messageContent?.find((b) => b.type === "plan") as { content?: string } | undefined)
      : undefined;
    const planText = planBlock?.content;

    const summary = isQuestion
      ? (questionBlock?.questions?.[0]?.question as string | undefined)
      : planText?.slice(0, 200);

    await inboxService.createItem({
      orgId,
      userId,
      itemType: isQuestion ? "question" : "plan",
      title: sessionName,
      summary,
      payload: {
        planContent: planText ?? null,
        questions: questionBlock?.questions ?? null,
      } as unknown as Prisma.InputJsonValue,
      sourceType: "session",
      sourceId: sessionId,
    });
  }

  private parseConnection(raw: unknown): SessionConnectionData {
    if (!raw || typeof raw !== "object") return defaultConnection();
    return defaultConnection(raw as Partial<SessionConnectionData>);
  }

  private async syncGroupWorkspaceState(
    sessionGroupId: string | null | undefined,
    patch: GroupWorkspaceStatePatch,
  ) {
    if (!sessionGroupId) return null;

    const groupData: Prisma.SessionGroupUncheckedUpdateInput = {};
    const sessionData: Prisma.SessionUpdateManyMutationInput = {};

    if (Object.prototype.hasOwnProperty.call(patch, "workdir")) {
      groupData.workdir = patch.workdir ?? null;
      sessionData.workdir = patch.workdir ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "connection")) {
      const connectionValue = patch.connection ?? Prisma.DbNull;
      groupData.connection = connectionValue;
      sessionData.connection = connectionValue;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "prUrl")) {
      groupData.prUrl = patch.prUrl ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "repoId")) {
      groupData.repoId = patch.repoId ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "branch")) {
      groupData.branch = patch.branch ?? null;
      sessionData.branch = patch.branch ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "worktreeDeleted")) {
      groupData.worktreeDeleted = patch.worktreeDeleted ?? false;
      sessionData.worktreeDeleted = patch.worktreeDeleted ?? false;
    }

    const shouldMirrorToSessions = Object.keys(sessionData).length > 0;

    return prisma.$transaction(async (tx) => {
      const sessionGroup = await tx.sessionGroup.update({
        where: { id: sessionGroupId },
        data: groupData,
        select: SESSION_GROUP_SUMMARY_SELECT,
      });

      if (shouldMirrorToSessions) {
        await tx.session.updateMany({
          where: { sessionGroupId },
          data: sessionData,
        });
      }

      return sessionGroup;
    });
  }

  private mergeConnection(
    existing: unknown,
    patch: Partial<SessionConnectionData>,
  ): Prisma.InputJsonValue {
    const conn = this.parseConnection(existing);
    return connJson({ ...conn, ...patch });
  }

  private parsePendingCommand(raw: unknown): PendingSessionCommand | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const pending = raw as Record<string, unknown>;
    if (pending.type === "send" && typeof pending.prompt === "string") {
      return {
        type: "send",
        prompt: pending.prompt,
        interactionMode:
          typeof pending.interactionMode === "string" ? pending.interactionMode : null,
      };
    }
    if (pending.type === "run" || pending.type == null) {
      return {
        type: "run",
        prompt: typeof pending.prompt === "string" ? pending.prompt : null,
        interactionMode:
          typeof pending.interactionMode === "string" ? pending.interactionMode : null,
      };
    }
    return null;
  }

  private async storePendingCommand(sessionId: string, pending: PendingSessionCommand) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { pendingRun: pending as unknown as Prisma.InputJsonValue },
    });
  }

  private async deliverPendingCommand(
    sessionId: string,
    rawPending: unknown,
  ): Promise<DeliveryResult | null> {
    const pending = this.parsePendingCommand(rawPending);
    if (!pending) return null;

    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        organizationId: true,
        tool: true,
        model: true,
        workdir: true,
        toolSessionId: true,
        repoId: true,
        connection: true,
        sessionGroupId: true,
      },
    });

    // If no tool session ID exists, prepend conversation context so the new
    // process has the full history (same pattern as tool-switch).
    let prompt = pending.prompt;
    if (!session.toolSessionId && prompt) {
      const context = await buildConversationContext(sessionId);
      if (context) {
        prompt = `${context}\n\n${prompt}`;
      }
    }

    // Append auto-save instruction for repo-based sessions
    if (prompt) {
      prompt = appendAutoSave(prompt, !!session.repoId);
    }

    const command = {
      type: pending.type,
      sessionId,
      prompt: prompt ?? undefined,
      tool: session.tool,
      model: session.model ?? undefined,
      interactionMode: pending.interactionMode ?? undefined,
      cwd: session.workdir ?? undefined,
      toolSessionId: session.toolSessionId ?? undefined,
    } satisfies {
      type: "run" | "send";
      sessionId: string;
      prompt?: string;
      tool: CodingTool;
      model?: string;
      interactionMode?: string;
      cwd?: string;
      toolSessionId?: string;
    };

    const deliveryResult = sessionRouter.send(sessionId, command);
    if (deliveryResult !== "delivered") {
      return deliveryResult;
    }

    const boundRuntime = sessionRouter.getRuntimeForSession(sessionId);
    const updatedSession = await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: "active",
        pendingRun: Prisma.DbNull,
        connection: this.mergeConnection(session.connection, {
          state: "connected",
          lastSeen: new Date().toISOString(),
          lastError: undefined,
          ...(boundRuntime && {
            runtimeInstanceId: boundRuntime.id,
            runtimeLabel: boundRuntime.label,
          }),
        }),
      },
      include: SESSION_INCLUDE,
    });
    const sessionGroup = await this.syncGroupWorkspaceState(updatedSession.sessionGroupId, {
      connection: updatedSession.connection as Prisma.InputJsonValue,
      worktreeDeleted: false,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_resumed",
      payload: { sessionId, ...(sessionGroup ? { sessionGroup } : {}) },
      actorType: "system",
      actorId: "system",
    });

    return "delivered";
  }

  private async persistConnectionFailure(
    sessionId: string,
    organizationId: string,
    deliveryResult: DeliveryResult,
    operation: string,
  ) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { status: true, connection: true, sessionGroupId: true },
    });
    if (session?.status && isFullyUnloadedSessionStatus(session.status)) return;
    const conn = this.parseConnection(session?.connection);

    const updated: SessionConnectionData = {
      ...conn,
      state: "disconnected",
      lastError: `${operation}: ${deliveryResult}`,
      lastDeliveryFailureAt: new Date().toISOString(),
      retryCount: conn.retryCount + 1,
      canRetry: true,
      canMove: true,
    };

    await prisma.session.update({
      where: { id: sessionId },
      data: { connection: connJson(updated) },
    });
    const sessionGroup = await this.syncGroupWorkspaceState(session?.sessionGroupId, {
      connection: connJson(updated),
    });

    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "connection_lost",
        reason: deliveryResult,
        operation,
        connection: connJson(updated),
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId: "system",
    });
  }

  private async fullyUnloadSession(sessionId: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        hosting: true,
        workdir: true,
        repoId: true,
        connection: true,
        sessionGroupId: true,
      },
    });
    if (!session) return;

    if (session.sessionGroupId) {
      terminalRelay.destroyAllForSessionGroup(session.sessionGroupId);
    } else {
      terminalRelay.destroyAllForSession(sessionId);
    }

    try {
      await sessionRouter.destroyRuntime(sessionId, session);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[session-service] failed to unload session ${sessionId}: ${message}`);
    }

    await this.syncGroupWorkspaceState(session.sessionGroupId, {
      workdir: null,
      worktreeDeleted: true,
    });
  }

  /** Set prUrl on the active session group when a PR is opened for its current branch. */
  async markPrOpened(params: {
    sessionGroupId: string;
    eventSessionId: string;
    prUrl: string;
    organizationId: string;
  }) {
    const { sessionGroupId, eventSessionId, prUrl, organizationId } = params;

    const sessionGroup = await this.syncGroupWorkspaceState(sessionGroupId, {
      prUrl,
    });

    if (!sessionGroup) return;

    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: eventSessionId,
      eventType: "session_pr_opened",
      payload: { sessionId: eventSessionId, prUrl, sessionGroup },
      actorType: "system",
      actorId: "github-webhook",
    });
  }

  /** Clear prUrl on the active session group when its current PR is closed without merging. */
  async markPrClosed(params: {
    sessionGroupId: string;
    eventSessionId: string;
    prUrl: string;
    organizationId: string;
  }) {
    const { sessionGroupId, eventSessionId, prUrl, organizationId } = params;

    const group = await prisma.sessionGroup.findUnique({
      where: { id: sessionGroupId },
      select: { prUrl: true },
    });
    if (!group?.prUrl || group.prUrl !== prUrl) return;

    const sessionGroup = await this.syncGroupWorkspaceState(sessionGroupId, {
      prUrl: null,
    });

    if (!sessionGroup) return;

    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: eventSessionId,
      eventType: "session_pr_closed",
      payload: { sessionId: eventSessionId, sessionGroup },
      actorType: "system",
      actorId: "github-webhook",
    });
  }

  /** Transition the active session group to merged when its current PR is merged. */
  async markPrMerged(params: {
    sessionGroupId: string;
    eventSessionId: string;
    prUrl: string;
    organizationId: string;
  }) {
    const { sessionGroupId, eventSessionId, prUrl, organizationId } = params;

    const group = await prisma.sessionGroup.findUnique({
      where: { id: sessionGroupId },
      select: { prUrl: true },
    });
    if (group?.prUrl && group.prUrl !== prUrl) return;

    // Atomic conditional update — skip if already merged
    const { count } = await prisma.session.updateMany({
      where: { id: eventSessionId, status: { not: "merged" } },
      data: { status: "merged" },
    });

    if (count === 0) {
      const existing = await prisma.session.findUnique({
        where: { id: eventSessionId },
        select: { status: true },
      });
      if (existing?.status === "merged") {
        await this.fullyUnloadSession(eventSessionId);
      }
      return;
    }

    const sessionGroup = await this.syncGroupWorkspaceState(sessionGroupId, {
      prUrl,
      workdir: null,
      worktreeDeleted: true,
    });

    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: eventSessionId,
      eventType: "session_pr_merged",
      payload: {
        sessionId: eventSessionId,
        prUrl,
        status: "merged",
        worktreeDeleted: true,
        ...(sessionGroup ? { sessionGroup } : {}),
      },
      actorType: "system",
      actorId: "github-webhook",
    });

    await this.fullyUnloadSession(eventSessionId);
  }
}

export const sessionService = new SessionService();
