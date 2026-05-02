import type { ActorType, CreatePreviewInput, EventType, PreviewVisibility } from "@trace/gql";
import type { Preview, PreviewStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { previewGatewayAdapter, type PreviewGatewayAdapter } from "../lib/preview-gateway.js";
import { sessionRouter } from "../lib/session-router.js";
import { terminalRelay } from "../lib/terminal-relay.js";
import { eventService } from "./event.js";

const ACTIVE_PREVIEW_STATUSES: PreviewStatus[] = ["starting", "ready", "stopping"];

type PreviewSnapshot = Omit<Preview, "createdAt" | "updatedAt" | "startedAt" | "stoppedAt"> & {
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  stoppedAt: string | null;
};

function serializePreview(preview: Preview): PreviewSnapshot {
  return {
    ...preview,
    createdAt: preview.createdAt.toISOString(),
    updatedAt: preview.updatedAt.toISOString(),
    startedAt: preview.startedAt ? preview.startedAt.toISOString() : null,
    stoppedAt: preview.stoppedAt ? preview.stoppedAt.toISOString() : null,
  };
}

function previewPayload(preview: Preview, error?: string): Prisma.InputJsonValue {
  return {
    preview: serializePreview(preview),
    status: preview.status,
    url: preview.url,
    error: error ?? preview.lastError,
  } satisfies Prisma.InputJsonObject;
}

function connectionRuntimeInstanceId(connection: Prisma.JsonValue): string | null {
  if (!connection || typeof connection !== "object" || Array.isArray(connection)) return null;
  const value = (connection as Record<string, unknown>).runtimeInstanceId;
  return typeof value === "string" && value.trim() ? value : null;
}

function validateCreatePreviewInput(input: CreatePreviewInput): {
  command: string;
  cwd: string | null;
  port: number;
  visibility: PreviewVisibility;
} {
  const command = input.command.trim();
  if (!command) {
    throw new ValidationError("Preview command is required");
  }
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    throw new ValidationError("Preview port must be an integer between 1 and 65535");
  }
  const cwd = input.cwd?.trim() ? input.cwd.trim() : null;
  if (cwd && cwd.includes("\0")) {
    throw new ValidationError("Preview cwd is invalid");
  }
  if (input.visibility !== "org" && input.visibility !== "public") {
    throw new ValidationError("Preview visibility is not supported");
  }

  return { command, cwd, port: input.port, visibility: input.visibility };
}

class PreviewService {
  constructor(private readonly gateway: PreviewGatewayAdapter = previewGatewayAdapter) {}

