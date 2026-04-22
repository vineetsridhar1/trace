import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gql } from "@urql/core";
import type { Event } from "@trace/gql";
import {
  extractMessagePreview,
  HIDDEN_SESSION_PAYLOAD_TYPES,
  stripPromptWrapping,
  useAuthStore,
} from "@trace/client-core";
import { asJsonObject } from "@trace/shared";
import { getClient } from "@/lib/urql";

const SESSION_PREVIEW_EVENTS_QUERY = gql`
  query MobileSessionPreviewEvents(
    $organizationId: ID!
    $scope: ScopeInput
    $limit: Int
    $before: DateTime
    $excludePayloadTypes: [String!]
  ) {
    events(
      organizationId: $organizationId
      scope: $scope
      limit: $limit
      before: $before
      excludePayloadTypes: $excludePayloadTypes
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

export interface SessionPreviewMessage {
  text: string;
  actorName: string | null;
  timestamp: string | null;
}

function normalizePreviewText(text: string): string {
  return stripPromptWrapping(text).trim();
}

function previewFromEvent(event: Event): SessionPreviewMessage | null {
  const payload = asJsonObject(event.payload);
  if (!payload) return null;

  const rawText =
    event.eventType === "session_started" && typeof payload.prompt === "string"
      ? payload.prompt
      : extractMessagePreview(event.eventType, payload);
  const text = typeof rawText === "string" ? normalizePreviewText(rawText) : "";
  if (!text) return null;

  return {
    text,
    actorName: event.actor?.name ?? null,
    timestamp: event.timestamp,
  };
}

export function useSessionPreviewMessage({
  cachedPreview,
  fallbackTimestamp,
  sessionId,
}: {
  cachedPreview: unknown;
  fallbackTimestamp: unknown;
  sessionId: string | null;
}) {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const [fetched, setFetched] = useState<{
    sessionId: string;
    message: SessionPreviewMessage | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const resolvedSessionIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setFetched(null);
  }, [sessionId]);

  const cachedMessage = useMemo<SessionPreviewMessage | null>(() => {
    if (typeof cachedPreview !== "string") return null;
    const text = normalizePreviewText(cachedPreview);
    if (!text) return null;
    return {
      text,
      actorName: null,
      timestamp: typeof fallbackTimestamp === "string" ? fallbackTimestamp : null,
    };
  }, [cachedPreview, fallbackTimestamp]);

  const message = fetched?.sessionId === sessionId ? fetched.message : cachedMessage;

  const warmPreview = useCallback(async () => {
    if (!sessionId || !activeOrgId || message?.text) return;
    if (resolvedSessionIdsRef.current.has(sessionId)) return;

    resolvedSessionIdsRef.current.add(sessionId);
    setLoading(true);

    try {
      const result = await getClient()
        .query(SESSION_PREVIEW_EVENTS_QUERY, {
          organizationId: activeOrgId,
          scope: { type: "session", id: sessionId },
          limit: 30,
          before: new Date().toISOString(),
          excludePayloadTypes: HIDDEN_SESSION_PAYLOAD_TYPES,
        })
        .toPromise();

      if (result.error) {
        resolvedSessionIdsRef.current.delete(sessionId);
        console.warn("[sessionPreview] failed", result.error);
        return;
      }

      const events = ((result.data as { events?: Array<Event & { id: string }> } | undefined)
        ?.events ?? []);
      const nextMessage = [...events]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .map(previewFromEvent)
        .find((item): item is SessionPreviewMessage => item !== null) ?? null;

      setFetched({ sessionId, message: nextMessage });
    } catch (err) {
      resolvedSessionIdsRef.current.delete(sessionId);
      console.warn("[sessionPreview] failed", err);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, message?.text, sessionId]);

  return {
    loading,
    message,
    warmPreview,
  };
}
