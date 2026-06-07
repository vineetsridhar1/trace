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
  },
}));

import { prisma } from "../lib/db.js";
import { sessionRouter } from "../lib/session-router.js";
import { eventService } from "./event.js";
import { SessionApplicationService } from "./session-applications.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const sessionRouterMock = sessionRouter as unknown as {
  getRuntime: ReturnType<typeof vi.fn>;
  sendToRuntime: ReturnType<typeof vi.fn>;
};
const eventServiceMock = eventService as unknown as { create: ReturnType<typeof vi.fn> };

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
    ).rejects.toThrow("Start the process first");
  });
});
