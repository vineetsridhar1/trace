import { asJsonObject } from "@trace/shared";
import type { JsonObject } from "@trace/shared";
import type {
  AgentStatus,
  Channel,
  ChannelGroup,
  Chat,
  Event,
  EventType,
  InboxItem,
  QueuedMessage,
  Repo,
  ScopeType,
  SessionStatus,
} from "@trace/gql";
import {
  StoreBatchWriter,
  type SessionEntity,
  type SessionGroupEntity,
} from "../stores/entity.js";
import { useAuthStore } from "../stores/auth.js";
import { getSessionChannelId } from "../lib/session-group.js";
import { isUserVisibleSession } from "../lib/session-visibility.js";
import {
  takePendingOptimisticSession,
  upsertSessionEventWithOptimisticResolution,
} from "../mutations/optimistic-message.js";
import { notifyForEvent } from "../notifications/registry.js";
import { getOrgEventUIBindings } from "./ui-bindings.js";
import {
  extractMessagePreview,
  routeSessionOutput,
  upsertSessionGroupFromPayload,
} from "./session-output.js";

const SESSION_STATUS_EVENTS: Set<EventType> = new Set([
  "session_started",
  "session_paused",
  "session_resumed",
  "session_terminated",
  "session_pr_merged",
]);

/** PR lifecycle events update the group PR URL; review state is derived from that. */
const SESSION_PR_EVENTS: Set<EventType> = new Set(["session_pr_opened", "session_pr_closed"]);

const SESSION_ACTIVITY_EVENTS: Set<EventType> = new Set(["session_output", "message_sent"]);

function agentStatusFromEvent(eventType: EventType, payload: JsonObject): AgentStatus | undefined {
  const explicit = payload.agentStatus as AgentStatus | undefined;
  if (explicit) return explicit;

  switch (eventType) {
    case "session_started":
      return "not_started";
    case "session_resumed":
      return "active";
    case "session_paused":
      return "done";
    case "session_terminated":
      return payload.reason === "bridge_complete" ? "done" : "stopped";
    default:
      return undefined;
  }
}

function sessionStatusFromEvent(
  eventType: EventType,
  payload: JsonObject,
): SessionStatus | undefined {
  const explicit = payload.sessionStatus as SessionStatus | undefined;
  if (explicit) return explicit;

  switch (eventType) {
    case "session_started":
      return "in_progress";
    case "session_resumed":
      return "in_progress";
    case "session_pr_merged":
      return "merged";
    default:
      return undefined;
  }
}

/**
 * Apply an event from the org-wide subscription to the entity store and
 * fire any registered notification handlers. The pure data work runs
 * inside a `StoreBatchWriter` so the entire event is one `setState` call.
 */
