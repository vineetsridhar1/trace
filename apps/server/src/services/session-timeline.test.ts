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
  event: { findFirst: Mock; findMany: Mock };
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
    prismaMock.session.findUnique.mockReset();
    prismaMock.event.findFirst.mockReset();
    prismaMock.event.findMany.mockReset();
  });

  it("returns compact completed timelines with lazy collapsed ranges", async () => {
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
    const resultEvent = event({
      id: "result",
      payload: { type: "result" },
      timestamp: new Date("2026-05-14T10:05:01.000Z"),
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
    prismaMock.session.findUnique.mockResolvedValueOnce({
      organizationId: "org-1",
      agentStatus: "done",
      sessionStatus: "in_progress",
    });
    prismaMock.event.findMany.mockResolvedValueOnce([
      resultEvent,
      finalEvent,
      ...[...hiddenCandidateEvents].reverse(),
      userEvent,
    ]);

    const page = await new SessionTimelineService().query({
      organizationId: "org-1",
      sessionId: "session-1",
      excludePayloadTypes: ["workspace_ready"],
    });

    expect(page.mode).toBe("compact");
    expect(page.hasOlder).toBe(false);
    expect(page.items.map((item) => item.kind)).toEqual([
      "event",
      "collapsed_events",
      "event",
      "event",
    ]);
    expect(page.items[1].collapsed).toEqual({
      id: "collapsed:user-1:assistant-final",
      startEventId: userEvent.id,
      startTimestamp: userEvent.timestamp,
      endEventId: finalEvent.id,
      endTimestamp: finalEvent.timestamp,
    });
    expect(page.items[2].event?.id).toBe("assistant-final");
    expect(page.items[3].event?.id).toBe("result");
    expect(prismaMock.event.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.event.findMany).toHaveBeenNthCalledWith(1, {
      where: expect.objectContaining({
        organizationId: "org-1",
        scopeType: "session",
        scopeId: "session-1",
      }),
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: 400,
    });
  });

  it("keeps attachment-only user messages visible in compact timelines", async () => {
    const userEvent = event({
      id: "user-image",
      eventType: "message_sent",
      actorType: "user",
      actorId: "user-1",
      payload: {
        text: "",
        attachmentKeys: ["uploads/org-1/image.png"],
      },
      timestamp: new Date("2026-05-14T10:00:00.000Z"),
    });
    const hiddenCandidate = event({
      id: "hidden-tool",
      payload: {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", id: "tool-1", name: "Read", input: {} }],
        },
      },
      timestamp: new Date("2026-05-14T10:01:00.000Z"),
    });
    const finalEvent = event({
      id: "assistant-final",
      payload: {
        type: "assistant",
        message: { content: [{ type: "text", text: "I can see it now." }] },
      },
      timestamp: new Date("2026-05-14T10:02:00.000Z"),
    });
    prismaMock.session.findUnique.mockResolvedValueOnce({
      organizationId: "org-1",
      agentStatus: "done",
      sessionStatus: "in_progress",
    });
    prismaMock.event.findMany.mockResolvedValueOnce([finalEvent, hiddenCandidate, userEvent]);

    const page = await new SessionTimelineService().query({
      organizationId: "org-1",
      sessionId: "session-1",
    });

    expect(page.mode).toBe("compact");
    expect(page.items.map((item) => item.id)).toEqual([
      "user-image",
      "collapsed:user-image:assistant-final",
      "assistant-final",
    ]);
    expect(page.items[1].collapsed).toEqual({
      id: "collapsed:user-image:assistant-final",
      startEventId: userEvent.id,
      startTimestamp: userEvent.timestamp,
      endEventId: finalEvent.id,
      endTimestamp: finalEvent.timestamp,
    });
    expect(prismaMock.event.findMany).toHaveBeenCalledTimes(1);
  });

  it("skips collapsed ranges when fetched candidates have no hidden thinking", async () => {
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
    prismaMock.event.findMany.mockResolvedValueOnce([finalEvent, userEvent]);

    const page = await new SessionTimelineService().query({
      organizationId: "org-1",
      sessionId: "session-1",
      excludePayloadTypes: ["workspace_ready"],
    });

    expect(page.mode).toBe("compact");
    expect(page.items.map((item) => item.kind)).toEqual(["event", "event"]);
    expect(page.items.map((item) => item.id)).toEqual(["user-1", "assistant-final"]);
    expect(prismaMock.event.findMany).toHaveBeenCalledTimes(1);
  });

  it("keeps a trailing collapsed range for tool events before manual stop", async () => {
    const userEvent = event({
      id: "user-1",
      eventType: "message_sent",
      actorType: "user",
      actorId: "user-1",
      payload: { text: "test" },
      timestamp: new Date("2026-05-14T10:00:00.000Z"),
    });
    const assistantText = event({
      id: "assistant-text",
      payload: {
        type: "assistant",
        message: { content: [{ type: "text", text: "I will inspect the repo." }] },
      },
      timestamp: new Date("2026-05-14T10:01:00.000Z"),
    });
    const toolUse = event({
      id: "tool-use",
      payload: {
        type: "assistant",
        message: { content: [{ type: "tool_use", id: "tool-1", name: "Read", input: {} }] },
      },
      timestamp: new Date("2026-05-14T10:02:00.000Z"),
    });
    const toolResult = event({
      id: "tool-result",
      payload: {
        type: "assistant",
        message: {
          content: [{ type: "tool_result", tool_use_id: "tool-1", content: "README.md" }],
        },
      },
      timestamp: new Date("2026-05-14T10:03:00.000Z"),
    });
    const manualStop = event({
      id: "manual-stop",
      eventType: "session_terminated",
      actorType: "user",
      actorId: "user-1",
      payload: { reason: "manual_stop" },
      timestamp: new Date("2026-05-14T10:04:00.000Z"),
    });

    prismaMock.session.findUnique.mockResolvedValueOnce({
      organizationId: "org-1",
      agentStatus: "done",
      sessionStatus: "in_progress",
    });
    prismaMock.event.findMany.mockResolvedValueOnce([
      manualStop,
      toolResult,
      toolUse,
      assistantText,
      userEvent,
    ]);

    const page = await new SessionTimelineService().query({
      organizationId: "org-1",
      sessionId: "session-1",
    });

    expect(page.mode).toBe("compact");
    expect(page.items.map((item) => item.id)).toEqual([
      "user-1",
      "assistant-text",
      "collapsed:assistant-text:manual-stop",
    ]);
    expect(page.items[2].collapsed).toEqual({
      id: "collapsed:assistant-text:manual-stop",
      startEventId: assistantText.id,
      startTimestamp: assistantText.timestamp,
      endEventId: manualStop.id,
      endTimestamp: manualStop.timestamp,
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

  it("returns lightweight prompt index items for text and image prompts", async () => {
    const textPrompt = event({
      id: "prompt-text",
      eventType: "session_started",
      actorType: "user",
      actorId: "user-1",
      payload: { prompt: "  Implement this feature  " },
      timestamp: new Date("2026-05-14T10:00:00.000Z"),
    });
    const imagePrompt = event({
      id: "prompt-image",
      eventType: "message_sent",
      actorType: "user",
      actorId: "user-1",
      payload: { text: "", attachmentKeys: ["uploads/org-1/image.png"] },
      timestamp: new Date("2026-05-14T10:01:00.000Z"),
    });
    const emptyPrompt = event({
      id: "prompt-empty",
      eventType: "message_sent",
      actorType: "user",
      actorId: "user-1",
      payload: { text: "" },
      timestamp: new Date("2026-05-14T10:02:00.000Z"),
    });
    prismaMock.session.findUnique.mockResolvedValueOnce({ organizationId: "org-1" });
    prismaMock.event.findMany.mockResolvedValueOnce([textPrompt, imagePrompt, emptyPrompt]);

    const items = await new SessionTimelineService().queryPromptIndex({
      organizationId: "org-1",
      sessionId: "session-1",
    });

    expect(items).toEqual([
      {
        eventId: "prompt-text",
        timestamp: textPrompt.timestamp,
        actorType: "user",
        actorId: "user-1",
        preview: "Implement this feature",
        imageCount: 0,
      },
      {
        eventId: "prompt-image",
        timestamp: imagePrompt.timestamp,
        actorType: "user",
        actorId: "user-1",
        preview: "Image prompt",
        imageCount: 1,
      },
    ]);
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          scopeType: "session",
          scopeId: "session-1",
          parentId: null,
          eventType: { in: ["session_started", "message_sent"] },
        }),
      }),
    );
  });

  it("returns an empty prompt index for sessions outside the organization", async () => {
    prismaMock.session.findUnique.mockResolvedValueOnce({ organizationId: "org-2" });

    const items = await new SessionTimelineService().queryPromptIndex({
      organizationId: "org-1",
      sessionId: "session-1",
    });

    expect(items).toEqual([]);
    expect(prismaMock.event.findMany).not.toHaveBeenCalled();
  });

  it("fetches a bounded event window around an anchor event", async () => {
    const beforeEvent = event({
      id: "before",
      timestamp: new Date("2026-05-14T09:59:00.000Z"),
    });
    const targetEvent = event({
      id: "target",
      eventType: "message_sent",
      actorType: "user",
      actorId: "user-1",
      payload: { text: "Jump here" },
      timestamp: new Date("2026-05-14T10:00:00.000Z"),
    });
    const afterEvent = event({
      id: "after",
      timestamp: new Date("2026-05-14T10:01:00.000Z"),
    });
    prismaMock.event.findFirst.mockResolvedValueOnce(targetEvent);
    prismaMock.event.findMany
      .mockResolvedValueOnce([beforeEvent])
      .mockResolvedValueOnce([afterEvent]);

    const events = await new SessionTimelineService().queryEventsAroundEvent({
      organizationId: "org-1",
      sessionId: "session-1",
      eventId: "target",
      limit: 5,
      excludePayloadTypes: ["workspace_ready"],
    });

    expect(events.map((item) => item.id)).toEqual(["before", "target", "after"]);
    expect(prismaMock.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "target",
          organizationId: "org-1",
          scopeType: "session",
          scopeId: "session-1",
          parentId: null,
        }),
      }),
    );
    expect(prismaMock.event.findMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.event.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ take: 2 }),
    );
    expect(prismaMock.event.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ take: 2 }),
    );
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
      hiddenBetweenAssistant2AndUser3,
      assistant2,
      hiddenBetweenUser2AndAssistant2,
      user2,
      assistant1,
      user1,
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
    expect(page.items[1].collapsed).toEqual({
      id: "collapsed:user-2:assistant-2",
      startEventId: user2.id,
      startTimestamp: user2.timestamp,
      endEventId: assistant2.id,
      endTimestamp: assistant2.timestamp,
    });
    expect(page.items[3].collapsed?.endTimestamp).toEqual(user3.timestamp);
  });

  it("keeps PR lifecycle events visible in compact timelines", async () => {
    const userEvent = event({
      id: "user-1",
      eventType: "session_started",
      actorType: "user",
      payload: { prompt: "Implement this" },
      timestamp: new Date("2026-05-14T10:00:00.000Z"),
    });
    const prEvent = event({
      id: "pr-opened",
      eventType: "session_pr_opened",
      payload: { url: "https://github.com/acme/repo/pull/1" },
      timestamp: new Date("2026-05-14T10:03:00.000Z"),
    });
    const finalEvent = event({
      id: "assistant-final",
      payload: {
        type: "assistant",
        message: { content: [{ type: "text", text: "Done." }] },
      },
      timestamp: new Date("2026-05-14T10:05:00.000Z"),
    });
    const hiddenCandidate = event({
      id: "hidden-tool",
      payload: {
        type: "assistant",
        message: { content: [{ type: "tool_use", id: "tool-1", name: "Read", input: {} }] },
      },
      timestamp: new Date("2026-05-14T10:01:00.000Z"),
    });
    prismaMock.session.findUnique.mockResolvedValueOnce({
      organizationId: "org-1",
      agentStatus: "done",
      sessionStatus: "in_progress",
    });
    prismaMock.event.findMany.mockResolvedValueOnce([
      finalEvent,
      prEvent,
      hiddenCandidate,
      userEvent,
    ]);

    const page = await new SessionTimelineService().query({
      organizationId: "org-1",
      sessionId: "session-1",
    });

    expect(page.mode).toBe("compact");
    expect(page.items.map((item) => item.id)).toEqual([
      "user-1",
      "collapsed:user-1:pr-opened",
      "pr-opened",
      "assistant-final",
    ]);
  });

  it("preserves thinking ranges for a turn with visible assistant and lifecycle milestones", async () => {
    const userEvent = event({
      id: "user-1",
      eventType: "message_sent",
      actorType: "user",
      payload: { text: "create pr" },
      timestamp: new Date("2026-05-14T10:00:00.000Z"),
    });
    const assistantText = event({
      id: "assistant-text",
      payload: {
        type: "assistant",
        message: {
          content: [
            {
              type: "text",
              text: "The remote-base diff is clean. I'm creating the PR now.",
            },
          ],
        },
      },
      timestamp: new Date("2026-05-14T10:02:00.000Z"),
    });
    const prEvent = event({
      id: "pr-opened",
      eventType: "session_pr_opened",
      payload: { url: "https://github.com/acme/repo/pull/1" },
      timestamp: new Date("2026-05-14T10:04:00.000Z"),
    });
    const terminated = event({
      id: "run-ended",
      eventType: "session_terminated",
      payload: { agentStatus: "done", sessionStatus: "done" },
      timestamp: new Date("2026-05-14T10:06:00.000Z"),
    });
    const initialTool = event({
      id: "hidden-tool-1",
      payload: {
        type: "assistant",
        message: { content: [{ type: "tool_use", id: "tool-1", name: "Read", input: {} }] },
      },
      timestamp: new Date("2026-05-14T10:01:00.000Z"),
    });
    const prTool = event({
      id: "hidden-tool-2",
      payload: {
        type: "assistant",
        message: { content: [{ type: "tool_use", id: "tool-2", name: "Bash", input: {} }] },
      },
      timestamp: new Date("2026-05-14T10:03:00.000Z"),
    });
    const finalTool = event({
      id: "hidden-tool-3",
      payload: {
        type: "assistant",
        message: { content: [{ type: "tool_use", id: "tool-3", name: "Bash", input: {} }] },
      },
      timestamp: new Date("2026-05-14T10:05:00.000Z"),
    });
    prismaMock.session.findUnique.mockResolvedValueOnce({
      organizationId: "org-1",
      agentStatus: "done",
      sessionStatus: "done",
    });
    prismaMock.event.findMany.mockResolvedValueOnce([
      terminated,
      finalTool,
      prEvent,
      prTool,
      assistantText,
      initialTool,
      userEvent,
    ]);

    const page = await new SessionTimelineService().query({
      organizationId: "org-1",
      sessionId: "session-1",
    });

    expect(page.mode).toBe("compact");
    expect(page.items.map((item) => item.id)).toEqual([
      "user-1",
      "collapsed:user-1:assistant-text",
      "assistant-text",
      "collapsed:assistant-text:pr-opened",
      "pr-opened",
      "collapsed:pr-opened:run-ended",
    ]);
  });

  it("does not create thinking ranges for superseded assistant text chunks", async () => {
    const userEvent = event({
      id: "user-1",
      eventType: "session_started",
      actorType: "user",
      payload: { prompt: "Implement this" },
      timestamp: new Date("2026-05-14T10:00:00.000Z"),
    });
    const textChunk1 = event({
      id: "assistant-text-1",
      payload: {
        type: "assistant",
        message: { content: [{ type: "text", text: "Working on it." }] },
      },
      timestamp: new Date("2026-05-14T10:01:00.000Z"),
    });
    const textChunk2 = event({
      id: "assistant-text-2",
      payload: {
        type: "assistant",
        message: { content: [{ type: "text", text: "Still working." }] },
      },
      timestamp: new Date("2026-05-14T10:02:00.000Z"),
    });
    const finalEvent = event({
      id: "assistant-final",
      payload: {
        type: "assistant",
        message: { content: [{ type: "text", text: "Done." }] },
      },
      timestamp: new Date("2026-05-14T10:03:00.000Z"),
    });
    prismaMock.session.findUnique.mockResolvedValueOnce({
      organizationId: "org-1",
      agentStatus: "done",
      sessionStatus: "in_progress",
    });
    prismaMock.event.findMany.mockResolvedValueOnce([
      finalEvent,
      textChunk2,
      textChunk1,
      userEvent,
    ]);

    const page = await new SessionTimelineService().query({
      organizationId: "org-1",
      sessionId: "session-1",
    });

    expect(page.mode).toBe("compact");
    expect(page.items.map((item) => item.id)).toEqual(["user-1", "assistant-final"]);
  });

  it("uses event ids to build collapsed ranges for events sharing a timestamp", async () => {
    const timestamp = new Date("2026-05-14T10:00:00.000Z");
    const userEvent = event({
      id: "a-user",
      eventType: "session_started",
      actorType: "user",
      payload: { prompt: "Implement this" },
      timestamp,
    });
    const hiddenCandidate = event({
      id: "b-hidden",
      payload: {
        type: "assistant",
        message: { content: [{ type: "tool_use", id: "tool-1", name: "Read", input: {} }] },
      },
      timestamp,
    });
    const finalEvent = event({
      id: "c-final",
      payload: {
        type: "assistant",
        message: { content: [{ type: "text", text: "Done." }] },
      },
      timestamp,
    });
    prismaMock.session.findUnique.mockResolvedValueOnce({
      organizationId: "org-1",
      agentStatus: "done",
      sessionStatus: "in_progress",
    });
    prismaMock.event.findMany.mockResolvedValueOnce([finalEvent, hiddenCandidate, userEvent]);

    const page = await new SessionTimelineService().query({
      organizationId: "org-1",
      sessionId: "session-1",
    });

    expect(page.mode).toBe("compact");
    expect(page.items[1].collapsed).toEqual({
      id: "collapsed:a-user:c-final",
      startEventId: userEvent.id,
      startTimestamp: timestamp,
      endEventId: finalEvent.id,
      endTimestamp: timestamp,
    });
  });
});
