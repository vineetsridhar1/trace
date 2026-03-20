import { useEffect } from "react";
import { gql } from "@urql/core";
import { asJsonObject, type JsonObject } from "@trace/shared";
import { client } from "../lib/urql";
import { useEntityStore } from "../stores/entity";
import type { SessionEntity } from "../stores/entity";
import { useAuthStore } from "../stores/auth";
import { useUIStore } from "../stores/ui";
import { notifyForEvent } from "../notifications/handlers";
import type { Event, EventType, ScopeType, SessionStatus, Channel, Chat, Repo, InboxItem } from "@trace/gql";

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
        avatarUrl
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
  "session_pr_opened",
  "session_pr_merged",
]);

const SESSION_ACTIVITY_EVENTS: Set<EventType> = new Set([
  "session_output",
  "message_sent",
]);

function statusFromEvent(eventType: EventType, payload: JsonObject): SessionStatus | undefined {
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
function sessionPatchFromOutput(payload: JsonObject): Partial<SessionEntity> | undefined {
  if (payload.type === "workspace_ready" && typeof payload.workdir === "string") {
    return { status: "pending" as SessionStatus, workdir: payload.workdir };
  }
  // LLM-generated title update
  if (payload.type === "title_generated" && typeof payload.name === "string") {
    return { name: payload.name };
  }
  if (payload.type === "question_pending" || payload.type === "plan_pending") {
    return { status: "needs_input" as SessionStatus };
  }
  // Connection state events carry a full connection patch
  if (typeof payload.type === "string" && CONNECTION_EVENT_TYPES.has(payload.type)) {
    const connection = asJsonObject(payload.connection);
    if (connection) {
      return { connection } as Partial<SessionEntity>;
    }
  }
  return undefined;
}

/** Extract a human-readable preview from a normalized message payload */
function extractMessagePreview(eventType: EventType, payload: JsonObject): string | null {
  if (eventType === "message_sent") {
    return typeof payload.text === "string" ? payload.text : null;
  }

  // Adapters normalize all output to { type: "assistant", message: { content: [...] } }
  if (payload.type !== "assistant") return null;

  const message = asJsonObject(payload.message);
  const content = message?.content;
  if (!Array.isArray(content)) return null;

  for (const block of content) {
    const b = asJsonObject(block);
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
        const { upsert, patch, remove } = useEntityStore.getState();
        const payload = asJsonObject(event.payload);

        // Always upsert the raw event
        upsert("events", event.id, event);

        // Repo created or updated — upsert directly from payload
        if ((event.eventType === "repo_created" || event.eventType === "repo_updated") && payload) {
          const repo = asJsonObject(payload.repo);
          if (repo && typeof repo.id === "string") {
            const existing = useEntityStore.getState().repos[repo.id];
            upsert("repos", repo.id, (existing ? { ...existing, ...repo } : repo) as unknown as Repo);
          }
        }

        // Chat events
        if (event.eventType === "chat_created" && payload) {
          const chat = asJsonObject(payload.chat);
          if (chat && typeof chat.id === "string") {
            upsert("chats", chat.id, chat as unknown as Chat);
          }
        }
        if (event.eventType === "chat_renamed" && payload) {
          if (event.scopeType === "chat" && typeof payload.name === "string") {
            patch("chats", event.scopeId, { name: payload.name } as Partial<Chat>);
          }
        }
        if ((event.eventType === "chat_member_added" || event.eventType === "chat_member_removed") && payload) {
          if (event.scopeType === "chat") {
            const members = payload.members;
            if (Array.isArray(members)) {
              patch("chats", event.scopeId, { members } as Partial<Chat>);
            }
          }
        }

        // New channel — upsert directly from payload
        if (event.eventType === "channel_created" && payload) {
          const channel = asJsonObject(payload.channel);
          if (channel && typeof channel.id === "string") {
            upsert("channels", channel.id, channel as unknown as Channel);
          }
        }

        // New session — upsert directly from payload
        if (event.eventType === "session_started" && payload) {
          const session = asJsonObject(payload.session);
          if (session && typeof session.id === "string") {
            upsert("sessions", session.id, session as unknown as SessionEntity);

            // If this session has a parent, update the parent's childSessions
            const parent = asJsonObject(session.parentSession);
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

        // Session deleted — remove from store and navigate away if active
        if (event.eventType === "session_deleted" && event.scopeType === ("session" satisfies ScopeType)) {
          const deletedId = event.scopeId;
          remove("sessions", deletedId);
          const activeSessionId = useUIStore.getState().activeSessionId;
          if (activeSessionId === deletedId) {
            useUIStore.getState().setActiveSessionId(null);
          }
        }

        // Route session status events
        if (SESSION_STATUS_EVENTS.has(event.eventType) && event.scopeType === ("session" satisfies ScopeType) && payload) {
          const status = statusFromEvent(event.eventType, payload);
          if (status) {
            const sessionPatch: Record<string, unknown> = {
              status,
              updatedAt: event.timestamp,
            };
            if (typeof payload.prUrl === "string") {
              sessionPatch.prUrl = payload.prUrl;
            }
            patch("sessions", event.scopeId, sessionPatch);
          }
        }

        // Handle session_output subtypes that update session fields
        if (event.eventType === "session_output" && event.scopeType === ("session" satisfies ScopeType) && payload) {
          const sessionPatch = sessionPatchFromOutput(payload);
          if (sessionPatch) {
            patch("sessions", event.scopeId, { ...sessionPatch, updatedAt: event.timestamp });
          }

          if (payload.type === "session_rehomed" && typeof payload.newSessionId === "string") {
            const activeSessionId = useUIStore.getState().activeSessionId;
            if (activeSessionId === event.scopeId) {
              useUIStore.getState().setActiveSessionId(payload.newSessionId);
            }
          }
        }

        // Route session activity events — update timestamp, and preview if it's a real message
        if (SESSION_ACTIVITY_EVENTS.has(event.eventType) && event.scopeType === ("session" satisfies ScopeType) && payload) {
          const preview = extractMessagePreview(event.eventType, payload);
          const updates: Partial<SessionEntity> = { updatedAt: event.timestamp, _lastMessageAt: event.timestamp };
          if (preview) {
            updates._lastEventPreview = preview;
          }
          patch("sessions", event.scopeId, updates);
        }

        // Inbox item events
        if (event.eventType === ("inbox_item_created" as EventType) && payload) {
          const item = asJsonObject(payload.inboxItem);
          if (item && typeof item.id === "string") {
            upsert("inboxItems", item.id, item as unknown as InboxItem);
          }
        }
        if (event.eventType === ("inbox_item_resolved" as EventType) && payload) {
          const item = asJsonObject(payload.inboxItem);
          if (item && typeof item.id === "string") {
            upsert("inboxItems", item.id, item as unknown as InboxItem);
          }
        }

        // Fire notification handlers after all store patches are applied
        notifyForEvent(event);
      });

    return () => subscription.unsubscribe();
  }, [activeOrgId]);
}