export function handleOrgEvent(event: Event): void {
  const ui = getOrgEventUIBindings();
  const batch = new StoreBatchWriter();
  const payload = asJsonObject(event.payload) ?? ({} as JsonObject);

  // Upsert the event into its scoped bucket. Note: session_output events
  // arrive with trimmed payloads from the org subscription. The session
  // detail view subscribes to sessionEvents for full payloads, which will
  // overwrite these trimmed versions.
  const scopeKey = `${event.scopeType}:${event.scopeId}`;
  batch.upsertScopedEvent(scopeKey, event.id, event);

  // Clean up optimistic session events to prevent brief duplicates
  if (event.eventType === "message_sent" && event.scopeType === ("session" satisfies ScopeType)) {
    const pending = takePendingOptimisticSession(event.scopeId, event);
    if (pending) {
      batch.removeScopedEvent(scopeKey, pending.tempEventId);
    }
  }

  // Repo created or updated — upsert directly from payload
  if (event.eventType === "repo_created" || event.eventType === "repo_updated") {
    const repo = asJsonObject(payload.repo);
    if (repo && typeof repo.id === "string") {
      const existing = batch.get("repos", repo.id);
      batch.upsert(
        "repos",
        repo.id,
        (existing ? { ...existing, ...repo } : repo) as unknown as Repo,
      );
    }
  }

  // Chat events
  if (event.eventType === "chat_created") {
    const chat = asJsonObject(payload.chat);
    if (chat && typeof chat.id === "string") {
      batch.upsert("chats", chat.id, chat as unknown as Chat);
    }
  }
  if (event.eventType === "chat_renamed") {
    if (event.scopeType === "chat" && typeof payload.name === "string") {
      batch.patch("chats", event.scopeId, { name: payload.name } as Partial<Chat>);
    }
  }
  if (event.eventType === "chat_member_added" || event.eventType === "chat_member_removed") {
    if (event.scopeType === "chat") {
      const members = payload.members;
      if (Array.isArray(members)) {
        batch.patch("chats", event.scopeId, { members } as Partial<Chat>);
      }
    }
  }

  // Queued message events
  if (event.eventType === "queued_message_added") {
    const qm = asJsonObject(payload.queuedMessage);
    if (qm && typeof qm.id === "string" && typeof qm.sessionId === "string") {
      batch.upsertQueuedMessage(qm.sessionId, qm.id, qm as unknown as QueuedMessage);
    }
  }
  if (event.eventType === "queued_message_removed") {
    const qmId = payload.queuedMessageId as string | undefined;
    const sid = payload.sessionId as string | undefined;
    if (qmId && sid) {
      batch.removeQueuedMessage(sid, qmId);
    }
  }
  if (event.eventType === "queued_messages_cleared") {
    const sid = payload.sessionId as string | undefined;
    if (sid) {
      batch.clearQueuedMessagesForSession(sid);
    }
  }
  if (event.eventType === "queued_messages_drained") {
    const qmId = payload.queuedMessageId as string | undefined;
    const sid = payload.sessionId as string | undefined;
    if (qmId && sid) {
      batch.removeQueuedMessage(sid, qmId);
    }
  }

  // New channel — upsert directly from payload
  if (event.eventType === "channel_created") {
    const channel = asJsonObject(payload.channel);
    if (channel && typeof channel.id === "string") {
      batch.upsert("channels", channel.id, channel as unknown as Channel);
    }
  }

  // Channel updated (position/group changes, reorder)
  if (event.eventType === "channel_updated") {
    if (payload.reorder && Array.isArray(payload.channels)) {
      for (const ch of payload.channels) {
        const c = asJsonObject(ch);
        if (c && typeof c.id === "string") {
          batch.patch("channels", c.id, c as Partial<Channel>);
        }
      }
    } else {
      const channel = asJsonObject(payload.channel);
      if (channel && typeof channel.id === "string") {
        batch.patch("channels", channel.id, channel as Partial<Channel>);
      }
    }
  }

  // Channel membership events
  if (event.eventType === "channel_member_added" || event.eventType === "channel_member_removed") {
    const userId = payload.userId as string | undefined;
    const currentUserId = useAuthStore.getState().user?.id;
    const channel = asJsonObject(payload.channel);

    if (
      event.eventType === "channel_member_added" &&
      userId === currentUserId &&
      channel &&
      typeof channel.id === "string"
    ) {
      batch.upsert("channels", channel.id, channel as unknown as Channel);
    } else if (event.eventType === "channel_member_removed" && userId === currentUserId) {
      batch.remove("channels", event.scopeId);
      if (ui.getActiveChannelId() === event.scopeId) {
        ui.setActiveChannelId(null);
      }
    } else if (channel && typeof channel.id === "string") {
      batch.patch("channels", channel.id, { members: channel.members } as Partial<Channel>);
    }
  }

  // Channel group events
  if (event.eventType === "channel_group_created") {
    const group = asJsonObject(payload.channelGroup);
    if (group && typeof group.id === "string") {
      batch.upsert("channelGroups", group.id, group as unknown as ChannelGroup);
    }
  }
  if (event.eventType === "channel_group_updated") {
    if (payload.reorder && Array.isArray(payload.groups)) {
      for (const g of payload.groups) {
        const group = asJsonObject(g);
        if (group && typeof group.id === "string") {
          batch.patch("channelGroups", group.id, group as Partial<ChannelGroup>);
        }
      }
    } else {
      const group = asJsonObject(payload.channelGroup);
      if (group && typeof group.id === "string") {
        batch.patch("channelGroups", group.id, group as Partial<ChannelGroup>);
      }
    }
  }
  if (event.eventType === "channel_group_deleted") {
    if (typeof payload.channelGroupId === "string") {
      batch.remove("channelGroups", payload.channelGroupId);
    }
    if (Array.isArray(payload.ungroupedChannels)) {
      for (const ch of payload.ungroupedChannels) {
        const c = asJsonObject(ch);
        if (c && typeof c.id === "string") {
          batch.patch("channels", c.id, c as Partial<Channel>);
        }
      }
    }
  }

  // Channel deleted — remove channel and its sessions/groups from store
  if (event.eventType === "channel_deleted") {
    if (typeof payload.channelId === "string") {
      const channelId = payload.channelId;

      const allSessions = batch.getAll("sessions");
      for (const [sessionId, session] of Object.entries(allSessions)) {
        if (session.channel?.id === channelId) {
          batch.remove("sessions", sessionId);
        }
      }
      const allGroups = batch.getAll("sessionGroups");
      for (const [groupId, group] of Object.entries(allGroups)) {
        if (group.channel?.id === channelId) {
          batch.remove("sessionGroups", groupId);
        }
      }

      batch.remove("channels", channelId);
      if (ui.getActiveChannelId() === channelId) {
        ui.setActiveChannelId(null);
      }
    }
  }

  // New session — upsert directly from payload
  if (event.eventType === "session_started") {
    const session = asJsonObject(payload.session);
    if (session && typeof session.id === "string") {
      upsertSessionGroupFromPayload({ batch, payload, timestamp: event.timestamp, bumpSort: true });
      const existingSession = batch.get("sessions", session.id);
      batch.upsert("sessions", session.id, {
        ...(existingSession ? { ...existingSession, ...session } : session),
        _sortTimestamp:
          (session.lastMessageAt as string | undefined) ??
          (session.updatedAt as string | undefined) ??
          event.timestamp,
      } as unknown as SessionEntity);

      // Auto-navigate to continuation sessions
      const sourceSessionId = payload.sourceSessionId;
      if (
        isUserVisibleSession(session) &&
        typeof sourceSessionId === "string" &&
        sourceSessionId === ui.getActiveSessionId()
      ) {
        const sessionGroupId = session.sessionGroupId as string | undefined;
        const channel = asJsonObject(session.channel);
        const channelId = typeof channel?.id === "string" ? channel.id : null;
        if (sessionGroupId) {
          ui.openSessionTab(sessionGroupId, session.id);
          ui.navigateToSession(channelId, sessionGroupId, session.id);
        }
      }
    }
  }

  // Session deleted — remove from store and navigate away if active
  if (
    event.eventType === "session_deleted" &&
    event.scopeType === ("session" satisfies ScopeType)
  ) {
    const deletedId = event.scopeId;
    const deletedSessionGroupId =
      typeof payload.deletedSessionGroupId === "string" ? payload.deletedSessionGroupId : null;
    const sessionGroupId =
      typeof payload.sessionGroupId === "string" ? payload.sessionGroupId : null;
    batch.remove("sessions", deletedId);
    if (deletedSessionGroupId) {
      batch.remove("sessionGroups", deletedSessionGroupId);
    }

    if (deletedSessionGroupId && ui.getActiveSessionGroupId() === deletedSessionGroupId) {
      ui.setActiveSessionId(null);
    } else if (ui.getActiveSessionId() === deletedId) {
      const allSessions = batch.getAll("sessions");
      const remaining = Object.values(allSessions)
        .filter(
          (session) => session.sessionGroupId === sessionGroupId && isUserVisibleSession(session),
        )
        .sort((a, b) => {
          const diff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          if (diff !== 0) return diff;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
      if (remaining[0]) {
        ui.setActiveSessionId(remaining[0].id);
      } else {
        ui.setActiveSessionId(null);
      }
    }
  }

  // Session group archived — update group and stop all agents
  if (event.eventType === "session_group_archived") {
    upsertSessionGroupFromPayload({ batch, payload, timestamp: event.timestamp, bumpSort: true });
    const sessionGroupId =
      typeof payload.sessionGroupId === "string" ? payload.sessionGroupId : null;
    if (sessionGroupId) {
      const sessionGroup = asJsonObject(payload.sessionGroup);
      batch.patch("sessionGroups", sessionGroupId, {
        archivedAt:
          typeof sessionGroup?.archivedAt === "string" ? sessionGroup.archivedAt : event.timestamp,
        status: "archived",
        worktreeDeleted: true,
        updatedAt: event.timestamp,
        _sortTimestamp: event.timestamp,
      });
      const allSessions = batch.getAll("sessions");
      for (const [siblingId, sibling] of Object.entries(allSessions)) {
        if (sibling.sessionGroupId === sessionGroupId) {
          batch.patch("sessions", siblingId, {
            agentStatus: "stopped" as AgentStatus,
            worktreeDeleted: true,
            updatedAt: event.timestamp,
            _sortTimestamp: event.timestamp,
          });
        }
      }
      if (ui.getActiveSessionGroupId() === sessionGroupId) {
        ui.setActiveSessionGroupId(null);
      }
    }
  }

  // Route session status events
  if (
    SESSION_STATUS_EVENTS.has(event.eventType) &&
    event.scopeType === ("session" satisfies ScopeType)
  ) {
    upsertSessionGroupFromPayload({ batch, payload, timestamp: event.timestamp, bumpSort: true });
    const agentStatus = agentStatusFromEvent(event.eventType, payload);
    const sessionStatus = sessionStatusFromEvent(event.eventType, payload);
    if (agentStatus || sessionStatus) {
      const sessionPatch: Record<string, unknown> = {
        ...(agentStatus && { agentStatus }),
        ...(sessionStatus && { sessionStatus }),
        updatedAt: event.timestamp,
        _sortTimestamp: event.timestamp,
      };
      if (payload.worktreeDeleted === true) {
        sessionPatch.worktreeDeleted = true;
      }
      batch.patch("sessions", event.scopeId, sessionPatch);
      const session = batch.get("sessions", event.scopeId);

      // Mark badges when agent reaches a terminal state
      if (
        (agentStatus === "done" || agentStatus === "failed" || agentStatus === "stopped") &&
        session &&
        isUserVisibleSession(session)
      ) {
        const channelId = getSessionChannelId(session);
        if (channelId && channelId !== ui.getActiveChannelId()) {
          ui.markChannelDone(channelId);
        }
        if (event.scopeId !== ui.getActiveSessionId()) {
          ui.markSessionDone(event.scopeId);
        }
        const sessionGroupId = session?.sessionGroupId;
        if (sessionGroupId && sessionGroupId !== ui.getActiveSessionGroupId()) {
          ui.markSessionGroupDone(sessionGroupId);
        }
      }

      // PR merge transitions ALL sessions in the group
      if (event.eventType === "session_pr_merged") {
        const mergedSession = batch.get("sessions", event.scopeId);
        const groupId = mergedSession?.sessionGroupId;
        if (groupId) {
          const allSessions = batch.getAll("sessions");
          for (const [siblingId, sibling] of Object.entries(allSessions)) {
            if (
              siblingId !== event.scopeId &&
              sibling.sessionGroupId === groupId &&
              sibling.sessionStatus !== "merged"
            ) {
              batch.patch("sessions", siblingId, {
                agentStatus: "done" as AgentStatus,
                sessionStatus: "merged" as SessionStatus,
                worktreeDeleted: true,
                updatedAt: event.timestamp,
                _sortTimestamp: event.timestamp,
              });
            }
          }
        }
      }
    }
  }

  // Route PR lifecycle events
  if (
    SESSION_PR_EVENTS.has(event.eventType) &&
    event.scopeType === ("session" satisfies ScopeType)
  ) {
    upsertSessionGroupFromPayload({ batch, payload, timestamp: event.timestamp, bumpSort: true });
  }

  // Handle session_output subtypes that update session fields
  if (event.eventType === "session_output" && event.scopeType === ("session" satisfies ScopeType)) {
    routeSessionOutput({ event, payload, batch, ui });
  }

  // Chat activity
  if (event.eventType === "message_sent" && event.scopeType === ("chat" satisfies ScopeType)) {
    batch.patch("chats", event.scopeId, { updatedAt: event.timestamp } as Partial<Chat>);
  }

  // Route session activity events
  if (
    SESSION_ACTIVITY_EVENTS.has(event.eventType) &&
    event.scopeType === ("session" satisfies ScopeType)
  ) {
    const preview = extractMessagePreview(event.eventType, payload);
    const isUserMessage = event.eventType === "message_sent" && event.actor?.type === "user";
    const isConversationalMessage =
      event.eventType === "message_sent" || payload.type === "assistant";
    const updates: Partial<SessionEntity> = {
      updatedAt: event.timestamp,
      ...(isConversationalMessage ? { lastMessageAt: event.timestamp } : {}),
      ...(isUserMessage ? { lastUserMessageAt: event.timestamp } : {}),
    };
    const bumpActivitySort = isConversationalMessage;
    if (bumpActivitySort) {
      updates._sortTimestamp = event.timestamp;
    }
    if (preview) {
      updates._lastEventPreview = preview;
    }
    batch.patch("sessions", event.scopeId, updates);
    if (bumpActivitySort) {
      const session = batch.get("sessions", event.scopeId);
      const groupId = session?.sessionGroupId;
      if (groupId) {
        batch.patch("sessionGroups", groupId, {
          _sortTimestamp: event.timestamp,
        } as Partial<SessionGroupEntity>);
      }
    }
  }

  // Inbox item events
  if (event.eventType === ("inbox_item_created" as EventType)) {
    const item = asJsonObject(payload.inboxItem);
    if (item && typeof item.id === "string") {
      batch.upsert("inboxItems", item.id, item as unknown as InboxItem);
    }
  }
  if (event.eventType === ("inbox_item_resolved" as EventType)) {
    const item = asJsonObject(payload.inboxItem);
    if (item && typeof item.id === "string") {
      batch.upsert("inboxItems", item.id, item as unknown as InboxItem);
    }
  }

  batch.flush();

  notifyForEvent(event);
}

/**
 * Apply a session-scoped event (from the per-session subscription).
 * Reuses the optimistic-resolution helper so optimistic placeholders
 * are replaced atomically by the canonical event.
 */
export function handleSessionEvent(sessionId: string, event: Event & { id: string }): void {
  upsertSessionEventWithOptimisticResolution(sessionId, event);
}
