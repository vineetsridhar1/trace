import type { StartSessionInput, ActorType } from "@trace/gql";
import type { SessionStatus, EventType, CodingTool } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { sessionRouter, type DeliveryResult } from "../lib/session-router.js";

export type StartSessionServiceInput = StartSessionInput & {
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

const SESSION_INCLUDE = { createdBy: true, repo: true, channel: true, parentSession: true, childSessions: true } as const;

/** Instruction appended to the initial session prompt so the AI generates a title inline. */
const TITLE_INSTRUCTION = `\n\nIMPORTANT: At the very beginning of your first response, output a short title (5-8 words) for this task wrapped in XML tags like this: <session-title>Your title here</session-title>. Then continue with your normal response.`;

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

export class SessionService {
  async list(organizationId: string, filters?: { status?: string | null; tool?: string | null; repoId?: string | null; channelId?: string | null }) {
    const where: Record<string, unknown> = { organizationId };
    if (filters?.status) where.status = filters.status;
    if (filters?.tool) where.tool = filters.tool;
    if (filters?.repoId) where.repoId = filters.repoId;
    if (filters?.channelId) where.channelId = filters.channelId;
    return prisma.session.findMany({ where, orderBy: { updatedAt: "desc" }, include: SESSION_INCLUDE });
  }

  async get(id: string) {
    return prisma.session.findUnique({ where: { id }, include: SESSION_INCLUDE });
  }

  async listByUser(organizationId: string, userId: string, status?: string | null) {
    const where: Record<string, unknown> = { organizationId, createdById: userId };
    if (status) where.status = status;
    return prisma.session.findMany({ where, orderBy: { updatedAt: "desc" }, include: SESSION_INCLUDE });
  }

  async start(input: StartSessionServiceInput) {
    const name = input.prompt
      ? input.prompt.slice(0, 80)
      : `Session ${new Date().toLocaleString()}`;

    // If a repo is selected, start in "creating" status to prepare workspace
    const needsWorkspace = !!input.repoId;
    const initialStatus = needsWorkspace ? "creating" : "pending";

    // Resolve hosting mode: if a runtime is specified, derive from it; otherwise use explicit value or default to cloud
    let hosting = input.hosting ?? "cloud";
    if (input.runtimeInstanceId) {
      const runtime = sessionRouter.getRuntime(input.runtimeInstanceId);
      if (runtime) {
        hosting = runtime.hostingMode;
      }
    }

    const [session] = await prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          name,
          status: initialStatus,
          tool: input.tool,
          model: input.model ?? undefined,
          hosting,
          organizationId: input.organizationId,
          createdById: input.createdById,
          repoId: input.repoId ?? undefined,
          branch: input.branch ?? undefined,
          channelId: input.channelId ?? undefined,
          parentSessionId: input.parentSessionId ?? undefined,
          connection: connJson(defaultConnection()),
          ...(input.projectId && {
            projects: { create: { projectId: input.projectId } },
          }),
        },
        include: SESSION_INCLUDE,
      });

      const event = await eventService.create({
        organizationId: input.organizationId,
        scopeType: "session",
        scopeId: session.id,
        eventType: "session_started",
        payload: {
          session: {
            id: session.id,
            name: session.name,
            status: session.status,
            tool: session.tool,
            model: session.model,
            hosting: session.hosting,
            createdBy: session.createdBy,
            repo: session.repo ?? null,
            branch: session.branch ?? null,
            channel: session.channel,
            parentSession: session.parentSession ?? null,
            childSessions: session.childSessions ?? [],
            connection: session.connection,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
          },
          prompt: input.prompt ?? null,
        },
        actorType: "user",
        actorId: input.createdById,
      }, tx);

      return [session, event] as const;
    });

    // Pre-bind to the requested runtime so subsequent commands route to it
    if (input.runtimeInstanceId) {
      sessionRouter.bindSession(session.id, input.runtimeInstanceId);
    }

    // If repo selected, send prepare command to bridge for worktree creation
    if (needsWorkspace && session.repo) {
      const result = sessionRouter.send(session.id, {
        type: "prepare",
        sessionId: session.id,
        repoId: session.repo.id,
        repoName: session.repo.name,
        repoRemoteUrl: session.repo.remoteUrl,
        defaultBranch: session.repo.defaultBranch,
        branch: input.branch ?? undefined,
      });

      if (result !== "delivered") {
        await this.persistConnectionFailure(session.id, session.organizationId, result, "prepare");
      }
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
        data: { pendingRun: { type: "run", prompt: prompt ?? null, interactionMode: interactionMode ?? null } },
        include: SESSION_INCLUDE,
      });
      return updated;
    }

    // Don't run if session is in a terminal state (e.g. workspace preparation failed)
    if (session.status === "failed" || session.status === "completed") {
      return session;
    }

    // If no prompt provided, retrieve the original prompt from the session_started event
    let resolvedPrompt = prompt;
    if (!resolvedPrompt) {
      const startEvent = await prisma.event.findFirst({
        where: { scopeId: id, scopeType: "session", eventType: "session_started" },
        orderBy: { timestamp: "asc" },
      });
      if (startEvent) {
        const payload = startEvent.payload as Record<string, unknown>;
        resolvedPrompt = (payload.prompt as string) ?? null;
      }
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
      await this.storePendingCommand(id, { type: "run", prompt: resolvedPrompt ?? null, interactionMode: interactionMode ?? null });
      await this.persistConnectionFailure(id, session.organizationId, deliveryResult, "run");
      return prisma.session.findUniqueOrThrow({ where: { id }, include: SESSION_INCLUDE });
    }

    // Only transition to active after successful delivery
    const updated = await prisma.session.update({
      where: { id },
      data: {
        status: "active",
        connection: this.mergeConnection(session.connection, { state: "connected", lastSeen: new Date().toISOString() }),
      },
      include: SESSION_INCLUDE,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: id,
      eventType: "session_resumed",
      payload: { sessionId: id },
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
    return this.transition(id, "terminate", "failed", "session_terminated", actorType, actorId);
  }

  private async transition(
    id: string,
    command: "pause" | "resume" | "terminate",
    newStatus: SessionStatus,
    eventType: EventType,
    actorType: ActorType,
    actorId: string,
  ) {
    const deliveryResult = sessionRouter.send(id, { type: command, sessionId: id });

    // For terminate, proceed regardless — we want the session marked as terminated
    // For pause/resume, only proceed if delivered or if terminating
    if (command !== "terminate" && deliveryResult !== "delivered") {
      const session = await prisma.session.findUniqueOrThrow({ where: { id }, select: { organizationId: true } });
      await this.persistConnectionFailure(id, session.organizationId, deliveryResult, command);
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
    config: { tool?: CodingTool; model?: string },
    actorType: ActorType,
    actorId: string,
  ) {
    const prev = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { tool: true },
    });

    const toolChanged = config.tool != null && config.tool !== prev.tool;

    const data: Record<string, unknown> = {};
    if (config.tool != null) data.tool = config.tool;
    if (config.model != null) data.model = config.model;
    if (toolChanged) {
      data.toolChangedAt = new Date();
      data.toolSessionId = null;
    }

    const session = await prisma.session.update({
      where: { id: sessionId },
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
        model: config.model ?? session.model,
        toolChanged,
      },
      actorType,
      actorId,
    });

    return session;
  }

  async linkToTicket(sessionId: string, ticketId: string, actorType: ActorType, actorId: string) {
    const session = await prisma.session.update({
      where: { id: sessionId },
      data: { tickets: { create: { ticketId } } },
      include: SESSION_INCLUDE,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "entity_linked",
      payload: { sessionId, ticketId },
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
      select: { organizationId: true },
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
  }

  async updateName(sessionId: string, name: string) {
    const session = await prisma.session.update({
      where: { id: sessionId },
      data: { name },
      select: { organizationId: true },
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: { type: "title_generated", name },
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
      const payload = evt.payload as Record<string, unknown>;
      if (payload.type !== "assistant") return false;
      const message = payload.message as Record<string, unknown> | undefined;
      const content = message?.content;
      if (!Array.isArray(content)) return false;
      return content.some((block: unknown) => {
        const b = block as Record<string, unknown> | undefined;
        return b?.type === "tool_use" && b?.name === "ExitPlanMode";
      });
    });

    const newStatus = hasPendingPlan ? "needs_input" : "completed";

    const session = await prisma.session.update({
      where: { id },
      data: { status: newStatus },
      select: { organizationId: true },
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
  }

  async sendMessage(sessionId: string, text: string, actorType: ActorType, actorId: string, interactionMode?: string) {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { organizationId: true, tool: true, model: true, toolChangedAt: true, workdir: true, toolSessionId: true, connection: true },
    });

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
      await this.storePendingCommand(sessionId, { type: "send", prompt, interactionMode: interactionMode ?? null });
      await this.persistConnectionFailure(sessionId, session.organizationId, deliveryResult, "send");
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
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: "active",
        connection: this.mergeConnection(session.connection, { state: "connected", lastSeen: new Date().toISOString() }),
        pendingRun: Prisma.DbNull,
      },
    });

    // Emit a resumed event so all clients see the status change
    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_resumed",
      payload: { sessionId },
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

  async workspaceReady(sessionId: string, workdir: string) {
    // Read and clear pendingRun atomically in a transaction to prevent double-delivery
    const [session, pendingRun] = await prisma.$transaction(async (tx) => {
      const prev = await tx.session.findUniqueOrThrow({
        where: { id: sessionId },
        select: { pendingRun: true },
      });

      const updated = await tx.session.update({
        where: { id: sessionId },
        data: { status: "pending", workdir, pendingRun: Prisma.DbNull },
        include: SESSION_INCLUDE,
      });

      return [updated, prev.pendingRun] as const;
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: { type: "workspace_ready", workdir },
      actorType: "system",
      actorId: "system",
    });

    // If a run was queued while workspace was being prepared, execute it now
    if (pendingRun) {
      const replayResult = await this.deliverPendingCommand(sessionId, pendingRun);
      if (replayResult && replayResult !== "delivered") {
        await this.persistConnectionFailure(sessionId, session.organizationId, replayResult, "workspace_replay");
      }
    }
  }

  async workspaceFailed(sessionId: string, error: string) {
    const session = await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: "failed",
        pendingRun: Prisma.DbNull,
        connection: connJson(defaultConnection({ state: "disconnected", lastError: error })),
      },
      include: SESSION_INCLUDE,
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_terminated",
      payload: { sessionId, reason: "workspace_failed", error },
      actorType: "system",
      actorId: "system",
    });
  }

  // ─── Connection Management ───

  async markConnectionLost(sessionId: string, reason: string, runtimeInstanceId?: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { organizationId: true, status: true, connection: true },
    });
    if (!session) return;

    // Don't mark completed/failed sessions as disconnected
    if (session.status === "completed" || session.status === "failed") return;

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
      },
      actorType: "system",
      actorId: "system",
    });
  }

  async markConnectionRestored(sessionId: string, runtimeInstanceId: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { organizationId: true, connection: true },
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

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: {
        type: "connection_restored",
        runtimeInstanceId,
        connection: connJson(updated),
      },
      actorType: "system",
      actorId: "system",
    });
  }

  async storeToolSessionId(sessionId: string, toolSessionId: string) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { toolSessionId },
    });
  }

  async retryConnection(sessionId: string, organizationId: string, actorType: ActorType, actorId: string) {
    const session = await prisma.session.findFirstOrThrow({
      where: { id: sessionId, organizationId },
      include: SESSION_INCLUDE,
    });

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
      ? sessionRouter.getRuntimeForSession(sessionId) ?? sessionRouter.getDefaultRuntime()
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

      await eventService.create({
        organizationId: session.organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "session_output",
        payload: { type: "recovery_failed", reason: "no_runtime", connection: connJson(failedConn) },
        actorType: "system",
        actorId: "system",
      });

      return prisma.session.findUniqueOrThrow({ where: { id: sessionId }, include: SESSION_INCLUDE });
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
        await this.persistConnectionFailure(sessionId, session.organizationId, prepResult, "retry_prepare");
        return prisma.session.findUniqueOrThrow({ where: { id: sessionId }, include: SESSION_INCLUDE });
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

      await eventService.create({
        organizationId: session.organizationId,
        scopeType: "session",
        scopeId: sessionId,
        eventType: "session_output",
        payload: { type: "connection_restored", runtimeInstanceId: runtime.id, connection: connJson(restoredConn) },
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

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_output",
      payload: { type: "connection_restored", runtimeInstanceId: runtime.id, connection: connJson(restoredConn) },
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
        await this.persistConnectionFailure(sessionId, session.organizationId, replayResult, "retry_replay");
      }
      return prisma.session.findUniqueOrThrow({ where: { id: sessionId }, include: SESSION_INCLUDE });
    }

    return updated;
  }

  async moveToRuntime(sessionId: string, runtimeInstanceId: string, organizationId: string, actorType: ActorType, actorId: string) {
    const session = await prisma.session.findFirstOrThrow({
      where: { id: sessionId, organizationId },
      include: { ...SESSION_INCLUDE, projects: true, tickets: true },
    });
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

    // Create child session targeted at the chosen runtime
    const childSession = await prisma.session.create({
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
        parentSessionId: sessionId,
        pendingRun: { type: "run", prompt: bootstrapPrompt, interactionMode: null } satisfies PendingSessionCommand,
        connection: connJson(defaultConnection({
          runtimeInstanceId,
          runtimeLabel: targetRuntime.label,
        })),
        ...(session.projects.length > 0 && {
          projects: {
            create: session.projects.map((sp: { projectId: string }) => ({ projectId: sp.projectId })),
          },
        }),
        ...(session.tickets.length > 0 && {
          tickets: {
            create: session.tickets.map((st: { ticketId: string }) => ({ ticketId: st.ticketId })),
          },
        }),
      },
      include: SESSION_INCLUDE,
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
        session: {
          id: childSession.id,
          name: childSession.name,
          status: childSession.status,
          tool: childSession.tool,
          model: childSession.model,
          hosting: childSession.hosting,
          createdBy: childSession.createdBy,
          repo: childSession.repo ?? null,
          channel: childSession.channel,
          parentSession: childSession.parentSession ?? null,
          childSessions: [],
          connection: childSession.connection,
          createdAt: childSession.createdAt,
          updatedAt: childSession.updatedAt,
        },
        prompt: bootstrapPrompt,
        movedFromSessionId: sessionId,
      },
      actorType,
      actorId,
    });

    // Start workspace preparation on the target runtime if needed
    if (childSession.repo) {
      const prepareResult = sessionRouter.send(childSession.id, {
        type: "prepare",
        sessionId: childSession.id,
        repoId: childSession.repo.id,
        repoName: childSession.repo.name,
        repoRemoteUrl: childSession.repo.remoteUrl,
        defaultBranch: childSession.repo.defaultBranch,
        branch: childSession.branch ?? undefined,
      });
      if (prepareResult !== "delivered") {
        await this.persistConnectionFailure(childSession.id, childSession.organizationId, prepareResult, "move_prepare");
      }
    } else {
      const deliveryResult = await this.deliverPendingCommand(childSession.id, childSession.pendingRun);
      if (deliveryResult && deliveryResult !== "delivered") {
        await this.persistConnectionFailure(childSession.id, childSession.organizationId, deliveryResult, "move_run");
      }
    }

    // Mark the old session as disconnected with context about the move
    const oldConn = this.parseConnection(session.connection);
    const rehomedConnection = {
      ...oldConn,
      state: "disconnected",
      lastError: `Moved to new session ${childSession.id}`,
      canRetry: false,
      canMove: true,
    } satisfies SessionConnectionData;

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        connection: connJson(rehomedConnection),
      },
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
        runtimeInstanceId,
        connection: connJson(rehomedConnection),
      },
      actorType,
      actorId,
    });

    return childSession;
  }

  async listRuntimesForTool(tool: string, organizationId: string) {
    const allRuntimes = sessionRouter
      .listRuntimes()
      .filter((runtime) => runtime.supportedTools.includes(tool));

    const sessionIds = allRuntimes.flatMap((runtime) => [...runtime.boundSessions]);
    const sessions = sessionIds.length === 0
      ? []
      : await prisma.session.findMany({
          where: {
            id: { in: sessionIds },
            organizationId,
          },
          select: { id: true },
        });
    const orgSessionIds = new Set(sessions.map((session) => session.id));

    return allRuntimes.map((r) => ({
      id: r.id,
      label: r.label,
      hostingMode: r.hostingMode,
      supportedTools: r.supportedTools,
      connected: r.ws.readyState === r.ws.OPEN,
      sessionCount: [...r.boundSessions].filter((sessionId) => orgSessionIds.has(sessionId)).length,
    }));
  }

  async listAvailableRuntimes(sessionId: string, organizationId: string) {
    const session = await prisma.session.findFirstOrThrow({
      where: { id: sessionId, organizationId },
      select: { tool: true },
    });
    return this.listRuntimesForTool(session.tool, organizationId);
  }

  // ─── Helpers ───

  private parseConnection(raw: unknown): SessionConnectionData {
    if (!raw || typeof raw !== "object") return defaultConnection();
    return defaultConnection(raw as Partial<SessionConnectionData>);
  }

  private mergeConnection(existing: unknown, patch: Partial<SessionConnectionData>): Prisma.InputJsonValue {
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
        interactionMode: typeof pending.interactionMode === "string" ? pending.interactionMode : null,
      };
    }
    if (pending.type === "run" || pending.type == null) {
      return {
        type: "run",
        prompt: typeof pending.prompt === "string" ? pending.prompt : null,
        interactionMode: typeof pending.interactionMode === "string" ? pending.interactionMode : null,
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

  private async deliverPendingCommand(sessionId: string, rawPending: unknown): Promise<DeliveryResult | null> {
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
        connection: true,
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

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: "active",
        pendingRun: Prisma.DbNull,
        connection: this.mergeConnection(session.connection, {
          state: "connected",
          lastSeen: new Date().toISOString(),
          lastError: undefined,
        }),
      },
    });

    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_resumed",
      payload: { sessionId },
      actorType: "system",
      actorId: "system",
    });

    return "delivered";
  }

  private async persistConnectionFailure(sessionId: string, organizationId: string, deliveryResult: DeliveryResult, operation: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { connection: true },
    });
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
      },
      actorType: "system",
      actorId: "system",
    });
  }
}

export const sessionService = new SessionService();
