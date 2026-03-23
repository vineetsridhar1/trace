import { useCallback, useMemo } from "react";
import { graphql } from "@trace/gql/client";
import type { Event } from "@trace/gql";
import { useAuthStore } from "../stores/auth";
import { upsertScopedMessageFromEvent } from "./message-event-utils";
import { useScopedMessages } from "./useScopedMessages";

const CHANNEL_MESSAGES_QUERY = graphql(`
  query ChannelMessages($channelId: ID!, $limit: Int, $before: DateTime) {
    channelMessages(channelId: $channelId, limit: $limit, before: $before) {
      id
      chatId
      channelId
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
`);

const CHANNEL_EVENTS_SUBSCRIPTION = graphql(`
  subscription ChannelEventsForMessages($channelId: ID!, $organizationId: ID!, $types: [String!]) {
    channelEvents(channelId: $channelId, organizationId: $organizationId, types: $types) {
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
`);


export function useChannelMessages(channelId: string) {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const getQueryVariables = useCallback(
    (before: string) => ({
      channelId,
      limit: 100,
      before,
    }),
    [channelId],
  );
  const subscriptionVariables = useMemo(
    () => activeOrgId
      ? {
          channelId,
          organizationId: activeOrgId,
          types: ["message_sent", "message_edited", "message_deleted"],
        }
      : null,
    [activeOrgId, channelId],
  );
  const handleEvent = useCallback(
    (event: Event) => {
      upsertScopedMessageFromEvent(event, { scopeType: "channel", scopeId: channelId });
    },
    [channelId],
  );
  const subscription = useMemo(
    () => subscriptionVariables
      ? {
          enabled: true,
          query: CHANNEL_EVENTS_SUBSCRIPTION,
          resultField: "channelEvents" as const,
          variables: subscriptionVariables,
          onEvent: handleEvent,
        }
      : {
          enabled: false,
          query: CHANNEL_EVENTS_SUBSCRIPTION,
          resultField: "channelEvents" as const,
          variables: { channelId },
          onEvent: handleEvent,
        },
    [channelId, handleEvent, subscriptionVariables],
  );

  return useScopedMessages({
    scopeId: channelId,
    scopeField: "channelId",
    query: CHANNEL_MESSAGES_QUERY,
    queryResultField: "channelMessages",
    getQueryVariables,
    resetKeys: [channelId, activeOrgId],
    subscription,
  });
}
