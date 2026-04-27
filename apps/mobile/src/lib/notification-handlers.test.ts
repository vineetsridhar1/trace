import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@trace/gql";

const mocks = vi.hoisted(() => ({
  appState: { currentState: "background" },
  getPermissionsAsync: vi.fn(),
  scheduleNotificationAsync: vi.fn(),
  registerHandler: vi.fn(),
  authState: { user: { id: "user-1" } as { id: string } | null },
  entityState: {
    sessions: {} as Record<string, unknown>,
  },
}));

vi.mock("react-native", () => ({
  AppState: mocks.appState,
}));

vi.mock("expo-notifications", () => ({
  getPermissionsAsync: mocks.getPermissionsAsync,
  scheduleNotificationAsync: mocks.scheduleNotificationAsync,
}));

vi.mock("@trace/client-core", () => ({
  registerHandler: mocks.registerHandler,
  useAuthStore: { getState: () => mocks.authState },
  useEntityStore: { getState: () => mocks.entityState },
}));

import {
  handleBridgeAccessRequested,
  handleSessionAgentStatusChange,
  resetNotificationDebounceForTest,
  shouldDebounceNotification,
} from "./notification-handlers";

function event(overrides: Partial<Event>): Event {
  return {
    id: "event-1",
    organizationId: "org-1",
    scopeType: "session",
    scopeId: "session-1",
    eventType: "session_terminated",
    payload: {},
    metadata: {},
    parentId: null,
    timestamp: "2026-04-27T00:00:00.000Z",
    actor: { id: "agent-1", type: "agent", name: "Agent" },
    ...overrides,
  } as Event;
}

async function flushNotifications(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("notification handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNotificationDebounceForTest();
    mocks.appState.currentState = "background";
    mocks.authState.user = { id: "user-1" };
    mocks.entityState.sessions = {};
    mocks.getPermissionsAsync.mockResolvedValue({ status: "granted" });
    mocks.scheduleNotificationAsync.mockResolvedValue("notification-1");
  });

  it("bounds and prunes recent notification debounce entries", () => {
    expect(shouldDebounceNotification("session:s1:done", 1_000)).toBe(false);
    expect(shouldDebounceNotification("session:s1:done", 1_500)).toBe(true);
    expect(shouldDebounceNotification("session:s1:done", 7_000)).toBe(false);

    for (let index = 0; index < 250; index++) {
      shouldDebounceNotification(`key:${index}`, 8_000 + index);
    }

    expect(shouldDebounceNotification("key:0", 8_260)).toBe(false);
  });

  it("schedules a session notification for an owned session while backgrounded", async () => {
    mocks.entityState.sessions = {
      "session-1": {
        id: "session-1",
        name: "Fix flaky CI",
        createdBy: { id: "user-1" },
        sessionGroupId: "group-1",
        agentStatus: "failed",
      },
    };

    handleSessionAgentStatusChange(event({}));
    await flushNotifications();

    expect(mocks.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: '"Fix flaky CI" is now Failed',
        body: undefined,
        data: { deepLink: "trace://sessions/group-1/session-1" },
      },
      trigger: null,
    });
  });

  it("does not schedule a session notification for the actor's own event", async () => {
    mocks.entityState.sessions = {
      "session-1": {
        id: "session-1",
        name: "Fix flaky CI",
        createdBy: { id: "user-1" },
        sessionGroupId: "group-1",
        agentStatus: "failed",
      },
    };

    handleSessionAgentStatusChange(event({ actor: { id: "user-1", type: "user", name: "Me" } }));
    await flushNotifications();

    expect(mocks.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("schedules a bridge access notification for the owner", async () => {
    handleBridgeAccessRequested(
      event({
        scopeType: "system",
        scopeId: "org-1",
        eventType: "bridge_access_requested",
        payload: {
          ownerUserId: "user-1",
          requestId: "request-1",
          runtimeLabel: "Studio Mac",
          requesterUser: { name: "Casey" },
          status: "pending",
        },
      }),
    );
    await flushNotifications();

    expect(mocks.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: "Casey requested bridge access",
        body: "Review access for Studio Mac",
        data: { deepLink: "trace://connections" },
      },
      trigger: null,
    });
  });
});
