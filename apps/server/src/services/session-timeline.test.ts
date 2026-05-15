import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Event as PrismaEvent } from "@prisma/client";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/pubsub.js", async () => {
  const { createPubsubMock } = await import("../../test/helpers.js");
  return {
    pubsub: createPubsubMock(),
    topics: {
      channelEvents: (id: string) => `channel:${id}:events`,
      chatEvents: (id: string) => `chat:${id}:events`,
      ticketEvents: (id: string) => `ticket:${id}:events`,
      orgEvents: (id: string) => `org:${id}:events`,
      sessionEvents: (id: string) => `session:${id}:events`,
    },
  };
});

vi.mock("../lib/redis.js", async () => {
  const { createRedisMock } = await import("../../test/helpers.js");
  return { redis: createRedisMock() };
});

vi.mock("./pushNotificationService.js", () => ({
  pushNotificationService: { notifyForEvent: vi.fn() },
}));

import { prisma } from "../lib/db.js";
import { SessionTimelineService } from "./session-timeline.js";

type PrismaMock = {
  session: { findUnique: Mock };
  event: { findMany: Mock; count: Mock };
};

const prismaMock = prisma as unknown as PrismaMock;

function event(partial: Partial<PrismaEvent> & { id: string; timestamp: Date }): PrismaEvent {
  return {
    id: partial.id,
    organizationId: partial.organizationId ?? "org-1",
    scopeType: partial.scopeType ?? "session",
    scopeId: partial.scopeId ?? "session-1",
    eventType: partial.eventType ?? "session_output",
    payload: partial.payload ?? {},
    actorType: partial.actorType ?? "agent",
    actorId: partial.actorId ?? "agent-1",
    parentId: partial.parentId ?? null,
    metadata: partial.metadata ?? {},
    timestamp: partial.timestamp,
  };
}

describe("SessionTimelineService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns compact completed timelines with collapsed hidden ranges", async () => {
    const userEvent = event({
      id: "user-1",
      eventType: "session_started",
      actorType: "user",
      actorId: "user-1",
      payload: { prompt: "Implement this" },
      timestamp: new Date("2026-05-14T10:00:00.000Z"),
    });
    const finalEvent = event({
      id: "assistant-final",
      payload: {
        type: "assistant",
        message: { content: [{ type: "text", text: "Done." }] },
      },
      timestamp: new Date("2026-05-14T10:05:00.000Z"),
    });

    prismaMock.session.findUnique.mockResolvedValueOnce({
      organizationId: "org-1",
      agentStatus: "done",
      sessionStatus: "in_progress",
    });
    prismaMock.event.findMany.mockResolvedValueOnce([userEvent, finalEvent]);
    prismaMock.event.count.mockResolvedValueOnce(12);

    const page = await new SessionTimelineService().query({
      organizationId: "org-1",
      sessionId: "session-1",
      excludePayloadTypes: ["workspace_ready"],
    });

    expect(page.mode).toBe("compact");
    expect(page.hasOlder).toBe(false);
    expect(page.items.map((item) => item.kind)).toEqual(["event", "collapsed_events", "event"]);
    expect(page.items[1].collapsed?.eventCount).toBe(12);
    expect(prismaMock.event.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        organizationId: "org-1",
        scopeType: "session",
        scopeId: "session-1",
        timestamp: { gt: userEvent.timestamp, lt: finalEvent.timestamp },
      }),
    });
  });

  it("falls back to live pages when a completed session has no final assistant text", async () => {
    const userEvent = event({
      id: "user-1",
      eventType: "session_started",
      actorType: "user",
      actorId: "user-1",
      payload: { prompt: "Implement this" },
      timestamp: new Date("2026-05-14T10:00:00.000Z"),
    });

    prismaMock.session.findUnique.mockResolvedValueOnce({
      organizationId: "org-1",
      agentStatus: "done",
      sessionStatus: "in_progress",
    });
    prismaMock.event.findMany.mockResolvedValueOnce([userEvent]);
    prismaMock.event.findMany.mockResolvedValueOnce([userEvent]);

    const page = await new SessionTimelineService().query({
      organizationId: "org-1",
      sessionId: "session-1",
      before: new Date("2026-05-14T11:00:00.000Z"),
      limit: 100,
    });

    expect(page.mode).toBe("live");
    expect(page.items).toHaveLength(1);
    expect(page.items[0].event?.id).toBe("user-1");
  });
});
