import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: {
    getRuntime: vi.fn(),
    sendToRuntime: vi.fn().mockReturnValue("delivered"),
  },
}));

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn(),
    publishEphemeral: vi.fn(),
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

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const sessionRouterMock = sessionRouter as unknown as {
  getRuntime: ReturnType<typeof vi.fn>;
  sendToRuntime: ReturnType<typeof vi.fn>;
};
const eventServiceMock = eventService as unknown as {
  create: ReturnType<typeof vi.fn>;
  publishEphemeral: ReturnType<typeof vi.fn>;
};

function mockGroup() {
  prismaMock.sessionGroup.findFirstOrThrow.mockResolvedValue({
    id: "group-1",
    organizationId: "org-1",
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

  it("starts the default full-stack process for a repo-less app group", async () => {
    prismaMock.sessionGroup.findFirstOrThrow.mockResolvedValueOnce({
      id: "group-1",
      kind: "app",
      organizationId: "org-1",
      ownerUserId: "user-1",
      visibility: "public",
      repoId: null,
      repo: null,
      workdir: "/workspace",
      sessions: [
        {
          id: "session-1",
          workdir: "/workspace",
          connection: { runtimeInstanceId: "runtime-1" },
        },
      ],
    });

    await new SessionApplicationService().startProcess("group-1", "app", "dev", "org-1", "user-1");

    expect(sessionRouterMock.sendToRuntime).toHaveBeenCalledWith(
      "runtime-1",
      expect.objectContaining({
        type: "app_process_start",
        command: "pnpm install --prefer-offline --frozen-lockfile && pnpm dev",
        ports: [{ portConfigId: "web", port: 3000, protocol: "http" }],
      }),
      "org-1",
    );
  });

  it("starts the same default dev process for a design group", async () => {
    prismaMock.sessionGroup.findFirstOrThrow.mockResolvedValueOnce({
      id: "group-1",
      kind: "design",
      organizationId: "org-1",
      ownerUserId: "user-1",
      visibility: "public",
      repoId: "managed-repo-1",
      repo: null,
      workdir: "/workspace",
      sessions: [
        {
          id: "session-1",
          workdir: "/workspace",
          connection: { runtimeInstanceId: "runtime-1" },
        },
      ],
    });

    await new SessionApplicationService().startProcess("group-1", "app", "dev", "org-1", "user-1");

    expect(sessionRouterMock.sendToRuntime).toHaveBeenCalledWith(
      "runtime-1",
      expect.objectContaining({
        type: "app_process_start",
        command: "pnpm install --prefer-offline --frozen-lockfile && pnpm dev",
        ports: [{ portConfigId: "web", port: 3000, protocol: "http" }],
      }),
      "org-1",
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

  it("publishes the primary enabled endpoint for an app session", async () => {
    prismaMock.sessionGroup.findFirstOrThrow.mockResolvedValueOnce({
      id: "group-1",
      kind: "app",
      ownerUserId: "user-1",
    });
    prismaMock.sessionEndpoint.findFirst.mockResolvedValueOnce({
      id: "endpoint-1",
      key: "endpointkey1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      appConfigId: "app",
      processConfigId: "dev",
      portConfigId: "web",
      label: "Preview",
      targetPort: 3000,
      status: "enabled",
      accessMode: "private",
      trafficCaptureMode: "metadata",
      enabledAt: new Date("2026-07-09T00:00:00.000Z"),
      disabledAt: null,
      revokedAt: null,
    });
    prismaMock.sessionEndpoint.update.mockImplementationOnce(async ({ data }) => ({
      id: "endpoint-1",
      key: "endpointkey1",
      sessionGroupId: "group-1",
      appConfigId: "app",
      processConfigId: "dev",
      portConfigId: "web",
      label: "Preview",
      targetPort: 3000,
      status: "enabled",
      accessMode: "private",
      trafficCaptureMode: "metadata",
      enabledAt: new Date("2026-07-09T00:00:00.000Z"),
      disabledAt: null,
      revokedAt: null,
      ...data,
    }));

    const endpoint = await new SessionApplicationService().publishAppSession(
      "group-1",
      "org-1",
      "user-1",
    );

    expect(endpoint.accessMode).toBe("public");
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeId: "group-1",
        payload: expect.objectContaining({ published: true }),
      }),
    );
  });

  it("creates a clean generated preview redirect", async () => {
    prismaMock.sessionEndpoint.findFirstOrThrow.mockResolvedValueOnce({
      id: "endpoint-1",
      sessionGroupId: "group-1",
      status: "enabled",
      revokedAt: null,
      key: "endpointkey1",
    });
    prismaMock.sessionGroup.findFirstOrThrow.mockResolvedValueOnce({
      visibility: "public",
      ownerUserId: "user-1",
    });

    const preview = await new SessionApplicationService().createEndpointPreview(
      "endpoint-1",
      "org-1",
      "user-1",
    );

    expect(new URL(preview.url).searchParams.get("next")).toBe("/");
    expect(preview.url).not.toContain("__trace_authoring");
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
    // Log lines are published (ephemeral), not persisted as Event rows.
    expect(eventServiceMock.publishEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "session_application_log_appended",
        payload: expect.objectContaining({ logEntry: expect.objectContaining({ id: "log-1" }) }),
      }),
    );
    expect(eventServiceMock.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "session_application_log_appended" }),
    );
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
