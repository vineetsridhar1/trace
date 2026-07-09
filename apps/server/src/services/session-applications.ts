import type {
  EndpointTrafficCaptureMode,
  SessionEndpointAccessMode,
  SessionApplicationProcess as PrismaSessionApplicationProcess,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "../lib/db.js";
import { sessionRouter } from "../lib/session-router.js";
import { AuthenticationError, AuthorizationError, ValidationError } from "../lib/errors.js";
import { canViewSessionGroup } from "./access.js";
import { eventService } from "./event.js";
import { orgSecretService } from "./org-secret.js";
import { repoApplicationConfigService } from "./repo-application-config.js";
import { buildEndpointUrl, generateEndpointKey } from "./endpoint-utils.js";
import { buildDefaultAppSetupConfig } from "./app-starter-config.js";
import { createEndpointPreviewToken } from "./endpoint-preview-auth.js";

import type { RepoEnvVar } from "@trace/gql";

type Tx = Prisma.TransactionClient;
const SETUP_OUTPUT_PREVIEW_LIMIT = 65_536;
export const PROCESS_LOG_ENTRY_MAX_CHARS = 8_192;
export const PROCESS_LOG_RETAINED_ROWS = 500;
const PROCESS_LOG_PRUNE_INTERVAL = 50;
const PROCESS_LOG_PRUNE_BATCH = 200;
const PROCESS_LOG_TRUNCATION_SUFFIX = "\n[trace] log chunk truncated";
const APP_TOKENS_PATH = "trace.tokens.json";

type ManagedSessionGroup = {
  id: string;
  organizationId: string;
  kind: string;
  ownerUserId: string;
  visibility: string;
  repoId: string | null;
  workdir: string | null;
  sessions: Array<{
    id: string;
    workdir: string | null;
    connection: Prisma.JsonValue;
  }>;
  repo: {
    id: string;
    setupConfig: Prisma.JsonValue;
  } | null;
};

function connectionRecord(connection: Prisma.JsonValue): Record<string, unknown> {
  return connection && typeof connection === "object" && !Array.isArray(connection)
    ? (connection as Record<string, unknown>)
    : {};
}

function connectionRuntimeInstanceId(connection: Prisma.JsonValue): string | null {
  const runtimeInstanceId = connectionRecord(connection).runtimeInstanceId;
  return typeof runtimeInstanceId === "string" && runtimeInstanceId.trim()
    ? runtimeInstanceId
    : null;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function mergeJsonObjects(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (isJsonObject(value) && isJsonObject(next[key])) {
      next[key] = mergeJsonObjects(next[key], value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

function parseTokenFile(content: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ValidationError("App token file is not valid JSON.");
  }
  if (!isJsonObject(parsed)) {
    throw new ValidationError("App token file must contain a JSON object.");
  }
  return parsed;
}

function publicProcess(process: PrismaSessionApplicationProcess) {
  return {
    id: process.id,
    sessionGroupId: process.sessionGroupId,
    appConfigId: process.appConfigId,
    processConfigId: process.processConfigId,
    label: process.label,
    status: process.status,
    runtimeInstanceId: process.runtimeInstanceId,
    startedAt: process.startedAt?.toISOString() ?? null,
    stoppedAt: process.stoppedAt?.toISOString() ?? null,
    exitCode: process.exitCode,
    lastError: process.lastError,
  };
}

function publicEndpoint(endpoint: {
  id: string;
  key: string;
  sessionGroupId: string;
  appConfigId: string;
  processConfigId: string;
  portConfigId: string;
  label: string;
  targetPort: number;
  status: string;
  accessMode: string;
  trafficCaptureMode: string;
  enabledAt: Date | null;
  disabledAt: Date | null;
  revokedAt: Date | null;
}) {
  return {
    id: endpoint.id,
    key: endpoint.key,
    url: buildEndpointUrl(endpoint.key),
    sessionGroupId: endpoint.sessionGroupId,
    appConfigId: endpoint.appConfigId,
    processConfigId: endpoint.processConfigId,
    portConfigId: endpoint.portConfigId,
    label: endpoint.label,
    targetPort: endpoint.targetPort,
    status: endpoint.status,
    accessMode: endpoint.accessMode,
    trafficCaptureMode: endpoint.trafficCaptureMode,
    enabledAt: endpoint.enabledAt?.toISOString() ?? null,
    disabledAt: endpoint.disabledAt?.toISOString() ?? null,
    revokedAt: endpoint.revokedAt?.toISOString() ?? null,
  };
}

export class SessionApplicationService {
  private logAppendChains = new Map<string, Promise<unknown>>();

  async listSetupScriptRuns(sessionGroupId: string, organizationId: string, userId: string) {
    await this.assertCanView(sessionGroupId, organizationId, userId);
    return prisma.sessionSetupScriptRun.findMany({
      where: { sessionGroupId, organizationId },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
  }

  async listProcesses(sessionGroupId: string, organizationId: string, userId: string) {
    await this.assertCanView(sessionGroupId, organizationId, userId);
    return prisma.sessionApplicationProcess.findMany({
      where: { sessionGroupId, organizationId },
      orderBy: [{ appConfigId: "asc" }, { processConfigId: "asc" }],
    });
  }

  async listLogs(
    processId: string,
    organizationId: string,
    userId: string,
    options?: { limit?: number | null; beforeSequence?: number | null },
  ) {
    const process = await prisma.sessionApplicationProcess.findFirstOrThrow({
      where: { id: processId, organizationId },
      select: { sessionGroupId: true },
    });
    await this.assertCanView(process.sessionGroupId, organizationId, userId);
    return prisma.sessionApplicationLogEntry.findMany({
      where: {
        processId,
        ...(options?.beforeSequence != null ? { sequence: { lt: options.beforeSequence } } : {}),
      },
      orderBy: { sequence: "desc" },
      take: Math.min(Math.max(options?.limit ?? 200, 1), 1000),
    });
  }

  async listEndpoints(sessionGroupId: string, organizationId: string, userId: string) {
    await this.assertCanView(sessionGroupId, organizationId, userId);
    return prisma.sessionEndpoint.findMany({
      where: { sessionGroupId, organizationId },
      orderBy: [{ appConfigId: "asc" }, { processConfigId: "asc" }, { portConfigId: "asc" }],
    });
  }

  async listTraffic(
    endpointId: string,
    organizationId: string,
    userId: string,
    options?: { limit?: number | null; before?: Date | null },
  ) {
    const endpoint = await prisma.sessionEndpoint.findFirstOrThrow({
      where: { id: endpointId, organizationId },
      select: { sessionGroupId: true },
    });
    await this.assertCanView(endpoint.sessionGroupId, organizationId, userId);
    return prisma.endpointTrafficEntry.findMany({
      where: {
        endpointId,
        ...(options?.before ? { startedAt: { lt: options.before } } : {}),
      },
      orderBy: { startedAt: "desc" },
      take: Math.min(Math.max(options?.limit ?? 100, 1), 500),
    });
  }

  async runSetupScript(
    sessionGroupId: string,
    scriptId: string,
    organizationId: string,
    userId: string,
  ) {
    const { group, sessionId, runtimeId } = await this.resolveCloudRuntime(
      sessionGroupId,
      organizationId,
      userId,
    );
    const config = repoApplicationConfigService.parseApplicationConfig(
      group.repo?.setupConfig ?? (group.kind === "app" ? buildDefaultAppSetupConfig() : null),
    );
    const script = config.setupScripts.find((candidate) => candidate.id === scriptId);
    if (!script) throw new ValidationError("Setup script not found");
    const run = await prisma.sessionSetupScriptRun.create({
      data: {
        organizationId,
        sessionGroupId,
        repoId: group.repoId ?? null,
        scriptConfigId: script.id,
        label: script.name,
        command: script.command,
        workingDirectory: script.workingDirectory ?? ".",
        outputPreview: `[trace] Queued setup script: ${script.command}\n`,
        startedByUserId: userId,
      },
    });
    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_setup_script_started",
      payload: { setupScriptRun: run },
      actorType: "user",
      actorId: userId,
    });
    const env = await this.resolveEnv(organizationId, script.env);
    const delivery = sessionRouter.sendToRuntime(
      runtimeId,
      {
        type: "setup_script_run",
        requestId: run.id,
        sessionGroupId,
        sessionId,
        command: script.command,
        cwd: script.workingDirectory ?? ".",
        env,
      },
      organizationId,
    );
    if (delivery !== "delivered") {
      await prisma.sessionSetupScriptRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          completedAt: new Date(),
          lastError: `Runtime not available: ${delivery}`,
        },
      });
      throw new Error(`Runtime not available: ${delivery}`);
    }
    return true;
  }

  async startApplication(
    sessionGroupId: string,
    appConfigId: string,
    organizationId: string,
    userId: string,
  ) {
    const { group } = await this.resolveCloudRuntime(sessionGroupId, organizationId, userId);
    const app = this.getApplication(group, appConfigId);
    return Promise.all(
      app.processes
        .filter((process) => process.required)
        .map((process) =>
          this.startProcess(sessionGroupId, appConfigId, process.id, organizationId, userId),
        ),
    );
  }

  async stopApplication(
    sessionGroupId: string,
    appConfigId: string,
    organizationId: string,
    userId: string,
  ) {
    const { group } = await this.resolveCloudRuntime(sessionGroupId, organizationId, userId);
    const app = this.getApplication(group, appConfigId);
    return Promise.all(
      app.processes.map((process) =>
        this.stopProcess(sessionGroupId, appConfigId, process.id, organizationId, userId),
      ),
    );
  }

  async startProcess(
    sessionGroupId: string,
    appConfigId: string,
    processConfigId: string,
    organizationId: string,
    userId: string,
  ) {
    const { group, sessionId, runtimeId } = await this.resolveCloudRuntime(
      sessionGroupId,
      organizationId,
      userId,
    );
    const app = this.getApplication(group, appConfigId);
    const processConfig = app.processes.find((candidate) => candidate.id === processConfigId);
    if (!processConfig) throw new ValidationError("Process not found");

    const env = await this.resolveEnv(organizationId, processConfig.env);

    const process = await prisma.$transaction(async (tx) => {
      const process = await tx.sessionApplicationProcess.upsert({
        where: {
          sessionGroupId_appConfigId_processConfigId: {
            sessionGroupId,
            appConfigId,
            processConfigId,
          },
        },
        create: {
          organizationId,
          sessionGroupId,
          repoId: group.repoId ?? null,
          appConfigId,
          processConfigId,
          label: processConfig.name,
          command: processConfig.command,
          workingDirectory: processConfig.workingDirectory ?? ".",
          status: "starting",
          runtimeInstanceId: runtimeId,
          startedByUserId: userId,
          startedAt: new Date(),
          stoppedAt: null,
          exitCode: null,
          lastError: null,
        },
        update: {
          label: processConfig.name,
          command: processConfig.command,
          workingDirectory: processConfig.workingDirectory ?? ".",
          status: "starting",
          runtimeInstanceId: runtimeId,
          startedByUserId: userId,
          startedAt: new Date(),
          stoppedAt: null,
          exitCode: null,
          lastError: null,
        },
      });
      await this.ensureEndpoints(
        tx,
        group,
        sessionId,
        appConfigId,
        processConfigId,
        processConfig.ports,
      );
      return process;
    });

    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_application_process_started",
      payload: { process: publicProcess(process) },
      actorType: "user",
      actorId: userId,
    });

    const delivery = sessionRouter.sendToRuntime(
      runtimeId,
      {
        type: "app_process_start",
        requestId: randomUUID(),
        processInstanceId: process.id,
        sessionGroupId,
        sessionId,
        appConfigId,
        processConfigId,
        command: processConfig.command,
        cwd: processConfig.workingDirectory ?? ".",
        env,
        ports: processConfig.ports.map((port) => ({
          portConfigId: port.id,
          port: port.port,
          protocol: "http",
        })),
      },
      organizationId,
    );
    if (delivery !== "delivered") {
      await this.markProcessFailed(
        process.id,
        organizationId,
        sessionId,
        userId,
        `Runtime not available: ${delivery}`,
      );
      throw new Error(`Runtime not available: ${delivery}`);
    }

    for (const port of processConfig.ports) {
      if (!port.defaultForwardingEnabled) continue;
      const endpoint = await prisma.sessionEndpoint.findUnique({
        where: {
          sessionGroupId_appConfigId_processConfigId_portConfigId: {
            sessionGroupId,
            appConfigId,
            processConfigId,
            portConfigId: port.id,
          },
        },
      });
      if (endpoint) {
        await this.enableEndpointForProcess(
          endpoint.id,
          process,
          sessionId,
          organizationId,
          userId,
        );
      }
    }

    return process;
  }

  async stopProcess(
    sessionGroupId: string,
    appConfigId: string,
    processConfigId: string,
    organizationId: string,
    userId: string,
  ) {
    const { sessionId, runtimeId } = await this.resolveCloudRuntime(
      sessionGroupId,
      organizationId,
      userId,
    );
    const process = await prisma.sessionApplicationProcess.findUniqueOrThrow({
      where: {
        sessionGroupId_appConfigId_processConfigId: {
          sessionGroupId,
          appConfigId,
          processConfigId,
        },
      },
    });
    const delivery = sessionRouter.sendToRuntime(
      runtimeId,
      {
        type: "app_process_stop",
        requestId: randomUUID(),
        processInstanceId: process.id,
      },
      organizationId,
    );
    if (delivery !== "delivered" && process.runtimeInstanceId) {
      throw new Error(`Runtime not available: ${delivery}`);
    }

    const stopped = await prisma.$transaction(async (tx) => {
      const stopped = await tx.sessionApplicationProcess.update({
        where: { id: process.id },
        data: {
          status: "stopped",
          stoppedAt: new Date(),
          runtimeInstanceId: null,
          bridgeProcessId: null,
        },
      });
      await tx.sessionEndpoint.updateMany({
        where: { sessionGroupId, appConfigId, processConfigId, status: "enabled" },
        data: { status: "disabled", disabledAt: new Date(), currentRuntimeInstanceId: null },
      });
      return stopped;
    });
    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_application_process_stopped",
      payload: { process: publicProcess(stopped) },
      actorType: "user",
      actorId: userId,
    });
    return stopped;
  }

  async restartProcess(
    sessionGroupId: string,
    appConfigId: string,
    processConfigId: string,
    organizationId: string,
    userId: string,
  ) {
    await this.stopProcess(sessionGroupId, appConfigId, processConfigId, organizationId, userId);
    return this.startProcess(sessionGroupId, appConfigId, processConfigId, organizationId, userId);
  }

  async enableEndpoint(
    endpointId: string,
    organizationId: string,
    userId: string,
    accessMode?: SessionEndpointAccessMode | null,
  ) {
    const endpoint = await prisma.sessionEndpoint.findFirstOrThrow({
      where: { id: endpointId, organizationId },
    });
    await this.assertCanManage(endpoint.sessionGroupId, organizationId, userId);
    const process = await prisma.sessionApplicationProcess.findUnique({
      where: {
        sessionGroupId_appConfigId_processConfigId: {
          sessionGroupId: endpoint.sessionGroupId,
          appConfigId: endpoint.appConfigId,
          processConfigId: endpoint.processConfigId,
        },
      },
    });
    if (!process || process.status !== "running") {
      throw new ValidationError(
        `Start the process first (current status: ${process?.status ?? "missing"})`,
      );
    }
    const updated = await prisma.sessionEndpoint.update({
      where: { id: endpoint.id },
      data: {
        status: "enabled",
        accessMode: accessMode ?? endpoint.accessMode,
        enabledByUserId: userId,
        enabledAt: new Date(),
        disabledAt: null,
        currentRuntimeInstanceId: process.runtimeInstanceId,
      },
    });
    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: await this.latestSessionIdForGroup(endpoint.sessionGroupId, organizationId),
      eventType: "session_endpoint_forwarding_enabled",
      payload: { endpoint: publicEndpoint(updated) },
      actorType: "user",
      actorId: userId,
    });
    return updated;
  }

  private async enableEndpointForProcess(
    endpointId: string,
    process: PrismaSessionApplicationProcess,
    sessionId: string,
    organizationId: string,
    userId: string,
    accessMode?: SessionEndpointAccessMode | null,
  ) {
    const endpoint = await prisma.sessionEndpoint.findFirstOrThrow({
      where: { id: endpointId, organizationId },
    });
    const updated = await prisma.sessionEndpoint.update({
      where: { id: endpoint.id },
      data: {
        status: "enabled",
        accessMode: accessMode ?? endpoint.accessMode,
        enabledByUserId: userId,
        enabledAt: new Date(),
        disabledAt: null,
        currentRuntimeInstanceId: process.runtimeInstanceId,
      },
    });
    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_endpoint_forwarding_enabled",
      payload: { endpoint: publicEndpoint(updated) },
      actorType: "user",
      actorId: userId,
    });
    return updated;
  }

  async disableEndpoint(endpointId: string, organizationId: string, userId: string) {
    const endpoint = await prisma.sessionEndpoint.findFirstOrThrow({
      where: { id: endpointId, organizationId },
    });
    await this.assertCanManage(endpoint.sessionGroupId, organizationId, userId);
    const updated = await prisma.sessionEndpoint.update({
      where: { id: endpoint.id },
      data: { status: "disabled", disabledAt: new Date(), currentRuntimeInstanceId: null },
    });
    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: await this.latestSessionIdForGroup(endpoint.sessionGroupId, organizationId),
      eventType: "session_endpoint_forwarding_disabled",
      payload: { endpoint: publicEndpoint(updated) },
      actorType: "user",
      actorId: userId,
    });
    return updated;
  }

  async rotateEndpoint(endpointId: string, organizationId: string, userId: string) {
    const endpoint = await prisma.sessionEndpoint.findFirstOrThrow({
      where: { id: endpointId, organizationId },
    });
    await this.assertCanManage(endpoint.sessionGroupId, organizationId, userId);
    const key = await this.createEndpointKey();
    const updated = await prisma.sessionEndpoint.update({
      where: { id: endpoint.id },
      data: { key },
    });
    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: await this.latestSessionIdForGroup(endpoint.sessionGroupId, organizationId),
      eventType: "session_endpoint_rotated",
      payload: { endpoint: publicEndpoint(updated) },
      actorType: "user",
      actorId: userId,
    });
    return updated;
  }

  async updateTrafficCapture(
    endpointId: string,
    mode: EndpointTrafficCaptureMode,
    organizationId: string,
    userId: string,
  ) {
    const endpoint = await prisma.sessionEndpoint.findFirstOrThrow({
      where: { id: endpointId, organizationId },
    });
    await this.assertCanManage(endpoint.sessionGroupId, organizationId, userId);
    const updated = await prisma.sessionEndpoint.update({
      where: { id: endpoint.id },
      data: { trafficCaptureMode: mode },
    });
    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: await this.latestSessionIdForGroup(endpoint.sessionGroupId, organizationId),
      eventType: "session_endpoint_traffic_capture_updated",
      payload: { endpoint: publicEndpoint(updated) },
      actorType: "user",
      actorId: userId,
    });
    return updated;
  }

  async createEndpointPreview(
    endpointId: string,
    organizationId: string,
    userId: string,
  ): Promise<{ url: string; expiresAt: Date }> {
    const endpoint = await prisma.sessionEndpoint.findFirstOrThrow({
      where: { id: endpointId, organizationId },
      select: {
        id: true,
        sessionGroupId: true,
        status: true,
        revokedAt: true,
        key: true,
      },
    });
    await this.assertCanView(endpoint.sessionGroupId, organizationId, userId);
    if (endpoint.revokedAt || endpoint.status === "revoked") {
      throw new ValidationError("Endpoint has been revoked.");
    }

    const credential = createEndpointPreviewToken({
      userId,
      organizationId,
      endpointId: endpoint.id,
    });
    const url = new URL(buildEndpointUrl(endpoint.key));
    url.pathname = "/__trace_preview_auth";
    url.searchParams.set("token", credential.token);
    url.searchParams.set("next", "/");
    return { url: url.toString(), expiresAt: credential.expiresAt };
  }

  async clearTraffic(endpointId: string, organizationId: string, userId: string) {
    const endpoint = await prisma.sessionEndpoint.findFirstOrThrow({
      where: { id: endpointId, organizationId },
      select: { id: true, sessionGroupId: true },
    });
    await this.assertCanManage(endpoint.sessionGroupId, organizationId, userId);
    await prisma.endpointTrafficEntry.deleteMany({ where: { endpointId: endpoint.id } });
    return true;
  }

  async patchAppTokens(
    sessionGroupId: string,
    tokens: Record<string, unknown>,
    organizationId: string,
    userId: string,
  ) {
    if (!isJsonObject(tokens)) {
      throw new ValidationError("tokens must be an object");
    }
    const { group, sessionId, runtimeId } = await this.resolveCloudRuntime(
      sessionGroupId,
      organizationId,
      userId,
    );
    if (group.kind !== "app") {
      throw new ValidationError("App token tweaks require an app session.");
    }

    const currentContent = await sessionRouter.readFile(
      runtimeId,
      sessionId,
      APP_TOKENS_PATH,
      group.workdir ?? group.sessions[0]?.workdir ?? undefined,
    );
    const currentTokens = parseTokenFile(currentContent);
    const nextTokens = mergeJsonObjects(currentTokens, tokens);
    const nextContent = `${JSON.stringify(nextTokens, null, 2)}\n`;

    await sessionRouter.writeFile(
      runtimeId,
      sessionId,
      APP_TOKENS_PATH,
      nextContent,
      group.workdir ?? group.sessions[0]?.workdir ?? undefined,
    );

    return eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_app_tokens_updated",
      payload: {
        sessionGroupId,
        path: APP_TOKENS_PATH,
        tokens: tokens as Prisma.InputJsonValue,
      } as Prisma.InputJsonValue,
      actorType: "user",
      actorId: userId,
    });
  }

  async publishAppSession(sessionGroupId: string, organizationId: string, userId: string) {
    const group = await prisma.sessionGroup.findFirstOrThrow({
      where: { id: sessionGroupId, organizationId },
      select: {
        id: true,
        kind: true,
        ownerUserId: true,
        sessions: {
          select: { id: true },
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
    });
    await this.assertCanManage(group.id, organizationId, userId, group);
    if (group.kind !== "app") {
      throw new ValidationError("Only app sessions can be published through app publish.");
    }

    const endpoint = await prisma.sessionEndpoint.findFirst({
      where: {
        sessionGroupId,
        organizationId,
        status: "enabled",
      },
      orderBy: [{ appConfigId: "asc" }, { processConfigId: "asc" }, { portConfigId: "asc" }],
    });
    if (!endpoint) {
      throw new ValidationError("Start the app preview before publishing.");
    }

    const updated = await prisma.sessionEndpoint.update({
      where: { id: endpoint.id },
      data: {
        accessMode: "public",
        enabledByUserId: userId,
        enabledAt: endpoint.enabledAt ?? new Date(),
      },
    });
    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: group.sessions[0]?.id ?? sessionGroupId,
      eventType: "session_endpoint_access_updated",
      payload: {
        endpoint: publicEndpoint(updated),
        sessionGroupId,
        published: true,
      },
      actorType: "user",
      actorId: userId,
    });
    return updated;
  }

  // Reflect a destroyed runtime (archive, idle cleanup, container loss): mark
  // every live process for the group stopped and disable its endpoints, emitting
  // the same per-entity events the UI already consumes.
  async markSessionGroupRuntimeStopped(sessionGroupId: string, organizationId: string) {
    const processes = await prisma.sessionApplicationProcess.findMany({
      where: {
        sessionGroupId,
        organizationId,
        status: { in: ["starting", "running", "stopping"] },
      },
    });
    for (const existing of processes) {
      const process = await prisma.sessionApplicationProcess.update({
        where: { id: existing.id },
        data: {
          status: "stopped",
          stoppedAt: new Date(),
          runtimeInstanceId: null,
          bridgeProcessId: null,
        },
      });
      await eventService.create({
        organizationId,
        scopeType: "session",
        scopeId: sessionGroupId,
        eventType: "session_application_process_stopped",
        payload: { process: publicProcess(process) },
        actorType: "system",
        actorId: "session-application-service",
      });
    }

    const endpoints = await prisma.sessionEndpoint.findMany({
      where: { sessionGroupId, organizationId, status: "enabled" },
    });
    for (const existing of endpoints) {
      const endpoint = await prisma.sessionEndpoint.update({
        where: { id: existing.id },
        data: { status: "disabled", disabledAt: new Date(), currentRuntimeInstanceId: null },
      });
      await eventService.create({
        organizationId,
        scopeType: "session",
        scopeId: sessionGroupId,
        eventType: "session_endpoint_forwarding_disabled",
        payload: { endpoint: publicEndpoint(endpoint) },
        actorType: "system",
        actorId: "session-application-service",
      });
    }
  }

  async deleteExpiredTraffic(retentionHours: number) {
    const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
    const result = await prisma.endpointTrafficEntry.deleteMany({
      where: { startedAt: { lt: cutoff } },
    });
    return result.count;
  }

  async markProcessRunning(processId: string, organizationId: string, bridgeProcessId: string) {
    const existing = await prisma.sessionApplicationProcess.findFirst({
      where: { id: processId, organizationId },
      select: { id: true },
    });
    if (!existing) return null;

    const process = await prisma.sessionApplicationProcess.update({
      where: { id: processId },
      data: { status: "running", bridgeProcessId, lastHeartbeatAt: new Date() },
    });
    await eventService.create({
      organizationId: process.organizationId,
      scopeType: "session",
      scopeId: process.sessionGroupId,
      eventType: "session_application_process_started",
      payload: { process: publicProcess(process) },
      actorType: "system",
      actorId: "bridge",
    });
    return process;
  }

  async completeSetupScriptRun(
    runId: string,
    organizationId: string,
    result: { exitCode: number; output?: string; error?: string },
  ) {
    const existing = await prisma.sessionSetupScriptRun.findFirst({
      where: { id: runId, organizationId },
      select: { id: true },
    });
    if (!existing) return null;
    const output = result.output ?? "";
    const outputPreview =
      output.length > SETUP_OUTPUT_PREVIEW_LIMIT
        ? output.slice(0, SETUP_OUTPUT_PREVIEW_LIMIT)
        : output || null;
    const run = await prisma.sessionSetupScriptRun.update({
      where: { id: runId },
      data: {
        status: result.exitCode === 0 && !result.error ? "completed" : "failed",
        exitCode: result.exitCode,
        outputPreview,
        outputTruncated: output.length > SETUP_OUTPUT_PREVIEW_LIMIT,
        lastError:
          result.error ?? (result.exitCode === 0 ? null : `Exited with ${result.exitCode}`),
        completedAt: new Date(),
      },
    });
    await eventService.create({
      organizationId: run.organizationId,
      scopeType: "session",
      scopeId: run.sessionGroupId,
      eventType:
        run.status === "completed"
          ? "session_setup_script_completed"
          : "session_setup_script_failed",
      payload: {
        setupScriptRun: {
          id: run.id,
          sessionGroupId: run.sessionGroupId,
          scriptConfigId: run.scriptConfigId,
          label: run.label,
          command: run.command,
          workingDirectory: run.workingDirectory,
          status: run.status,
          exitCode: run.exitCode,
          outputPreview: run.outputPreview,
          outputTruncated: run.outputTruncated,
          lastError: run.lastError,
          startedAt: run.startedAt.toISOString(),
          completedAt: run.completedAt?.toISOString() ?? null,
        },
      },
      actorType: "system",
      actorId: "bridge",
    });
    return run;
  }

  async appendSetupScriptOutput(runId: string, organizationId: string, data: string) {
    if (!data) return null;
    const run = await prisma.sessionSetupScriptRun.findFirst({
      where: { id: runId, organizationId },
      select: {
        id: true,
        status: true,
        outputPreview: true,
        outputTruncated: true,
      },
    });
    if (!run || run.status !== "running") return run;

    const next = `${run.outputPreview ?? ""}${data}`;
    return prisma.sessionSetupScriptRun.update({
      where: { id: runId },
      data: {
        outputPreview:
          next.length > SETUP_OUTPUT_PREVIEW_LIMIT
            ? next.slice(0, SETUP_OUTPUT_PREVIEW_LIMIT)
            : next,
        outputTruncated: run.outputTruncated || next.length > SETUP_OUTPUT_PREVIEW_LIMIT,
      },
    });
  }

  async markProcessExited(
    processId: string,
    organizationId: string,
    exitCode: number | null,
    error?: string | null,
  ) {
    const existing = await prisma.sessionApplicationProcess.findFirst({
      where: { id: processId, organizationId },
      select: { id: true },
    });
    if (!existing) return null;

    const process = await prisma.sessionApplicationProcess.update({
      where: { id: processId },
      data: {
        status: error ? "failed" : "exited",
        exitCode,
        lastError: error,
        stoppedAt: new Date(),
        runtimeInstanceId: null,
        bridgeProcessId: null,
      },
    });
    await prisma.sessionEndpoint.updateMany({
      where: {
        sessionGroupId: process.sessionGroupId,
        appConfigId: process.appConfigId,
        processConfigId: process.processConfigId,
        status: "enabled",
      },
      data: { status: "disabled", disabledAt: new Date(), currentRuntimeInstanceId: null },
    });
    await eventService.create({
      organizationId: process.organizationId,
      scopeType: "session",
      scopeId: process.sessionGroupId,
      eventType: error
        ? "session_application_process_failed"
        : "session_application_process_stopped",
      payload: { process: publicProcess(process) },
      actorType: "system",
      actorId: "bridge",
    });
    return process;
  }

  // Log chunks for one process arrive concurrently (stdout + stderr) over a
  // single runtime connection bound to this server instance. Serialize the
  // read-then-write sequence assignment per process so concurrent chunks can't
  // collide on the same sequence number and corrupt pagination.
  async appendProcessLog(
    processId: string,
    organizationId: string,
    stream: "stdout" | "stderr",
    data: string,
  ) {
    if (!data) return null;
    const prior = this.logAppendChains.get(processId) ?? Promise.resolve();
    const next = prior
      .catch(() => undefined)
      .then(() => this.writeProcessLog(processId, organizationId, stream, data));
    this.logAppendChains.set(processId, next);
    void next.finally(() => {
      if (this.logAppendChains.get(processId) === next) this.logAppendChains.delete(processId);
    });
    return next;
  }

  private async writeProcessLog(
    processId: string,
    organizationId: string,
    stream: "stdout" | "stderr",
    data: string,
  ) {
    const process = await prisma.sessionApplicationProcess.findFirst({
      where: { id: processId, organizationId },
      select: { id: true, organizationId: true, sessionGroupId: true },
    });
    if (!process) return null;

    const entry = await prisma.$transaction(async (tx) => {
      const last = await tx.sessionApplicationLogEntry.findFirst({
        where: { processId },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });
      const sequence = (last?.sequence ?? 0) + 1;
      const created = await tx.sessionApplicationLogEntry.create({
        data: {
          organizationId: process.organizationId,
          processId,
          stream,
          data: truncateProcessLogData(data),
          sequence,
        },
      });
      if (sequence % PROCESS_LOG_PRUNE_INTERVAL === 0) {
        await pruneProcessLogs(tx, processId);
      }
      return created;
    });
    return entry;
  }

  private async markProcessFailed(
    processId: string,
    organizationId: string,
    sessionId: string,
    userId: string,
    error: string,
  ) {
    const process = await prisma.sessionApplicationProcess.update({
      where: { id: processId },
      data: { status: "failed", lastError: error, stoppedAt: new Date(), runtimeInstanceId: null },
    });
    await eventService.create({
      organizationId,
      scopeType: "session",
      scopeId: sessionId,
      eventType: "session_application_process_failed",
      payload: { process: publicProcess(process) },
      actorType: "user",
      actorId: userId,
    });
  }

  private async ensureEndpoints(
    tx: Tx,
    group: ManagedSessionGroup,
    sessionId: string,
    appConfigId: string,
    processConfigId: string,
    ports: Array<{ id: string; label: string; port: number; protocol: string }>,
  ) {
    for (const port of ports) {
      const existing = await tx.sessionEndpoint.findUnique({
        where: {
          sessionGroupId_appConfigId_processConfigId_portConfigId: {
            sessionGroupId: group.id,
            appConfigId,
            processConfigId,
            portConfigId: port.id,
          },
        },
      });
      if (existing) continue;
      const endpoint = await tx.sessionEndpoint.create({
        data: {
          key: await this.createEndpointKey(tx),
          organizationId: group.organizationId,
          sessionGroupId: group.id,
          repoId: group.repoId ?? null,
          appConfigId,
          processConfigId,
          portConfigId: port.id,
          label: port.label,
          targetPort: port.port,
          protocol: port.protocol,
        },
      });
      await eventService.create(
        {
          organizationId: group.organizationId,
          scopeType: "session",
          scopeId: sessionId,
          eventType: "session_endpoint_created",
          payload: { endpoint: publicEndpoint(endpoint) },
          actorType: "system",
          actorId: "session-application-service",
        },
        tx,
      );
    }
  }

  private async createEndpointKey(tx: Pick<Tx, "sessionEndpoint"> | typeof prisma = prisma) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const key = generateEndpointKey();
      const existing = await tx.sessionEndpoint.findUnique({
        where: { key },
        select: { id: true },
      });
      if (!existing) return key;
    }
    throw new Error("Could not generate unique endpoint key");
  }

  private async latestSessionIdForGroup(sessionGroupId: string, organizationId: string) {
    const session = await prisma.session.findFirst({
      where: { sessionGroupId, organizationId },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    return session?.id ?? sessionGroupId;
  }

  // Env vars in the repo config reference org secrets by name; the plaintext
  // value is never stored in the config. Resolve to actual values here, right
  // before handing the process off to the runtime.
  private async resolveEnv(
    organizationId: string,
    env: RepoEnvVar[] | null | undefined,
  ): Promise<Record<string, string> | undefined> {
    if (!env || env.length === 0) return undefined;
    const resolved: Record<string, string> = {};
    const missing = new Set<string>();
    for (const entry of env) {
      const value = await orgSecretService.getDecryptedValueByName(
        organizationId,
        entry.secretName,
      );
      if (value == null) {
        missing.add(entry.secretName);
        continue;
      }
      resolved[entry.key] = value;
    }
    if (missing.size > 0) {
      throw new ValidationError(`Missing org secrets: ${[...missing].join(", ")}`);
    }
    return resolved;
  }

  private getApplication(group: ManagedSessionGroup, appConfigId: string) {
    const setupConfig =
      group.repo?.setupConfig ?? (group.kind === "app" ? buildDefaultAppSetupConfig() : null);
    const config = repoApplicationConfigService.parseApplicationConfig(setupConfig);
    const app = config.applications.find((candidate) => candidate.id === appConfigId);
    if (!app) throw new ValidationError("Application not found");
    return app;
  }

  private async resolveCloudRuntime(
    sessionGroupId: string,
    organizationId: string,
    userId: string | null | undefined,
  ) {
    if (!userId) throw new AuthenticationError();
    const group = await prisma.sessionGroup.findFirstOrThrow({
      where: { id: sessionGroupId, organizationId },
      select: {
        id: true,
        organizationId: true,
        kind: true,
        ownerUserId: true,
        visibility: true,
        repoId: true,
        workdir: true,
        repo: { select: { id: true, setupConfig: true } },
        sessions: {
          select: { id: true, workdir: true, connection: true },
          orderBy: { updatedAt: "desc" },
        },
      },
    });
    await this.assertCanManage(group.id, organizationId, userId, group);
    if (group.kind !== "app" && (!group.repoId || !group.repo)) {
      throw new ValidationError("Session group does not have a repo");
    }
    const session = group.sessions.find((candidate) =>
      connectionRuntimeInstanceId(candidate.connection),
    );
    if (!session) throw new ValidationError("Session group does not have a connected runtime");
    const runtimeId = connectionRuntimeInstanceId(session.connection);
    if (!runtimeId) throw new ValidationError("Session group does not have a connected runtime");
    const runtime = sessionRouter.getRuntime(runtimeId, organizationId);
    if (!runtime || runtime.ws.readyState !== runtime.ws.OPEN) {
      throw new ValidationError("Session group runtime is not connected");
    }
    if (runtime.hostingMode !== "cloud") {
      throw new ValidationError(
        "Application forwarding is currently only available for cloud sessions",
      );
    }
    return { group: group as ManagedSessionGroup, sessionId: session.id, runtimeId: runtime.key };
  }

  private async assertCanView(
    sessionGroupId: string,
    organizationId: string,
    userId: string | null | undefined,
  ) {
    if (!userId) throw new AuthenticationError();
    const group = await prisma.sessionGroup.findFirstOrThrow({
      where: { id: sessionGroupId, organizationId },
      select: { visibility: true, ownerUserId: true },
    });
    if (!canViewSessionGroup(group, userId)) {
      throw new AuthorizationError("Not authorized for this session group");
    }
  }

  private async assertCanManage(
    sessionGroupId: string,
    organizationId: string,
    userId: string,
    preloaded?: { ownerUserId: string },
  ) {
    const group =
      preloaded ??
      (await prisma.sessionGroup.findFirstOrThrow({
        where: { id: sessionGroupId, organizationId },
        select: { ownerUserId: true },
      }));
    if (group.ownerUserId === userId) return;
    const member = await prisma.orgMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { role: true },
    });
    if (member?.role !== "admin") {
      throw new AuthorizationError(
        "Only the session owner or an org admin can manage applications",
      );
    }
  }
}

export const sessionApplicationService = new SessionApplicationService();

function truncateProcessLogData(data: string): string {
  if (data.length <= PROCESS_LOG_ENTRY_MAX_CHARS) return data;
  const prefixLength = Math.max(
    PROCESS_LOG_ENTRY_MAX_CHARS - PROCESS_LOG_TRUNCATION_SUFFIX.length,
    0,
  );
  return `${data.slice(0, prefixLength)}${PROCESS_LOG_TRUNCATION_SUFFIX}`;
}

async function pruneProcessLogs(tx: Tx, processId: string): Promise<void> {
  const staleEntries = await tx.sessionApplicationLogEntry.findMany({
    where: { processId },
    orderBy: { sequence: "desc" },
    skip: PROCESS_LOG_RETAINED_ROWS,
    take: PROCESS_LOG_PRUNE_BATCH,
    select: { id: true },
  });
  if (staleEntries.length === 0) return;
  await tx.sessionApplicationLogEntry.deleteMany({
    where: { id: { in: staleEntries.map((entry) => entry.id) } },
  });
}
