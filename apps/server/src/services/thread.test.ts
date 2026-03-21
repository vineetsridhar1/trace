import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./chat.js", () => ({
  chatService: {
    getReplies: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { chatService } from "./chat.js";
import { ThreadService } from "./thread.js";

const prismaMock = prisma as any;
const chatServiceMock = chatService as any;

describe("ThreadService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates reply loading to ChatService", async () => {
    chatServiceMock.getReplies.mockResolvedValueOnce([{ id: "reply-1" }]);

    const service = new ThreadService();
    await expect(service.getReplies("msg-1", "org-1", "user-1")).resolves.toEqual([{ id: "reply-1" }]);
  });

  it("summarizes replies with deduplicated participants", async () => {
    const now = new Date("2026-03-21T00:00:00.000Z");
    prismaMock.message.findMany.mockResolvedValueOnce([
      { actorType: "user", actorId: "u1", createdAt: now },
      { actorType: "user", actorId: "u1", createdAt: new Date("2026-03-20T00:00:00.000Z") },
      { actorType: "agent", actorId: "a1", createdAt: new Date("2026-03-19T00:00:00.000Z") },
      { actorType: "user", actorId: "u2", createdAt: new Date("2026-03-18T00:00:00.000Z") },
      { actorType: "user", actorId: "u3", createdAt: new Date("2026-03-17T00:00:00.000Z") },
    ]);

    const service = new ThreadService();
    const summary = await service.getSummary("msg-1");

    expect(summary).toEqual({
      replyCount: 5,
      lastReplyAt: now,
      participantRefs: [
        { actorType: "user", actorId: "u1", createdAt: now },
        { actorType: "agent", actorId: "a1", createdAt: new Date("2026-03-19T00:00:00.000Z") },
        { actorType: "user", actorId: "u2", createdAt: new Date("2026-03-18T00:00:00.000Z") },
      ],
    });
  });
});
