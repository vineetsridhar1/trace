import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import {
  assertChatAccess,
  assertChannelAccess,
  assertScopeAccess,
  assertThreadAccess,
  isActiveChannelMember,
  isActiveChatMember,
} from "./access.js";

const prismaMock = prisma as any;

describe("access service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks active chat membership", async () => {
    prismaMock.chatMember.findFirst.mockResolvedValueOnce({ chatId: "chat-1" });
    await expect(isActiveChatMember("chat-1", "user-1")).resolves.toBe(true);

    prismaMock.chatMember.findFirst.mockResolvedValueOnce(null);
    await expect(isActiveChatMember("chat-1", "user-1")).resolves.toBe(false);
  });

  it("checks active channel membership", async () => {
    prismaMock.channelMember.findFirst.mockResolvedValueOnce({ channelId: "channel-1" });
    await expect(isActiveChannelMember("channel-1", "user-1")).resolves.toBe(true);

    prismaMock.channelMember.findFirst.mockResolvedValueOnce(null);
    await expect(isActiveChannelMember("channel-1", "user-1")).resolves.toBe(false);
  });

  it("asserts chat access and rejects missing membership", async () => {
    prismaMock.chat.findFirst.mockResolvedValueOnce({ id: "chat-1" });
    await expect(assertChatAccess("chat-1", "user-1")).resolves.toEqual({
      id: "chat-1",
    });

    prismaMock.chat.findFirst.mockResolvedValueOnce(null);
    await expect(assertChatAccess("chat-1", "user-1")).rejects.toThrow(
      "Not authorized for this chat",
    );
  });

  it("asserts channel access and rejects missing membership", async () => {
    prismaMock.channelMember.findFirst.mockResolvedValueOnce({ channelId: "channel-1" });
    await expect(assertChannelAccess("channel-1", "user-1")).resolves.toEqual({
      id: "channel-1",
    });

    prismaMock.channelMember.findFirst.mockResolvedValueOnce(null);
    await expect(assertChannelAccess("channel-1", "user-1")).rejects.toThrow(
      "Not authorized for this channel",
    );
  });

  it("dispatches scope access checks by scope type", async () => {
    prismaMock.channelMember.findFirst.mockResolvedValueOnce({ channelId: "channel-1" });

    await expect(assertScopeAccess("channel", "channel-1", "user-1", "org-1")).resolves.toBeUndefined();
    await expect(assertScopeAccess("unknown", "id", "user-1", "org-1")).rejects.toThrow(
      "Unsupported scope type: unknown",
    );
  });

  it("validates thread access through the root message and chat membership", async () => {
    prismaMock.message.findUniqueOrThrow.mockResolvedValueOnce({
      id: "message-1",
      chatId: "chat-1",
      channelId: null,
      parentMessageId: null,
    });
    prismaMock.chat.findFirst.mockResolvedValueOnce({ id: "chat-1" });

    await expect(assertThreadAccess("message-1", "user-1")).resolves.toEqual({
      id: "message-1",
      chatId: "chat-1",
      channelId: null,
      parentMessageId: null,
    });
  });

  it("validates thread access through channel membership for channel threads", async () => {
    prismaMock.message.findUniqueOrThrow.mockResolvedValueOnce({
      id: "message-1",
      chatId: null,
      channelId: "channel-1",
      parentMessageId: null,
    });
    prismaMock.channelMember.findFirst.mockResolvedValueOnce({ channelId: "channel-1" });

    await expect(assertThreadAccess("message-1", "user-1")).resolves.toEqual({
      id: "message-1",
      chatId: null,
      channelId: "channel-1",
      parentMessageId: null,
    });
  });
});
