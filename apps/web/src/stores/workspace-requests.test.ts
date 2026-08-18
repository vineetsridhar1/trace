import type { Event, User } from "@trace/gql";
import { useAuthStore } from "@trace/client-core";
import { beforeEach, describe, expect, it } from "vitest";
import { reconcileWorkspaceRequestEvent, useWorkspaceRequestStore } from "./workspace-requests";

function browserRequest(targetUserId: string): Event {
  return {
    id: "request-1",
    eventType: "workspace_browser_open_requested",
    scopeType: "system",
    scopeId: "group-1",
    timestamp: "2026-08-17T00:00:00.000Z",
    payload: {
      sessionGroupId: "group-1",
      targetUserId,
      url: "https://example.com/",
    },
  } as unknown as Event;
}

describe("workspace request reconciliation", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: "user-1", email: "user@example.com", name: "User" } as User,
    });
    useWorkspaceRequestStore.setState({ browserRequestsByGroup: {} });
  });

  it("queues browser requests for the requesting user", () => {
    reconcileWorkspaceRequestEvent(browserRequest("user-1"));

    expect(useWorkspaceRequestStore.getState().browserRequestsByGroup["group-1"]).toEqual([
      {
        id: "request-1",
        sessionGroupId: "group-1",
        url: "https://example.com/",
      },
    ]);
  });

  it("ignores browser requests targeting another user", () => {
    reconcileWorkspaceRequestEvent(browserRequest("user-2"));

    expect(useWorkspaceRequestStore.getState().browserRequestsByGroup).toEqual({});
  });
});
