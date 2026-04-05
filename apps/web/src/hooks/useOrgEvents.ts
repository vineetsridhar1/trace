import { useEffect } from "react";
import { gql } from "@urql/core";
import { asJsonObject, type JsonObject } from "@trace/shared";
import { client } from "../lib/urql";
import { useEntityStore, eventScopeKey } from "../stores/entity";
import type { SessionEntity, SessionGroupEntity } from "../stores/entity";
import { useAuthStore } from "../stores/auth";
import { useUIStore } from "../stores/ui";
import { notifyForEvent } from "../notifications/handlers";
import type {
  AgentStatus,
  Event,
  EventType,
  ScopeType,
  Channel,
  ChannelGroup,
  Chat,
  Repo,
  InboxItem,
  GitCheckpoint,
  SessionStatus,
} from "@trace/gql";
import { processAiConversationEvent } from "../features/ai-conversations/utils/processAiConversationEvent";

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
  "session_pr_merged",
]);

/** PR lifecycle events update the group PR URL; review state is derived from that. */
const SESSION_PR_EVENTS: Set<EventType> = new Set(["session_pr_opened", "session_pr_closed"]);

const SESSION_ACTIVITY_EVENTS: Set<EventType> = new Set(["session_output", "message_sent"]);

function agentStatusFromEvent(eventType: EventType, payload: JsonObject): AgentStatus | undefined {
  // Server includes the authoritative status in all session event payloads
  const explicit = payload.agentStatus as AgentStatus | undefined;
  if (explicit) return explicit;

  // Fallback for older events without agentStatus in payload
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
    return {
      ...(payload.agentStatus && { agentStatus: payload.agentStatus as AgentStatus }),
      ...(payload.sessionStatus && { sessionStatus: payload.sessionStatus as SessionStatus }),
      workdir: payload.workdir,
    };
  }
  // LLM-generated title update
  if (payload.type === "title_generated" && typeof payload.name === "string") {
    return { name: payload.name };
  }
  if (payload.type === "question_pending" || payload.type === "plan_pending") {
    return { sessionStatus: "needs_input" as SessionStatus };
  }
  // Connection state events carry a full connection patch
  if (typeof payload.type === "string" && CONNECTION_EVENT_TYPES.has(payload.type)) {
    const connection = asJsonObject(payload.connection);
    const sessionPatch: Partial<SessionEntity> = {
      ...(payload.agentStatus && { agentStatus: payload.agentStatus as AgentStatus }),
      ...(payload.sessionStatus && { sessionStatus: payload.sessionStatus as SessionStatus }),
    };
    if (connection) {
      sessionPatch.connection = connection as SessionEntity["connection"];
    }
    if (Object.keys(sessionPatch).length > 0) {
      return sessionPatch;
    }
  }
  return undefined;
}

function shouldBumpSortTimestampForOutput(payload: JsonObject): boolean {
  return (
    payload.type === "workspace_ready" ||
    payload.type === "question_pending" ||
    payload.type === "plan_pending" ||
    (typeof payload.type === "string" && CONNECTION_EVENT_TYPES.has(payload.type))
  );
}

function mergeGitCheckpoints(
  existing: GitCheckpoint[] | null | undefined,
  incoming: GitCheckpoint | GitCheckpoint[],
): GitCheckpoint[] {
  const merged = new Map<string, GitCheckpoint>();
  for (const checkpoint of existing ?? []) {
    merged.set(checkpoint.id, checkpoint);
  }

  const nextItems = Array.isArray(incoming) ? incoming : [incoming];
  for (const checkpoint of nextItems) {
    merged.set(checkpoint.id, checkpoint);
  }

  return [...merged.values()].sort((a, b) => b.committedAt.localeCompare(a.committedAt));
}

function rewriteGitCheckpoints(
  existing: GitCheckpoint[] | null | undefined,
  replacedCommitSha: string,
  incoming: GitCheckpoint,
): GitCheckpoint[] {
  const filtered = (existing ?? []).filter(
    (checkpoint) => checkpoint.commitSha !== replacedCommitSha,
  );
  return mergeGitCheckpoints(filtered, incoming);
}

