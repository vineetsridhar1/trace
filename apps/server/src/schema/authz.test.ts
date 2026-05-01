import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/pubsub.js", () => ({
  pubsub: {
    asyncIterator: vi.fn(() => "iterator"),
  },
  topics: {
    ticketEvents: (id: string) => `ticket:${id}:events`,
    sessionPorts: (id: string) => `session:${id}:ports`,
    sessionStatus: (id: string) => `session:${id}:status`,
    sessionEvents: (id: string) => `session:${id}:events`,
  },
}));

vi.mock("../services/access.js", () => ({
  assertScopeAccess: vi.fn(),
}));

vi.mock("../services/ticket.js", () => ({
  ticketService: {
    list: vi.fn(),
    get: vi.fn(),
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
  },
}));

vi.mock("../lib/db.js", () => ({
  prisma: {
    session: {
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

import { ticketQueries, ticketSubscriptions } from "./ticket.js";
import { sessionQueries, sessionSubscriptions } from "./session.js";
import { sessionMutations } from "./session.js";
import { channelGroupQueries } from "./channelGroup.js";
import { eventSubscriptions } from "./event.js";
import { inboxQueries } from "./inbox.js";
import { aiConversationQueries, aiConversationMutations } from "./ai-conversation.js";
import { assertScopeAccess } from "../services/access.js";
import { ticketService } from "../services/ticket.js";
import { sessionService } from "../services/session.js";
import { prisma } from "../lib/db.js";
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

    expect(assertScopeAccess).toHaveBeenNthCalledWith(1, "session", "session-1", "user-1", "org-1");
    expect(assertScopeAccess).toHaveBeenNthCalledWith(2, "session", "session-1", "user-1", "org-1");
    expect(assertScopeAccess).toHaveBeenNthCalledWith(3, "session", "session-1", "user-1", "org-1");
    expect(assertScopeAccess).toHaveBeenNthCalledWith(4, "session", "session-1", "user-1", "org-1");
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
});
