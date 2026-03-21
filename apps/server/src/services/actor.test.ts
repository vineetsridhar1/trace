import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import { resolveActor, resolveActors } from "./actor.js";

const prismaMock = prisma as any;

describe("actor service helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves users via the provided loader when available", async () => {
    const loader = { load: vi.fn().mockResolvedValue({ id: "u1", name: "Alice", avatarUrl: "a.png" }) };

    await expect(resolveActor({ actorType: "user", actorId: "u1" }, loader as any)).resolves.toEqual({
      type: "user",
      id: "u1",
      name: "Alice",
      avatarUrl: "a.png",
    });
    expect(loader.load).toHaveBeenCalledWith("u1");
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("resolves agent identities from prisma with a default fallback", async () => {
    prismaMock.agentIdentity.findUnique.mockResolvedValueOnce(null);

    await expect(resolveActor({ actorType: "agent", actorId: "a1" })).resolves.toEqual({
      type: "agent",
      id: "a1",
      name: "Trace AI",
      avatarUrl: null,
    });
  });

  it("batch resolves and deduplicates actor references", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "u1", name: "Alice", avatarUrl: "a.png" },
    ]);
    prismaMock.agentIdentity.findMany.mockResolvedValueOnce([
      { id: "a1", name: "Helper" },
    ]);

    const actors = await resolveActors([
      { actorType: "user", actorId: "u1" },
      { actorType: "user", actorId: "u1" },
      { actorType: "agent", actorId: "a1" },
      { actorType: "system", actorId: "sys" },
    ]);

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["u1"] } },
      select: { id: true, name: true, avatarUrl: true },
    });
    expect(actors.get("user:u1")).toEqual({
      type: "user",
      id: "u1",
      name: "Alice",
      avatarUrl: "a.png",
    });
    expect(actors.get("agent:a1")).toEqual({
      type: "agent",
      id: "a1",
      name: "Helper",
      avatarUrl: null,
    });
    expect(actors.get("system:sys")).toEqual({
      type: "system",
      id: "sys",
      name: null,
      avatarUrl: null,
    });
  });
});
