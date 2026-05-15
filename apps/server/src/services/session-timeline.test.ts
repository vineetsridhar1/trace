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
  event: { findMany: Mock };
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
    const hiddenCandidateEvents = [
      event({
        id: "hidden-tool-1",
        payload: {
          type: "assistant",
          message: {
            content: [
              { type: "tool_use", id: "tool-1", name: "Read", input: {} },
              { type: "tool_use", id: "tool-2", name: "Edit", input: {} },
            ],
          },
        },
        timestamp: new Date("2026-05-14T10:01:00.000Z"),
      }),
      event({
        id: "hidden-message-1",
        payload: {
          type: "assistant",
          message: { content: [{ type: "text", text: "Working on it." }] },
        },
        timestamp: new Date("2026-05-14T10:02:00.000Z"),
      }),
    ];
    const hiddenRangeEvents = [
      ...hiddenCandidateEvents,
      event({
        id: "hidden-connection-lost",
        payload: { type: "connection_lost" },
        timestamp: new Date("2026-05-14T10:02:30.000Z"),
      }),
      ...Array.from({ length: 10 }, (_, i) =>
        event({
          id: `hidden-${i}`,
          payload: { type: "result" },
          timestamp: new Date(`2026-05-14T10:03:${String(i).padStart(2, "0")}.000Z`),
        }),
      ),
    ];

    prismaMock.session.findUnique.mockResolvedValueOnce({
      organizationId: "org-1",
      agentStatus: "done",
      sessionStatus: "in_progress",
    });
    prismaMock.event.findMany.mockResolvedValueOnce([
      finalEvent,
      ...[...hiddenCandidateEvents].reverse(),
      userEvent,
    ]);
    prismaMock.event.findMany.mockResolvedValueOnce(hiddenRangeEvents);

    const page = await new SessionTimelineService().query({
      organizationId: "org-1",
      sessionId: "session-1",
      excludePayloadTypes: ["workspace_ready"],
    });

    expect(page.mode).toBe("compact");
    expect(page.hasOlder).toBe(false);
    expect(page.items.map((item) => item.kind)).toEqual(["event", "collapsed_events", "event"]);
    expect(page.items[1].collapsed?.eventCount).toBe(2);
    expect(page.items[1].collapsed?.toolCallCount).toBe(2);
    expect(page.items[1].collapsed?.messageCount).toBe(1);
    expect(prismaMock.event.findMany).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({
        organizationId: "org-1",
        scopeType: "session",
        scopeId: "session-1",
        timestamp: { gt: userEvent.timestamp, lt: finalEvent.timestamp },
      }),
      orderBy: { timestamp: "asc" },
      select: { eventType: true, payload: true, parentId: true, timestamp: true },
    });
  });

  it("does not create collapsed ranges for hidden events that render no activity", async () => {
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
    const hiddenNoiseEvents = [
      event({
        id: "hidden-connection-lost",
        payload: { type: "connection_lost" },
        timestamp: new Date("2026-05-14T10:01:00.000Z"),
      }),
      event({
        id: "hidden-tool-result-only",
        payload: {
          type: "user",
          message: {
            content: [{ type: "tool_result", tool_use_id: "tool-1", content: "ok" }],
          },
        },
        timestamp: new Date("2026-05-14T10:02:00.000Z"),
      }),
      event({
        id: "hidden-child-output",
        parentId: "subagent-parent",
        payload: {
          type: "assistant",
          message: { content: [{ type: "text", text: "Nested child output" }] },
        },
        timestamp: new Date("2026-05-14T10:03:00.000Z"),
      }),
    ];

    prismaMock.session.findUnique.mockResolvedValueOnce({
      organizationId: "org-1",
      agentStatus: "done",
      sessionStatus: "in_progress",
    });
    prismaMock.event.findMany.mockResolvedValueOnce([finalEvent, userEvent]);
    prismaMock.event.findMany.mockResolvedValueOnce(hiddenNoiseEvents);

    const page = await new SessionTimelineService().query({
      organizationId: "org-1",
      sessionId: "session-1",
      excludePayloadTypes: ["workspace_ready"],
    });

    expect(page.mode).toBe("compact");
    expect(page.items.map((item) => item.kind)).toEqual(["event", "event"]);
    expect(page.items.map((item) => item.id)).toEqual(["user-1", "assistant-final"]);
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

  it("pages compact timelines before an anchor and preserves the boundary collapsed range", async () => {
    const user1 = event({
      id: "user-1",
      eventType: "session_started",
      actorType: "user",
      payload: { prompt: "First" },
      timestamp: new Date("2026-05-14T10:00:00.000Z"),
    });
    const assistant1 = event({
      id: "assistant-1",
      payload: { type: "assistant", message: { content: [{ type: "text", text: "One" }] } },
      timestamp: new Date("2026-05-14T10:01:00.000Z"),
    });
    const user2 = event({
      id: "user-2",
      eventType: "message_sent",
      actorType: "user",
      payload: { text: "Second" },
      timestamp: new Date("2026-05-14T10:02:00.000Z"),
    });
    const assistant2 = event({
      id: "assistant-2",
      payload: { type: "assistant", message: { content: [{ type: "text", text: "Two" }] } },
      timestamp: new Date("2026-05-14T10:03:00.000Z"),
    });
    const user3 = event({
      id: "user-3",
      eventType: "message_sent",
      actorType: "user",
      payload: { text: "Third" },
      timestamp: new Date("2026-05-14T10:04:00.000Z"),
    });
    const hiddenBetweenUser2AndAssistant2 = event({
      id: "hidden-a",
      payload: {
        type: "assistant",
        message: { content: [{ type: "tool_use", id: "tool-a", name: "Read", input: {} }] },
      },
      timestamp: new Date("2026-05-14T10:02:30.000Z"),
    });
    const hiddenBetweenAssistant2AndUser3 = event({
      id: "hidden-b",
      payload: {
        type: "assistant",
        message: { content: [{ type: "tool_use", id: "tool-b", name: "Grep", input: {} }] },
      },
      timestamp: new Date("2026-05-14T10:03:30.000Z"),
    });

    prismaMock.session.findUnique.mockResolvedValueOnce({
      organizationId: "org-1",
      agentStatus: "done",
      sessionStatus: "in_progress",
    });
    prismaMock.event.findMany.mockResolvedValueOnce([
      user3,
      assistant2,
      user2,
      assistant1,
      user1,
    ]);
    prismaMock.event.findMany.mockResolvedValueOnce([
      hiddenBetweenUser2AndAssistant2,
      hiddenBetweenAssistant2AndUser3,
    ]);

    const page = await new SessionTimelineService().query({
      organizationId: "org-1",
      sessionId: "session-1",
      before: user3.timestamp,
      limit: 2,
    });

    expect(page.mode).toBe("compact");
    expect(page.hasOlder).toBe(true);
    expect(page.items.map((item) => item.id)).toEqual([
      "user-2",
      "collapsed:user-2:assistant-2",
      "assistant-2",
      "collapsed:assistant-2:user-3",
    ]);
    expect(page.items[3].collapsed?.endTimestamp).toEqual(user3.timestamp);
  });
});
