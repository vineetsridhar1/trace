import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/storage/index.js", () => ({
  storage: {
    putObject: vi.fn(),
    getGetUrl: vi.fn(),
  },
}));

vi.mock("../lib/pubsub.js", () => ({
  pubsub: {
    asyncIterator: vi.fn(() => "iterator"),
  },
  topics: {
    ticketEvents: (id: string) => `ticket:${id}:events`,
    channelEvents: (id: string) => `channel:${id}:events`,
    sessionPorts: (id: string) => `session:${id}:ports`,
    sessionStatus: (id: string) => `session:${id}:status`,
    sessionEvents: (id: string) => `session:${id}:events`,
    orgEvents: (id: string) => `org:${id}:events`,
  },
}));

vi.mock("../services/access.js", () => ({
  assertScopeAccess: vi.fn(),
  assertChannelAccess: vi.fn(),
  assertChatAccess: vi.fn(),
  visibleChannelWhere: vi.fn((userId: string) => ({
    OR: [
      { visibility: "public" },
      { ownerId: userId },
      { members: { some: { userId, leftAt: null } } },
    ],
  })),
  canViewChannel: vi.fn(
    (
      channel: {
        visibility?: string | null;
        ownerId?: string | null;
        members?: Array<{ userId: string }>;
      },
      userId: string,
    ) =>
      channel.visibility == null ||
      channel.visibility === "public" ||
      channel.ownerId === userId ||
      !!channel.members?.some((member) => member.userId === userId),
  ),
  canViewSessionGroup: vi.fn(
    (group: { visibility?: string | null; ownerUserId?: string | null }, userId: string) =>
      group.visibility == null || group.visibility === "public" || group.ownerUserId === userId,
  ),
}));

vi.mock("../services/event.js", () => ({
  eventService: {
    query: vi.fn(),
  },
}));

vi.mock("../services/session-timeline.js", () => ({
  sessionTimelineService: {
    query: vi.fn(),
  },
}));

vi.mock("../services/ticket.js", () => ({
  ticketService: {
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    addComment: vi.fn(),
    assign: vi.fn(),
    unassign: vi.fn(),
    link: vi.fn(),
    unlink: vi.fn(),
  },
}));

vi.mock("../services/session.js", () => ({
  sessionService: {
    list: vi.fn(),
    listByUser: vi.fn(),
    get: vi.fn(),
    terminate: vi.fn(),
    dismiss: vi.fn(),
    delete: vi.fn(),
    sendMessage: vi.fn(),
    queueMessage: vi.fn(),
    removeQueuedMessage: vi.fn(),
    steerQueuedMessage: vi.fn(),
    updateQueuedMessage: vi.fn(),
    clearQueuedMessages: vi.fn(),
    reorderQueuedMessages: vi.fn(),
    getQueuedMessageSessionId: vi.fn().mockResolvedValue("session-1"),
  },
}));

