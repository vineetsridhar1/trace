import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: {
    getRuntime: vi.fn(),
    readFile: vi.fn(),
    sendToRuntime: vi.fn().mockReturnValue("delivered"),
    writeFile: vi.fn(),
  },
}));

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { sessionRouter } from "../lib/session-router.js";
import { eventService } from "./event.js";
import {
  PROCESS_LOG_ENTRY_MAX_CHARS,
  PROCESS_LOG_RETAINED_ROWS,
  SessionApplicationService,
} from "./session-applications.js";
import { verifyEndpointPreviewToken } from "./endpoint-preview-auth.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const sessionRouterMock = sessionRouter as unknown as {
  getRuntime: ReturnType<typeof vi.fn>;
  readFile: ReturnType<typeof vi.fn>;
  sendToRuntime: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
};
const eventServiceMock = eventService as unknown as { create: ReturnType<typeof vi.fn> };

function mockGroup() {
  prismaMock.sessionGroup.findFirstOrThrow.mockResolvedValue({
    id: "group-1",
    organizationId: "org-1",
    kind: "coding",
    ownerUserId: "user-1",
    visibility: "public",
    repoId: "repo-1",
    workdir: "/workspace",
    repo: {
      id: "repo-1",
      setupConfig: {
        applications: {
          setupScripts: [],
          applications: [
            {
              id: "web",
              name: "Web",
              processes: [
                {
                  id: "dev",
                  name: "Dev",
                  command: "pnpm dev",
                  workingDirectory: ".",
                  required: true,
                  ports: [
                    {
                      id: "web",
                      label: "Web",
                      port: 3000,
                      protocol: "http",
                      defaultForwardingEnabled: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    sessions: [
      {
        id: "session-1",
        workdir: "/workspace",
        connection: { runtimeInstanceId: "runtime-1" },
      },
    ],
  });
}

describe("SessionApplicationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGroup();
    sessionRouterMock.getRuntime.mockReturnValue({
      key: "runtime-1",
      id: "runtime-1",
      hostingMode: "cloud",
      ws: { readyState: 1, OPEN: 1 },
    });
    sessionRouterMock.sendToRuntime.mockReturnValue("delivered");
    sessionRouterMock.readFile.mockResolvedValue("{}");
    sessionRouterMock.writeFile.mockResolvedValue(undefined);
    prismaMock.sessionEndpoint.findUnique.mockResolvedValue(null);
    prismaMock.sessionEndpoint.create.mockResolvedValue({
      id: "endpoint-1",
      key: "endpointkey1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      repoId: "repo-1",
      appConfigId: "web",
      processConfigId: "dev",
      portConfigId: "web",
      label: "Web",
      targetPort: 3000,
      protocol: "http",
      status: "disabled",
      accessMode: "private",
      trafficCaptureMode: "metadata",
      enabledAt: null,
      disabledAt: null,
      revokedAt: null,
    });
    prismaMock.sessionApplicationProcess.upsert.mockResolvedValue({
      id: "process-1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      repoId: "repo-1",
      appConfigId: "web",
      processConfigId: "dev",
      label: "Dev",
      command: "pnpm dev",
      workingDirectory: ".",
      status: "starting",
      runtimeInstanceId: "runtime-1",
      bridgeProcessId: null,
      exitCode: null,
      lastError: null,
      startedByUserId: "user-1",
      startedAt: new Date("2026-06-07T00:00:00.000Z"),
      stoppedAt: null,
      lastHeartbeatAt: null,
      createdAt: new Date("2026-06-07T00:00:00.000Z"),
      updatedAt: new Date("2026-06-07T00:00:00.000Z"),
    });
  });

  it("rejects non-cloud runtimes at the service layer", async () => {
    sessionRouterMock.getRuntime.mockReturnValueOnce({
      key: "runtime-1",
      id: "runtime-1",
      hostingMode: "local",
      ws: { readyState: 1, OPEN: 1 },
    });

    await expect(
      new SessionApplicationService().startProcess("group-1", "web", "dev", "org-1", "user-1"),
    ).rejects.toThrow("Application forwarding is currently only available for cloud sessions");
  });

  it("starts a process and creates missing endpoint records for configured ports", async () => {
    const process = await new SessionApplicationService().startProcess(
      "group-1",
      "web",
      "dev",
      "org-1",
      "user-1",
    );

    expect(process.id).toBe("process-1");
    expect(prismaMock.sessionApplicationProcess.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionGroupId_appConfigId_processConfigId: {
            sessionGroupId: "group-1",
            appConfigId: "web",
            processConfigId: "dev",
          },
        },
      }),
    );
    expect(prismaMock.sessionEndpoint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionGroupId: "group-1",
          appConfigId: "web",
          processConfigId: "dev",
          portConfigId: "web",
          targetPort: 3000,
        }),
      }),
    );
    expect(sessionRouterMock.sendToRuntime).toHaveBeenCalledWith(
      "runtime-1",
      expect.objectContaining({ type: "app_process_start", processInstanceId: "process-1" }),
      "org-1",
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "session_endpoint_created" }),
      prismaMock,
    );
  });

  it("creates and enables endpoints for runtime-detected listening ports", async () => {
    const process = {
      id: "process-1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      repoId: "repo-1",
      appConfigId: "web",
      processConfigId: "dev",
      label: "Dev",
      command: "pnpm dev",
      workingDirectory: ".",
      status: "running",
      runtimeInstanceId: "runtime-1",
      bridgeProcessId: "bridge-process-1",
      exitCode: null,
      lastError: null,
      startedByUserId: "user-1",
      startedAt: new Date("2026-06-07T00:00:00.000Z"),
      stoppedAt: null,
      lastHeartbeatAt: null,
      createdAt: new Date("2026-06-07T00:00:00.000Z"),
      updatedAt: new Date("2026-06-07T00:00:00.000Z"),
    };
    const endpoint = {
      id: "endpoint-detected",
      key: "endpointkey2",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      repoId: "repo-1",
      appConfigId: "web",
      processConfigId: "dev",
      portConfigId: "detected-5173",
      label: "Port 5173",
      targetPort: 5173,
      protocol: "http",
      status: "disabled",
      accessMode: "private",
      trafficCaptureMode: "metadata",
      enabledAt: null,
      disabledAt: null,
      revokedAt: null,
    };

    prismaMock.sessionApplicationProcess.findFirst.mockResolvedValueOnce(process);
    prismaMock.sessionEndpoint.findUnique.mockResolvedValueOnce(null);
    prismaMock.sessionEndpoint.create.mockResolvedValueOnce(endpoint);
    prismaMock.sessionEndpoint.findMany.mockResolvedValueOnce([endpoint]);
    prismaMock.sessionEndpoint.findFirstOrThrow.mockResolvedValueOnce(endpoint);
    prismaMock.sessionEndpoint.update.mockResolvedValueOnce({
      ...endpoint,
      status: "enabled",
      enabledByUserId: "user-1",
      enabledAt: new Date("2026-06-07T00:00:01.000Z"),
      currentRuntimeInstanceId: "runtime-1",
    });

    const endpoints = await new SessionApplicationService().recordDetectedPorts(
      "process-1",
      "org-1",
      [
        { port: 5173, protocol: "http" },
        { port: 5173, protocol: "http" },
        { port: 22, protocol: "http" },
      ],
    );

    expect(endpoints).toEqual([endpoint]);
    expect(prismaMock.sessionEndpoint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionGroupId: "group-1",
          appConfigId: "web",
          processConfigId: "dev",
          portConfigId: "detected-5173",
          label: "Port 5173",
          targetPort: 5173,
        }),
      }),
    );
    expect(prismaMock.sessionEndpoint.update).toHaveBeenCalledWith({
      where: { id: "endpoint-detected" },
      data: expect.objectContaining({
        status: "enabled",
        enabledByUserId: "user-1",
        currentRuntimeInstanceId: "runtime-1",
      }),
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "session_endpoint_created" }),
      prismaMock,
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "session_endpoint_forwarding_enabled",
        actorType: "system",
        actorId: "bridge",
      }),
    );
  });

  it("starts the default app preview before a managed repo exists", async () => {
    const repoLessAppGroup = {
      id: "group-1",
      organizationId: "org-1",
      kind: "app",
      ownerUserId: "user-1",
      visibility: "public",
      repoId: null,
      workdir: "/home/coder",
      repo: null,
      sessions: [
        {
          id: "session-1",
          workdir: "/home/coder",
          connection: { runtimeInstanceId: "runtime-1" },
        },
      ],
    };
    prismaMock.sessionGroup.findFirstOrThrow
      .mockResolvedValueOnce(repoLessAppGroup)
      .mockResolvedValueOnce(repoLessAppGroup);
    prismaMock.sessionApplicationProcess.upsert.mockResolvedValueOnce({
      id: "process-1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      repoId: null,
      appConfigId: "web",
      processConfigId: "dev",
      label: "Next.js dev server",
      command: "pnpm dev --hostname 0.0.0.0",
      workingDirectory: ".",
      status: "starting",
      runtimeInstanceId: "runtime-1",
      bridgeProcessId: null,
      exitCode: null,
      lastError: null,
      startedByUserId: "user-1",
      startedAt: new Date("2026-06-07T00:00:00.000Z"),
      stoppedAt: null,
      lastHeartbeatAt: null,
      createdAt: new Date("2026-06-07T00:00:00.000Z"),
      updatedAt: new Date("2026-06-07T00:00:00.000Z"),
    });
    prismaMock.sessionEndpoint.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "endpoint-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        appConfigId: "web",
        processConfigId: "dev",
        portConfigId: "web",
        accessMode: "private",
      });
    prismaMock.sessionEndpoint.findFirstOrThrow.mockResolvedValueOnce({
      id: "endpoint-1",
      key: "endpointkey1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      repoId: null,
      appConfigId: "web",
      processConfigId: "dev",
      portConfigId: "web",
      label: "Web",
      targetPort: 3000,
      protocol: "http",
      status: "disabled",
      accessMode: "private",
      trafficCaptureMode: "metadata",
      enabledAt: null,
      disabledAt: null,
      revokedAt: null,
    });
    prismaMock.sessionEndpoint.update.mockResolvedValueOnce({
      id: "endpoint-1",
      key: "endpointkey1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      repoId: null,
      appConfigId: "web",
      processConfigId: "dev",
      portConfigId: "web",
      label: "Web",
      targetPort: 3000,
      protocol: "http",
      status: "enabled",
      accessMode: "private",
      trafficCaptureMode: "metadata",
      enabledAt: new Date("2026-06-07T00:00:00.000Z"),
      disabledAt: null,
      revokedAt: null,
    });

    await new SessionApplicationService().startApplication("group-1", "web", "org-1", "user-1");

    expect(prismaMock.sessionApplicationProcess.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          repoId: null,
          command: "pnpm dev --hostname 0.0.0.0",
        }),
      }),
    );
    expect(prismaMock.sessionEndpoint.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ repoId: null, targetPort: 3000 }),
      }),
    );
    expect(prismaMock.sessionEndpoint.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "endpoint-1" },
        data: expect.objectContaining({
          status: "enabled",
          currentRuntimeInstanceId: "runtime-1",
        }),
      }),
    );
  });

  it("runs the app preview lifecycle and publishes the live endpoint on the session timeline", async () => {
    const service = new SessionApplicationService();
    prismaMock.sessionGroup.findFirstOrThrow.mockReset();
    prismaMock.sessionApplicationProcess.upsert.mockReset();
    prismaMock.sessionApplicationProcess.findFirst.mockReset();
    prismaMock.sessionApplicationProcess.update.mockReset();
    prismaMock.sessionEndpoint.findUnique.mockReset();
    prismaMock.sessionEndpoint.findFirst.mockReset();
    prismaMock.sessionEndpoint.findFirstOrThrow.mockReset();
    prismaMock.sessionEndpoint.create.mockReset();
    prismaMock.sessionEndpoint.update.mockReset();
    prismaMock.sessionApplicationLogEntry.findFirst.mockReset();
    prismaMock.sessionApplicationLogEntry.create.mockReset();

    const appGroup = {
      id: "group-1",
      organizationId: "org-1",
      kind: "app",
      ownerUserId: "user-1",
      visibility: "public",
      repoId: null,
      workdir: "/home/coder",
      repo: null,
      sessions: [
        {
          id: "session-1",
          workdir: "/home/coder",
          connection: { runtimeInstanceId: "runtime-1" },
        },
      ],
    };
    const startingProcess = {
      id: "process-1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      repoId: null,
      appConfigId: "web",
      processConfigId: "dev",
      label: "Next.js dev server",
      command: "pnpm dev --hostname 0.0.0.0",
      workingDirectory: ".",
      status: "starting",
      runtimeInstanceId: "runtime-1",
      bridgeProcessId: null,
      exitCode: null,
      lastError: null,
      startedByUserId: "user-1",
      startedAt: new Date("2026-06-07T00:00:00.000Z"),
      stoppedAt: null,
      lastHeartbeatAt: null,
      createdAt: new Date("2026-06-07T00:00:00.000Z"),
      updatedAt: new Date("2026-06-07T00:00:00.000Z"),
    };
    const runningProcess = {
      ...startingProcess,
      status: "running",
      bridgeProcessId: "bridge-process-1",
      lastHeartbeatAt: new Date("2026-06-07T00:00:01.000Z"),
    };
    const disabledEndpoint = {
      id: "endpoint-1",
      key: "endpointkey1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      repoId: null,
      appConfigId: "web",
      processConfigId: "dev",
      portConfigId: "web",
      label: "Web",
      targetPort: 3000,
      protocol: "http",
      status: "disabled",
      accessMode: "private",
      trafficCaptureMode: "metadata",
      enabledAt: null,
      disabledAt: null,
      revokedAt: null,
    };
    const enabledEndpoint = {
      ...disabledEndpoint,
      status: "enabled",
      enabledAt: new Date("2026-06-07T00:00:02.000Z"),
      currentRuntimeInstanceId: "runtime-1",
    };
    const publicEndpoint = {
      ...enabledEndpoint,
      accessMode: "public",
    };

    prismaMock.sessionGroup.findFirstOrThrow
      .mockResolvedValueOnce(appGroup)
      .mockResolvedValueOnce(appGroup)
      .mockResolvedValueOnce({
        id: "group-1",
        kind: "app",
        ownerUserId: "user-1",
        sessions: [{ id: "session-1" }],
      });
    prismaMock.sessionApplicationProcess.upsert.mockResolvedValueOnce(startingProcess);
    prismaMock.sessionEndpoint.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "endpoint-1" });
    prismaMock.sessionEndpoint.create.mockResolvedValueOnce(disabledEndpoint);
    prismaMock.sessionEndpoint.findFirstOrThrow.mockResolvedValueOnce(disabledEndpoint);
    prismaMock.sessionEndpoint.update
      .mockResolvedValueOnce(enabledEndpoint)
      .mockResolvedValueOnce(publicEndpoint);
    prismaMock.sessionApplicationProcess.findFirst
      .mockResolvedValueOnce({ id: "process-1" })
      .mockResolvedValueOnce({
        id: "process-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
      });
    prismaMock.sessionApplicationProcess.update.mockResolvedValueOnce(runningProcess);
    prismaMock.sessionApplicationProcess.findUnique.mockResolvedValueOnce({
      id: "process-1",
      status: "running",
    });
    prismaMock.sessionApplicationLogEntry.findFirst.mockResolvedValueOnce(null);
    prismaMock.sessionApplicationLogEntry.create.mockResolvedValueOnce({
      id: "log-1",
      organizationId: "org-1",
      processId: "process-1",
      stream: "stdout",
      data: "ready on 3000",
      sequence: 1,
      timestamp: new Date("2026-06-07T00:00:03.000Z"),
    });
    prismaMock.sessionEndpoint.findFirst.mockResolvedValueOnce(enabledEndpoint);

    await service.startApplication("group-1", "web", "org-1", "user-1");
    await service.markProcessRunning("process-1", "org-1", "bridge-process-1");
    await service.appendProcessLog("process-1", "org-1", "stdout", "ready on 3000");
    const endpoint = await service.publishAppSession("group-1", "org-1", "user-1");

    expect(endpoint.accessMode).toBe("public");
    expect(sessionRouterMock.sendToRuntime).toHaveBeenCalledWith(
      "runtime-1",
      expect.objectContaining({
        type: "app_process_start",
        command: "pnpm dev --hostname 0.0.0.0",
        ports: [expect.objectContaining({ port: 3000 })],
      }),
      "org-1",
    );
    expect(prismaMock.sessionApplicationLogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        processId: "process-1",
        stream: "stdout",
        data: "ready on 3000",
        sequence: 1,
      }),
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "session_endpoint_created",
        scopeId: "session-1",
      }),
      prismaMock,
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "session_endpoint_forwarding_enabled",
        scopeId: "session-1",
        payload: expect.objectContaining({
          endpoint: expect.objectContaining({ status: "enabled" }),
        }),
      }),
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "session_endpoint_access_updated",
        scopeId: "session-1",
        payload: expect.objectContaining({
          published: true,
          endpoint: expect.objectContaining({ accessMode: "public" }),
        }),
      }),
    );
  });

  it("requires a running process before enabling forwarding", async () => {
    prismaMock.sessionEndpoint.findFirstOrThrow.mockResolvedValueOnce({
      id: "endpoint-1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      appConfigId: "web",
      processConfigId: "dev",
      accessMode: "private",
    });
    prismaMock.sessionGroup.findFirstOrThrow.mockResolvedValueOnce({ ownerUserId: "user-1" });
    prismaMock.sessionApplicationProcess.findUnique.mockResolvedValueOnce({
      id: "process-1",
      status: "stopped",
    });

    await expect(
      new SessionApplicationService().enableEndpoint("endpoint-1", "org-1", "user-1"),
    ).rejects.toThrow("Start the process first (current status: stopped)");
  });

  it("publishes the primary app endpoint", async () => {
    prismaMock.sessionGroup.findFirstOrThrow.mockResolvedValueOnce({
      id: "group-1",
      kind: "app",
      ownerUserId: "user-1",
      sessions: [{ id: "session-1" }],
    });
    prismaMock.sessionEndpoint.findFirst.mockResolvedValueOnce({
      id: "endpoint-1",
      key: "endpointkey1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      repoId: "repo-1",
      appConfigId: "web",
      processConfigId: "dev",
      portConfigId: "web",
      label: "Web",
      targetPort: 3000,
      protocol: "http",
      status: "enabled",
      accessMode: "private",
      trafficCaptureMode: "metadata",
      enabledAt: new Date("2026-07-09T10:00:00.000Z"),
      disabledAt: null,
      revokedAt: null,
    });
    prismaMock.sessionApplicationProcess.findUnique.mockResolvedValueOnce({
      id: "process-1",
      status: "running",
    });
    prismaMock.sessionEndpoint.update.mockResolvedValueOnce({
      id: "endpoint-1",
      key: "endpointkey1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      repoId: "repo-1",
      appConfigId: "web",
      processConfigId: "dev",
      portConfigId: "web",
      label: "Web",
      targetPort: 3000,
      protocol: "http",
      status: "enabled",
      accessMode: "public",
      trafficCaptureMode: "metadata",
      enabledAt: new Date("2026-07-09T10:00:00.000Z"),
      disabledAt: null,
      revokedAt: null,
    });

    const endpoint = await new SessionApplicationService().publishAppSession(
      "group-1",
      "org-1",
      "user-1",
    );

    expect(endpoint.accessMode).toBe("public");
    expect(prismaMock.sessionApplicationProcess.findUnique).toHaveBeenCalledWith({
      where: {
        sessionGroupId_appConfigId_processConfigId: {
          sessionGroupId: "group-1",
          appConfigId: "web",
          processConfigId: "dev",
        },
      },
    });
    expect(prismaMock.sessionEndpoint.update).toHaveBeenCalledWith({
      where: { id: "endpoint-1" },
      data: {
        accessMode: "public",
        enabledByUserId: "user-1",
        enabledAt: new Date("2026-07-09T10:00:00.000Z"),
      },
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "session_endpoint_access_updated",
        payload: expect.objectContaining({
          published: true,
          endpoint: expect.objectContaining({
            accessMode: "public",
            url: expect.stringContaining("endpointkey1"),
          }),
        }),
      }),
    );
  });

  it("rejects publishing a stale enabled endpoint when its process is not running", async () => {
    prismaMock.sessionGroup.findFirstOrThrow.mockResolvedValueOnce({
      id: "group-1",
      kind: "app",
      ownerUserId: "user-1",
      sessions: [{ id: "session-1" }],
    });
    prismaMock.sessionEndpoint.findFirst.mockResolvedValueOnce({
      id: "endpoint-1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      appConfigId: "web",
      processConfigId: "dev",
      portConfigId: "web",
      status: "enabled",
      accessMode: "private",
    });
    prismaMock.sessionApplicationProcess.findUnique.mockResolvedValueOnce({
      id: "process-1",
      status: "stopped",
    });

    await expect(
      new SessionApplicationService().publishAppSession("group-1", "org-1", "user-1"),
    ).rejects.toThrow("Start the app preview before publishing.");
    expect(prismaMock.sessionEndpoint.update).not.toHaveBeenCalled();
  });

  it("mints a signed private endpoint preview URL for authorized viewers", async () => {
    prismaMock.sessionEndpoint.findFirstOrThrow.mockResolvedValueOnce({
      id: "endpoint-1",
      key: "endpointkey1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      status: "enabled",
      revokedAt: null,
    });
    prismaMock.sessionGroup.findFirstOrThrow.mockResolvedValueOnce({
      visibility: "public",
      ownerUserId: "owner-1",
    });

    const preview = await new SessionApplicationService().createEndpointPreview(
      "endpoint-1",
      "org-1",
      "user-1",
    );

    const url = new URL(preview.url);
    const token = url.searchParams.get("token");
    expect(url.hostname).toBe("endpointkey1.preview.localhost");
    expect(url.pathname).toBe("/__trace_preview_auth");
    expect(url.searchParams.get("next")).toBe("/");
    expect(token).toBeTruthy();
    expect(token ? verifyEndpointPreviewToken(token) : null).toMatchObject({
      tokenType: "endpoint_preview",
      userId: "user-1",
      organizationId: "org-1",
      endpointId: "endpoint-1",
    });
    expect(preview.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("patches app token files through the live cloud bridge", async () => {
    prismaMock.sessionGroup.findFirstOrThrow.mockResolvedValueOnce({
      id: "group-1",
      organizationId: "org-1",
      kind: "app",
      ownerUserId: "user-1",
      visibility: "public",
      repoId: null,
      workdir: "/home/coder",
      repo: null,
      sessions: [
        {
          id: "session-1",
          workdir: "/home/coder",
          connection: { runtimeInstanceId: "runtime-1" },
        },
      ],
    });
    sessionRouterMock.readFile.mockResolvedValueOnce(
      JSON.stringify({
        color: {
          background: "#ffffff",
          primary: "#2563eb",
        },
        radius: {
          card: "8px",
        },
      }),
    );
    eventServiceMock.create.mockResolvedValueOnce({ id: "event-1" });

    const event = await new SessionApplicationService().patchAppTokens(
      "group-1",
      { color: { primary: "#ef4444" } },
      "org-1",
      "user-1",
    );

    expect(event).toEqual({ id: "event-1" });
    expect(sessionRouterMock.readFile).toHaveBeenCalledWith(
      "runtime-1",
      "session-1",
      "trace.tokens.json",
      "/home/coder",
    );
    expect(sessionRouterMock.writeFile).toHaveBeenCalledWith(
      "runtime-1",
      "session-1",
      "trace.tokens.json",
      `${JSON.stringify(
        {
          color: {
            background: "#ffffff",
            primary: "#ef4444",
          },
          radius: {
            card: "8px",
          },
        },
        null,
        2,
      )}\n`,
      "/home/coder",
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "session_app_tokens_updated",
        scopeId: "session-1",
        payload: expect.objectContaining({
          sessionGroupId: "group-1",
          path: "trace.tokens.json",
          tokens: { color: { primary: "#ef4444" } },
        }),
      }),
    );
  });

  it("rejects publish for non-app sessions", async () => {
    prismaMock.sessionGroup.findFirstOrThrow.mockResolvedValueOnce({
      id: "group-1",
      kind: "coding",
      ownerUserId: "user-1",
    });

    await expect(
      new SessionApplicationService().publishAppSession("group-1", "org-1", "user-1"),
    ).rejects.toThrow("Only app sessions can be published through app publish.");
    expect(prismaMock.sessionEndpoint.update).not.toHaveBeenCalled();
  });

  it("ignores stale bridge logs for missing process rows", async () => {
    prismaMock.sessionApplicationProcess.findFirst.mockResolvedValueOnce(null);

    const entry = await new SessionApplicationService().appendProcessLog(
      "missing-process",
      "org-1",
      "stdout",
      "late log",
    );

    expect(entry).toBeNull();
    expect(prismaMock.sessionApplicationLogEntry.create).not.toHaveBeenCalled();
    expect(eventServiceMock.create).not.toHaveBeenCalled();
  });

  it("truncates noisy app process log chunks before storing them", async () => {
    prismaMock.sessionApplicationProcess.findFirst.mockResolvedValueOnce({
      id: "process-1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
    });
    prismaMock.sessionApplicationLogEntry.findFirst.mockResolvedValueOnce({ sequence: 4 });
    prismaMock.sessionApplicationLogEntry.create.mockImplementationOnce(async ({ data }) => ({
      id: "log-1",
      timestamp: new Date("2026-06-07T00:00:00.000Z"),
      ...data,
    }));

    const entry = await new SessionApplicationService().appendProcessLog(
      "process-1",
      "org-1",
      "stdout",
      "x".repeat(PROCESS_LOG_ENTRY_MAX_CHARS + 1024),
    );

    expect(entry?.data.length).toBe(PROCESS_LOG_ENTRY_MAX_CHARS);
    expect(entry?.data).toContain("[trace] log chunk truncated");
    expect(prismaMock.sessionApplicationLogEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          data: expect.stringContaining("[trace] log chunk truncated"),
          sequence: 5,
        }),
      }),
    );
    expect(eventServiceMock.create).not.toHaveBeenCalled();
  });

  it("prunes old app process logs as a rolling tail", async () => {
    prismaMock.sessionApplicationProcess.findFirst.mockResolvedValueOnce({
      id: "process-1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
    });
    prismaMock.sessionApplicationLogEntry.findFirst.mockResolvedValueOnce({ sequence: 49 });
    prismaMock.sessionApplicationLogEntry.create.mockImplementationOnce(async ({ data }) => ({
      id: "log-50",
      timestamp: new Date("2026-06-07T00:00:00.000Z"),
      ...data,
    }));
    prismaMock.sessionApplicationLogEntry.findMany.mockResolvedValueOnce([
      { id: "stale-1" },
      { id: "stale-2" },
    ]);

    await new SessionApplicationService().appendProcessLog(
      "process-1",
      "org-1",
      "stderr",
      "line\n",
    );

    expect(prismaMock.sessionApplicationLogEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { processId: "process-1" },
        skip: PROCESS_LOG_RETAINED_ROWS,
      }),
    );
    expect(prismaMock.sessionApplicationLogEntry.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["stale-1", "stale-2"] } },
    });
  });

  it("marks live processes stopped and disables endpoints when the runtime is torn down", async () => {
    prismaMock.sessionApplicationProcess.findMany.mockResolvedValueOnce([
      {
        id: "process-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        appConfigId: "web",
        processConfigId: "dev",
        status: "running",
      },
    ]);
    prismaMock.sessionApplicationProcess.update.mockImplementationOnce(async ({ data }) => ({
      id: "process-1",
      sessionGroupId: "group-1",
      appConfigId: "web",
      processConfigId: "dev",
      label: "Dev",
      runtimeInstanceId: null,
      startedAt: null,
      stoppedAt: new Date("2026-06-07T00:00:00.000Z"),
      exitCode: null,
      lastError: null,
      ...data,
    }));
    prismaMock.sessionEndpoint.findMany.mockResolvedValueOnce([
      { id: "endpoint-1", status: "enabled" },
    ]);
    prismaMock.sessionEndpoint.update.mockImplementationOnce(async ({ data }) => ({
      id: "endpoint-1",
      key: "endpointkey1",
      sessionGroupId: "group-1",
      appConfigId: "web",
      processConfigId: "dev",
      portConfigId: "web",
      label: "Web",
      targetPort: 3000,
      status: "disabled",
      accessMode: "private",
      trafficCaptureMode: "metadata",
      enabledAt: null,
      disabledAt: new Date("2026-06-07T00:00:00.000Z"),
      revokedAt: null,
      ...data,
    }));

    await new SessionApplicationService().markSessionGroupRuntimeStopped("group-1", "org-1");

    expect(prismaMock.sessionApplicationProcess.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "process-1" },
        data: expect.objectContaining({
          status: "stopped",
          runtimeInstanceId: null,
          bridgeProcessId: null,
        }),
      }),
    );
    expect(prismaMock.sessionEndpoint.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "endpoint-1" },
        data: expect.objectContaining({ status: "disabled", currentRuntimeInstanceId: null }),
      }),
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "session_application_process_stopped" }),
    );
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "session_endpoint_forwarding_disabled" }),
    );
  });

  it("ignores stale bridge lifecycle callbacks for missing process rows", async () => {
    prismaMock.sessionApplicationProcess.findFirst.mockResolvedValue(null);

    await expect(
      new SessionApplicationService().markProcessRunning(
        "missing-process",
        "org-1",
        "bridge-process",
      ),
    ).resolves.toBeNull();
    await expect(
      new SessionApplicationService().markProcessExited("missing-process", "org-1", 0),
    ).resolves.toBeNull();

    expect(prismaMock.sessionApplicationProcess.update).not.toHaveBeenCalled();
    expect(eventServiceMock.create).not.toHaveBeenCalled();
  });

  it("scopes bridge-driven process updates to the reporting runtime's org", async () => {
    prismaMock.sessionApplicationProcess.findFirst.mockResolvedValue(null);

    await new SessionApplicationService().markProcessRunning("process-1", "org-1", "bridge-1");
    await new SessionApplicationService().markProcessExited("process-1", "org-1", 0);

    expect(prismaMock.sessionApplicationProcess.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "process-1", organizationId: "org-1" } }),
    );
    // A foreign org never matches, so the row is never updated.
    expect(prismaMock.sessionApplicationProcess.update).not.toHaveBeenCalled();
  });
});
