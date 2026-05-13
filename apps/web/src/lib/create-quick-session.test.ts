import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEntityStore } from "@trace/client-core";
import { useUIStore } from "../stores/ui";

const { mutationMock } = vi.hoisted(() => ({
  mutationMock: vi.fn(),
}));

vi.mock("./urql", () => ({
  client: {
    mutation: mutationMock,
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { createQuickSession } from "./create-quick-session";

function resetEntityStore() {
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
    agentEnvironments: {},
    eventsByScope: {},
    _eventIdsByScope: {},
    _sessionIdsByGroup: {},
    _messageIdsByScope: {},
    _eventIdsByParentId: {},
    _queuedMessageIdsBySession: {},
  });
}

describe("createQuickSession", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });
    vi.stubGlobal("history", {
      pushState: vi.fn(),
      replaceState: vi.fn(),
    });
    resetEntityStore();
    useUIStore.setState({
      activeChannelId: null,
      activeSessionGroupId: null,
      activeSessionId: null,
      lastSelectedSessionIdsByGroup: {},
      openSessionTabsByGroup: {},
    });
    mutationMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a navigable optimistic session before startSession returns", async () => {
    let resolveMutation: (value: {
      data: { startSession: { id: string; sessionGroupId: string } };
    }) => void = () => undefined;
    const mutationPromise = new Promise<{
      data: { startSession: { id: string; sessionGroupId: string } };
    }>((resolve) => {
      resolveMutation = resolve;
    });
    mutationMock.mockReturnValue({ toPromise: () => mutationPromise });

    const createPromise = createQuickSession("channel-1");

    const optimisticSessions = Object.values(useEntityStore.getState().sessions);
    const optimisticGroups = Object.values(useEntityStore.getState().sessionGroups);
    expect(optimisticSessions).toHaveLength(1);
    expect(optimisticGroups).toHaveLength(1);
    expect(optimisticSessions[0]).toMatchObject({
      channel: { id: "channel-1" },
      _optimistic: true,
    });
    expect(useUIStore.getState().activeSessionId).toBe(optimisticSessions[0]?.id);

    resolveMutation({
      data: { startSession: { id: "session-real", sessionGroupId: "group-real" } },
    });
    await createPromise;

    expect(useEntityStore.getState().sessions["session-real"]).toMatchObject({
      id: "session-real",
      sessionGroupId: "group-real",
    });
    expect(useEntityStore.getState().sessions[optimisticSessions[0]?.id ?? ""]).toBeUndefined();
    expect(useUIStore.getState().activeSessionId).toBe("session-real");
  });
});
