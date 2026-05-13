import { beforeEach, describe, expect, it } from "vitest";
import {
  eventScopeKey,
  messageScopeKey,
  optimisticallyInsertChannelMessage,
  useAuthStore,
  useEntityStore,
} from "@trace/client-core";
import type { Event } from "@trace/gql";
import { upsertScopedMessageFromEvent } from "./message-event-utils";

function resetStores() {
  useEntityStore.getState().reset();
  useAuthStore.setState({
    user: {
      id: "user-1",
      name: "User",
      email: "user@example.test",
      avatarUrl: null,
      organizations: [],
    },
    activeOrgId: "org-1",
    orgMemberships: [],
    loading: false,
    token: null,
  });
}

beforeEach(() => {
  resetStores();
});

describe("upsertScopedMessageFromEvent", () => {
  it("reconciles optimistic channel messages with canonical message_sent events", () => {
    const optimistic = optimisticallyInsertChannelMessage("channel-1", "<p>Hello</p>");
    const event: Event = {
      id: "event-real",
      scopeType: "channel",
      scopeId: "channel-1",
      eventType: "message_sent",
      payload: {
        messageId: "message-real",
        text: "Hello",
        html: "<p>Hello</p>",
        parentMessageId: null,
        clientMutationId: optimistic.clientMutationId,
      },
      actor: { type: "user", id: "user-1", name: "User", avatarUrl: null },
      parentId: null,
      timestamp: "2026-01-01T00:00:00.000Z",
      metadata: null,
    };

    upsertScopedMessageFromEvent(event, { scopeType: "channel", scopeId: "channel-1" });

    const state = useEntityStore.getState();
    expect(state.messages[optimistic.messageId]).toBeUndefined();
    expect(state.messages["message-real"]).toMatchObject({
      id: "message-real",
      channelId: "channel-1",
      html: "<p>Hello</p>",
    });
    expect(state._messageIdsByScope[messageScopeKey("channel", "channel-1")]).toEqual([
      "message-real",
    ]);
    expect(state.eventsByScope[eventScopeKey("channel", "channel-1")]?.[optimistic.eventId]).toBeUndefined();
  });
});
