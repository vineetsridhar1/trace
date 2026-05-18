import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import type { Actor, Event } from "@trace/gql";
import { attachmentKeysFromPayload, asJsonObject } from "@trace/shared";
import { eventScopeKey, useAuthStore, useScopedEvents } from "@trace/client-core";
import { client } from "../lib/urql";

const PROMPT_INDEX_PREVIEW_CHARS = 500;

const SESSION_PROMPT_INDEX_QUERY = gql`
  query SessionPromptIndex($organizationId: ID!, $sessionId: ID!) {
    sessionPromptIndex(organizationId: $organizationId, sessionId: $sessionId) {
      eventId
      timestamp
      actor {
        type
        id
        name
        avatarUrl
      }
      preview
      imageCount
    }
  }
`;

export interface SessionPromptIndexItem {
  eventId: string;
  timestamp: string;
  actor: Actor;
  preview: string;
  imageCount: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asActor(value: unknown): Actor | null {
  const actor = asRecord(value);
  if (
    !actor ||
    typeof actor.type !== "string" ||
    typeof actor.id !== "string" ||
    (actor.name != null && typeof actor.name !== "string") ||
    (actor.avatarUrl != null && typeof actor.avatarUrl !== "string")
  ) {
    return null;
  }

  const name = typeof actor.name === "string" ? actor.name : null;
  const avatarUrl = typeof actor.avatarUrl === "string" ? actor.avatarUrl : null;

  return {
    type: actor.type as Actor["type"],
    id: actor.id,
    name,
    avatarUrl,
  };
}

function previewText(text: string): string {
  return text.length > PROMPT_INDEX_PREVIEW_CHARS
    ? `${text.slice(0, PROMPT_INDEX_PREVIEW_CHARS).trimEnd()}…`
    : text;
}

function promptFromEvent(event: Event): SessionPromptIndexItem | null {
  if (event.eventType !== "session_started" && event.eventType !== "message_sent") return null;

  const payload = asJsonObject(event.payload);
  if (!payload) return null;

  const imageCount = attachmentKeysFromPayload(payload).length;
  const rawText = event.eventType === "session_started" ? payload.prompt : payload.text;
  const text = typeof rawText === "string" ? rawText.trim() : "";
  if (!text && imageCount === 0) return null;

  return {
    eventId: event.id,
    timestamp: event.timestamp,
    actor: event.actor,
    preview: text
      ? previewText(text)
      : imageCount === 1
        ? "Image prompt"
        : `${imageCount} image prompt`,
    imageCount,
  };
}

function parsePromptIndex(value: unknown): SessionPromptIndexItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((rawItem) => {
    const item = asRecord(rawItem);
    const actor = asActor(item?.actor);
    if (
      !item ||
      !actor ||
      typeof item.eventId !== "string" ||
      typeof item.timestamp !== "string" ||
      typeof item.preview !== "string" ||
      typeof item.imageCount !== "number"
    ) {
      return [];
    }

    return [
      {
        eventId: item.eventId,
        timestamp: item.timestamp,
        actor,
        preview: item.preview,
        imageCount: item.imageCount,
      },
    ];
  });
}

export function useSessionPromptIndex(sessionId: string, options?: { skip?: boolean }) {
  const skip = options?.skip === true;
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const scopedEvents = useScopedEvents(eventScopeKey("session", sessionId));
  const [fetchedItems, setFetchedItems] = useState<SessionPromptIndexItem[]>([]);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState<string | null>(null);

  const fetchPromptIndex = useCallback(async () => {
    if (skip || !activeOrgId) return;

    setLoading(true);
    setError(null);
    const result = await client
      .query(SESSION_PROMPT_INDEX_QUERY, { organizationId: activeOrgId, sessionId })
      .toPromise();

    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    setFetchedItems(parsePromptIndex(asRecord(result.data)?.sessionPromptIndex));
    setLoading(false);
  }, [activeOrgId, sessionId, skip]);

  useEffect(() => {
    setFetchedItems([]);
    setError(null);
    if (skip) {
      setLoading(false);
      return;
    }
    void fetchPromptIndex();
  }, [fetchPromptIndex, skip]);

  const items = useMemo(() => {
    const byEventId = new Map(fetchedItems.map((item) => [item.eventId, item]));
    for (const event of Object.values(scopedEvents)) {
      const prompt = promptFromEvent(event);
      if (prompt) byEventId.set(prompt.eventId, prompt);
    }

    return [...byEventId.values()].sort((a, b) => {
      const timestampDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      if (timestampDiff !== 0) return timestampDiff;
      return a.eventId.localeCompare(b.eventId);
    });
  }, [fetchedItems, scopedEvents]);

  return { items, loading, error, refetch: fetchPromptIndex };
}
