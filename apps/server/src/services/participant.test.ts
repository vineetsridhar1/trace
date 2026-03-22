import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import { ParticipantService } from "./participant.js";

const prismaMock = prisma as any;

describe("ParticipantService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("subscribes users with upsert semantics", async () => {
    const service = new ParticipantService();
    await service.subscribe({
      userId: "user-1",
      scopeType: "chat",
      scopeId: "chat-1",
    });

    expect(prismaMock.participant.upsert).toHaveBeenCalledWith({
      where: {
        userId_scopeType_scopeId: { userId: "user-1", scopeType: "chat", scopeId: "chat-1" },
      },
      create: {
        userId: "user-1",
        scopeType: "chat",
        scopeId: "chat-1",
      },
      update: {},
    });
  });

  it("mutes and unmutes participants", async () => {
    const service = new ParticipantService();
    await service.mute({
      userId: "user-1",
      scopeType: "chat",
      scopeId: "chat-1",
    });
    await service.unmute({
      userId: "user-1",
      scopeType: "chat",
      scopeId: "chat-1",
    });

    expect(prismaMock.participant.update).toHaveBeenCalledTimes(2);
    expect(prismaMock.participant.update.mock.calls[1][0]).toEqual({
      where: {
        userId_scopeType_scopeId: { userId: "user-1", scopeType: "chat", scopeId: "chat-1" },
      },
      data: { mutedAt: null },
    });
  });

  it("checks participant membership", async () => {
    prismaMock.participant.findFirst.mockResolvedValueOnce({ id: "p1" });
    const service = new ParticipantService();
    await expect(service.isParticipant("user-1", "chat", "chat-1")).resolves.toBe(true);

    prismaMock.participant.findFirst.mockResolvedValueOnce(null);
    await expect(service.isParticipant("user-1", "chat", "chat-1")).resolves.toBe(false);
  });
});
