import { useEffect } from "react";
import { gql } from "@urql/core";
import { client } from "../lib/urql";
import { useEntityStore } from "../stores/entity";
import type { SessionEntity } from "../stores/entity";
import { useAuthStore } from "../stores/auth";
import type { Event, EventType, ScopeType, SessionStatus, Channel } from "@trace/gql";

const ORG_EVENTS_SUBSCRIPTION = gql`
  subscription OrgEvents($organizationId: ID!) {
    orgEvents(organizationId: $organizationId) {
      id
      scopeType
      scopeId
      eventType
      payload
      actor {
        type
        id
      }
      parentId
      timestamp
      metadata
    }
  }
`;

const SESSION_STATUS_EVENTS: Set<EventType> = new Set([
  "session_started",
  "session_paused",
  "session_resumed",
  "session_terminated",
]);

const SESSION_ACTIVITY_EVENTS: Set<EventType> = new Set([
  "session_output",
  "message_sent",
]);

function statusFromEvent(eventType: EventType, payload: Record<string, unknown>): SessionStatus | undefined {
  switch (eventType) {
    case "session_started":
    case "session_resumed":
      return "active";
    case "session_paused":
      return "paused";
    case "session_terminated":
      return payload.reason === "bridge_complete" ? "completed" : "failed";
    default:
      return undefined;
  }
}

/** Safely narrow unknown to a record */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Extract a human-readable preview from a message payload, skipping tool calls */
function extractMessagePreview(eventType: EventType, payload: Record<string, unknown>): string | null {
  if (eventType === "message_sent") {
    return typeof payload.text === "string" ? payload.text : null;
  }

  const type = payload.type;
  if (type === "tool_use" || type === "tool_result" || type === "system" || type === "stderr") {
    return null;
  }

  if (type === "assistant" || type === "text") {
    const message = asRecord(payload.message);
    const content = message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        const b = asRecord(block);
        if (b?.type === "text" && typeof b.text === "string" && b.text.trim()) {
          return b.text;
        }
      }
    }
    if (typeof payload.text === "string" && payload.text.trim()) return payload.text;
  }

  return null;
}

export function useOrgEvents() {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);

  useEffect(() => {
    if (!activeOrgId) return;

    const subscription = client
      .subscription(ORG_EVENTS_SUBSCRIPTION, {
        organizationId: activeOrgId,
      })
      .subscribe((result) => {
        if (!result.data?.orgEvents) return;

        const event = result.data.orgEvents as Event;
        const { upsert, patch } = useEntityStore.getState();

        // Always upsert the raw event
        upsert("events", event.id, event);

        // New channel — upsert directly from payload
        if (event.eventType === "channel_created") {
          const channel = asRecord(event.payload.channel);
          if (channel && typeof channel.id === "string") {
            upsert("channels", channel.id, channel as unknown as Channel);
          }
        }

        // New session — upsert directly from payload
        if (event.eventType === "session_started") {
          const session = asRecord(event.payload.session);
          if (session && typeof session.id === "string") {
            upsert("sessions", session.id, session as unknown as SessionEntity);
          }
        }

        // Route session status events
        if (SESSION_STATUS_EVENTS.has(event.eventType) && event.scopeType === ("session" satisfies ScopeType)) {
          const status = statusFromEvent(event.eventType, event.payload);
          if (status) {
            patch("sessions", event.scopeId, {
              status,
              updatedAt: event.timestamp,
            });
          }
        }

        // Route session activity events — update timestamp, and preview if it's a real message
        if (SESSION_ACTIVITY_EVENTS.has(event.eventType) && event.scopeType === ("session" satisfies ScopeType)) {
          const preview = extractMessagePreview(event.eventType, event.payload);
          const updates: Partial<SessionEntity> = { updatedAt: event.timestamp };
          if (preview) {
            updates._lastEventPreview = preview;
          }
          patch("sessions", event.scopeId, updates);
        }
      });

    return () => subscription.unsubscribe();
  }, [activeOrgId]);
}
