import { useEffect } from "react";
import { gql } from "@urql/core";
import { asJsonObject, type JsonObject } from "@trace/shared";
import { client } from "../lib/urql";
import { useEntityStore, eventScopeKey, StoreBatchWriter } from "../stores/entity";
import type { SessionEntity, SessionGroupEntity } from "../stores/entity";
import { useAuthStore } from "../stores/auth";
import { useUIStore, navigateToSession } from "../stores/ui";
import { getSessionChannelId } from "../lib/session-group";
import { notifyForEvent } from "../notifications/handlers";
import { takePendingOptimisticSession } from "../lib/optimistic-message";
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
  // LLM-generated branch rename
  if (payload.type === "branch_renamed" && typeof payload.branch === "string") {
    return { branch: payload.branch };
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
  return payload.type === "question_pending" || payload.type === "plan_pending";
}

function patchGroupSessionsBranch(batch: StoreBatchWriter, sessionGroupId: string, branch: string) {
  const allSessions = batch.getAll("sessions");
  for (const [sessionId, session] of Object.entries(allSessions)) {
    if (session.sessionGroupId === sessionGroupId) {
      batch.patch("sessions", sessionId, { branch } as Partial<SessionEntity>);
    }
  }
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
        if (result.error) {
          console.error("[orgEvents] subscription error:", result.error);
        }
        if (!result.data?.orgEvents) return;

        const event = result.data.orgEvents as Event;
        const batch = new StoreBatchWriter();
        const payload = asJsonObject(event.payload);

        const upsertSessionGroupFromPayload = (bumpSort = false) => {
          const sessionFromPayload = asJsonObject(payload?.session);
          const sessionGroup =
            asJsonObject(payload?.sessionGroup) ?? asJsonObject(sessionFromPayload?.sessionGroup);
          if (sessionGroup && typeof sessionGroup.id === "string") {
            const existing = batch.get("sessionGroups", sessionGroup.id);
            batch.upsert("sessionGroups", sessionGroup.id, {
              ...(existing ? { ...existing, ...sessionGroup } : sessionGroup),
              ...(bumpSort ? { _sortTimestamp: event.timestamp } : {}),
            } as SessionGroupEntity);
          }
        };

        // Upsert the event into its scoped bucket.
        // Note: session_output events arrive with trimmed payloads from the org
        // subscription. The session detail view subscribes to sessionEvents for
        // full payloads, which will overwrite these trimmed versions.
        const scopeKey = eventScopeKey(event.scopeType, event.scopeId);
        batch.upsertScopedEvent(scopeKey, event.id, event);

        // Clean up optimistic session events to prevent brief duplicates
        if (
          event.eventType === "message_sent" &&
          event.scopeType === ("session" satisfies ScopeType)
        ) {
          const pending = takePendingOptimisticSession(event.scopeId, event);
          if (pending) {
            batch.removeScopedEvent(scopeKey, pending.tempEventId);
          }
        }

        // Repo created or updated — upsert directly from payload
        if ((event.eventType === "repo_created" || event.eventType === "repo_updated") && payload) {
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
        if (event.eventType === "chat_created" && payload) {
          const chat = asJsonObject(payload.chat);
          if (chat && typeof chat.id === "string") {
            batch.upsert("chats", chat.id, chat as unknown as Chat);
          }
        }
        if (event.eventType === "chat_renamed" && payload) {
          if (event.scopeType === "chat" && typeof payload.name === "string") {
            batch.patch("chats", event.scopeId, { name: payload.name } as Partial<Chat>);
          }
        }
        if (
          (event.eventType === "chat_member_added" || event.eventType === "chat_member_removed") &&
          payload
        ) {
          if (event.scopeType === "chat") {
            const members = payload.members;
            if (Array.isArray(members)) {
              batch.patch("chats", event.scopeId, { members } as Partial<Chat>);
            }
          }
        }

        // New channel — upsert directly from payload
        if (event.eventType === "channel_created" && payload) {
          const channel = asJsonObject(payload.channel);
          if (channel && typeof channel.id === "string") {
            batch.upsert("channels", channel.id, channel as unknown as Channel);
          }
        }

        // Channel updated (position/group changes, reorder)
        if (event.eventType === "channel_updated" && payload) {
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
            batch.upsert("channels", channel.id, channel as unknown as Channel);
          } else if (event.eventType === "channel_member_removed" && userId === currentUserId) {
            batch.remove("channels", event.scopeId);
            const activeChannelId = useUIStore.getState().activeChannelId;
            if (activeChannelId === event.scopeId) {
              useUIStore.getState().setActiveChannelId(null);
            }
          } else if (channel && typeof channel.id === "string") {
            batch.patch("channels", channel.id, { members: channel.members } as Partial<Channel>);
          }
        }

        // Channel group events
        if (event.eventType === "channel_group_created" && payload) {
          const group = asJsonObject(payload.channelGroup);
          if (group && typeof group.id === "string") {
            batch.upsert("channelGroups", group.id, group as unknown as ChannelGroup);
          }
        }
        if (event.eventType === "channel_group_updated" && payload) {
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
        if (event.eventType === "channel_group_deleted" && payload) {
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
        if (event.eventType === "channel_deleted" && payload) {
          if (typeof payload.channelId === "string") {
            const channelId = payload.channelId;

            // Remove sessions and session groups that belonged to this channel
            const allSessions = batch.getAll("sessions");
            for (const [sessionId, session] of Object.entries(allSessions)) {
              if (session.channelId === channelId) {
                batch.remove("sessions", sessionId);
              }
            }
            const allGroups = batch.getAll("sessionGroups");
            for (const [groupId, group] of Object.entries(allGroups)) {
              if (group.channelId === channelId) {
                batch.remove("sessionGroups", groupId);
              }
            }

            batch.remove("channels", channelId);
            const ui = useUIStore.getState();
            if (ui.activeChannelId === channelId) {
              ui.setActiveChannelId(null);
            }
          }
        }

        // New session — upsert directly from payload
        if (event.eventType === "session_started" && payload) {
          const session = asJsonObject(payload.session);
          if (session && typeof session.id === "string") {
            upsertSessionGroupFromPayload(true);
            const existingSession = batch.get("sessions", session.id);
            batch.upsert("sessions", session.id, {
              ...(existingSession ? { ...existingSession, ...session } : session),
              _sortTimestamp: (session.updatedAt as string | undefined) ?? event.timestamp,
              _lastUserMessageAt: event.timestamp,
            } as unknown as SessionEntity);

            // Auto-navigate to continuation sessions
            const sourceSessionId = payload.sourceSessionId;
            const ui = useUIStore.getState();
            if (typeof sourceSessionId === "string" && sourceSessionId === ui.activeSessionId) {
              const sessionGroupId = session.sessionGroupId as string | undefined;
              const channel = asJsonObject(session.channel);
              const channelId = typeof channel?.id === "string" ? channel.id : null;
              if (sessionGroupId) {
                ui.openSessionTab(sessionGroupId, session.id);
                navigateToSession(channelId, sessionGroupId, session.id);
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
            payload && typeof payload.deletedSessionGroupId === "string"
              ? payload.deletedSessionGroupId
              : null;
          const sessionGroupId =
            payload && typeof payload.sessionGroupId === "string" ? payload.sessionGroupId : null;
          batch.remove("sessions", deletedId);
          if (deletedSessionGroupId) {
            batch.remove("sessionGroups", deletedSessionGroupId);
          }

          const ui = useUIStore.getState();
          if (deletedSessionGroupId && ui.activeSessionGroupId === deletedSessionGroupId) {
            ui.setActiveSessionId(null);
          } else if (ui.activeSessionId === deletedId) {
            const allSessions = batch.getAll("sessions");
            const remaining = Object.values(allSessions)
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

        // Session group archived — update group and stop all agents
        if (event.eventType === "session_group_archived" && payload) {
          upsertSessionGroupFromPayload(true);
          const sessionGroupId =
            typeof payload.sessionGroupId === "string" ? payload.sessionGroupId : null;
          if (sessionGroupId) {
            const sessionGroup = asJsonObject(payload.sessionGroup);
            batch.patch("sessionGroups", sessionGroupId, {
              archivedAt:
                typeof sessionGroup?.archivedAt === "string"
                  ? sessionGroup.archivedAt
                  : event.timestamp,
              status: "archived",
              worktreeDeleted: true,
              updatedAt: event.timestamp,
              _sortTimestamp: event.timestamp,
            });
            // Stop all sibling sessions
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
            // Navigate away if viewing the archived group
            const ui = useUIStore.getState();
            if (ui.activeSessionGroupId === sessionGroupId) {
              ui.setActiveSessionGroupId(null);
            }
          }
        }

        // Route session status events
        if (
          SESSION_STATUS_EVENTS.has(event.eventType) &&
          event.scopeType === ("session" satisfies ScopeType) &&
          payload
        ) {
          upsertSessionGroupFromPayload(true);
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

            // Mark badges when agent reaches a terminal state
            if (agentStatus === "done" || agentStatus === "failed" || agentStatus === "stopped") {
              const session = useEntityStore.getState().sessions[event.scopeId];
              const channelId = getSessionChannelId(session);
              const ui = useUIStore.getState();
              if (channelId && channelId !== ui.activeChannelId) {
                ui.markChannelDone(channelId);
              }
              if (event.scopeId !== ui.activeSessionId) {
                ui.markSessionDone(event.scopeId);
              }
              const sessionGroupId = session?.sessionGroupId;
              if (sessionGroupId && sessionGroupId !== ui.activeSessionGroupId) {
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
          event.scopeType === ("session" satisfies ScopeType) &&
          payload
        ) {
          upsertSessionGroupFromPayload(true);
        }

        // Handle session_output subtypes that update session fields
        if (
          event.eventType === "session_output" &&
          event.scopeType === ("session" satisfies ScopeType) &&
          payload
        ) {
          const bumpSort = shouldBumpSortTimestampForOutput(payload);
          upsertSessionGroupFromPayload(bumpSort);
          const sessionPatch = sessionPatchFromOutput(payload);
          if (sessionPatch) {
            batch.patch("sessions", event.scopeId, {
              ...sessionPatch,
              updatedAt: event.timestamp,
              ...(bumpSort ? { _sortTimestamp: event.timestamp } : {}),
            });
          }
          if (payload.type === "branch_renamed" && typeof payload.branch === "string") {
            const sessionGroup = asJsonObject(payload.sessionGroup);
            const sessionGroupId =
              typeof sessionGroup?.id === "string"
                ? sessionGroup.id
                : (batch.get("sessions", event.scopeId)?.sessionGroupId ?? null);
            if (sessionGroupId) {
              patchGroupSessionsBranch(batch, sessionGroupId, payload.branch);
            }
          }

          if (payload.type === "session_rehomed" && typeof payload.newSessionId === "string") {
            const activeSessionId = useUIStore.getState().activeSessionId;
            if (activeSessionId === event.scopeId) {
              useUIStore.getState().setActiveSessionId(payload.newSessionId);
            }
          }

          const checkpoint = extractGitCheckpoint(payload);
          if (checkpoint) {
            const existingSession = batch.get("sessions", event.scopeId);
            if (existingSession) {
              batch.patch("sessions", event.scopeId, {
                gitCheckpoints: mergeGitCheckpoints(
                  existingSession.gitCheckpoints as GitCheckpoint[] | undefined,
                  checkpoint,
                ),
              } as Partial<SessionEntity>);
            }

            const existingGroup = batch.get("sessionGroups", checkpoint.sessionGroupId);
            if (existingGroup) {
              batch.patch("sessionGroups", checkpoint.sessionGroupId, {
                gitCheckpoints: mergeGitCheckpoints(
                  existingGroup.gitCheckpoints as GitCheckpoint[] | undefined,
                  checkpoint,
                ),
              } as Partial<SessionGroupEntity>);
            }
          }

          const rewrite = extractGitCheckpointRewrite(payload);
          if (rewrite) {
            const existingSession = batch.get("sessions", event.scopeId);
            if (existingSession) {
              batch.patch("sessions", event.scopeId, {
                gitCheckpoints: rewriteGitCheckpoints(
                  existingSession.gitCheckpoints as GitCheckpoint[] | undefined,
                  rewrite.replacedCommitSha,
                  rewrite.checkpoint,
                ),
              } as Partial<SessionEntity>);
            }

            const existingGroup = batch.get("sessionGroups", rewrite.checkpoint.sessionGroupId);
            if (existingGroup) {
              batch.patch("sessionGroups", rewrite.checkpoint.sessionGroupId, {
                gitCheckpoints: rewriteGitCheckpoints(
                  existingGroup.gitCheckpoints as GitCheckpoint[] | undefined,
                  rewrite.replacedCommitSha,
                  rewrite.checkpoint,
                ),
              } as Partial<SessionGroupEntity>);
            }
          }
        }

        // Chat activity
        if (
          event.eventType === "message_sent" &&
          event.scopeType === ("chat" satisfies ScopeType)
        ) {
          batch.patch("chats", event.scopeId, { updatedAt: event.timestamp } as Partial<Chat>);
        }

        // Route session activity events
        if (
          SESSION_ACTIVITY_EVENTS.has(event.eventType) &&
          event.scopeType === ("session" satisfies ScopeType) &&
          payload
        ) {
          const preview = extractMessagePreview(event.eventType, payload);
          const updates: Partial<SessionEntity> = {
            updatedAt: event.timestamp,
            _lastMessageAt: event.timestamp,
            ...(event.eventType === "message_sent" ? { _lastUserMessageAt: event.timestamp } : {}),
          };
          // Bump sort for user messages and assistant text messages (not tool calls)
          const bumpActivitySort =
            event.eventType === "message_sent" || payload.type === "assistant";
          if (bumpActivitySort) {
            updates._sortTimestamp = event.timestamp;
          }
          if (preview) {
            updates._lastEventPreview = preview;
          }
          batch.patch("sessions", event.scopeId, updates);
          // Also bump the session group sort timestamp for meaningful messages
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
        if (event.eventType === ("inbox_item_created" as EventType) && payload) {
          const item = asJsonObject(payload.inboxItem);
          if (item && typeof item.id === "string") {
            batch.upsert("inboxItems", item.id, item as unknown as InboxItem);
          }
        }
        if (event.eventType === ("inbox_item_resolved" as EventType) && payload) {
          const item = asJsonObject(payload.inboxItem);
          if (item && typeof item.id === "string") {
            batch.upsert("inboxItems", item.id, item as unknown as InboxItem);
          }
        }

        // Flush all accumulated mutations as a single setState call
        batch.flush();

        // Fire notification handlers after all store patches are applied
        notifyForEvent(event);
      });

    return () => subscription.unsubscribe();
  }, [activeOrgId]);
}
