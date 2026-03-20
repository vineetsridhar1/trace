import { useEffect, useState, useCallback, useRef } from "react";
import { gql } from "@urql/core";
import type { Actor, Event, Message } from "@trace/gql";
import { asJsonObject, isJsonObject } from "@trace/shared";
import { client } from "../lib/urql";
import { useEntityStore, useEntityIds } from "../stores/entity";
import { useAuthStore } from "../stores/auth";

const PAGE_SIZE = 100;

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
  subscription ChatEventsSubscription($chatId: ID!, $organizationId: ID!, $types: [String!]) {
    chatEvents(chatId: $chatId, organizationId: $organizationId, types: $types) {
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

  return [nextActor, ...(existing ?? []).filter((replier) => `${replier.type}:${replier.id}` !== `${nextActor.type}:${nextActor.id}`)].slice(0, 3);
}

function upsertMessageFromEvent(event: Event) {
  if (event.scopeType !== "chat") return;

  const payload = asJsonObject(event.payload);
  if (!payload) return;

  const messageId = typeof payload?.messageId === "string" ? payload.messageId : null;
  if (!messageId) return;

  const { messages, upsert, patch } = useEntityStore.getState();
  const existing = messages[messageId] as Message | undefined;

  if (event.eventType === "message_sent") {
    const parentMessageId = typeof payload.parentMessageId === "string" ? payload.parentMessageId : null;
    const nextMessage: Message = {
      id: messageId,
      chatId: event.scopeId,
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

export function useChatMessages(chatId: string) {
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
  }, [chatId, activeOrgId]);

  const fetchMessages = useCallback(async () => {
    const result = await client
      .query(CHAT_MESSAGES_QUERY, {
        chatId,
        limit: PAGE_SIZE,
        before: new Date().toISOString(),
      })
      .toPromise();

    const messages = result.data?.chatMessages as Array<Message & { id: string }> | undefined;
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
  }, [chatId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!activeOrgId) return;

    const subscription = client
      .subscription(CHAT_EVENTS_SUBSCRIPTION, {
        chatId,
        organizationId: activeOrgId,
        types: ["message_sent", "message_edited", "message_deleted"],
      })
      .subscribe((result) => {
        if (!result.data?.chatEvents) return;
        upsertMessageFromEvent(result.data.chatEvents as Event);
      });

    return () => subscription.unsubscribe();
  }, [activeOrgId, chatId]);

  const fetchOlderMessages = useCallback(async () => {
    if (!oldestCreatedAtRef.current || loadingOlderRef.current || !hasOlderRef.current) {
      return;
    }

    loadingOlderRef.current = true;
    setLoadingOlder(true);

    const result = await client
      .query(CHAT_MESSAGES_QUERY, {
        chatId,
        limit: PAGE_SIZE,
        before: oldestCreatedAtRef.current,
      })
      .toPromise();

    const messages = result.data?.chatMessages as Array<Message & { id: string }> | undefined;
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
  }, [chatId]);

  const messageIds = useEntityIds(
    "messages",
    (message) => message.chatId === chatId && !message.parentMessageId,
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
