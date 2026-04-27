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
import { participantService } from "./participant.js";
import { ChatService } from "./chat.js";

const prismaMock = prisma as any;
const eventServiceMock = eventService as any;
const participantServiceMock = participantService as any;

describe("ChatService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.orgMember.findFirst.mockResolvedValue({ organizationId: "org-1" });
  });

  it("rejects chats without members", async () => {
    const service = new ChatService();

    await expect(
      service.create({ organizationId: "org-1", memberIds: [] } as any, "user", "user-1"),
    ).rejects.toThrow("Chats must include at least one other member");
  });

  it("returns an existing deduplicated DM", async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "user-1", name: "Alice" },
      { id: "user-2", name: "Bob" },
    ]);
    prismaMock.chat.findFirst.mockResolvedValueOnce({ id: "chat-1", members: [] });

    const service = new ChatService();
    const chat = await service.create(
      { organizationId: "org-1", memberIds: ["user-2"] } as any,
      "user",
      "user-1",
    );

    expect(chat).toEqual({ id: "chat-1", members: [] });
    expect(prismaMock.chat.create).not.toHaveBeenCalled();
  });

  it("creates group chats, auto-subscribes members, and emits chat_created", async () => {
    const createdAt = new Date("2026-03-21T00:00:00.000Z");
    prismaMock.user.findMany
      .mockResolvedValueOnce([
        { id: "user-1", name: "Alice" },
        { id: "user-2", name: "Bob" },
        { id: "user-3", name: "Cara" },
      ])
      .mockResolvedValueOnce([
        { id: "user-1", name: "Alice", avatarUrl: null },
        { id: "user-2", name: "Bob", avatarUrl: null },
        { id: "user-3", name: "Cara", avatarUrl: null },
      ]);
    prismaMock.chat.findFirst.mockResolvedValueOnce(null);
    prismaMock.chat.create.mockResolvedValueOnce({
      id: "chat-1",
      type: "group",
      name: "Planning",
      createdAt,
      updatedAt: createdAt,
      members: [],
    });
    prismaMock.chatMember.findMany.mockResolvedValueOnce([
      { userId: "user-1", joinedAt: createdAt },
      { userId: "user-2", joinedAt: createdAt },
      { userId: "user-3", joinedAt: createdAt },
    ]);

    const service = new ChatService();
    const chat = await service.create(
      {
        organizationId: "org-1",
        memberIds: ["user-2", "user-3"],
        name: "Planning",
      } as any,
      "user",
      "user-1",
    );

    expect(chat.id).toBe("chat-1");
    expect(prismaMock.participant.create).toHaveBeenCalledTimes(3);
    expect(eventServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        scopeType: "chat",
        scopeId: "chat-1",
        eventType: "chat_created",
      }),
      prismaMock,
    );
  });

  it("sends threaded messages and subscribes the author to the thread", async () => {
    const createdAt = new Date("2026-03-21T00:00:00.000Z");
    prismaMock.chat.findFirstOrThrow.mockResolvedValueOnce({
      id: "chat-1",
      organizationId: "org-1",
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

    const service = new ChatService();
    const message = await service.editMessage({
      messageId: "message-1",
      html: "<p>hello</p>",
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

  it("returns top-level messages in ascending order when paginating backwards", async () => {
    prismaMock.chat.findFirstOrThrow.mockResolvedValueOnce({ id: "chat-1" });
    prismaMock.message.findMany
      .mockResolvedValueOnce([
        { id: "message-2", parentMessageId: null },
        { id: "message-1", parentMessageId: null },
      ])
      .mockResolvedValueOnce([]);

    const service = new ChatService();
    const messages = await service.getMessages("chat-1", "user-1", {
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
    await expect(service.rename("chat-1", "Renamed", "user", "user-1")).resolves.toEqual({
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
});
