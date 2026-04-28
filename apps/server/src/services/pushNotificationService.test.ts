import type { Event as PrismaEvent } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "../lib/db.js";
import { PushNotificationService } from "./pushNotificationService.js";

const prismaMock = prisma as unknown as {
  event: {
    findMany: ReturnType<typeof vi.fn>;
  };
  session: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  pushToken: {
    findMany: ReturnType<typeof vi.fn>;
  };
};

function event(overrides: Partial<PrismaEvent>): PrismaEvent {
  return {
    id: "event-1",
    organizationId: "org-1",
    scopeType: "session",
    scopeId: "session-1",
    eventType: "session_terminated",
    payload: {},
    actorType: "system",
    actorId: "system",
    parentId: null,
    metadata: {},
    timestamp: new Date("2026-04-27T00:00:00.000Z"),
    ...overrides,
  } as PrismaEvent;
}

describe("PushNotificationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200 })),
    );
    prismaMock.pushToken.findMany.mockResolvedValue([
      {
        id: "push-1",
        userId: "user-1",
        organizationId: "org-1",
        token: "ExponentPushToken[token-1]",
        platform: "ios",
      },
      {
        id: "push-2",
        userId: "user-1",
        organizationId: "org-1",
        token: "not-an-expo-token",
        platform: "ios",
      },
    ]);
    prismaMock.event.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends completion pushes to the session owner", async () => {
    prismaMock.session.findUnique.mockResolvedValue({
      createdById: "user-1",
      name: "Fix flaky CI",
      sessionGroupId: "group-1",
      channel: { name: "mobile" },
    });
    prismaMock.event.findMany.mockResolvedValue([
      {
        eventType: "session_resumed",
        payload: { clientSource: "mobile" },
      },
      {
        eventType: "session_output",
        payload: {
          type: "assistant",
          message: { content: [{ type: "text", text: "Done. I updated the flaky CI check." }] },
        },
      },
    ]);

    await new PushNotificationService().notifyForEvent(
      event({ payload: { agentStatus: "done", sessionStatus: "in_progress" } }),
    );

    expect(prismaMock.pushToken.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", organizationId: "org-1" },
      orderBy: { lastSeenAt: "desc" },
    });
    expect(fetch).toHaveBeenCalledWith("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          to: "ExponentPushToken[token-1]",
          title: "Fix flaky CI",
          subtitle: "#mobile",
          body: "Done. I updated the flaky CI check.",
          data: { deepLink: "trace://sessions/group-1/session-1" },
        },
      ]),
    });
  });

  it("does not send a session push for the owner's own action", async () => {
    prismaMock.session.findUnique.mockResolvedValue({
      createdById: "user-1",
      name: "Fix flaky CI",
      sessionGroupId: "group-1",
      channel: { name: "mobile" },
    });

    await new PushNotificationService().notifyForEvent(
      event({
        actorType: "user",
        actorId: "user-1",
        payload: { agentStatus: "done", sessionStatus: "in_progress" },
      }),
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not send pushes for pause or resume events", async () => {
    prismaMock.session.findUnique.mockResolvedValue({
      createdById: "user-1",
      name: "Fix flaky CI",
      sessionGroupId: "group-1",
    });

    await new PushNotificationService().notifyForEvent(
      event({ eventType: "session_paused", actorType: "user", actorId: "user-2" }),
    );
    await new PushNotificationService().notifyForEvent(
      event({ eventType: "session_resumed", actorType: "user", actorId: "user-2" }),
    );

    expect(prismaMock.session.findUnique).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends awaiting-input pushes when the AI asks for input", async () => {
    prismaMock.session.findUnique.mockResolvedValue({
      createdById: "user-1",
      name: "Fix flaky CI",
      sessionGroupId: "group-1",
      channel: { name: "mobile" },
    });
    prismaMock.event.findMany.mockResolvedValue([
      {
        eventType: "session_resumed",
        payload: { clientSource: "mobile" },
      },
      {
        eventType: "session_output",
        payload: {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "I need clarification on which auth flow to keep." }],
          },
        },
      },
    ]);

    await new PushNotificationService().notifyForEvent(
      event({
        eventType: "session_output",
        payload: { type: "question_pending", sessionStatus: "needs_input" },
      }),
    );

    expect(fetch).toHaveBeenCalledWith("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          to: "ExponentPushToken[token-1]",
          title: "Fix flaky CI",
          subtitle: "#mobile",
          body: "I need clarification on which auth flow to keep.",
          data: { deepLink: "trace://sessions/group-1/session-1" },
        },
      ]),
    });
  });

  it("does not send completion pushes for terminated sessions awaiting input", async () => {
    await new PushNotificationService().notifyForEvent(
      event({
        payload: { agentStatus: "done", sessionStatus: "needs_input" },
      }),
    );

    expect(prismaMock.session.findUnique).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not send session pushes for web-originated runs", async () => {
    prismaMock.session.findUnique.mockResolvedValue({
      createdById: "user-1",
      name: "Fix flaky CI",
      sessionGroupId: "group-1",
      channel: { name: "mobile" },
    });
    prismaMock.event.findMany.mockResolvedValue([
      {
        eventType: "session_resumed",
        payload: { clientSource: "web" },
      },
      {
        eventType: "session_output",
        payload: {
          type: "assistant",
          message: { content: [{ type: "text", text: "Done. I updated the flaky CI check." }] },
        },
      },
    ]);

    await new PushNotificationService().notifyForEvent(
      event({ payload: { agentStatus: "done", sessionStatus: "in_progress" } }),
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not send session pushes when the latest user turn came from web", async () => {
    prismaMock.session.findUnique.mockResolvedValue({
      createdById: "user-1",
      name: "Fix flaky CI",
      sessionGroupId: "group-1",
      channel: { name: "mobile" },
    });
    prismaMock.event.findMany.mockResolvedValue([
      {
        eventType: "message_sent",
        payload: { text: "Can you adjust this from web?", clientSource: "web" },
      },
      {
        eventType: "session_resumed",
        payload: { clientSource: "mobile" },
      },
    ]);

    await new PushNotificationService().notifyForEvent(
      event({
        eventType: "session_output",
        payload: { type: "question_pending", sessionStatus: "needs_input" },
      }),
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends bridge access request pushes to the owner", async () => {
    await new PushNotificationService().notifyForEvent(
      event({
        scopeType: "system",
        scopeId: "org-1",
        eventType: "bridge_access_requested",
        actorType: "user",
        actorId: "user-2",
        payload: {
          requestId: "request-1",
          ownerUserId: "user-1",
          runtimeLabel: "Studio Mac",
          requesterUser: { name: "Casey" },
          status: "pending",
        },
      }),
    );

    expect(fetch).toHaveBeenCalledWith("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          to: "ExponentPushToken[token-1]",
          title: "Casey requested bridge access",
          body: "Review access for Studio Mac",
          data: {
            deepLink: "trace://connections",
            requestId: "request-1",
            foregroundPresentation: "bridge_access_requested",
          },
        },
      ]),
    });
  });
});
