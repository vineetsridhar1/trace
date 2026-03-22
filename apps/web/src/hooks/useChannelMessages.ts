import { useEffect, useState, useCallback, useRef } from "react";
import { gql } from "@urql/core";
import type { Actor, Event, Message } from "@trace/gql";
import { asJsonObject, isJsonObject } from "@trace/shared";
import { client } from "../lib/urql";
import { useEntityStore, useEntityIds } from "../stores/entity";
import { useAuthStore } from "../stores/auth";

const PAGE_SIZE = 100;

const CHANNEL_MESSAGES_QUERY = gql`
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
`;

const CHANNEL_EVENTS_SUBSCRIPTION = gql`
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
`;

function normalizeMentions(
  value: unknown,
  fallback: Message["mentions"] | null | undefined,
): Message["mentions"] | null {
  if (Array.isArray(value) || isJsonObject(value)) {
    return value as Message["mentions"];
  }
  return fallback ?? null;
}

function normalizeThreadRepliers(existing: Message["threadRepliers"] | null | undefined, actor: Actor) {
  const nextActor = {
    type: actor.type,
    id: actor.id,
    name: actor.name ?? null,
    avatarUrl: actor.avatarUrl ?? null,
  };
  return [nextActor, ...(existing ?? []).filter((r) => `${r.type}:${r.id}` !== `${nextActor.type}:${nextActor.id}`)].slice(0, 3);
}

function upsertChannelMessageFromEvent(event: Event, channelId: string) {
  if (event.scopeType !== "channel" || event.scopeId !== channelId) return;

  const payload = asJsonObject(event.payload);
  if (!payload) return;

  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  if (!messageId) return;

  const { messages, upsert, patch } = useEntityStore.getState();
  const existing = messages[messageId] as Message | undefined;

  if (event.eventType === "message_sent") {
    const parentMessageId = typeof payload.parentMessageId === "string" ? payload.parentMessageId : null;
    const nextMessage: Message = {
      id: messageId,
      chatId: null,
      channelId,
      text: typeof payload.text === "string" ? payload.text : existing?.text ?? "",
      html: typeof payload.html === "string" ? payload.html : existing?.html ?? null,
      mentions: normalizeMentions(payload.mentions, existing?.mentions),
      parentMessageId,
      replyCount: existing?.replyCount ?? 0,
      latestReplyAt: existing?.latestReplyAt ?? null,
      threadRepliers: existing?.threadRepliers ?? [],
      actor: event.actor,
      createdAt: existing?.createdAt ?? event.timestamp,
      updatedAt: event.timestamp,
      editedAt: existing?.editedAt ?? null,
      deletedAt: existing?.deletedAt ?? null,
    };

    upsert("messages", messageId, nextMessage);

    if (!existing && parentMessageId) {
      const root = messages[parentMessageId] as Message | undefined;
      if (root) {
        patch("messages", parentMessageId, {
          replyCount: (root.replyCount ?? 0) + 1,
          latestReplyAt: event.timestamp,
          threadRepliers: normalizeThreadRepliers(root.threadRepliers, event.actor),
        });
      }
    }
    return;
  }

  if (event.eventType === "message_edited") {
    if (existing) {
      patch("messages", messageId, {
        text: typeof payload.text === "string" ? payload.text : existing.text,
        html: typeof payload.html === "string" ? payload.html : existing.html,
        mentions: normalizeMentions(payload.mentions, existing.mentions),
        updatedAt: event.timestamp,
        editedAt: event.timestamp,
      });
    }
    return;
  }

  if (event.eventType === "message_deleted" && existing) {
    patch("messages", messageId, {
      text: "",
      html: null,
      mentions: null,
      updatedAt: event.timestamp,
      deletedAt: event.timestamp,
    });
  }
}

export function useChannelMessages(channelId: string) {
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
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
  }, [channelId, activeOrgId]);

  const fetchMessages = useCallback(async () => {
    const result = await client
      .query(CHANNEL_MESSAGES_QUERY, {
        channelId,
        limit: PAGE_SIZE,
        before: new Date().toISOString(),
      })
      .toPromise();

    const messages = result.data?.channelMessages as Array<Message & { id: string }> | undefined;
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
  }, [channelId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!activeOrgId) return;

    const subscription = client
      .subscription(CHANNEL_EVENTS_SUBSCRIPTION, {
        channelId,
        organizationId: activeOrgId,
        types: ["message_sent", "message_edited", "message_deleted"],
      })
      .subscribe((result) => {
        if (!result.data?.channelEvents) return;
        upsertChannelMessageFromEvent(result.data.channelEvents as Event, channelId);
      });

    return () => subscription.unsubscribe();
  }, [channelId, activeOrgId]);

  const fetchOlderMessages = useCallback(async () => {
    if (!oldestCreatedAtRef.current || loadingOlderRef.current || !hasOlderRef.current) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);

    const result = await client
      .query(CHANNEL_MESSAGES_QUERY, {
        channelId,
        limit: PAGE_SIZE,
        before: oldestCreatedAtRef.current,
      })
      .toPromise();

    const messages = result.data?.channelMessages as Array<Message & { id: string }> | undefined;
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
  }, [channelId]);

  const messageIds = useEntityIds(
    "messages",
    (message) =>
      message.channelId === channelId &&
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
