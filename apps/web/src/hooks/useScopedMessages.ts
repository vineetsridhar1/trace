import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentNode } from "graphql";
import type { Event, Message } from "@trace/gql";
import { client } from "../lib/urql";
import { useEntityIds, useEntityStore } from "../stores/entity";

const PAGE_SIZE = 100;

type MessageResultField = "chatMessages" | "channelMessages";
type EventResultField = "chatEvents" | "channelEvents";

type SubscriptionConfig = {
  enabled: boolean;
  query: DocumentNode;
  resultField: EventResultField;
  variables: Record<string, unknown>;
  onEvent: (event: Event) => void;
};

type UseScopedMessagesOptions = {
  scopeId: string;
  scopeField: "chatId" | "channelId";
  query: DocumentNode;
  queryResultField: MessageResultField;
  getQueryVariables: (before: string) => Record<string, unknown>;
  resetKeys: readonly unknown[];
  subscription?: SubscriptionConfig;
};

function getMessagesFromResult(data: Record<string, unknown> | undefined, field: MessageResultField) {
  const value = data?.[field];
  return Array.isArray(value) ? (value as Array<Message & { id: string }>) : undefined;
}

function getEventFromResult(data: Record<string, unknown> | undefined, field: EventResultField) {
  const value = data?.[field];
  return value ? (value as Event) : null;
}

export function useScopedMessages({
  scopeId,
  scopeField,
  query,
  queryResultField,
  getQueryVariables,
  resetKeys,
  subscription,
}: UseScopedMessagesOptions) {
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const oldestCreatedAtRef = useRef<string | null>(null);
  const loadingOlderRef = useRef(false);
  const hasOlderRef = useRef(true);

  useEffect(() => {
    setLoading(true);
    setLoadingOlder(false);
    setHasOlder(true);
    oldestCreatedAtRef.current = null;
    loadingOlderRef.current = false;
    hasOlderRef.current = true;
  }, resetKeys);

  const fetchMessages = useCallback(async () => {
    const result = await client
      .query(query, getQueryVariables(new Date().toISOString()))
      .toPromise();

    const messages = getMessagesFromResult(result.data as Record<string, unknown> | undefined, queryResultField);
    if (messages) {
      useEntityStore.getState().upsertMany("messages", messages);

      if (messages.length < PAGE_SIZE) {
        setHasOlder(false);
        hasOlderRef.current = false;
      }
      if (messages.length > 0) {
        oldestCreatedAtRef.current = messages[0].createdAt;
      }
    }

    setLoading(false);
  }, [getQueryVariables, query, queryResultField]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!subscription?.enabled) {
      return;
    }

    const activeSubscription = client
      .subscription(subscription.query, subscription.variables)
      .subscribe((result) => {
        const event = getEventFromResult(result.data as Record<string, unknown> | undefined, subscription.resultField);
        if (event) {
          subscription.onEvent(event);
        }
      });

    return () => activeSubscription.unsubscribe();
  }, [subscription]);

  const fetchOlderMessages = useCallback(async () => {
    if (!oldestCreatedAtRef.current || loadingOlderRef.current || !hasOlderRef.current) {
      return;
    }

    loadingOlderRef.current = true;
    setLoadingOlder(true);

    const result = await client
      .query(query, getQueryVariables(oldestCreatedAtRef.current))
      .toPromise();

    const messages = getMessagesFromResult(result.data as Record<string, unknown> | undefined, queryResultField);
    if (messages) {
      useEntityStore.getState().upsertMany("messages", messages);

      if (messages.length < PAGE_SIZE) {
        setHasOlder(false);
        hasOlderRef.current = false;
      }
      if (messages.length > 0) {
        oldestCreatedAtRef.current = messages[0].createdAt;
      }
    }

    loadingOlderRef.current = false;
    setLoadingOlder(false);
  }, [getQueryVariables, query, queryResultField]);

  const messageIds = useEntityIds(
    "messages",
    (message) =>
      message[scopeField] === scopeId &&
      !message.parentMessageId &&
      (!message.deletedAt || (message.replyCount ?? 0) > 0),
    (a, b) => a.createdAt.localeCompare(b.createdAt),
  );

  return {
    messageIds,
    loading,
    loadingOlder,
    hasOlder,
    fetchOlderMessages,
  };
}
