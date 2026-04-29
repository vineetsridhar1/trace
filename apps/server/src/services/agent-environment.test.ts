import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { AgentEnvironmentService } from "./agent-environment.js";
import type { createPrismaMock } from "../../test/helpers.js";

const prismaMock = prisma as unknown as ReturnType<typeof createPrismaMock>;
const eventServiceMock = eventService as unknown as {
  create: ReturnType<typeof vi.fn>;
};

const now = new Date("2026-04-28T12:00:00.000Z");

describe("AgentEnvironmentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => Promise<unknown>) => callback(prismaMock),
    );
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValue({
      userId: "user-1",
      organizationId: "org-1",
    });
  });

  it("creates a default environment transactionally and clears existing defaults", async () => {
    prismaMock.agentEnvironment.create.mockResolvedValueOnce({
      id: "env-1",
      organizationId: "org-1",
      name: "Company Launcher",
      adapterType: "provisioned",
      config: {
        startUrl: "https://launcher.example/start",
        stopUrl: "https://launcher.example/stop",
        statusUrl: "https://launcher.example/status",
        auth: { secretId: "secret-1" },
      },
      enabled: true,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });

    const service = new AgentEnvironmentService();
    const environment = await service.create(
      {
        organizationId: "org-1",
        name: " Company Launcher ",
        adapterType: "provisioned",
        config: {
          startUrl: "https://launcher.example/start",
          stopUrl: "https://launcher.example/stop",
          statusUrl: "https://launcher.example/status",
          auth: { secretId: "secret-1" },
        },
        isDefault: true,
      },
      "user",
      "user-1",
    );

    expect(environment.id).toBe("env-1");
    expect(prismaMock.$executeRaw).toHaveBeenCalled();
    expect(prismaMock.agentEnvironment.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", enabled: true, isDefault: true },
      data: { isDefault: false },
    });
    expect(prismaMock.agentEnvironment.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        name: "Company Launcher",
        adapterType: "provisioned",
        config: {
          startUrl: "https://launcher.example/start",
          stopUrl: "https://launcher.example/stop",
          statusUrl: "https://launcher.example/status",
          auth: { secretId: "secret-1" },
        },
        enabled: true,
        isDefault: true,
      },
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      {
        organizationId: "org-1",
        scopeType: "system",
        scopeId: "org-1",
        eventType: "agent_environment_created",
        payload: {
          agentEnvironment: {
            id: "env-1",
            organizationId: "org-1",
            name: "Company Launcher",
            adapterType: "provisioned",
            config: {
              startUrl: "https://launcher.example/start",
              stopUrl: "https://launcher.example/stop",
              statusUrl: "https://launcher.example/status",
              auth: { secretId: "secret-1" },
            },
            enabled: true,
            isDefault: true,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        },
        actorType: "user",
        actorId: "user-1",
      },
      prismaMock,
    );
  });

  it("does not store raw provider tokens in config", async () => {
    const service = new AgentEnvironmentService();

    await expect(
      service.create(
        {
          organizationId: "org-1",
          name: "Launcher",
          adapterType: "provisioned",
          config: { auth: { token: "raw-token" } },
        },
        "user",
        "user-1",
      ),
    ).rejects.toThrow("auth config can only include type and secretId");

    expect(prismaMock.agentEnvironment.create).not.toHaveBeenCalled();
  });

  it("rejects credential-shaped config keys that are not secret references", async () => {
    const service = new AgentEnvironmentService();

    await expect(
      service.create(
        {
          organizationId: "org-1",
          name: "Launcher",
          adapterType: "provisioned",
          config: { auth: { type: "bearer", value: "raw-token" } },
        },
        "user",
        "user-1",
      ),
    ).rejects.toThrow("auth config can only include type and secretId");

    await expect(
      service.create(
        {
          organizationId: "org-1",
          name: "Launcher",
          adapterType: "provisioned",
          config: { access_token: "raw-token" },
        },
        "user",
        "user-1",
      ),
    ).rejects.toThrow("cannot store raw secrets");

    expect(prismaMock.agentEnvironment.create).not.toHaveBeenCalled();
  });

  it("validates local environment runtime selection config", async () => {
    const service = new AgentEnvironmentService();

    await expect(
      service.create(
        {
          organizationId: "org-1",
          name: "Local",
          adapterType: "local",
          config: { runtimeSelection: "nearest_laptop" },
        },
        "user",
        "user-1",
      ),
    ).rejects.toThrow("runtimeSelection must be any_accessible_local");

    await expect(
      service.create(
        {
          organizationId: "org-1",
          name: "Local",
          adapterType: "local",
          config: {
            runtimeInstanceId: "runtime-1",
            runtimeSelection: "any_accessible_local",
          },
        },
        "user",
        "user-1",
      ),
    ).rejects.toThrow("cannot set both runtimeInstanceId and runtimeSelection");

    expect(prismaMock.agentEnvironment.create).not.toHaveBeenCalled();
  });

  it("clears default when an environment is disabled", async () => {
    prismaMock.agentEnvironment.findFirstOrThrow.mockResolvedValueOnce({
      id: "env-1",
      organizationId: "org-1",
      name: "Local",
      adapterType: "local",
      config: {},
      enabled: true,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
    prismaMock.agentEnvironment.update.mockResolvedValueOnce({
      id: "env-1",
      organizationId: "org-1",
      name: "Local",
      adapterType: "local",
      config: {},
      enabled: false,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });

    const service = new AgentEnvironmentService();
    await service.update("env-1", { enabled: false }, "user", "user-1");

    expect(prismaMock.agentEnvironment.update).toHaveBeenCalledWith({
      where: { id: "env-1" },
      data: {
        enabled: false,
        isDefault: false,
      },
    });
  });

  it("checks actor organization access inside environment mutations", async () => {
    prismaMock.orgMember.findUniqueOrThrow.mockRejectedValueOnce(new Error("Not found"));
    prismaMock.agentEnvironment.findFirstOrThrow.mockResolvedValueOnce({
      id: "env-1",
      organizationId: "org-2",
      name: "Local",
      adapterType: "local",
      config: {},
      enabled: true,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });

    const service = new AgentEnvironmentService();

    await expect(service.update("env-1", { name: "Renamed" }, "user", "user-1")).rejects.toThrow(
      "Not found",
    );

    expect(prismaMock.orgMember.findUniqueOrThrow).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: "user-1",
          organizationId: "org-2",
        },
      },
      select: { userId: true },
    });
    expect(prismaMock.agentEnvironment.update).not.toHaveBeenCalled();
  });

  it("does not report environment tests as successful before adapter validation exists", async () => {
    prismaMock.agentEnvironment.findFirstOrThrow.mockResolvedValueOnce({
      id: "env-1",
      name: "Launcher",
      adapterType: "provisioned",
      config: {
        startUrl: "https://launcher.example/start",
        stopUrl: "https://launcher.example/stop",
        statusUrl: "https://launcher.example/status",
      },
      enabled: true,
      organizationId: "org-1",
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });

    const service = new AgentEnvironmentService();
    const result = await service.test("env-1", "user", "user-1");

    expect(result).toEqual({
      ok: false,
      message: "Provisioned environment testing requires runtime adapter connectivity",
    });
  });

  it("rejects a session environment that does not support the requested tool", async () => {
    prismaMock.agentEnvironment.findFirstOrThrow.mockResolvedValueOnce({
      id: "env-1",
      organizationId: "org-1",
      name: "Codex Only",
      adapterType: "local",
      config: { capabilities: { supportedTools: ["codex"] } },
      enabled: true,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });

    const service = new AgentEnvironmentService();

    await expect(
      service.resolveForSessionRequest({
        organizationId: "org-1",
        environmentId: "env-1",
        tool: "claude_code",
        actorType: "user",
        actorId: "user-1",
      }),
    ).rejects.toThrow("does not support the requested coding tool");
  });

  it("disables instead of hard-deleting environments referenced by sessions", async () => {
    prismaMock.agentEnvironment.findFirstOrThrow.mockResolvedValueOnce({
      id: "env-1",
      organizationId: "org-1",
      name: "Local",
      adapterType: "local",
      config: {},
      enabled: true,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
    prismaMock.session.count.mockResolvedValueOnce(1);
    prismaMock.agentEnvironment.update.mockResolvedValueOnce({
      id: "env-1",
      organizationId: "org-1",
      name: "Local",
      adapterType: "local",
      config: {},
      enabled: false,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    });

    const service = new AgentEnvironmentService();
    await service.delete("env-1", "user", "user-1");

    expect(prismaMock.agentEnvironment.delete).not.toHaveBeenCalled();
    expect(prismaMock.agentEnvironment.update).toHaveBeenCalledWith({
      where: { id: "env-1" },
      data: { enabled: false, isDefault: false },
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "agent_environment_deleted",
        payload: expect.objectContaining({
          agentEnvironment: expect.objectContaining({
            id: "env-1",
            enabled: false,
            isDefault: false,
          }),
        }),
      }),
      prismaMock,
    );
  });
});
