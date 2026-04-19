import { useCallback, useMemo } from "react";
import { gql } from "@urql/core";
import type { Event, Message } from "@trace/gql";
import { useAuthStore } from "@trace/client-core";
import { upsertFetchedChatMessagesWithOptimisticResolution } from "../lib/optimistic-message";
import { upsertScopedMessageFromEvent } from "./message-event-utils";
import { useScopedMessages } from "./useScopedMessages";

const CHAT_MESSAGES_QUERY = gql`
  query ChatMessages($chatId: ID!, $limit: Int, $before: DateTime) {
    chatMessages(chatId: $chatId, limit: $limit, before: $before) {
      id
      chatId
      text
      html
      mentions
      parentMessageId
      replyCount
      latestReplyAt
      threadRepliers {
        type
        id
        name
        avatarUrl
      }
      actor {
        type
        id
        name
        avatarUrl
      }
      createdAt
      updatedAt
      editedAt
      deletedAt
    }
  }
`;

const CHAT_EVENTS_SUBSCRIPTION = gql`
  subscription ChatEventsSubscription($chatId: ID!, $types: [String!]) {
    chatEvents(chatId: $chatId, types: $types) {
      id
      scopeType
      scopeId
      eventType
      payload
      actor {
        type
        id
        name
        avatarUrl
      }
      parentId
      timestamp
      metadata
    }
  }
`;

export function useChatMessages(chatId: string) {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const getQueryVariables = useCallback(
    (before: string) => ({
      chatId,
      limit: 100,
      before,
    }),
    [chatId],
  );
  const subscriptionVariables = useMemo(
    () => ({
      chatId,
      types: ["message_sent", "message_edited", "message_deleted"],
    }),
    [chatId],
  );
  const handleEvent = useCallback(
    (event: Event) => {
      upsertScopedMessageFromEvent(event, { scopeType: "chat", scopeId: chatId });
    },
    [chatId],
  );
  const handleMessagesLoaded = useCallback(
    (messages: Array<Message & { id: string }>) => {
      upsertFetchedChatMessagesWithOptimisticResolution(chatId, messages);
    },
    [chatId],
  );
  const subscription = useMemo(
    () => ({
      enabled: true,
      query: CHAT_EVENTS_SUBSCRIPTION,
      resultField: "chatEvents" as const,
      variables: subscriptionVariables,
      onEvent: handleEvent,
    }),
    [handleEvent, subscriptionVariables],
  );

  return useScopedMessages({
    scopeId: chatId,
    scopeField: "chatId",
    query: CHAT_MESSAGES_QUERY,
    queryResultField: "chatMessages",
    getQueryVariables,
    resetKeys: [chatId, activeOrgId],
    subscription,
    onMessagesLoaded: handleMessagesLoaded,
  });
}
