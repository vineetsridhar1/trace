import type { StartSessionInput, ActorType } from "@trace/gql";
import type { SessionStatus, EventType, CodingTool } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { sessionRouter } from "../lib/session-router.js";

export type StartSessionServiceInput = StartSessionInput & {
  organizationId: string;
  createdById: string;
};

const SESSION_INCLUDE = { createdBy: true, repo: true, channel: true, parentSession: true, childSessions: true } as const;

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

    const [session] = await prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          name,
          status: initialStatus,
          tool: input.tool,
          model: input.model ?? undefined,
          hosting: input.hosting,
          organizationId: input.organizationId,
          createdById: input.createdById,
          repoId: input.repoId ?? undefined,
          branch: input.branch ?? undefined,
          channelId: input.channelId ?? undefined,
          parentSessionId: input.parentSessionId ?? undefined,
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
            channel: session.channel,
            parentSession: session.parentSession ?? null,
            childSessions: session.childSessions ?? [],
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

    // If repo selected, send prepare command to bridge for worktree creation
    if (needsWorkspace && session.repo) {
      sessionRouter.send(session.id, {
        type: "prepare",
        sessionId: session.id,
        repoId: session.repo.id,
        repoName: session.repo.name,
        repoRemoteUrl: session.repo.remoteUrl,
        defaultBranch: session.repo.defaultBranch,
        branch: input.branch ?? undefined,
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
        data: { pendingRun: { prompt: prompt ?? null, interactionMode: interactionMode ?? null } },
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

    const command = {
      type: "run" as const,
      sessionId: id,
      prompt: resolvedPrompt ?? undefined,
      tool: session.tool,
      model: session.model ?? undefined,
      interactionMode,
      cwd: session.workdir ?? undefined,
    };

    const sent = sessionRouter.send(id, command);

    if (!sent) {
      // Try binding to a default bridge and retry
      const bridge = sessionRouter.getDefaultBridge();
      if (bridge) {
        sessionRouter.bindSession(id, bridge.id);
        sessionRouter.send(id, command);
      }
    }

    // Update status to active and return with includes
    const updated = await prisma.session.update({
      where: { id },
      data: { status: "active" },
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
    sessionRouter.send(id, { type: command, sessionId: id });

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
    if (toolChanged) data.toolChangedAt = new Date();

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
    const session = await prisma.session.update({
      where: { id: sessionId },
      data: { status: "active" },
      select: { organizationId: true, tool: true, model: true, toolChangedAt: true, workdir: true },
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

    // Forward to bridge so the coding tool receives the message
    sessionRouter.send(sessionId, {
      type: "send",
      sessionId,
      prompt,
      tool: session.tool,
      model: session.model ?? undefined,
      interactionMode,
      cwd: session.workdir ?? undefined,
    });

    return event;
  }
  async workspaceReady(sessionId: string, workdir: string) {
    // Read pendingRun before clearing it atomically
    const prev = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { pendingRun: true },
    });

    const session = await prisma.session.update({
      where: { id: sessionId },
      data: { status: "pending", workdir, pendingRun: Prisma.DbNull },
      include: SESSION_INCLUDE,
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
    if (prev.pendingRun) {
      const pending = prev.pendingRun as Record<string, unknown>;
      await this.run(
        sessionId,
        (pending.prompt as string) ?? undefined,
        (pending.interactionMode as string) ?? undefined,
      );
    }
  }

  async workspaceFailed(sessionId: string, error: string) {
    const session = await prisma.session.update({
      where: { id: sessionId },
      data: { status: "failed", pendingRun: Prisma.DbNull },
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
}

export const sessionService = new SessionService();
