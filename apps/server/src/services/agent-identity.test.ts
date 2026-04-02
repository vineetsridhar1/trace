import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import { TRACE_AI_USER_ID } from "../lib/ai-user.js";
import { AgentIdentityService } from "./agent-identity.js";

const prismaMock = prisma as any;

describe("AgentIdentityService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gets or creates org agent settings", async () => {
    prismaMock.agentIdentity.upsert.mockResolvedValueOnce({
      id: "agent-1",
      organizationId: "org-1",
      name: "Trace AI",
      status: "enabled",
      autonomyMode: "act",
      soulFile: "soul.md",
      dailyLimitCents: 1200,
    });

    const service = new AgentIdentityService();
    await expect(service.getOrCreate("org-1")).resolves.toEqual({
      agentId: TRACE_AI_USER_ID,
      organizationId: "org-1",
      name: "Trace AI",
      status: "enabled",
      autonomyMode: "act",
      soulFile: "soul.md",
      costBudget: { dailyLimitCents: 1200 },
    });
  });

  it("returns null when no identity exists", async () => {
    prismaMock.agentIdentity.findUnique.mockResolvedValueOnce(null);

    const service = new AgentIdentityService();
    await expect(service.get("org-1")).resolves.toBeNull();
  });

  it("loads and updates settings maps", async () => {
    prismaMock.agentIdentity.findMany.mockResolvedValueOnce([
      {
        id: "agent-1",
        organizationId: "org-1",
        name: "Trace AI",
        status: "enabled",
        autonomyMode: "act",
        soulFile: "",
        dailyLimitCents: 1000,
      },
    ]);
    prismaMock.agentIdentity.update.mockResolvedValueOnce({
      id: "agent-1",
      organizationId: "org-1",
      name: "Agent Smith",
      status: "disabled",
      autonomyMode: "observe",
      soulFile: "updated.md",
      dailyLimitCents: 500,
    });

    const service = new AgentIdentityService();
    const map = await service.loadAll();
    const updated = await service.update("org-1", {
      name: "Agent Smith",
      status: "disabled",
      autonomyMode: "observe",
      soulFile: "updated.md",
      dailyLimitCents: 500,
    });

    expect(map.get("org-1")?.agentId).toBe(TRACE_AI_USER_ID);
    expect(updated).toEqual({
      agentId: TRACE_AI_USER_ID,
      organizationId: "org-1",
      name: "Agent Smith",
      status: "disabled",
      autonomyMode: "observe",
      soulFile: "updated.md",
      costBudget: { dailyLimitCents: 500 },
    });
  });
});
