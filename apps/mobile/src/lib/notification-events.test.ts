import { describe, expect, it } from "vitest";
import {
  buildBridgeAccessRequestedNotification,
  buildSessionAgentStatusNotification,
  parseBridgeAccessNotificationPayload,
} from "./notification-events";

describe("buildSessionAgentStatusNotification", () => {
  it("builds a session deep link and readable title", () => {
    expect(
      buildSessionAgentStatusNotification({
        sessionName: "Fix flaky CI",
        sessionGroupId: "group-1",
        sessionId: "session-1",
        agentStatus: "failed",
      }),
    ).toEqual({
      title: "\"Fix flaky CI\" is now Failed",
      deepLink: "trace://sessions/group-1/session-1",
    });
  });
});

describe("parseBridgeAccessNotificationPayload", () => {
  it("reads the owner-facing bridge request fields", () => {
    expect(
      parseBridgeAccessNotificationPayload(
        {
          ownerUserId: "user-1",
          requestId: "request-1",
          runtimeLabel: "Vineet's MacBook Pro",
          requesterUser: { id: "user-2", name: "Casey" },
          requestedCapabilities: ["session", "terminal"],
          status: "pending",
        },
        "Fallback Name",
      ),
    ).toEqual({
      ownerUserId: "user-1",
      requestId: "request-1",
      requesterName: "Casey",
      runtimeLabel: "Vineet's MacBook Pro",
      status: "pending",
    });
  });

  it("falls back to the actor name when requester profile data is missing", () => {
    expect(
      parseBridgeAccessNotificationPayload(
        {
          ownerUserId: "user-1",
          requestId: "request-1",
          runtimeLabel: "",
          requesterUser: { id: "user-2" },
          status: "pending",
        },
        "Fallback Name",
      ),
    ).toEqual({
      ownerUserId: "user-1",
      requestId: "request-1",
      requesterName: "Fallback Name",
      runtimeLabel: "your bridge",
      status: "pending",
    });
  });
});

describe("buildBridgeAccessRequestedNotification", () => {
  it("targets the connections tab", () => {
    expect(
      buildBridgeAccessRequestedNotification({
        requesterName: "Casey",
        runtimeLabel: "Studio Mac",
      }),
    ).toEqual({
      title: "Casey requested bridge access",
      body: "Review access for Studio Mac",
      deepLink: "trace://connections",
    });
  });
});