vi.mock("../lib/db.js", () => ({
  prisma: {
    session: {
      findFirst: vi.fn(),
    },
    sessionGroup: {
      findFirst: vi.fn(),
    },
    channel: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: {
    getRuntime: vi.fn(),
    getRuntimeForSession: vi.fn(),
    listSkills: vi.fn(),
  },
}));

vi.mock("../services/runtime-access.js", () => ({
  runtimeAccessService: {
    getAccessState: vi.fn(),
  },
}));

vi.mock("../services/channelGroup.js", () => ({
  channelGroupService: {
    list: vi.fn(),
  },
}));

vi.mock("../services/inbox.js", () => ({
  inboxService: {
    listForUser: vi.fn(),
  },
}));

vi.mock("../services/aiConversation.js", () => ({
  aiConversationService: {
    getConversations: vi.fn(),
    createConversation: vi.fn(),
  },
}));

import { ticketMutations, ticketQueries, ticketSubscriptions } from "./ticket.js";
import { sessionQueries, sessionSubscriptions } from "./session.js";
import { sessionMutations } from "./session.js";
import { channelGroupQueries } from "./channelGroup.js";
import { channelSubscriptions } from "./channel.js";
import { eventQueries, eventSubscriptions } from "./event.js";
import { inboxQueries } from "./inbox.js";
import { aiConversationQueries, aiConversationMutations } from "./ai-conversation.js";
import { assertChannelAccess, assertScopeAccess } from "../services/access.js";
import { eventService } from "../services/event.js";
import { ticketService } from "../services/ticket.js";
import { sessionService } from "../services/session.js";
import { prisma } from "../lib/db.js";
import { pubsub } from "../lib/pubsub.js";
import { sessionRouter } from "../lib/session-router.js";
import { runtimeAccessService } from "../services/runtime-access.js";
import { channelGroupService } from "../services/channelGroup.js";
import { inboxService } from "../services/inbox.js";
import { aiConversationService } from "../services/aiConversation.js";

const ctx = {
  userId: "user-1",
  organizationId: "org-1",
  role: "admin",
  actorType: "user",
} as any;

describe("GraphQL authz guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects cross-org ticket list queries", async () => {
    expect(() => ticketQueries.tickets({}, { organizationId: "org-2" }, ctx)).toThrow(
      "Not authorized for this organization",
    );
    expect(ticketService.list).not.toHaveBeenCalled();
  });

  it("rejects cross-org session list queries", async () => {
    expect(() => sessionQueries.sessions({}, { organizationId: "org-2" }, ctx)).toThrow(
      "Not authorized for this organization",
    );
    expect(sessionService.list).not.toHaveBeenCalled();
  });

  it("rejects cross-org my-session list queries", async () => {
    expect(() => sessionQueries.mySessions({}, { organizationId: "org-2" }, ctx)).toThrow(
      "Not authorized for this organization",
    );
    expect(sessionService.listByUser).not.toHaveBeenCalled();
  });

  it("rejects cross-org channel-group queries", async () => {
    expect(() => channelGroupQueries.channelGroups({}, { organizationId: "org-2" }, ctx)).toThrow(
      "Not authorized for this organization",
    );
    expect(channelGroupService.list).not.toHaveBeenCalled();
  });

  it("rejects cross-org inbox queries", async () => {
    expect(() => inboxQueries.inboxItems({}, { organizationId: "org-2" }, ctx)).toThrow(
      "Not authorized for this organization",
    );
    expect(inboxService.listForUser).not.toHaveBeenCalled();
  });

  it("rejects cross-org AI conversation entry points", async () => {
    expect(() =>
      aiConversationQueries.aiConversations({}, { organizationId: "org-2" }, ctx),
    ).toThrow("Not authorized for this organization");
    expect(() =>
      aiConversationMutations.createAiConversation({}, { organizationId: "org-2", input: {} }, ctx),
    ).toThrow("Not authorized for this organization");
    expect(aiConversationService.getConversations).not.toHaveBeenCalled();
    expect(aiConversationService.createConversation).not.toHaveBeenCalled();
  });

  it("guards session mutations by active org and scope", async () => {
    await sessionMutations.terminateSession({}, { id: "session-1" }, ctx);
    await sessionMutations.dismissSession({}, { id: "session-1" }, ctx);
    await sessionMutations.deleteSession({}, { id: "session-1" }, ctx);
    await sessionMutations.sendSessionMessage({}, { sessionId: "session-1", text: "hello" }, ctx);
    await sessionMutations.queueSessionMessage({}, { sessionId: "session-1", text: "queued" }, ctx);
    await sessionMutations.removeQueuedMessage({}, { id: "queued-1" }, ctx);
    await sessionMutations.steerQueuedMessage({}, { id: "queued-1" }, ctx);
    await sessionMutations.updateQueuedMessage({}, { id: "queued-1", text: "edited" }, ctx);
    await sessionMutations.clearQueuedMessages({}, { sessionId: "session-1" }, ctx);
    await sessionMutations.reorderQueuedMessages(
      {},
      { sessionId: "session-1", ids: ["queued-1"] },
      ctx,
    );

    expect(assertScopeAccess).toHaveBeenNthCalledWith(1, "session", "session-1", "user-1", "org-1");
    expect(assertScopeAccess).toHaveBeenNthCalledWith(2, "session", "session-1", "user-1", "org-1");
    expect(assertScopeAccess).toHaveBeenNthCalledWith(3, "session", "session-1", "user-1", "org-1");
    expect(assertScopeAccess).toHaveBeenNthCalledWith(4, "session", "session-1", "user-1", "org-1");
    expect(assertScopeAccess).toHaveBeenNthCalledWith(5, "session", "session-1", "user-1", "org-1");
    expect(assertScopeAccess).toHaveBeenNthCalledWith(6, "session", "session-1", "user-1", "org-1");
    expect(assertScopeAccess).toHaveBeenNthCalledWith(7, "session", "session-1", "user-1", "org-1");
    expect(assertScopeAccess).toHaveBeenNthCalledWith(8, "session", "session-1", "user-1", "org-1");
    expect(assertScopeAccess).toHaveBeenNthCalledWith(9, "session", "session-1", "user-1", "org-1");
    expect(assertScopeAccess).toHaveBeenNthCalledWith(
      10,
      "session",
      "session-1",
      "user-1",
      "org-1",
    );
  });

  it("uses the org-scoped runtime key when loading bridge slash commands", async () => {
    vi.mocked(prisma.session.findFirst).mockResolvedValueOnce({
      id: "session-1",
      tool: "claude_code",
      workdir: "/worktree",
      sessionGroupId: "group-1",
      connection: { runtimeInstanceId: "runtime-1" },
    });
    vi.mocked(sessionRouter.getRuntime).mockReturnValueOnce({
      key: "org-1:runtime-1",
      id: "runtime-1",
      label: "Laptop",
      ws: { readyState: 1, OPEN: 1 },
      hostingMode: "local",
      organizationId: "org-1",
      supportedTools: ["claude_code"],
      registeredRepoIds: [],
      lastHeartbeat: Date.now(),
      boundSessions: new Set<string>(),
      linkedCheckouts: new Map(),
    });
    vi.mocked(runtimeAccessService.getAccessState).mockResolvedValueOnce({
      runtimeInstanceId: "runtime-1",
      bridgeRuntimeId: "bridge-1",
      label: "Laptop",
      hostingMode: "local",
      connected: true,
      ownerUser: null,
      allowed: true,
      isOwner: true,
      scopeType: "all_sessions",
      sessionGroupId: null,
      capabilities: ["session"],
      expiresAt: null,
      pendingRequest: null,
    });
    vi.mocked(sessionRouter.listSkills).mockResolvedValueOnce([
      { name: "project-plan", description: "Plan work", source: "project" },
    ]);

    await sessionQueries.sessionSlashCommands({}, { sessionId: "session-1" }, ctx);

    expect(sessionRouter.listSkills).toHaveBeenCalledWith(
      "org-1:runtime-1",
      "session-1",
      expect.objectContaining({ workdirHint: "/worktree" }),
    );
  });

  it("guards ticket event subscriptions by org and scope", async () => {
    await ticketSubscriptions.ticketEvents.subscribe(
      {},
      { ticketId: "ticket-1", organizationId: "org-1" },
      ctx,
    );

    expect(assertScopeAccess).toHaveBeenCalledWith("ticket", "ticket-1", "user-1", "org-1");
  });

  it("guards ticket mutations by active org and ticket scope before writing", async () => {
    await ticketMutations.updateTicket({}, { id: "ticket-1", input: { title: "Updated" } }, ctx);
    await ticketMutations.commentOnTicket({}, { ticketId: "ticket-1", text: "hello" }, ctx);
    await ticketMutations.assignTicket({}, { ticketId: "ticket-1", userId: "user-2" }, ctx);
    await ticketMutations.unassignTicket({}, { ticketId: "ticket-1", userId: "user-2" }, ctx);
    await ticketMutations.linkTicket(
      {},
      { ticketId: "ticket-1", entityType: "session", entityId: "session-1" },
      ctx,
    );
    await ticketMutations.unlinkTicket(
      {},
      { ticketId: "ticket-1", entityType: "session", entityId: "session-1" },
      ctx,
    );

    expect(assertScopeAccess).toHaveBeenNthCalledWith(1, "ticket", "ticket-1", "user-1", "org-1");
    expect(assertScopeAccess).toHaveBeenNthCalledWith(2, "ticket", "ticket-1", "user-1", "org-1");
    expect(assertScopeAccess).toHaveBeenNthCalledWith(3, "ticket", "ticket-1", "user-1", "org-1");
    expect(assertScopeAccess).toHaveBeenNthCalledWith(4, "ticket", "ticket-1", "user-1", "org-1");
    expect(assertScopeAccess).toHaveBeenNthCalledWith(5, "ticket", "ticket-1", "user-1", "org-1");
    expect(assertScopeAccess).toHaveBeenNthCalledWith(6, "ticket", "ticket-1", "user-1", "org-1");
  });

  it("checks channel event subscriptions against the active organization", async () => {
    await channelSubscriptions.channelEvents.subscribe(
      {},
      { channelId: "channel-1", organizationId: "org-1" },
      ctx,
    );

    expect(assertChannelAccess).toHaveBeenCalledWith("channel-1", "user-1", "org-1");
  });

  it("guards session subscriptions by org and scope", async () => {
    await sessionSubscriptions.sessionPortsChanged.subscribe(
      {},
      { sessionId: "session-1", organizationId: "org-1" },
      ctx,
    );
    await eventSubscriptions.sessionEvents.subscribe(
      {},
      { sessionId: "session-1", organizationId: "org-1" },
      ctx,
    );

    expect(assertScopeAccess).toHaveBeenNthCalledWith(1, "session", "session-1", "user-1", "org-1");
    expect(assertScopeAccess).toHaveBeenNthCalledWith(2, "session", "session-1", "user-1", "org-1");
  });

  it("filters historical session events using current group visibility", async () => {
    vi.mocked(eventService.query).mockResolvedValueOnce([
      {
        scopeType: "session",
        scopeId: "session-1",
        eventType: "session_started",
        payload: {
          sessionGroup: {
            id: "group-1",
            visibility: "public",
            ownerUserId: "owner-1",
          },
        },
      },
    ]);
    vi.mocked(prisma.sessionGroup.findFirst).mockResolvedValueOnce({
      visibility: "private",
      ownerUserId: "owner-1",
    });

    const result = await eventQueries.events({}, { organizationId: "org-1" }, ctx);

    expect(result).toEqual([]);
    expect(prisma.sessionGroup.findFirst).toHaveBeenCalledWith({
      where: { id: "group-1", organizationId: "org-1" },
      select: { visibility: true, ownerUserId: true },
    });
  });

  it("filters historical private channel events using current channel visibility", async () => {
    vi.mocked(eventService.query).mockResolvedValueOnce([
      {
        scopeType: "channel",
        scopeId: "channel-1",
        eventType: "channel_created",
        payload: {
          channel: {
            id: "channel-1",
            visibility: "private",
            ownerId: "owner-1",
            members: [{ user: { id: "owner-1" } }],
          },
        },
      },
    ]);
    vi.mocked(prisma.channel.findFirst).mockResolvedValueOnce(null);

    const result = await eventQueries.events({}, { organizationId: "org-1" }, ctx);

    expect(result).toEqual([]);
    expect(prisma.channel.findFirst).toHaveBeenCalledWith({
      where: {
        id: "channel-1",
        organizationId: "org-1",
        OR: [
          { visibility: "public" },
          { ownerId: "user-1" },
          { members: { some: { userId: "user-1", leftAt: null } } },
        ],
      },
      select: { id: true },
    });
  });

  it("allows invited users to receive their private channel membership event", async () => {
    vi.mocked(eventService.query).mockResolvedValueOnce([
      {
        scopeType: "channel",
        scopeId: "channel-1",
        eventType: "channel_member_added",
        payload: {
          userId: "user-1",
          channel: {
            id: "channel-1",
            visibility: "private",
            ownerId: "owner-1",
            members: [{ user: { id: "owner-1" } }, { user: { id: "user-1" } }],
          },
        },
      },
    ]);

    const result = await eventQueries.events({}, { organizationId: "org-1" }, ctx);

    expect(result).toEqual([
      expect.objectContaining({
        eventType: "channel_member_added",
      }),
    ]);
    expect(prisma.channel.findFirst).not.toHaveBeenCalled();
  });

  it("invalidates session event visibility cache when group visibility changes", async () => {
    const scopedCtx = { ...ctx, userId: "user-2" };
    const events = [
      {
        sessionEvents: {
          scopeType: "session",
          scopeId: "session-1",
          eventType: "session_started",
          payload: { sessionGroupId: "group-1" },
        },
      },
      {
        sessionEvents: {
          scopeType: "session",
          scopeId: "session-1",
          eventType: "session_group_visibility_updated",
          payload: { sessionGroupId: "group-1", ownerUserId: "owner-1", removed: true },
        },
      },
      {
        sessionEvents: {
          scopeType: "session",
          scopeId: "session-1",
          eventType: "session_output",
          payload: { sessionGroupId: "group-1" },
        },
      },
    ];
    const iterator = {
      async next() {
        const value = events.shift();
        return value ? { value, done: false } : { value: undefined, done: true };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    } as AsyncIterableIterator<(typeof events)[number]>;
    vi.mocked(pubsub.asyncIterator).mockReturnValueOnce(iterator);
    vi.mocked(prisma.sessionGroup.findFirst)
      .mockResolvedValueOnce({ visibility: "public", ownerUserId: "owner-1" })
      .mockResolvedValueOnce({ visibility: "private", ownerUserId: "owner-1" });

    const filtered = await eventSubscriptions.sessionEvents.subscribe(
      {},
      { sessionId: "session-1", organizationId: "org-1" },
      scopedCtx,
    );

    await expect(filtered.next()).resolves.toEqual({
      value: expect.objectContaining({
        sessionEvents: expect.objectContaining({ eventType: "session_started" }),
      }),
      done: false,
    });
    await expect(filtered.next()).resolves.toEqual({
      value: expect.objectContaining({
        sessionEvents: expect.objectContaining({ eventType: "session_group_visibility_updated" }),
      }),
      done: false,
    });
    await expect(filtered.next()).resolves.toEqual({ value: undefined, done: true });
    expect(prisma.sessionGroup.findFirst).toHaveBeenCalledTimes(2);
  });

  it("filters org event subscriptions for hidden private channel events", async () => {
    const events = [
      {
        orgEvents: {
          scopeType: "channel",
          scopeId: "channel-1",
          eventType: "channel_created" as const,
          payload: {
            channel: {
              id: "channel-1",
              visibility: "private",
              ownerId: "owner-1",
              members: [{ user: { id: "owner-1" } }],
            },
          },
        },
      },
    ];
    const iterator = {
      async next() {
        const value = events.shift();
        return value ? { value, done: false } : { value: undefined, done: true };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    } as AsyncIterableIterator<(typeof events)[number]>;
    vi.mocked(pubsub.asyncIterator).mockReturnValueOnce(iterator);
    vi.mocked(prisma.channel.findFirst).mockResolvedValueOnce(null);

    const filtered = eventSubscriptions.orgEvents.subscribe({}, { organizationId: "org-1" }, ctx);

    await expect(filtered.next()).resolves.toEqual({ value: undefined, done: true });
  });
});
