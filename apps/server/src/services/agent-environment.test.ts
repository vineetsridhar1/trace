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
  });

  it("creates a default environment transactionally and clears existing defaults", async () => {
    prismaMock.agentEnvironment.create.mockResolvedValueOnce({
      id: "env-1",
      organizationId: "org-1",
      name: "Company Launcher",
      adapterType: "provisioned",
      config: { auth: { secretId: "secret-1" } },
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
        config: { auth: { secretId: "secret-1" } },
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
        config: { auth: { secretId: "secret-1" } },
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
            config: { auth: { secretId: "secret-1" } },
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
    await service.update("env-1", "org-1", { enabled: false }, "user", "user-1");

    expect(prismaMock.agentEnvironment.update).toHaveBeenCalledWith({
      where: { id: "env-1" },
      data: {
        enabled: false,
        isDefault: false,
      },
    });
  });
});
