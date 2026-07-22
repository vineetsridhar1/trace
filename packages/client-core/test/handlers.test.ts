import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event, EventType, ScopeType } from "@trace/gql";
import { handleOrgEvent, handleSessionEvent } from "../src/events/handlers.js";
import { useEntityStore } from "../src/stores/entity.js";
import { useAuthStore } from "../src/stores/auth.js";
import { setOrgEventUIBindings, type OrgEventUIBindings } from "../src/events/ui-bindings.js";

function resetStores() {
  useEntityStore.setState({
    organizations: {},
    users: {},
    repos: {},
    projects: {},
    channels: {},
    channelGroups: {},
    sessionGroups: {},
    chats: {},
    sessions: {},
    tickets: {},
    inboxItems: {},
    messages: {},
    queuedMessages: {},
    sessionApplicationProcesses: {},
    sessionApplicationLogs: {},
    sessionEndpoints: {},
    eventsByScope: {},
    _eventIdsByScope: {},
    _sessionIdsByGroup: {},
    _messageIdsByScope: {},
    _eventIdsByParentId: {},
    _queuedMessageIdsBySession: {},
  });
  useAuthStore.setState({
    user: null,
    activeOrgId: null,
    orgMemberships: [],
    loading: false,
    token: null,
  });
}

interface BindingsHarness {
  bindings: OrgEventUIBindings;
  state: {
    activeChannelId: string | null;
    activeSessionId: string | null;
    activeSessionGroupId: string | null;
  };
  markChannelDone: ReturnType<typeof vi.fn>;
  markSessionDone: ReturnType<typeof vi.fn>;
  markSessionGroupDone: ReturnType<typeof vi.fn>;
  setActiveChannelId: ReturnType<typeof vi.fn>;
  setActiveSessionId: ReturnType<typeof vi.fn>;
  setActiveSessionGroupId: ReturnType<typeof vi.fn>;
  openSessionTab: ReturnType<typeof vi.fn>;
  navigateToSession: ReturnType<typeof vi.fn>;
}

function installBindings(initial: Partial<BindingsHarness["state"]> = {}): BindingsHarness {
  const state = {
    activeChannelId: initial.activeChannelId ?? null,
    activeSessionId: initial.activeSessionId ?? null,
    activeSessionGroupId: initial.activeSessionGroupId ?? null,
  };
  const harness: BindingsHarness = {
    state,
    markChannelDone: vi.fn(),
    markSessionDone: vi.fn(),
    markSessionGroupDone: vi.fn(),
    setActiveChannelId: vi.fn((id: string | null) => {
      state.activeChannelId = id;
    }),
    setActiveSessionId: vi.fn((id: string | null) => {
      state.activeSessionId = id;
    }),
    setActiveSessionGroupId: vi.fn((id: string | null) => {
      state.activeSessionGroupId = id;
    }),
    openSessionTab: vi.fn(),
    navigateToSession: vi.fn(),
    bindings: {
      getActiveChannelId: () => state.activeChannelId,
      getActiveSessionId: () => state.activeSessionId,
      getActiveSessionGroupId: () => state.activeSessionGroupId,
      setActiveChannelId: (id) => harness.setActiveChannelId(id),
      setActiveSessionId: (id) => harness.setActiveSessionId(id),
      setActiveSessionGroupId: (id) => harness.setActiveSessionGroupId(id),
      markChannelDone: (id) => harness.markChannelDone(id),
      markSessionDone: (id) => harness.markSessionDone(id),
      markSessionGroupDone: (id) => harness.markSessionGroupDone(id),
      openSessionTab: (groupId, sessionId) => harness.openSessionTab(groupId, sessionId),
      navigateToSession: (channelId, groupId, sessionId) =>
        harness.navigateToSession(channelId, groupId, sessionId),
    },
  };
  setOrgEventUIBindings(harness.bindings);
  return harness;
}

let nextEventCounter = 0;

interface EventInit {
  eventType: EventType;
  scopeType?: ScopeType;
  scopeId: string;
  payload?: Record<string, unknown>;
  actor?: { type: "user" | "agent" | "system"; id: string; name?: string | null };
  timestamp?: string;
  parentId?: string | null;
}