function extractGitCheckpoint(payload: JsonObject): GitCheckpoint | null {
  if (payload.type !== "git_checkpoint") return null;
  const checkpoint = asJsonObject(payload.checkpoint);
  if (!checkpoint || typeof checkpoint.id !== "string") return null;
  return checkpoint as unknown as GitCheckpoint;
}

function extractGitCheckpointRewrite(
  payload: JsonObject,
): { replacedCommitSha: string; checkpoint: GitCheckpoint } | null {
  if (payload.type !== "git_checkpoint_rewrite" || typeof payload.replacedCommitSha !== "string") {
    return null;
  }

  const checkpoint = asJsonObject(payload.checkpoint);
  if (!checkpoint || typeof checkpoint.id !== "string") return null;

  return {
    replacedCommitSha: payload.replacedCommitSha,
    checkpoint: checkpoint as unknown as GitCheckpoint,
  };
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
        const { upsert, patch, remove, upsertScopedEvent } = useEntityStore.getState();
        const payload = asJsonObject(event.payload);

        const upsertSessionGroupFromPayload = () => {
          const sessionFromPayload = asJsonObject(payload?.session);
          const sessionGroup =
            asJsonObject(payload?.sessionGroup) ?? asJsonObject(sessionFromPayload?.sessionGroup);
          if (sessionGroup && typeof sessionGroup.id === "string") {
            const existing = useEntityStore.getState().sessionGroups[sessionGroup.id];
            upsert("sessionGroups", sessionGroup.id, {
              ...(existing ? { ...existing, ...sessionGroup } : sessionGroup),
              _sortTimestamp: event.timestamp,
            } as SessionGroupEntity);
          }
        };

        // Always upsert the raw event into its scoped bucket
        upsertScopedEvent(eventScopeKey(event.scopeType, event.scopeId), event.id, event);

        // Repo created or updated — upsert directly from payload
        if ((event.eventType === "repo_created" || event.eventType === "repo_updated") && payload) {
          const repo = asJsonObject(payload.repo);
          if (repo && typeof repo.id === "string") {
            const existing = useEntityStore.getState().repos[repo.id];
            upsert(
              "repos",
              repo.id,
              (existing ? { ...existing, ...repo } : repo) as unknown as Repo,
            );
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
        if (
          (event.eventType === "chat_member_added" || event.eventType === "chat_member_removed") &&
          payload
        ) {
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

        // Channel updated (position/group changes, reorder)
        if (event.eventType === "channel_updated" && payload) {
          if (payload.reorder && Array.isArray(payload.channels)) {
            for (const ch of payload.channels) {
              const c = asJsonObject(ch);
              if (c && typeof c.id === "string") {
                patch("channels", c.id, c as Partial<Channel>);
              }
            }
          } else {
            const channel = asJsonObject(payload.channel);
            if (channel && typeof channel.id === "string") {
              patch("channels", channel.id, channel as Partial<Channel>);
            }
          }
        }

        // Channel membership events
        if (
          (event.eventType === "channel_member_added" ||
            event.eventType === "channel_member_removed") &&
          payload
        ) {
          const userId = payload.userId as string | undefined;
          const currentUserId = useAuthStore.getState().user?.id;
          const channel = asJsonObject(payload.channel);

          if (
            event.eventType === "channel_member_added" &&
            userId === currentUserId &&
            channel &&
            typeof channel.id === "string"
          ) {
            // Current user joined — add channel to store
            upsert("channels", channel.id, channel as unknown as Channel);
          } else if (event.eventType === "channel_member_removed" && userId === currentUserId) {
            // Current user left — remove channel from store
            remove("channels", event.scopeId);
            const activeChannelId = useUIStore.getState().activeChannelId;
            if (activeChannelId === event.scopeId) {
              useUIStore.getState().setActiveChannelId(null);
            }
          } else if (channel && typeof channel.id === "string") {
            // Another user joined/left — update channel members
            patch("channels", channel.id, { members: channel.members } as Partial<Channel>);
          }
        }

        // Channel group events
        if (event.eventType === "channel_group_created" && payload) {
          const group = asJsonObject(payload.channelGroup);
          if (group && typeof group.id === "string") {
            upsert("channelGroups", group.id, group as unknown as ChannelGroup);
          }
        }
        if (event.eventType === "channel_group_updated" && payload) {
          if (payload.reorder && Array.isArray(payload.groups)) {
            for (const g of payload.groups) {
              const group = asJsonObject(g);
              if (group && typeof group.id === "string") {
                patch("channelGroups", group.id, group as Partial<ChannelGroup>);
              }
            }
          } else {
            const group = asJsonObject(payload.channelGroup);
            if (group && typeof group.id === "string") {
              patch("channelGroups", group.id, group as Partial<ChannelGroup>);
            }
          }
        }
        if (event.eventType === "channel_group_deleted" && payload) {
          if (typeof payload.channelGroupId === "string") {
            remove("channelGroups", payload.channelGroupId);
          }
          // Patch channels that were ungrouped by this deletion
          if (Array.isArray(payload.ungroupedChannels)) {
            for (const ch of payload.ungroupedChannels) {
              const c = asJsonObject(ch);
              if (c && typeof c.id === "string") {
                patch("channels", c.id, c as Partial<Channel>);
              }
            }
          }
        }

        // New session — upsert directly from payload
        if (event.eventType === "session_started" && payload) {
          const session = asJsonObject(payload.session);
          if (session && typeof session.id === "string") {
            upsertSessionGroupFromPayload();
            const existingSession = useEntityStore.getState().sessions[session.id];
            upsert("sessions", session.id, {
              ...(existingSession ? { ...existingSession, ...session } : session),
              _sortTimestamp: (session.updatedAt as string | undefined) ?? event.timestamp,
            } as unknown as SessionEntity);
          }
        }

        // Session deleted — remove from store and navigate away if active
        if (
          event.eventType === "session_deleted" &&
          event.scopeType === ("session" satisfies ScopeType)
        ) {
          const deletedId = event.scopeId;
          const deletedSessionGroupId =
            payload && typeof payload.deletedSessionGroupId === "string"
              ? payload.deletedSessionGroupId
              : null;
          const sessionGroupId =
            payload && typeof payload.sessionGroupId === "string" ? payload.sessionGroupId : null;
          remove("sessions", deletedId);
          if (deletedSessionGroupId) {
            remove("sessionGroups", deletedSessionGroupId);
          }

          const ui = useUIStore.getState();
          if (deletedSessionGroupId && ui.activeSessionGroupId === deletedSessionGroupId) {
            ui.setActiveSessionId(null);
          } else if (ui.activeSessionId === deletedId) {
            const remaining = Object.values(useEntityStore.getState().sessions)
              .filter((session) => session.sessionGroupId === sessionGroupId)
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

        // Route session status events
        if (
          SESSION_STATUS_EVENTS.has(event.eventType) &&
          event.scopeType === ("session" satisfies ScopeType) &&
          payload
        ) {
          upsertSessionGroupFromPayload();
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
            patch("sessions", event.scopeId, sessionPatch);

            // PR merge transitions ALL sessions in the group, not just the event session.
            // Patch sibling sessions so their tab indicators update immediately.
            if (event.eventType === "session_pr_merged") {
              const mergedSession = useEntityStore.getState().sessions[event.scopeId];
              const groupId = mergedSession?.sessionGroupId;
              if (groupId) {
                const allSessions = useEntityStore.getState().sessions;
                for (const [siblingId, sibling] of Object.entries(allSessions)) {
                  if (
                    siblingId !== event.scopeId &&
                    sibling.sessionGroupId === groupId &&
                    sibling.sessionStatus !== "merged"
                  ) {
                    patch("sessions", siblingId, {
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

        // Route PR lifecycle events — review state is derived from sessionGroup.prUrl
        if (
          SESSION_PR_EVENTS.has(event.eventType) &&
          event.scopeType === ("session" satisfies ScopeType) &&
          payload
        ) {
          upsertSessionGroupFromPayload();
        }

        // Handle session_output subtypes that update session fields
        if (
          event.eventType === "session_output" &&
          event.scopeType === ("session" satisfies ScopeType) &&
          payload
        ) {
          upsertSessionGroupFromPayload();
          const sessionPatch = sessionPatchFromOutput(payload);
          if (sessionPatch) {
            patch("sessions", event.scopeId, {
              ...sessionPatch,
              updatedAt: event.timestamp,
              ...(shouldBumpSortTimestampForOutput(payload)
                ? { _sortTimestamp: event.timestamp }
                : {}),
            });
          }

          if (payload.type === "session_rehomed" && typeof payload.newSessionId === "string") {
            const activeSessionId = useUIStore.getState().activeSessionId;
            if (activeSessionId === event.scopeId) {
              useUIStore.getState().setActiveSessionId(payload.newSessionId);
            }
          }

          const checkpoint = extractGitCheckpoint(payload);
          if (checkpoint) {
            const existingSession = useEntityStore.getState().sessions[event.scopeId];
            if (existingSession) {
              patch("sessions", event.scopeId, {
                gitCheckpoints: mergeGitCheckpoints(
                  existingSession.gitCheckpoints as GitCheckpoint[] | undefined,
                  checkpoint,
                ),
              } as Partial<SessionEntity>);
            }

            const existingGroup =
              useEntityStore.getState().sessionGroups[checkpoint.sessionGroupId];
            if (existingGroup) {
              patch("sessionGroups", checkpoint.sessionGroupId, {
                gitCheckpoints: mergeGitCheckpoints(
                  existingGroup.gitCheckpoints as GitCheckpoint[] | undefined,
                  checkpoint,
                ),
              } as Partial<SessionGroupEntity>);
            }
          }

          const rewrite = extractGitCheckpointRewrite(payload);
          if (rewrite) {
            const existingSession = useEntityStore.getState().sessions[event.scopeId];
            if (existingSession) {
              patch("sessions", event.scopeId, {
                gitCheckpoints: rewriteGitCheckpoints(
                  existingSession.gitCheckpoints as GitCheckpoint[] | undefined,
                  rewrite.replacedCommitSha,
                  rewrite.checkpoint,
                ),
              } as Partial<SessionEntity>);
            }

            const existingGroup =
              useEntityStore.getState().sessionGroups[rewrite.checkpoint.sessionGroupId];
            if (existingGroup) {
              patch("sessionGroups", rewrite.checkpoint.sessionGroupId, {
                gitCheckpoints: rewriteGitCheckpoints(
                  existingGroup.gitCheckpoints as GitCheckpoint[] | undefined,
                  rewrite.replacedCommitSha,
                  rewrite.checkpoint,
                ),
              } as Partial<SessionGroupEntity>);
            }
          }
        }

        // Chat activity — update sort timestamp when a new message arrives in a chat
        if (
          event.eventType === "message_sent" &&
          event.scopeType === ("chat" satisfies ScopeType)
        ) {
          patch("chats", event.scopeId, { updatedAt: event.timestamp } as Partial<Chat>);
        }

        // Route session activity events — update timestamp, and preview if it's a real message
        if (
          SESSION_ACTIVITY_EVENTS.has(event.eventType) &&
          event.scopeType === ("session" satisfies ScopeType) &&
          payload
        ) {
          const preview = extractMessagePreview(event.eventType, payload);
          const updates: Partial<SessionEntity> = {
            updatedAt: event.timestamp,
            _lastMessageAt: event.timestamp,
          };
          if (event.eventType === "message_sent") {
            updates._sortTimestamp = event.timestamp;
          }
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

        // ── AI Conversation events — delegate to shared processor ───
        if (event.eventType.startsWith("ai_") && payload) {
          processAiConversationEvent({
            eventType: event.eventType,
            payload,
            timestamp: event.timestamp,
            conversationId:
              event.scopeType === ("ai_conversation" as ScopeType) ? event.scopeId : undefined,
          });
        }

        // Fire notification handlers after all store patches are applied
        notifyForEvent(event);
      });

    return () => subscription.unsubscribe();
  }, [activeOrgId]);
}