  async listForSession(sessionId: string, organizationId: string): Promise<Preview[]> {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, organizationId },
      select: { id: true },
    });
    if (!session) {
      throw new NotFoundError("Session", sessionId);
    }

    return prisma.preview.findMany({
      where: { sessionId, organizationId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createPreview(input: {
    organizationId: string;
    actorType: ActorType;
    actorId: string;
    data: CreatePreviewInput;
  }): Promise<Preview> {
    const validated = validateCreatePreviewInput(input.data);
    const session = await prisma.session.findFirst({
      where: { id: input.data.sessionId, organizationId: input.organizationId },
      select: {
        id: true,
        organizationId: true,
        sessionGroupId: true,
        hosting: true,
        connection: true,
      },
    });
    if (!session) {
      throw new NotFoundError("Session", input.data.sessionId);
    }
    if (session.hosting !== "cloud") {
      throw new ValidationError("Preview links are only available for cloud sessions");
    }

    const existingActive = await prisma.preview.findFirst({
      where: {
        organizationId: input.organizationId,
        sessionId: session.id,
        status: { in: ACTIVE_PREVIEW_STATUSES },
      },
      select: { id: true },
    });
    if (existingActive) {
      throw new ValidationError("This session already has an active preview");
    }

    const runtimeInstanceId = connectionRuntimeInstanceId(session.connection);
    const runtime =
      (runtimeInstanceId
        ? sessionRouter.getRuntime(runtimeInstanceId, input.organizationId)
        : undefined) ?? sessionRouter.getRuntimeForSession(session.id);
    if (!runtime || runtime.ws.readyState !== runtime.ws.OPEN) {
      throw new ValidationError("Cloud runtime is not connected for this session");
    }
    if (runtime.organizationId && runtime.organizationId !== input.organizationId) {
      throw new ValidationError("Runtime does not belong to this organization");
    }
    if (runtime.hostingMode !== "cloud") {
      throw new ValidationError("Preview links require a cloud runtime");
    }

    let preview = await prisma.preview.create({
      data: {
        organizationId: input.organizationId,
        sessionId: session.id,
        sessionGroupId: session.sessionGroupId,
        createdById: input.actorId,
        command: validated.command,
        cwd: validated.cwd,
        port: validated.port,
        visibility: validated.visibility,
        status: "starting",
      },
    });
    await this.emit(preview, "preview_created", input.actorType, input.actorId);

    let routeId: string | null = null;
    let terminalId: string | null = null;
    try {
      terminalId = terminalRelay.startLongRunningProcess({
        sessionId: session.id,
        sessionGroupId: session.sessionGroupId,
        organizationId: input.organizationId,
        runtimeInstanceId: runtime.id,
        ownerUserId: input.actorId,
        command: validated.command,
        cwd: validated.cwd ?? undefined,
        onEnd: (exitCode, error) => {
          void this.handleProcessEnd(preview.id, exitCode, error);
        },
      });

      preview = await prisma.preview.update({
        where: { id: preview.id },
        data: { terminalId, startedAt: new Date() },
      });
      await this.emit(preview, "preview_process_started", input.actorType, input.actorId);

      const route = await this.gateway.createRoute({
        organizationId: input.organizationId,
        sessionId: session.id,
        runtimeInstanceId: runtime.id,
        port: validated.port,
        visibility: validated.visibility,
      });
      routeId = route.routeId;

      preview = await prisma.preview.update({
        where: { id: preview.id },
        data: { status: "ready", routeId: route.routeId, url: route.url },
      });
      await this.emit(preview, "preview_ready", input.actorType, input.actorId);
      return preview;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start preview";
      if (terminalId) {
        terminalRelay.destroyTerminal(terminalId);
      }
      if (routeId) {
        await this.gateway.revokeRoute(routeId).catch(() => undefined);
      }
      preview = await prisma.preview.update({
        where: { id: preview.id },
        data: { status: "failed", stoppedAt: new Date(), lastError: message },
      });
      await this.emit(preview, "preview_failed", input.actorType, input.actorId, message);
      return preview;
    }
  }

  async stopPreview(input: {
    id: string;
    organizationId: string;
    actorType: ActorType;
    actorId: string;
  }): Promise<Preview> {
    let preview = await prisma.preview.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
    });
    if (!preview) {
      throw new NotFoundError("Preview", input.id);
    }

    if (preview.status === "stopped" || preview.status === "failed") {
      return preview;
    }

    preview = await prisma.preview.update({
      where: { id: preview.id },
      data: { status: "stopping" },
    });
    await this.emit(preview, "preview_stopping", input.actorType, input.actorId);

    if (preview.routeId) {
      await this.gateway.revokeRoute(preview.routeId);
    }
    if (preview.terminalId) {
      terminalRelay.destroyTerminal(preview.terminalId);
    }

    preview = await prisma.preview.update({
      where: { id: preview.id },
      data: { status: "stopped", stoppedAt: new Date() },
    });
    await this.emit(preview, "preview_stopped", input.actorType, input.actorId);
    return preview;
  }

  private async handleProcessEnd(
    previewId: string,
    exitCode: number | null,
    error?: string,
  ): Promise<void> {
    const current = await prisma.preview.findUnique({ where: { id: previewId } });
    if (!current || current.status === "stopped" || current.status === "failed") return;

    const failure =
      error ?? (exitCode && exitCode !== 0 ? `Process exited with code ${exitCode}` : null);
    const preview = await prisma.preview.update({
      where: { id: previewId },
      data: {
        status: failure ? "failed" : "stopped",
        stoppedAt: new Date(),
        lastError: failure,
      },
    });
    if (preview.routeId) {
      await this.gateway.revokeRoute(preview.routeId).catch(() => undefined);
    }
    await this.emit(
      preview,
      failure ? "preview_failed" : "preview_stopped",
      "system",
      "system",
      failure ?? undefined,
    );
  }

  private async emit(
    preview: Preview,
    eventType: EventType,
    actorType: ActorType,
    actorId: string,
    error?: string,
  ): Promise<void> {
    await eventService.create({
      organizationId: preview.organizationId,
      scopeType: "session",
      scopeId: preview.sessionId,
      eventType,
      payload: previewPayload(preview, error),
      actorType,
      actorId,
    });
  }
}

export const previewService = new PreviewService();
export { PreviewService, serializePreview };
