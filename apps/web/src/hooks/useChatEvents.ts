import { useEffect, useState, useCallback, useRef } from "react";
import { gql } from "@urql/core";
import type { Event } from "@trace/gql";
import { client } from "../lib/urql";
import { useEntityStore, useEntityIds } from "../stores/entity";
import { useAuthStore } from "../stores/auth";

const PAGE_SIZE = 100;

const CHAT_EVENTS_QUERY = gql`
  query ChatEventsQuery($organizationId: ID!, $scope: ScopeInput, $types: [String!], $limit: Int, $before: DateTime) {
    events(
      organizationId: $organizationId
      scope: $scope
      types: $types
      limit: $limit
      before: $before
    ) {
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

export function useChatEvents(chatId: string) {
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const oldestTimestampRef = useRef<string | null>(null);
  const loadingOlderRef = useRef(false);
  const hasOlderRef = useRef(true);

  useEffect(() => {
    setLoading(true);
    setLoadingOlder(false);
    setHasOlder(true);
    oldestTimestampRef.current = null;
    loadingOlderRef.current = false;
    hasOlderRef.current = true;
  }, [chatId, activeOrgId]);

  const fetchEvents = useCallback(async () => {
    if (!activeOrgId) return;

    const result = await client
      .query(CHAT_EVENTS_QUERY, {
        organizationId: activeOrgId,
        scope: { type: "chat", id: chatId },
        types: ["message_sent"],
        limit: PAGE_SIZE,
        before: new Date().toISOString(),
      })
      .toPromise();

    if (result.data?.events) {
      const events = result.data.events as Array<Event & { id: string }>;
      useEntityStore.getState().upsertMany("events", events);

      if (events.length < PAGE_SIZE) {
        setHasOlder(false);
        hasOlderRef.current = false;
      }
      if (events.length > 0) {
        oldestTimestampRef.current = events[0].timestamp;
      }
    }
    setLoading(false);
  }, [activeOrgId, chatId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Subscribe to real-time chat events
  useEffect(() => {
    if (!activeOrgId) return;

    const subscription = client
      .subscription(CHAT_EVENTS_SUBSCRIPTION, {
        chatId,
        organizationId: activeOrgId,
        types: ["message_sent"],
      })
      .subscribe((result) => {
        if (!result.data?.chatEvents) return;
        const event = result.data.chatEvents as Event & { id: string };
        useEntityStore.getState().upsert("events", event.id, event);
      });

    return () => subscription.unsubscribe();
  }, [activeOrgId, chatId]);

  const fetchOlderEvents = useCallback(async () => {
    if (!activeOrgId || !oldestTimestampRef.current || loadingOlderRef.current || !hasOlderRef.current) {
      return;
    }

    loadingOlderRef.current = true;
    setLoadingOlder(true);

    const result = await client
      .query(CHAT_EVENTS_QUERY, {
        organizationId: activeOrgId,
        scope: { type: "chat", id: chatId },
        types: ["message_sent"],
        limit: PAGE_SIZE,
        before: oldestTimestampRef.current,
      })
      .toPromise();

    if (result.data?.events) {
      const events = result.data.events as Array<Event & { id: string }>;
      useEntityStore.getState().upsertMany("events", events);

      if (events.length < PAGE_SIZE) {
        setHasOlder(false);
        hasOlderRef.current = false;
      }
      if (events.length > 0) {
        oldestTimestampRef.current = events[0].timestamp;
      }
    }
    loadingOlderRef.current = false;
    setLoadingOlder(false);
  }, [activeOrgId, chatId]);

  // Main feed events: scopeType=chat, scopeId=chatId, and parentId IS NULL
  const eventIds = useEntityIds(
    "events",
    (e) => e.scopeType === "chat" && e.scopeId === chatId && e.eventType === "message_sent" && !e.parentId,
    (a, b) => a.timestamp.localeCompare(b.timestamp),
  );

  return { eventIds, loading, loadingOlder, hasOlder, fetchOlderEvents };
}
