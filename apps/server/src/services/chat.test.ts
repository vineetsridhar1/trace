import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn(),
    publishCreated: vi.fn(),
    publishPrivateUserEvent: vi.fn(),
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
import { participantService } from "./participant.js";
import { ChatService } from "./chat.js";

const prismaMock = prisma as any;
const eventServiceMock = eventService as any;
const participantServiceMock = participantService as any;

describe("ChatService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.orgMember.findFirst.mockResolvedValue({ organizationId: "org-1" });
    eventServiceMock.create.mockResolvedValue({ id: "event-1" });
  });

  it("rejects chats without members", async () => {
    const service = new ChatService();

    await expect(
      service.create({ memberIds: [] } as any, "org-1", "user", "user-1"),
    ).rejects.toThrow("Chats must include at least one other member");
  });

  it("rejects chats with members outside the active organization", async () => {
    prismaMock.orgMember.findMany.mockResolvedValueOnce([
      { user: { id: "user-1", name: "Alice" } },
    ]);

    const service = new ChatService();

    await expect(
      service.create({ memberIds: ["user-2"] } as any, "org-1", "user", "user-1"),
    ).rejects.toThrow("One or more users are not in this organization");

    expect(prismaMock.orgMember.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", userId: { in: ["user-1", "user-2"] } },
      include: { user: { select: { id: true, name: true } } },
    });
    expect(prismaMock.chat.create).not.toHaveBeenCalled();
  });

  it("returns an existing deduplicated DM", async () => {
    prismaMock.orgMember.findMany.mockResolvedValueOnce([
      { user: { id: "user-1", name: "Alice" } },
      { user: { id: "user-2", name: "Bob" } },
    ]);
    prismaMock.chat.findFirst.mockResolvedValueOnce({ id: "chat-1", members: [] });

    const service = new ChatService();
    const chat = await service.create({ memberIds: ["user-2"] } as any, "org-1", "user", "user-1");

    expect(chat).toEqual({ id: "chat-1", members: [] });
    expect(prismaMock.chat.create).not.toHaveBeenCalled();
  });

  it("creates an organization DM, auto-subscribes both members, and emits chat_created", async () => {
    const createdAt = new Date("2026-03-21T00:00:00.000Z");
    prismaMock.orgMember.findMany.mockResolvedValueOnce([
      { user: { id: "user-1", name: "Alice" } },
      { user: { id: "user-2", name: "Bob" } },
    ]);
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "user-1", name: "Alice", avatarUrl: null },
      { id: "user-2", name: "Bob", avatarUrl: null },
    ]);
    prismaMock.chat.findFirst.mockResolvedValueOnce(null);
    prismaMock.chat.create.mockResolvedValueOnce({
      id: "chat-1",
      type: "dm",
      name: null,
      createdAt,
      updatedAt: createdAt,
      members: [],
    });
    prismaMock.chatMember.findMany.mockResolvedValueOnce([
      { userId: "user-1", joinedAt: createdAt },
      { userId: "user-2", joinedAt: createdAt },
    ]);

    const service = new ChatService();
    const chat = await service.create(
      { memberIds: ["user-2"] } as any,
      "org-1",
      "user",
      "user-1",
    );

    expect(chat.id).toBe("chat-1");
    expect(prismaMock.chat.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-1",
          type: "dm",
          dmKey: "user-1:user-2",
        }),
      }),
    );
    expect(prismaMock.participant.create).toHaveBeenCalledTimes(2);
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        scopeType: "chat",
        scopeId: "chat-1",
        eventType: "chat_created",
      }),
      prismaMock,
    );
    expect(eventServiceMock.publishCreated).toHaveBeenCalledWith(
      { id: "event-1" },
      ["user-1", "user-2"],
    );
  });

  it("rejects group chat creation in the direct-message MVP", async () => {
    const service = new ChatService();

    await expect(
      service.create(
        { memberIds: ["user-2", "user-3"], name: "Planning" } as any,
        "org-1",
        "user",
        "user-1",
      ),
    ).rejects.toThrow("Direct messages support exactly one other member");

    expect(prismaMock.chat.create).not.toHaveBeenCalled();
  });

  it("sends threaded messages and subscribes the author to the thread", async () => {
    const createdAt = new Date("2026-03-21T00:00:00.000Z");
    prismaMock.chat.findFirstOrThrow.mockResolvedValueOnce({
      id: "chat-1",
      organizationId: "org-1",
      members: [{ userId: "user-1" }, { userId: "user-2" }],
    });
    prismaMock.message.findUniqueOrThrow.mockResolvedValueOnce({
      id: "message-root",
      organizationId: "org-1",
      chatId: "chat-1",
      parentMessageId: null,
    });
    prismaMock.message.create.mockResolvedValueOnce({
      id: "message-1",
      chatId: "chat-1",
      organizationId: "org-1",
      actorType: "user",
      actorId: "user-1",
      text: "hello",
      html: null,
      mentions: null,
      parentMessageId: "message-root",
      createdAt,
    });

    const service = new ChatService();
    const message = await service.sendMessage({
      chatId: "chat-1",
      text: "hello",
      parentId: "message-root",
      clientMutationId: "mutation-1",
      organizationId: "org-1",
      actorType: "user",
      actorId: "user-1",
    });

    expect(message).toMatchObject({
      id: "message-1",
      parentMessageId: "message-root",
      replyCount: 0,
    });
    expect(participantServiceMock.subscribe).toHaveBeenCalledWith({
      userId: "user-1",
      scopeType: "thread",
      scopeId: "message-root",
    });
    expect(eventServiceMock.create).toHaveBeenCalled();
  });

  it("checks chat membership inside the active organization before sending messages", async () => {
    prismaMock.chat.findFirstOrThrow.mockResolvedValueOnce({
      id: "chat-1",
      members: [{ userId: "user-1" }, { userId: "user-2" }],
    });
    prismaMock.message.create.mockResolvedValueOnce({
      id: "message-1",
      chatId: "chat-1",
      actorType: "user",
      actorId: "user-1",
      text: "hello",
      html: null,
      mentions: null,
      parentMessageId: null,
      createdAt: new Date("2026-03-21T00:00:00.000Z"),
    });

    const service = new ChatService();
    await service.sendMessage({
      chatId: "chat-1",
      text: "hello",
      clientMutationId: "mutation-1",
      organizationId: "org-1",
      actorType: "user",
      actorId: "user-1",
    });

    expect(prismaMock.chat.findFirstOrThrow).toHaveBeenCalledWith({
      where: {
        id: "chat-1",
        organizationId: "org-1",
        type: "dm",
        members: { some: { userId: "user-1", leftAt: null } },
      },
      select: {
        id: true,
        members: { where: { leftAt: null }, select: { userId: true } },
      },
    });
  });

  it("returns an idempotent duplicate without creating another message or unread count", async () => {
    const createdAt = new Date("2026-03-21T00:00:00.000Z");
    prismaMock.message.findFirst.mockResolvedValueOnce({
      id: "message-1",
      chatId: "chat-1",
      actorType: "user",
      actorId: "user-1",
      text: "hello",
      html: null,
      parentMessageId: null,
      createdAt,
    });

    const service = new ChatService();
    const message = await service.sendMessage({
      chatId: "chat-1",
      text: "hello",
      clientMutationId: "mutation-1",
      organizationId: "org-1",
      actorType: "user",
      actorId: "user-1",
    });

    expect(message.id).toBe("message-1");
    expect(prismaMock.message.create).not.toHaveBeenCalled();
    expect(prismaMock.chatMember.updateMany).not.toHaveBeenCalled();
    expect(eventServiceMock.publishCreated).not.toHaveBeenCalled();
  });

  it("returns the existing message when edits are a no-op", async () => {
    prismaMock.message.findFirstOrThrow.mockResolvedValueOnce({
      id: "message-1",
      organizationId: "org-1",
      chatId: "chat-1",
      actorType: "user",
      actorId: "user-1",
      text: "hello",
      html: "<p>hello</p>",
      mentions: [],
      deletedAt: null,
      parentMessageId: null,
    });
    prismaMock.message.findMany.mockResolvedValueOnce([]);
    prismaMock.chatMember.findMany.mockResolvedValueOnce([]);

    const service = new ChatService();
    const message = await service.editMessage({
      messageId: "message-1",
      html: "<p>hello</p>",
      organizationId: "org-1",
      actorType: "user",
      actorId: "user-1",
    });

    expect(prismaMock.message.update).not.toHaveBeenCalled();
    expect(message).toMatchObject({
      id: "message-1",
      replyCount: 0,
    });
  });

  it("soft deletes messages and emits message_deleted", async () => {
    const deletedAt = new Date("2026-03-21T00:00:00.000Z");
    prismaMock.message.findFirstOrThrow.mockResolvedValueOnce({
      id: "message-1",
      organizationId: "org-1",
      chatId: "chat-1",
      actorType: "user",
      actorId: "user-1",
      deletedAt: null,
      parentMessageId: null,
    });
    prismaMock.message.update.mockResolvedValueOnce({
      id: "message-1",
      organizationId: "org-1",
      chatId: "chat-1",
      actorType: "user",
      actorId: "user-1",
      text: "",
      html: null,
      mentions: null,
      deletedAt,
      parentMessageId: null,
    });
    prismaMock.message.findMany.mockResolvedValueOnce([]);

    const service = new ChatService();
    const message = await service.deleteMessage({
      messageId: "message-1",
      organizationId: "org-1",
      actorType: "user",
      actorId: "user-1",
    });

    expect(message.deletedAt).toBe(deletedAt);
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "message_deleted",
      }),
      prismaMock,
    );
  });

  it("persists a monotonic read cursor and emits a private user event", async () => {
    const createdAt = new Date("2026-03-21T00:00:00.000Z");
    prismaMock.chat.findFirstOrThrow.mockResolvedValueOnce({ id: "chat-1" });
    prismaMock.message.findFirstOrThrow.mockResolvedValueOnce({
      id: "message-1",
      createdAt,
    });
    prismaMock.chatMember.findUniqueOrThrow.mockResolvedValueOnce({
      lastReadAt: null,
      lastReadMessageId: null,
    });
    prismaMock.message.count.mockResolvedValueOnce(2);

    const service = new ChatService();
    await expect(service.markRead("chat-1", "message-1", "org-1", "user-1")).resolves.toBe(true);

    expect(prismaMock.chatMember.update).toHaveBeenCalledWith({
      where: { chatId_userId: { chatId: "chat-1", userId: "user-1" } },
      data: {
        lastReadMessageId: "message-1",
        lastReadAt: createdAt,
        unreadCount: 2,
      },
    });
    expect(eventServiceMock.publishPrivateUserEvent).toHaveBeenCalledWith(
      { id: "event-1" },
      ["user-1"],
    );
  });

  it("does not regress a read cursor within the same timestamp", async () => {
    const createdAt = new Date("2026-03-21T00:00:00.000Z");
    prismaMock.chat.findFirstOrThrow.mockResolvedValueOnce({ id: "chat-1" });
    prismaMock.message.findFirstOrThrow.mockResolvedValueOnce({
      id: "message-a",
      createdAt,
    });
    prismaMock.chatMember.findUniqueOrThrow.mockResolvedValueOnce({
      lastReadAt: createdAt,
      lastReadMessageId: "message-b",
    });

    const service = new ChatService();
    await expect(service.markRead("chat-1", "message-a", "org-1", "user-1")).resolves.toBe(
      false,
    );

    expect(prismaMock.chatMember.update).not.toHaveBeenCalled();
    expect(eventServiceMock.publishPrivateUserEvent).not.toHaveBeenCalled();
  });

  it("returns top-level messages in ascending order when paginating backwards", async () => {
    prismaMock.chat.findFirstOrThrow.mockResolvedValueOnce({ id: "chat-1" });
    prismaMock.message.findMany
      .mockResolvedValueOnce([
        { id: "message-2", parentMessageId: null },
        { id: "message-1", parentMessageId: null },
      ])
      .mockResolvedValueOnce([]);

    const service = new ChatService();
    const messages = await service.getMessages("chat-1", "user-1", "org-1", {
      before: new Date("2026-03-21T00:00:00.000Z"),
      limit: 2,
    });

    expect(messages.map((message) => message.id)).toEqual(["message-1", "message-2"]);
  });

  it("renames group chats and emits chat_renamed", async () => {
    prismaMock.chat.findFirstOrThrow.mockResolvedValueOnce({
      type: "group",
      organizationId: "org-1",
    });
    prismaMock.chat.update.mockResolvedValueOnce({
      id: "chat-1",
      name: "Renamed",
      members: [],
    });

    const service = new ChatService();
    await expect(service.rename("chat-1", "Renamed", "org-1", "user", "user-1")).resolves.toEqual({
      id: "chat-1",
      name: "Renamed",
      members: [],
    });
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "chat_renamed",
        payload: { name: "Renamed" },
      }),
      prismaMock,
    );
  });

  it("skips the query for searches shorter than two characters", async () => {
    const service = new ChatService();

    await expect(service.searchMessages("a", "user-1", "org-1")).resolves.toEqual([]);
    expect(prismaMock.message.findMany).not.toHaveBeenCalled();
  });

  it("searches messages scoped to visible chats and channels", async () => {
    prismaMock.message.findMany.mockResolvedValueOnce([
      {
        id: "m1",
        chatId: "chat-1",
        channelId: null,
        parentMessageId: null,
        actorType: "user",
        actorId: "user-2",
        text: "hello world",
        html: null,
        mentions: null,
        editedAt: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    prismaMock.session.findMany.mockResolvedValueOnce([]);

    const service = new ChatService();
    const results = await service.searchMessages("hello", "user-1", "org-1");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "m1",
      text: "hello world",
      chatId: "chat-1",
      sessionId: null,
    });

    const where = prismaMock.message.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      deletedAt: null,
      text: { contains: "hello", mode: "insensitive" },
    });
    // Restricts to chats the user belongs to and channels visible to them.
    expect(where.OR).toEqual([
      expect.objectContaining({
        chat: expect.objectContaining({
          members: { some: { userId: "user-1", leftAt: null } },
        }),
      }),
      expect.objectContaining({
        channel: expect.objectContaining({ organizationId: "org-1" }),
      }),
    ]);
    // No visible sessions => the raw event search is skipped entirely.
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it("searches session conversation events and maps them to hits", async () => {
    prismaMock.message.findMany.mockResolvedValueOnce([]);
    prismaMock.session.findMany.mockResolvedValueOnce([
      { id: "session-1", sessionGroupId: "group-1", tool: "claude_code" },
    ]);
    prismaMock.$queryRaw.mockResolvedValueOnce([
      {
        id: "evt-1",
        eventType: "message_sent",
        actorType: "user",
        actorId: "user-1",
        scopeId: "session-1",
        timestamp: new Date("2026-01-01T00:00:01Z"),
        payload: { text: "hello world from a session" },
      },
      {
        id: "evt-2",
        // Assistant output is stored with a "system" actor; search surfaces it as
        // an agent so it can be labeled by coding tool.
        eventType: "session_output",
        actorType: "system",
        actorId: "system",
        scopeId: "session-1",
        timestamp: new Date("2026-01-01T00:00:00Z"),
        payload: { type: "assistant", message: { content: [{ type: "text", text: "hello world back" }] } },
      },
      {
        id: "evt-3",
        eventType: "session_output",
        actorType: "system",
        actorId: "system",
        scopeId: "session-1",
        timestamp: new Date("2026-01-01T00:00:02Z"),
        // ILIKE matched JSON structure, but the visible text does not contain the
        // query, so this hit must be filtered out.
        payload: { type: "assistant", message: { content: [{ type: "text", text: "unrelated" }] } },
      },
    ]);

    const service = new ChatService();
    const results = await service.searchMessages("hello world", "user-1", "org-1");

    expect(results).toHaveLength(2);
    const byId = Object.fromEntries(results.map((r) => [r.id, r]));
    expect(byId["evt-1"]).toMatchObject({
      text: "hello world from a session",
      sessionId: "session-1",
      sessionGroupId: "group-1",
      actorType: "user",
      agentTool: "claude_code",
    });
    // Assistant output becomes an agent hit carrying the session's tool.
    expect(byId["evt-2"]).toMatchObject({
      text: "hello world back",
      actorType: "agent",
      agentTool: "claude_code",
    });
    expect(byId["evt-3"]).toBeUndefined();
  });
});
