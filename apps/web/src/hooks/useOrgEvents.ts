import { useEffect } from "react";
import { gql } from "@urql/core";
import { client } from "../lib/urql";
import { useEntityStore } from "../stores/entity";
import type { SessionEntity } from "../stores/entity";
import { useAuthStore } from "../stores/auth";
import { useUIStore } from "../stores/ui";
import { notifyForEvent } from "../notifications/handlers";
import type { Event, EventType, ScopeType, SessionStatus, Channel, Repo } from "@trace/gql";

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
        name
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
  // Server includes the authoritative status in all session event payloads
  const explicit = payload.status as SessionStatus | undefined;
  if (explicit) return explicit;

  // Fallback for older events without status in payload
  switch (eventType) {
    case "session_started": {
      // Session may start in "creating" status when a repo is selected
      const session = payload.session as Record<string, unknown> | undefined;
      const status = session?.status as SessionStatus | undefined;
      return status ?? "pending";
    }
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

/** Connection event types that carry a connection patch */
const CONNECTION_EVENT_TYPES = new Set([
  "connection_lost",
  "connection_restored",
  "recovery_failed",
  "recovery_requested",
  "session_rehomed",
]);

/** Extract session field updates from session_output subtypes (e.g. workspace_ready, connection events, title) */
function sessionPatchFromOutput(payload: Record<string, unknown>): Partial<SessionEntity> | undefined {
  if (payload.type === "workspace_ready" && typeof payload.workdir === "string") {
    return { status: "pending" as SessionStatus, workdir: payload.workdir };
  }
  // LLM-generated title update
  if (payload.type === "title_generated" && typeof payload.name === "string") {
    return { name: payload.name };
  }
  // Connection state events carry a full connection patch
  if (typeof payload.type === "string" && CONNECTION_EVENT_TYPES.has(payload.type)) {
    const connection = asRecord(payload.connection);
    if (connection) {
      return { connection } as Partial<SessionEntity>;
    }
  }
  return undefined;
}

/** Safely narrow unknown to a record */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Extract a human-readable preview from a normalized message payload */
function extractMessagePreview(eventType: EventType, payload: Record<string, unknown>): string | null {
  if (eventType === "message_sent") {
    return typeof payload.text === "string" ? payload.text : null;
  }

  // Adapters normalize all output to { type: "assistant", message: { content: [...] } }
  if (payload.type !== "assistant") return null;

  const message = asRecord(payload.message);
  const content = message?.content;
  if (!Array.isArray(content)) return null;

  for (const block of content) {
    const b = asRecord(block);
    if (b?.type === "text" && typeof b.text === "string" && b.text.trim()) {
      return b.text;
    }
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

        // Fire any registered notification handlers
        notifyForEvent(event);

        // New repo — upsert directly from payload
        if (event.eventType === "repo_created") {
          const repo = asRecord(event.payload.repo);
          if (repo && typeof repo.id === "string") {
            upsert("repos", repo.id, repo as unknown as Repo);
          }
        }

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

            // If this session has a parent, update the parent's childSessions
            const parent = asRecord(session.parentSession);
            if (parent && typeof parent.id === "string") {
              const { sessions } = useEntityStore.getState();
              const parentEntity = sessions[parent.id];
              if (parentEntity) {
                const existing = (parentEntity.childSessions ?? []) as SessionEntity[];
                const alreadyLinked = existing.some((c) => c.id === session.id);
                if (!alreadyLinked) {
                  patch("sessions", parent.id, {
                    childSessions: [...existing, session as unknown as SessionEntity],
                  });
                }
              }
            }
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

        // Handle session_output subtypes that update session fields
        if (event.eventType === "session_output" && event.scopeType === ("session" satisfies ScopeType)) {
          const sessionPatch = sessionPatchFromOutput(event.payload);
          if (sessionPatch) {
            patch("sessions", event.scopeId, { ...sessionPatch, updatedAt: event.timestamp });
          }

          if (event.payload.type === "session_rehomed" && typeof event.payload.newSessionId === "string") {
            const activeSessionId = useUIStore.getState().activeSessionId;
            if (activeSessionId === event.scopeId) {
              useUIStore.getState().setActiveSessionId(event.payload.newSessionId);
            }
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
