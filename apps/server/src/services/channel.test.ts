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

vi.mock("./participant.js", () => ({
  participantService: {
    subscribe: vi.fn(),
  },
}));

vi.mock("./mention.js", () => ({
  sanitizeHtml: vi.fn((html: string) => html),
  extractMentions: vi.fn(() => []),
  stripHtml: vi.fn((html: string) => html.replace(/<[^>]+>/g, "").trim()),
}));

vi.mock("./actor.js", () => ({
  resolveActors: vi.fn(async () => new Map()),
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { ChannelService } from "./channel.js";

const prismaMock = prisma as any;
const eventServiceMock = eventService as any;

describe("ChannelService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects channel creation when the actor is not an org member", async () => {
    prismaMock.orgMember.findUniqueOrThrow.mockRejectedValueOnce(new Error("Not found"));

    const service = new ChannelService();

    await expect(
      service.create(
        {
          organizationId: "org-1",
          name: "general",
          type: "text",
        } as any,
        "user",
        "user-1",
      ),
    ).rejects.toThrow("Not found");

    expect(prismaMock.channel.create).not.toHaveBeenCalled();
  });

  it("rejects message-model sends for coding channels", async () => {
    prismaMock.channel.findFirstOrThrow.mockResolvedValueOnce({
      id: "channel-1",
      organizationId: "org-1",
      type: "coding",
    });

    const service = new ChannelService();

    await expect(
      service.sendChannelMessage({
        channelId: "channel-1",
        html: "<p>hello</p>",
        actorType: "user",
        actorId: "user-1",
      }),
    ).rejects.toThrow("Channel messages are only supported for text channels");

    expect(prismaMock.message.create).not.toHaveBeenCalled();
  });

  it("hydrates channel thread replies with the message summary shape", async () => {
    const createdAt = new Date("2026-03-22T00:00:00.000Z");
    prismaMock.message.findFirstOrThrow.mockResolvedValueOnce({ id: "root-1" });
    prismaMock.message.findMany.mockResolvedValueOnce([
      {
        id: "reply-1",
        chatId: null,
        channelId: "channel-1",
        actorType: "user",
        actorId: "user-2",
        text: "reply",
        html: null,
        mentions: null,
        parentMessageId: "root-1",
        createdAt,
        updatedAt: createdAt,
        editedAt: null,
        deletedAt: null,
      },
    ]);

    const service = new ChannelService();
    const replies = await service.getChannelThreadReplies("root-1", "user-1");

    expect(prismaMock.message.findFirstOrThrow).toHaveBeenCalledWith({
      where: {
        id: "root-1",
        channelId: { not: null },
        channel: { type: "text", members: { some: { userId: "user-1", leftAt: null } } },
      },
      select: { id: true },
    });
    expect(replies).toEqual([
      expect.objectContaining({
        id: "reply-1",
        channelId: "channel-1",
        replyCount: 0,
        latestReplyAt: null,
        threadRepliers: [],
      }),
    ]);
  });

  it("uses the legacy event send path only for coding channels with membership", async () => {
    prismaMock.channel.findFirstOrThrow.mockResolvedValueOnce({ organizationId: "org-1" });

    const service = new ChannelService();
    await service.sendMessage("channel-1", "hello", null, "user", "user-1");

    expect(prismaMock.channel.findFirstOrThrow).toHaveBeenCalledWith({
      where: {
        id: "channel-1",
        type: "coding",
        members: { some: { userId: "user-1", leftAt: null } },
      },
      select: { organizationId: true },
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith({
      organizationId: "org-1",
      scopeType: "channel",
      scopeId: "channel-1",
      eventType: "message_sent",
      payload: { text: "hello" },
      actorType: "user",
      actorId: "user-1",
      parentId: undefined,
    });
  });
});
