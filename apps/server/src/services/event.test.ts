import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
      userEvents: (orgId: string, userId: string) => `org:${orgId}:user:${userId}:events`,
      orgEvents: (id: string) => `org:${id}:events`,
    },
  };
});

vi.mock("../lib/redis.js", async () => {
  const { createRedisMock } = await import("../../test/helpers.js");
  return { redis: createRedisMock() };
});

import { prisma } from "../lib/db.js";
import { pubsub } from "../lib/pubsub.js";
import { redis } from "../lib/redis.js";
import { EventService } from "./event.js";

const prismaMock = prisma as any;
const pubsubMock = pubsub as any;
const redisMock = redis as any;

describe("EventService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMock.xadd.mockResolvedValue("1-0");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates events, publishes to pubsub, and appends to redis streams", async () => {
    prismaMock.event.create.mockResolvedValueOnce({
      id: "event-1",
      organizationId: "org-1",
      scopeType: "channel",
      scopeId: "channel-1",
      eventType: "channel_created",
    });

    const service = new EventService();
    const event = await service.create({
      organizationId: "org-1",
      scopeType: "channel",
      scopeId: "channel-1",
      eventType: "channel_created",
      payload: { ok: true } as any,
      actorType: "user",
      actorId: "user-1",
    });

    expect(event.id).toBe("event-1");
    expect(pubsubMock.publish).toHaveBeenNthCalledWith(1, "channel:channel-1:events", {
      channelEvents: event,
    });
    expect(pubsubMock.publish).toHaveBeenNthCalledWith(2, "org:org-1:events", {
      orgEvents: event,
    });
    expect(redisMock.xadd).toHaveBeenCalledWith(
      "stream:org:org-1:events",
      "*",
      "event",
      JSON.stringify(event),
    );
  });

  it("can create events without publishing until explicitly requested", async () => {
    prismaMock.event.create.mockResolvedValueOnce({
      id: "event-1",
      organizationId: "org-1",
      scopeType: "channel",
      scopeId: "channel-1",
      eventType: "channel_created",
    });

    const service = new EventService();
    const event = await service.create({
      organizationId: "org-1",
      scopeType: "channel",
      scopeId: "channel-1",
      eventType: "channel_created",
      payload: { ok: true } as any,
      actorType: "user",
      actorId: "user-1",
      deferPublish: true,
    });

    expect(pubsubMock.publish).not.toHaveBeenCalled();
    expect(redisMock.xadd).not.toHaveBeenCalled();

    service.publishCreated(event);

    expect(pubsubMock.publish).toHaveBeenNthCalledWith(1, "channel:channel-1:events", {
      channelEvents: event,
    });
    expect(pubsubMock.publish).toHaveBeenNthCalledWith(2, "org:org-1:events", {
      orgEvents: event,
    });
    expect(redisMock.xadd).toHaveBeenCalledWith(
      "stream:org:org-1:events",
      "*",
      "event",
      JSON.stringify(event),
    );
  });

  it("fans chat events out only to members with a bounded ambient payload", () => {
    const longText = "x".repeat(500);
    const event = {
      id: "event-chat-1",
      organizationId: "org-1",
      scopeType: "chat",
      scopeId: "chat-1",
      eventType: "message_sent",
      actorType: "user",
      actorId: "user-1",
      parentId: null,
      metadata: {},
      timestamp: new Date("2026-03-21T00:00:00.000Z"),
      payload: {
        messageId: "message-1",
        chatId: "chat-1",
        text: longText,
        html: `<p>${longText}</p>`,
        createdAt: "2026-03-21T00:00:00.000Z",
      },
    } as any;

    const service = new EventService();
    service.publishCreated(event, ["user-1", "user-2", "user-2"]);

    expect(pubsubMock.publish).toHaveBeenCalledWith("chat:chat-1:events", {
      chatEvents: event,
    });
    expect(pubsubMock.publish).toHaveBeenCalledWith(
      "org:org-1:user:user-1:events",
      expect.objectContaining({
        userEvents: expect.objectContaining({
          payload: expect.objectContaining({ text: "x".repeat(160) }),
        }),
      }),
    );
    expect(pubsubMock.publish).toHaveBeenCalledWith(
      "org:org-1:user:user-2:events",
      expect.any(Object),
    );
    expect(
      pubsubMock.publish.mock.calls.filter(
        ([topic]: [string]) => topic === "org:org-1:user:user-2:events",
      ),
    ).toHaveLength(1);
    expect(pubsubMock.publish).not.toHaveBeenCalledWith(
      "org:org-1:events",
      expect.any(Object),
    );
    const userEnvelope = pubsubMock.publish.mock.calls.find(
      ([topic]: [string]) => topic === "org:org-1:user:user-1:events",
    )?.[1].userEvents;
    expect(userEnvelope.payload.html).toBeUndefined();
  });

  it("publishes read-state events only to the requested user topic", () => {
    const event = {
      id: "event-read-1",
      organizationId: "org-1",
      scopeType: "system",
      scopeId: "user-1",
      eventType: "chat_read",
      payload: { chatId: "chat-1", unreadCount: 0 },
    } as any;

    const service = new EventService();
    service.publishPrivateUserEvent(event, ["user-1"]);

    expect(pubsubMock.publish).toHaveBeenCalledTimes(1);
    expect(pubsubMock.publish).toHaveBeenCalledWith("org:org-1:user:user-1:events", {
      userEvents: event,
    });
  });

  it("queries events in chronological order even when paginating backwards", async () => {
    const older = { id: "older" };
    const newer = { id: "newer" };
    prismaMock.event.findMany.mockResolvedValueOnce([newer, older]);

    const service = new EventService();
    const results = await service.query("org-1", {
      scopeType: "chat",
      before: new Date("2026-03-21T00:00:00.000Z"),
      limit: 2,
    });

    expect(prismaMock.event.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        scopeType: "chat",
        AND: [
          {
            OR: [{ timestamp: { lt: new Date("2026-03-21T00:00:00.000Z") } }],
          },
        ],
      },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: 2,
    });
    expect(results).toEqual([older, newer]);
  });

  it("uses event ids as tie breakers when querying same-timestamp cursors", async () => {
    prismaMock.event.findMany.mockResolvedValueOnce([]);

    const service = new EventService();
    await service.query("org-1", {
      scopeType: "chat",
      before: new Date("2026-03-21T00:00:00.000Z"),
      beforeEventId: "event-b",
      limit: 2,
    });

    expect(prismaMock.event.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        scopeType: "chat",
        AND: [
          {
            OR: [
              { timestamp: { lt: new Date("2026-03-21T00:00:00.000Z") } },
              {
                AND: [
                  { timestamp: new Date("2026-03-21T00:00:00.000Z") },
                  { id: { lt: "event-b" } },
                ],
              },
            ],
          },
        ],
      },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: 2,
    });
  });

  it("skips Redis stream appends in local mode", async () => {
    vi.stubEnv("TRACE_LOCAL_MODE", "1");
    prismaMock.event.create.mockResolvedValueOnce({
      id: "event-local-1",
      organizationId: "org-1",
      scopeType: "channel",
      scopeId: "channel-1",
      eventType: "channel_created",
    });

    const service = new EventService();
    await service.create({
      organizationId: "org-1",
      scopeType: "channel",
      scopeId: "channel-1",
      eventType: "channel_created",
      payload: { ok: true } as any,
      actorType: "user",
      actorId: "user-1",
    });

    expect(redisMock.xadd).not.toHaveBeenCalled();
  });
});
