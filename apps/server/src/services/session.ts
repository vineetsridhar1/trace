import type { StartSessionInput, ActorType } from "@trace/gql";
import type { SessionStatus, EventType, CodingTool } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { hasQuestionBlock, hasPlanBlock } from "@trace/shared";
import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { sessionRouter, type DeliveryResult } from "../lib/session-router.js";
import { inboxService } from "./inbox.js";
import { runtimeDebug } from "../lib/runtime-debug.js";
import { terminalRelay } from "../lib/terminal-relay.js";

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

const FULLY_UNLOADED_SESSION_STATUSES: readonly SessionStatus[] = ["failed", "merged"];

function isFullyUnloadedSessionStatus(status: SessionStatus): boolean {
  return FULLY_UNLOADED_SESSION_STATUSES.includes(status);
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

    // If a parent session has a workdir, reuse it instead of creating a new worktree
    let parentWorkdir: string | null = null;
    if (input.parentSessionId) {
      const parent = await prisma.session.findUnique({
        where: { id: input.parentSessionId },
        select: { workdir: true },
      });
      parentWorkdir = parent?.workdir ?? null;
    }

    // Only need workspace creation if repo is selected and parent doesn't already have a workdir
    const needsWorkspace = !!input.repoId && !parentWorkdir;

    // Resolve hosting mode: if a runtime is specified, derive from it; otherwise use explicit value or default to cloud
    let hosting = input.hosting ?? "cloud";
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

    // Cloud sessions always start as "creating" — the VM needs time to boot
    const initialStatus = (needsWorkspace || hosting === "cloud") ? "creating" : "pending";

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
          workdir: parentWorkdir ?? undefined,
          channelId: input.channelId ?? undefined,
          parentSessionId: input.parentSessionId ?? undefined,
          connection: connJson(defaultConnection({
            ...(input.runtimeInstanceId && { runtimeInstanceId: input.runtimeInstanceId }),
            ...(runtimeLabel && { runtimeLabel }),
          })),
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

    // If this is a child session (e.g. "Approve new session"), resolve parent's inbox item
    if (input.parentSessionId) {
      await inboxService.resolveBySource({
        sourceType: "session",
        sourceId: input.parentSessionId,
        orgId: input.organizationId,
        resolution: "Approved (new session)",
      });
    }

    if (needsWorkspace || session.hosting === "cloud") {
      sessionRouter.createRuntime({
        sessionId: session.id,
        hosting: session.hosting as "cloud" | "local",
        tool: session.tool,
        model: session.model ?? undefined,
        repo: session.repo ? { id: session.repo.id, name: session.repo.name, remoteUrl: session.repo.remoteUrl, defaultBranch: session.repo.defaultBranch } : null,
        branch: input.branch ?? undefined,
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
        data: { pendingRun: { type: "run", prompt: prompt ?? null, interactionMode: interactionMode ?? null } },
        include: SESSION_INCLUDE,
      });
      return updated;
    }

    // Fully unloaded sessions cannot accept follow-up work.
    if (isFullyUnloadedSessionStatus(session.status)) {
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
    // Persist the runtime binding so restoreSessionsForRuntime can recover it after restart
    const boundRuntime = sessionRouter.getRuntimeForSession(id);
    const updated = await prisma.session.update({
      where: { id },
      data: {
        status: "active",
        connection: this.mergeConnection(session.connection, {
          state: "connected",
          lastSeen: new Date().toISOString(),
          ...(boundRuntime && { runtimeInstanceId: boundRuntime.id, runtimeLabel: boundRuntime.label }),
        }),
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
    return this.terminateWithStatus(id, "failed", "Session terminated", actorType, actorId);
  }

  async dismiss(id: string, actorType: ActorType = "system", actorId: string = "system") {
    return this.terminateWithStatus(id, "completed", "Session dismissed", actorType, actorId);
  }

  private async terminateWithStatus(id: string, targetStatus: SessionStatus, resolution: string, actorType: ActorType, actorId: string) {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id },
      select: { organizationId: true },
    });
    await inboxService.resolveBySource({ sourceType: "session", sourceId: id, orgId: session.organizationId, resolution });
    return this.transition(id, "terminate", targetStatus, "session_terminated", actorType, actorId);
  }

  async delete(id: string, actorType: ActorType = "system", actorId: string = "system") {
    const session = await prisma.session.findUnique({
      where: { id },
      include: SESSION_INCLUDE,
    });
    if (!session) throw new Error("Session not found or already deleted");

    // Resolve any pending inbox items (plans/questions awaiting input)
    await inboxService.resolveBySource({ sourceType: "session", sourceId: id, orgId: session.organizationId, resolution: "Session deleted" });

    // Clean up terminal relay entries and notify attached frontends
    terminalRelay.destroyAllForSession(id);

    // Clean up runtime (bridge + cloud VM for cloud, bridge + worktree for local)
    await sessionRouter.destroyRuntime(id, session);

    // Orphan children, delete junctions, delete session — all in one transaction
    await prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { parentSessionId: id },
        data: { parentSessionId: null },
      });
      await tx.sessionProject.deleteMany({ where: { sessionId: id } });
      await tx.sessionTicket.deleteMany({ where: { sessionId: id } });
      await tx.session.delete({ where: { id } });
    });

    // Broadcast the deletion event (events are kept for audit trail)
    await eventService.create({
      organizationId: session.organizationId,
      scopeType: "session",
      scopeId: id,
      eventType: "session_deleted",
      payload: { sessionId: id, name: session.name },
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
      return hasPlanBlock(evt.payload as Record<string, unknown>);
    });

    // Safety net for adapters that exit cleanly after emitting a question
    // (Claude Code hangs on stdin so recordOutput handles it first, but other
    // adapters may reach complete() with a question still pending).
    const hasQuestion = recentEvents.some((evt) => {
      return hasQuestionBlock(evt.payload as Record<string, unknown>);
    });

    const newStatus = (hasPendingPlan || hasQuestion) ? "needs_input" : "completed";

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

  async sendMessage(sessionId: string, text: string, actorType: ActorType, actorId: string, interactionMode?: string) {
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { organizationId: true, status: true, tool: true, model: true, toolChangedAt: true, workdir: true, toolSessionId: true, connection: true },
    });

    if (isFullyUnloadedSessionStatus(session.status)) {
      throw new Error(`Cannot send follow-up messages to a ${session.status} session`);
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
    // Persist the runtime binding so restoreSessionsForRuntime can recover it after restart
    const boundRuntime = sessionRouter.getRuntimeForSession(sessionId);
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: "active",
        connection: this.mergeConnection(session.connection, {
          state: "connected",
          lastSeen: new Date().toISOString(),
          ...(boundRuntime && { runtimeInstanceId: boundRuntime.id, runtimeLabel: boundRuntime.label }),
        }),
        pendingRun: Prisma.DbNull,
      },
    });

    // Resolve any inbox items for this session (leaving needs_input)
    await inboxService.resolveBySource({ sourceType: "session", sourceId: sessionId, orgId: session.organizationId, resolution: text.slice(0, 200) });

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

  async retryConnection(sessionId: string, organizationId: string, actorType: ActorType, actorId: string) {
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
          branch: childSession.branch ?? null,
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

    // Provision the runtime on the target
    if (childSession.repo || targetRuntime.hostingMode === "cloud") {
      sessionRouter.createRuntime({
        sessionId: childSession.id,
        hosting: targetRuntime.hostingMode,
        tool: childSession.tool,
        model: childSession.model ?? undefined,
        repo: childSession.repo ? { id: childSession.repo.id, name: childSession.repo.name, remoteUrl: childSession.repo.remoteUrl, defaultBranch: childSession.repo.defaultBranch } : null,
        branch: childSession.branch ?? undefined,
        createdById: actorId,
        organizationId: childSession.organizationId,
        onFailed: (error) => this.workspaceFailed(childSession.id, error),
        onWorkspaceReady: (workdir) => this.workspaceReady(childSession.id, workdir),
      });
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
      .filter((runtime) => runtime.hostingMode === "local" && runtime.supportedTools.includes(tool));

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
  async listBranches(repoId: string, organizationId: string, runtimeInstanceId?: string): Promise<string[]> {
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
    const messageContent = (data.message as Record<string, unknown> | undefined)
      ?.content as Array<Record<string, unknown>> | undefined;

    const isQuestion = hasQuestionBlock(data);

    const questionBlock = isQuestion
      ? messageContent?.find((b) => b.type === "question") as { questions: Array<Record<string, unknown>> } | undefined
      : undefined;

    const planBlock = !isQuestion
      ? messageContent?.find((b) => b.type === "plan") as { content?: string } | undefined
      : undefined;
    const planText = planBlock?.content;

    const summary = isQuestion
      ? questionBlock?.questions?.[0]?.question as string | undefined
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

    const boundRuntime = sessionRouter.getRuntimeForSession(sessionId);
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: "active",
        pendingRun: Prisma.DbNull,
        connection: this.mergeConnection(session.connection, {
          state: "connected",
          lastSeen: new Date().toISOString(),
          lastError: undefined,
          ...(boundRuntime && { runtimeInstanceId: boundRuntime.id, runtimeLabel: boundRuntime.label }),
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
      select: { status: true, connection: true },
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

  private async fullyUnloadSession(sessionId: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { hosting: true, workdir: true, repoId: true, connection: true },
    });
    if (!session) return;

    terminalRelay.destroyAllForSession(sessionId);

    try {
      await sessionRouter.destroyRuntime(sessionId, session);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[session-service] failed to unload session ${sessionId}: ${message}`);
    }
  }

  /** Transition a session to "in_review" when a PR is opened for its branch. */
  async markPrOpened(params: { sessionId: string; prUrl: string; organizationId: string }) {
    const { sessionId, prUrl, organizationId } = params;

    // Atomic conditional update — skip if already in_review or merged
    const { count } = await prisma.session.updateMany({
      where: { id: sessionId, status: { notIn: ["in_review", "merged"] } },
      data: { status: "in_review", prUrl },
    });

    if (count === 0) return;

    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_pr_opened",
      payload: { sessionId, prUrl, status: "in_review" },
      actorType: "system",
      actorId: "github-webhook",
    });
  }

  /** Transition a session to "merged" when its PR is merged. */
  async markPrMerged(params: { sessionId: string; prUrl: string; organizationId: string }) {
    const { sessionId, prUrl, organizationId } = params;

    // Atomic conditional update — skip if already merged
    const { count } = await prisma.session.updateMany({
      where: { id: sessionId, status: { not: "merged" } },
      data: { status: "merged", prUrl },
    });

    if (count === 0) {
      const existing = await prisma.session.findUnique({
        where: { id: sessionId },
        select: { status: true },
      });
      if (existing?.status === "merged") {
        await this.fullyUnloadSession(sessionId);
      }
      return;
    }

    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_pr_merged",
      payload: { sessionId, prUrl, status: "merged" },
      actorType: "system",
      actorId: "github-webhook",
    });

    await this.fullyUnloadSession(sessionId);
  }
}

export const sessionService = new SessionService();
