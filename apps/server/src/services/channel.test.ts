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
import { TRACE_AI_USER_ID } from "../lib/ai-user.js";
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

  it("requires a repo when creating a coding channel", async () => {
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValueOnce({
      userId: "user-1",
      organizationId: "org-1",
    });

    const service = new ChannelService();

    await expect(
      service.create(
        {
          organizationId: "org-1",
          name: "backend",
          type: "coding",
        },
        "user",
        "user-1",
      ),
    ).rejects.toThrow("repoId is required for coding channels");

    expect(prismaMock.channel.create).not.toHaveBeenCalled();
  });

  it("allows a user org member to create a channel and adds the AI user as a default member", async () => {
    const createdAt = new Date("2026-04-02T00:00:00.000Z");
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValueOnce({
      userId: "user-1",
      organizationId: "org-1",
    });
    prismaMock.channel.create.mockResolvedValueOnce({
      id: "channel-1",
      name: "general",
      type: "text",
      position: 0,
      organizationId: "org-1",
      groupId: null,
      repoId: null,
      baseBranch: null,
    });
    prismaMock.orgMember.findUnique.mockResolvedValueOnce({
      userId: TRACE_AI_USER_ID,
    });
    prismaMock.channelMember.findMany.mockResolvedValueOnce([
      { channelId: "channel-1", userId: "user-1", joinedAt: createdAt, leftAt: null },
      { channelId: "channel-1", userId: TRACE_AI_USER_ID, joinedAt: createdAt, leftAt: null },
    ]);
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "user-1", name: "User One", avatarUrl: null },
      { id: TRACE_AI_USER_ID, name: "Trace AI", avatarUrl: null },
    ]);

    const service = new ChannelService();
    const channel = await service.create(
      {
        organizationId: "org-1",
        name: "general",
        type: "text",
        position: 0,
      } as any,
      "user",
      "user-1",
    );

    expect(channel).toEqual(expect.objectContaining({ id: "channel-1", name: "general" }));
    expect(prismaMock.channelMember.create).toHaveBeenNthCalledWith(1, {
      data: { channelId: "channel-1", userId: "user-1" },
    });
    expect(prismaMock.channelMember.create).toHaveBeenNthCalledWith(2, {
      data: { channelId: "channel-1", userId: TRACE_AI_USER_ID },
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          channel: expect.objectContaining({
            id: "channel-1",
            members: [
              {
                user: { id: "user-1", name: "User One", avatarUrl: null },
                joinedAt: createdAt.toISOString(),
              },
              {
                user: { id: TRACE_AI_USER_ID, name: "Trace AI", avatarUrl: null },
                joinedAt: createdAt.toISOString(),
              },
            ],
          }),
        },
      }),
      expect.anything(),
    );
  });

  it("includes repo metadata in the join event payload", async () => {
    const joinedAt = new Date("2026-03-22T00:00:00.000Z");
    prismaMock.channel.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: "channel-1",
        name: "backend",
        type: "coding",
        position: 3,
        groupId: "group-1",
        organizationId: "org-1",
        repoId: "repo-1",
        repo: { name: "trace" },
      })
      .mockResolvedValueOnce({
        id: "channel-1",
        members: [{ userId: "user-1", leftAt: null }],
      });
    prismaMock.orgMember.findUniqueOrThrow.mockResolvedValueOnce({
      userId: "user-1",
      organizationId: "org-1",
    });
    prismaMock.channelMember.findUnique.mockResolvedValueOnce(null);
    prismaMock.channelMember.create.mockResolvedValueOnce({
      channelId: "channel-1",
      userId: "user-1",
      joinedAt,
    });
    prismaMock.channelMember.findMany.mockResolvedValueOnce([
      {
        channelId: "channel-1",
        userId: "user-1",
        joinedAt,
        leftAt: null,
      },
    ]);
    prismaMock.user.findMany.mockResolvedValueOnce([
      {
        id: "user-1",
        name: "User One",
        avatarUrl: null,
      },
    ]);

    const service = new ChannelService();
    await service.join("channel-1", "user", "user-1");

    expect(eventServiceMock.create).toHaveBeenCalledWith(
      {
        organizationId: "org-1",
        scopeType: "channel",
        scopeId: "channel-1",
        eventType: "channel_member_added",
        payload: {
          userId: "user-1",
          channel: {
            id: "channel-1",
            name: "backend",
            type: "coding",
            position: 3,
            groupId: "group-1",
            repoId: "repo-1",
            repo: { id: "repo-1", name: "trace" },
            members: [
              {
                user: { id: "user-1", name: "User One", avatarUrl: null },
                joinedAt: joinedAt.toISOString(),
              },
            ],
          },
        },
        actorType: "user",
        actorId: "user-1",
      },
      expect.anything(),
    );
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

  it("rejects channel deletion by an agent before touching the database", async () => {
    const service = new ChannelService();

    await expect(service.delete("channel-1", "org-1", "agent", TRACE_AI_USER_ID)).rejects.toThrow(
      "Agents cannot delete channels directly",
    );

    expect(prismaMock.channel.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