function makeEvent(init: EventInit): Event {
  nextEventCounter += 1;
  return {
    id: `evt-${nextEventCounter}`,
    scopeType: init.scopeType ?? "session",
    scopeId: init.scopeId,
    eventType: init.eventType,
    payload: init.payload ?? {},
    actor: {
      type: init.actor?.type ?? "user",
      id: init.actor?.id ?? "user-1",
      name: init.actor?.name ?? null,
      avatarUrl: null,
    },
    parentId: init.parentId ?? null,
    timestamp: init.timestamp ?? "2026-01-01T00:00:00.000Z",
    metadata: null,
  } as Event;
}

beforeEach(() => {
  resetStores();
  installBindings();
});

describe("handleOrgEvent", () => {
  it("does not expose managed repos through the generic repo table", () => {
    const event = makeEvent({
      eventType: "repo_created",
      scopeType: "system",
      scopeId: "managed-1",
      payload: {
        repo: {
          id: "managed-1",
          name: "generated app",
          provider: "managed",
          remoteUrl: "https://trace.test/git/org-1/managed-1.git",
          defaultBranch: "main",
          webhookActive: false,
        },
      },
    });

    handleOrgEvent(event);

    expect(useEntityStore.getState().repos["managed-1"]).toBeUndefined();
    expect(useEntityStore.getState().eventsByScope["system:managed-1"]?.[event.id]).toEqual(event);
  });

  it("upserts the event into the scoped bucket", () => {
    const event = makeEvent({
      eventType: "session_output",
      scopeId: "session-1",
      payload: { type: "assistant", message: { content: [{ type: "text", text: "hi" }] } },
    });
    handleOrgEvent(event);

    const bucket = useEntityStore.getState().eventsByScope["session:session-1"];
    expect(bucket).toBeDefined();
    expect(bucket?.[event.id]).toEqual(event);
    expect(useEntityStore.getState()._eventIdsByScope["session:session-1"]).toEqual([event.id]);
  });

  it("clears navigation when the active session group is deleted", () => {
    useEntityStore.setState({
      sessions: {
        "session-1": { id: "session-1", sessionGroupId: "group-1" } as never,
      },
      sessionGroups: {
        "group-1": { id: "group-1" } as never,
      },
    });
    const harness = installBindings({
      activeSessionId: "session-1",
      activeSessionGroupId: "group-1",
    });

    handleOrgEvent(
      makeEvent({
        eventType: "session_deleted",
        scopeId: "session-1",
        payload: {
          sessionGroupId: "group-1",
          deletedSessionGroupId: "group-1",
        },
      }),
    );

    expect(harness.setActiveSessionId).toHaveBeenCalledWith(null);
    expect(harness.setActiveSessionGroupId).toHaveBeenCalledWith(null);
    expect(useEntityStore.getState().sessionGroups["group-1"]).toBeUndefined();
  });

  it("keeps scoped event ids ordered by timestamp", () => {
    const newer = makeEvent({
      eventType: "session_output",
      scopeId: "session-1",
      timestamp: "2026-01-01T00:00:02.000Z",
      payload: { type: "assistant", message: { content: [{ type: "text", text: "newer" }] } },
    });
    const older = makeEvent({
      eventType: "session_output",
      scopeId: "session-1",
      timestamp: "2026-01-01T00:00:01.000Z",
      payload: { type: "assistant", message: { content: [{ type: "text", text: "older" }] } },
    });

    handleOrgEvent(newer);
    handleOrgEvent(older);

    expect(useEntityStore.getState()._eventIdsByScope["session:session-1"]).toEqual([
      older.id,
      newer.id,
    ]);
  });

  it("upserts created channels only when the current user is a member", () => {
    useAuthStore.setState({
      user: { id: "user-1" } as never,
    });

    handleOrgEvent(
      makeEvent({
        eventType: "channel_created",
        scopeType: "channel",
        scopeId: "channel-1",
        payload: {
          channel: {
            id: "channel-1",
            name: "backend",
            members: [{ user: { id: "user-1" }, joinedAt: "2026-01-01T00:00:00.000Z" }],
          },
        },
      }),
    );

    expect(useEntityStore.getState().channels["channel-1"]).toMatchObject({
      id: "channel-1",
      name: "backend",
    });
  });

  it("ignores created channels when the current user is not a member", () => {
    useAuthStore.setState({
      user: { id: "user-1" } as never,
    });

    handleOrgEvent(
      makeEvent({
        eventType: "channel_created",
        scopeType: "channel",
        scopeId: "channel-2",
        payload: {
          channel: {
            id: "channel-2",
            name: "frontend",
            members: [{ user: { id: "user-2" }, joinedAt: "2026-01-01T00:00:00.000Z" }],
          },
        },
      }),
    );

    expect(useEntityStore.getState().channels["channel-2"]).toBeUndefined();
  });

  it("removes private owner channels from the sidebar store when the owner leaves", () => {
    useAuthStore.setState({
      user: { id: "user-1" } as never,
    });
    useEntityStore.setState({
      channels: {
        "channel-1": {
          id: "channel-1",
          name: "private-room",
          visibility: "private",
          ownerId: "user-1",
          viewerIsMember: true,
        } as never,
      },
    });
    const harness = installBindings({ activeChannelId: "channel-1" });

    handleOrgEvent(
      makeEvent({
        eventType: "channel_member_removed",
        scopeType: "channel",
        scopeId: "channel-1",
        payload: {
          userId: "user-1",
          channel: {
            id: "channel-1",
            name: "private-room",
            visibility: "private",
            ownerId: "user-1",
            members: [],
          },
        },
      }),
    );

    expect(useEntityStore.getState().channels["channel-1"]).toBeUndefined();
    expect(harness.setActiveChannelId).toHaveBeenCalledWith(null);
  });

  it("upserts a new session and its session group on session_started", () => {
    const event = makeEvent({
      eventType: "session_started",
      scopeId: "session-1",
      payload: {
        session: {
          id: "session-1",
          sessionGroupId: "group-1",
          name: "fresh",
          updatedAt: "2026-01-01T00:00:00.000Z",
          lastMessageAt: null,
        },
        sessionGroup: { id: "group-1", name: "group" },
      },
    });
    handleOrgEvent(event);

    const session = useEntityStore.getState().sessions["session-1"];
    const group = useEntityStore.getState().sessionGroups["group-1"];
    expect(session).toMatchObject({ id: "session-1", sessionGroupId: "group-1" });
    expect(group).toMatchObject({ id: "group-1" });
  });

  it("auto-navigates to a continuation session when source is active", () => {
    const harness = installBindings({ activeSessionId: "session-old" });
    const event = makeEvent({
      eventType: "session_started",
      scopeId: "session-new",
      payload: {
        session: {
          id: "session-new",
          sessionGroupId: "group-1",
          channel: { id: "channel-7" },
        },
        sourceSessionId: "session-old",
      },
    });
    handleOrgEvent(event);
    expect(harness.openSessionTab).toHaveBeenCalledWith("group-1", "session-new");
    expect(harness.navigateToSession).toHaveBeenCalledWith("channel-7", "group-1", "session-new");
  });

  it("marks badges when an owned off-screen session reaches a terminal state", () => {
    useAuthStore.setState({
      user: { id: "user-1" } as never,
    });
    useEntityStore.setState((state) => ({
      sessions: {
        ...state.sessions,
        "session-1": {
          id: "session-1",
          sessionGroupId: "group-1",
          channel: { id: "channel-1" },
          createdBy: { id: "user-1" },
          updatedAt: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
        } as never,
      },
    }));

    const harness = installBindings({
      activeChannelId: "channel-other",
      activeSessionId: "session-other",
      activeSessionGroupId: "group-other",
    });
    handleOrgEvent(
      makeEvent({
        eventType: "session_terminated",
        scopeId: "session-1",
        payload: { agentStatus: "done", sessionStatus: "completed" },
      }),
    );

    expect(harness.markChannelDone).toHaveBeenCalledWith("channel-1");
    expect(harness.markSessionDone).toHaveBeenCalledWith("session-1");
    expect(harness.markSessionGroupDone).toHaveBeenCalledWith("group-1");
    expect(useEntityStore.getState().sessions["session-1"].agentStatus).toBe("done");
  });

  it("does not mark badges when another user's off-screen session reaches a terminal state", () => {
    useAuthStore.setState({
      user: { id: "user-1" } as never,
    });
    useEntityStore.setState((state) => ({
      sessions: {
        ...state.sessions,
        "session-1": {
          id: "session-1",
          sessionGroupId: "group-1",
          channel: { id: "channel-1" },
          createdBy: { id: "user-2" },
          updatedAt: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
        } as never,
      },
    }));

    const harness = installBindings({
      activeChannelId: "channel-other",
      activeSessionId: "session-other",
      activeSessionGroupId: "group-other",
    });
    handleOrgEvent(
      makeEvent({
        eventType: "session_terminated",
        scopeId: "session-1",
        payload: { agentStatus: "done", sessionStatus: "completed" },
      }),
    );

    expect(harness.markChannelDone).not.toHaveBeenCalled();
    expect(harness.markSessionDone).not.toHaveBeenCalled();
    expect(harness.markSessionGroupDone).not.toHaveBeenCalled();
    expect(useEntityStore.getState().sessions["session-1"].agentStatus).toBe("done");
  });

  it("propagates session_pr_merged across sibling sessions in the group", () => {
    useEntityStore.setState({
      sessions: {
        "session-1": {
          id: "session-1",
          sessionGroupId: "group-1",
          sessionStatus: "in_progress",
          updatedAt: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
        } as never,
        "session-2": {
          id: "session-2",
          sessionGroupId: "group-1",
          sessionStatus: "in_progress",
          updatedAt: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
        } as never,
      },
      sessionGroups: {
        "group-1": { id: "group-1" } as never,
      },
      _sessionIdsByGroup: { "group-1": ["session-1", "session-2"] },
    });

    handleOrgEvent(
      makeEvent({
        eventType: "session_pr_merged",
        scopeId: "session-1",
        payload: { agentStatus: "done", sessionStatus: "merged", worktreeDeleted: true },
      }),
    );

    const sessions = useEntityStore.getState().sessions;
    expect(sessions["session-1"].sessionStatus).toBe("merged");
    expect(sessions["session-2"].sessionStatus).toBe("merged");
    expect(sessions["session-2"].worktreeDeleted).toBe(true);
  });

  it("archives a session group and stops every session in it", () => {
    useEntityStore.setState({
      sessions: {
        "session-1": {
          id: "session-1",
          sessionGroupId: "group-1",
          agentStatus: "active",
        } as never,
      },
      sessionGroups: {
        "group-1": { id: "group-1", status: "active" } as never,
      },
      _sessionIdsByGroup: { "group-1": ["session-1"] },
    });
    const harness = installBindings({ activeSessionGroupId: "group-1" });

    handleOrgEvent(
      makeEvent({
        eventType: "session_group_archived",
        scopeType: "sessionGroup",
        scopeId: "group-1",
        payload: {
          sessionGroupId: "group-1",
          sessionGroup: { id: "group-1", archivedAt: "2026-01-02T00:00:00.000Z" },
        },
      }),
    );

    expect(useEntityStore.getState().sessionGroups["group-1"].status).toBe("archived");
    expect(useEntityStore.getState().sessions["session-1"].agentStatus).toBe("stopped");
    expect(harness.setActiveSessionGroupId).toHaveBeenCalledWith(null);
  });

  it("renames a session group from event payload", () => {
    useEntityStore.setState({
      sessionGroups: {
        "group-1": {
          id: "group-1",
          name: "Old workspace",
          updatedAt: "2026-01-01T00:00:00.000Z",
        } as never,
      },
    });

    handleOrgEvent(
      makeEvent({
        eventType: "session_group_renamed",
        scopeId: "session-1",
        timestamp: "2026-01-02T00:00:00.000Z",
        payload: {
          sessionGroupId: "group-1",
          name: "New workspace",
          sessionGroup: {
            id: "group-1",
            name: "New workspace",
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
        },
      }),
    );

    expect(useEntityStore.getState().sessionGroups["group-1"]).toMatchObject({
      id: "group-1",
      name: "New workspace",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("updates a saved design preview from its event", () => {
    useEntityStore.setState({
      sessionGroups: {
        "group-1": {
          id: "group-1",
          name: "Design",
          updatedAt: "2026-01-01T00:00:00.000Z",
        } as never,
      },
    });

    handleOrgEvent(
      makeEvent({
        eventType: "design_preview_updated",
        scopeId: "group-1",
        timestamp: "2026-01-02T00:00:00.000Z",
        payload: {
          sessionGroupId: "group-1",
          designPreviewStatus: "captured",
          designPreviewCommitSha: "a".repeat(40),
          designPreviewUrl: "/design-previews/groups/group-1",
        },
      }),
    );

    expect(useEntityStore.getState().sessionGroups["group-1"]).toMatchObject({
      designPreviewStatus: "captured",
      designPreviewCommitSha: "a".repeat(40),
      designPreviewUrl: "/design-previews/groups/group-1",
    });
  });

  it("routes session_output question_pending into needs_input + bumps sort", () => {
    useEntityStore.setState({
      sessions: {
        "session-1": {
          id: "session-1",
          sessionGroupId: "group-1",
        } as never,
      },
      sessionGroups: { "group-1": { id: "group-1" } as never },
      _sessionIdsByGroup: { "group-1": ["session-1"] },
    });

    handleOrgEvent(
      makeEvent({
        eventType: "session_output",
        scopeId: "session-1",
        timestamp: "2026-02-01T00:00:00.000Z",
        payload: { type: "question_pending" },
      }),
    );

    const session = useEntityStore.getState().sessions["session-1"];
    expect(session.sessionStatus).toBe("needs_input");
    expect(session._sortTimestamp).toBe("2026-02-01T00:00:00.000Z");
  });

  it("routes session_output workspace_ready into workdir", () => {
    useEntityStore.setState({
      sessions: { "session-1": { id: "session-1", sessionGroupId: "group-1" } as never },
      sessionGroups: { "group-1": { id: "group-1" } as never },
      _sessionIdsByGroup: { "group-1": ["session-1"] },
    });

    handleOrgEvent(
      makeEvent({
        eventType: "session_output",
        scopeId: "session-1",
        payload: { type: "workspace_ready", workdir: "/tmp/work" },
      }),
    );

    expect(useEntityStore.getState().sessions["session-1"].workdir).toBe("/tmp/work");
  });

  it("routes session-scoped usage_updated into session totals", () => {
    useEntityStore.setState({
      sessions: { "session-1": { id: "session-1", sessionGroupId: "group-1" } as never },
      sessionGroups: { "group-1": { id: "group-1" } as never },
      _sessionIdsByGroup: { "group-1": ["session-1"] },
    });

    handleSessionEvent(
      "session-1",
      makeEvent({
        eventType: "session_output",
        scopeId: "session-1",
        timestamp: "2026-02-01T00:00:00.000Z",
        payload: {
          type: "usage_updated",
          inputTokens: 12,
          outputTokens: 3,
          cacheReadTokens: 40,
          cacheCreationTokens: 0,
          costUsd: 0.0042,
        },
      }) as Event & { id: string },
    );

    expect(useEntityStore.getState().sessions["session-1"]).toMatchObject({
      inputTokens: 12,
      outputTokens: 3,
      cacheReadTokens: 40,
      cacheCreationTokens: 0,
    });
  });

  it("routes session_output workspace_failed into retryable session state", () => {
    useEntityStore.setState({
      sessions: {
        "session-1": {
          id: "session-1",
          sessionGroupId: "group-1",
          agentStatus: "active",
          worktreeDeleted: false,
        } as never,
      },
      sessionGroups: { "group-1": { id: "group-1" } as never },
      _sessionIdsByGroup: { "group-1": ["session-1"] },
    });

    handleOrgEvent(
      makeEvent({
        eventType: "session_output",
        scopeId: "session-1",
        payload: {
          type: "workspace_failed",
          agentStatus: "done",
          connection: { state: "failed", canRetry: true },
        },
      }),
    );

    const session = useEntityStore.getState().sessions["session-1"];
    expect(session.agentStatus).toBe("done");
    expect(session.worktreeDeleted).toBe(false);
    expect(session.connection).toEqual({ state: "failed", canRetry: true });
  });

  it("routes session_output title_generated into session.name", () => {
    useEntityStore.setState({
      sessions: { "session-1": { id: "session-1", sessionGroupId: "group-1" } as never },
      sessionGroups: { "group-1": { id: "group-1" } as never },
      _sessionIdsByGroup: { "group-1": ["session-1"] },
    });

    handleOrgEvent(
      makeEvent({
        eventType: "session_output",
        scopeId: "session-1",
        payload: { type: "title_generated", name: "Refactor auth middleware" },
      }),
    );

    expect(useEntityStore.getState().sessions["session-1"].name).toBe("Refactor auth middleware");
  });

  it("routes session_output git_checkpoint into gitCheckpoints", () => {
    useEntityStore.setState({
      sessions: { "session-1": { id: "session-1", sessionGroupId: "group-1" } as never },
      sessionGroups: { "group-1": { id: "group-1" } as never },
      _sessionIdsByGroup: { "group-1": ["session-1"] },
    });

    const checkpoint = {
      id: "ckpt-1",
      sessionGroupId: "group-1",
      commitSha: "abc",
      committedAt: "2026-01-01T00:00:00.000Z",
    };
    handleOrgEvent(
      makeEvent({
        eventType: "session_output",
        scopeId: "session-1",
        payload: { type: "git_checkpoint", checkpoint },
      }),
    );

    const session = useEntityStore.getState().sessions["session-1"] as never as {
      gitCheckpoints: Array<{ id: string }>;
    };
    expect(session.gitCheckpoints).toHaveLength(1);
    expect(session.gitCheckpoints[0].id).toBe("ckpt-1");
  });

  it("handles queued message add, update, reorder, and removal events", () => {
    handleOrgEvent(
      makeEvent({
        eventType: "queued_message_added",
        scopeId: "session-1",
        payload: {
          queuedMessage: {
            id: "qm-1",
            sessionId: "session-1",
            text: "hi",
            position: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        },
      }),
    );

    expect(useEntityStore.getState().queuedMessages["qm-1"]).toBeDefined();
    expect(useEntityStore.getState()._queuedMessageIdsBySession["session-1"]).toContain("qm-1");

    handleOrgEvent(
      makeEvent({
        eventType: "queued_message_updated",
        scopeId: "session-1",
        payload: {
          queuedMessage: {
            id: "qm-1",
            sessionId: "session-1",
            text: "edited",
            position: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        },
      }),
    );

    expect(useEntityStore.getState().queuedMessages["qm-1"].text).toBe("edited");

    handleOrgEvent(
      makeEvent({
        eventType: "queued_message_added",
        scopeId: "session-1",
        payload: {
          queuedMessage: {
            id: "qm-2",
            sessionId: "session-1",
            text: "second",
            position: 1,
            createdAt: "2026-01-01T00:00:01.000Z",
          },
        },
      }),
    );
    handleOrgEvent(
      makeEvent({
        eventType: "queued_messages_reordered",
        scopeId: "session-1",
        payload: {
          queuedMessages: [
            {
              id: "qm-2",
              sessionId: "session-1",
              text: "second",
              position: 0,
              createdAt: "2026-01-01T00:00:01.000Z",
            },
            {
              id: "qm-1",
              sessionId: "session-1",
              text: "edited",
              position: 1,
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      }),
    );

    expect(useEntityStore.getState().queuedMessages["qm-1"]).toMatchObject({ position: 1 });
    expect(useEntityStore.getState().queuedMessages["qm-2"]).toMatchObject({ position: 0 });

    handleOrgEvent(
      makeEvent({
        eventType: "queued_message_removed",
        scopeId: "session-1",
        payload: { queuedMessageId: "qm-1", sessionId: "session-1" },
      }),
    );

    expect(useEntityStore.getState().queuedMessages["qm-1"]).toBeUndefined();
  });

  it("removes a deleted channel and its sessions/groups from the store", () => {
    useEntityStore.setState({
      channels: { "channel-1": { id: "channel-1" } as never },
      sessions: {
        "session-1": {
          id: "session-1",
          sessionGroupId: "group-1",
          channel: { id: "channel-1" },
        } as never,
      },
      sessionGroups: {
        "group-1": { id: "group-1", channel: { id: "channel-1" } } as never,
      },
      _sessionIdsByGroup: { "group-1": ["session-1"] },
    });
    const harness = installBindings({ activeChannelId: "channel-1" });

    handleOrgEvent(
      makeEvent({
        eventType: "channel_deleted",
        scopeType: "channel",
        scopeId: "channel-1",
        payload: { channelId: "channel-1" },
      }),
    );

    const state = useEntityStore.getState();
    expect(state.channels["channel-1"]).toBeUndefined();
    expect(state.sessions["session-1"]).toBeUndefined();
    expect(state.sessionGroups["group-1"]).toBeUndefined();
    expect(harness.setActiveChannelId).toHaveBeenCalledWith(null);
  });

  it("upserts inbox items for a non-rendered V1 event so the store stays consistent", () => {
    useAuthStore.setState({
      user: { id: "user-1", name: "User One", email: "one@example.com", avatarUrl: null },
    });

    handleOrgEvent(
      makeEvent({
        eventType: "inbox_item_created" as EventType,
        scopeType: "user",
        scopeId: "user-1",
        payload: {
          inboxItem: {
            id: "inbox-1",
            userId: "user-1",
            itemType: "question",
            title: "Need answer",
          },
        },
      }),
    );

    expect(useEntityStore.getState().inboxItems["inbox-1"]).toMatchObject({
      id: "inbox-1",
      itemType: "question",
    });
  });

  it("ignores inbox item events for other users", () => {
    useAuthStore.setState({
      user: { id: "user-1", name: "User One", email: "one@example.com", avatarUrl: null },
    });

    handleOrgEvent(
      makeEvent({
        eventType: "inbox_item_created" as EventType,
        scopeType: "user",
        scopeId: "user-2",
        payload: {
          inboxItem: {
            id: "inbox-2",
            userId: "user-2",
            itemType: "question",
            title: "Someone else's item",
          },
        },
      }),
    );

    expect(useEntityStore.getState().inboxItems["inbox-2"]).toBeUndefined();
  });

  it("session_output session_rehomed redirects active session", () => {
    const harness = installBindings({ activeSessionId: "session-old" });
    useEntityStore.setState({
      sessions: { "session-old": { id: "session-old", sessionGroupId: "group-1" } as never },
      sessionGroups: { "group-1": { id: "group-1" } as never },
      _sessionIdsByGroup: { "group-1": ["session-old"] },
    });

    handleOrgEvent(
      makeEvent({
        eventType: "session_output",
        scopeId: "session-old",
        payload: { type: "session_rehomed", newSessionId: "session-new" },
      }),
    );

    expect(harness.setActiveSessionId).toHaveBeenCalledWith("session-new");
  });

  it("upserts streamed app process logs without a refetch", () => {
    handleOrgEvent(
      makeEvent({
        eventType: "session_application_log_appended",
        scopeId: "group-1",
        payload: {
          logEntry: {
            id: "log-1",
            processId: "process-1",
            stream: "stdout",
            data: "ready\n",
            sequence: 1,
            timestamp: "2026-07-09T00:00:00.000Z",
          },
        },
      }),
    );

    expect(useEntityStore.getState().sessionApplicationLogs["log-1"]).toMatchObject({
      processId: "process-1",
      data: "ready\n",
    });
    // The log entity lives in its own capped table; it must NOT also be stored
    // in the uncapped scoped-event log.
    expect(useEntityStore.getState().eventsByScope["session:group-1"]).toBeUndefined();
  });

  it("upserts setup script runs without a refetch", () => {
    handleOrgEvent(
      makeEvent({
        eventType: "session_setup_script_started",
        scopeId: "group-1",
        payload: {
          setupScriptRun: {
            id: "run-1",
            sessionGroupId: "group-1",
            scriptConfigId: "install",
            label: "Install",
            command: "pnpm install",
            workingDirectory: ".",
            status: "running",
            exitCode: null,
            outputPreview: "Queued",
            outputTruncated: false,
            lastError: null,
            startedAt: "2026-07-09T00:00:00.000Z",
            completedAt: null,
          },
        },
      }),
    );

    expect(useEntityStore.getState().sessionSetupScriptRuns["run-1"]).toMatchObject({
      scriptConfigId: "install",
      status: "running",
    });
  });
});
