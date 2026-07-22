import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Chat, Event, User } from "@trace/gql";

vi.mock("../notifications/registry.js", () => ({
  notifyForEvent: vi.fn(),
}));

import { useAuthStore } from "../stores/auth.js";
import { useEntityStore } from "../stores/entity.js";
import { handleUserEvent } from "./handlers.js";

const currentUser = {
  id: "user-1",
  name: "Alice",
  email: "alice@example.com",
  avatarUrl: null,
} as User;

function chatEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "event-1",
    organizationId: "org-1",
    scopeType: "chat",
    scopeId: "chat-1",
    eventType: "message_sent",
    payload: {
      messageId: "message-1",
      chatId: "chat-1",
      text: "hello",
      parentMessageId: null,
      createdAt: "2026-03-21T00:00:00.000Z",
    },
    actor: { type: "user", id: "user-2", name: "Bob", avatarUrl: null },
    parentId: null,
    timestamp: "2026-03-21T00:00:00.000Z",
    metadata: {},
    ...overrides,
  } as Event;
}

function seededChat(): Chat {
  return {
    id: "chat-1",
    organizationId: "org-1",
    type: "dm",
    name: null,
    members: [],
    lastMessage: null,
    lastMessageAt: null,
    viewerUnreadCount: 4,
    createdAt: "2026-03-20T00:00:00.000Z",
    updatedAt: "2026-03-20T00:00:00.000Z",
  } as unknown as Chat;
}

describe("handleUserEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEntityStore.getState().reset();
    useAuthStore.setState({ user: currentUser, activeOrgId: "org-1" });
    useEntityStore.getState().upsert("chats", "chat-1", seededChat());
  });

  it("updates the lightweight chat projection without retaining background messages", () => {
    handleUserEvent(chatEvent());

    const state = useEntityStore.getState();
    expect(state.chats["chat-1"]).toMatchObject({
      lastMessageAt: "2026-03-21T00:00:00.000Z",
      viewerUnreadCount: 5,
      lastMessage: { id: "message-1", text: "hello" },
    });
    expect(state.messages).toEqual({});
    expect(state.eventsByScope).toEqual({});
  });

  it("does not double count repeated delivery of the same ambient message", () => {
    const event = chatEvent();
    handleUserEvent(event);
    handleUserEvent(event);

    expect(useEntityStore.getState().chats["chat-1"].viewerUnreadCount).toBe(5);
  });

  it("applies the server-owned durable unread projection", () => {
    handleUserEvent(
      chatEvent({
        id: "event-read",
        scopeType: "system",
        scopeId: "user-1",
        eventType: "chat_read",
        payload: { chatId: "chat-1", unreadCount: 0 },
      }),
    );

    expect(useEntityStore.getState().chats["chat-1"].viewerUnreadCount).toBe(0);
  });
});
