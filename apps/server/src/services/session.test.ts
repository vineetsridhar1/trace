import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
}));

vi.mock("./inbox.js", () => ({
  inboxService: {
    resolveBySource: vi.fn().mockResolvedValue(undefined),
    createItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: {
    send: vi.fn().mockReturnValue("delivered"),
    createRuntime: vi.fn(),
    destroyRuntime: vi.fn().mockResolvedValue(undefined),
    transitionRuntime: vi.fn().mockResolvedValue("delivered"),
    bindSession: vi.fn(),
    getRuntime: vi.fn().mockReturnValue(null),
    getDefaultRuntime: vi.fn(),
    getRuntimeForSession: vi.fn().mockReturnValue(null),
    getRuntimeForRepo: vi.fn(),
    listRuntimes: vi.fn().mockReturnValue([]),
    getRuntimeDiagnostics: vi.fn().mockReturnValue({}),
    listBranches: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../lib/terminal-relay.js", () => ({
  terminalRelay: {
    destroyAllForSession: vi.fn(),
  },
}));

vi.mock("../lib/runtime-debug.js", () => ({
  runtimeDebug: vi.fn(),
}));

vi.mock("@trace/shared", async () => {
  const actual = await vi.importActual<typeof import("@trace/shared")>("@trace/shared");
  return {
    ...actual,
    getDefaultModel: vi.fn().mockReturnValue("claude-sonnet-4-20250514"),
    isSupportedModel: vi.fn().mockReturnValue(true),
    hasQuestionBlock: vi.fn().mockReturnValue(false),
    hasPlanBlock: vi.fn().mockReturnValue(false),
  };
});

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { inboxService } from "./inbox.js";
import { sessionRouter } from "../lib/session-router.js";
import { terminalRelay } from "../lib/terminal-relay.js";
import { hasQuestionBlock, hasPlanBlock } from "@trace/shared";
import { SessionService, isFullyUnloadedSessionStatus } from "./session.js";

const prismaMock = prisma as any;
const eventServiceMock = eventService as any;
const inboxServiceMock = inboxService as any;
const sessionRouterMock = sessionRouter as any;
const terminalRelayMock = terminalRelay as any;

const SESSION_INCLUDE = {
  createdBy: true,
  repo: true,
  channel: true,
  parentSession: true,
  childSessions: true,
};

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    name: "Test Session",
    status: "pending",
    tool: "claude_code",
    model: "claude-sonnet-4-20250514",
    hosting: "cloud",
    organizationId: "org-1",
    createdById: "user-1",
    repoId: null,
    branch: null,
    channelId: null,
    parentSessionId: null,
    workdir: null,
    toolSessionId: null,
    toolChangedAt: null,
    pendingRun: null,
    worktreeDeleted: false,
    prUrl: null,
    connection: { state: "connected", retryCount: 0, canRetry: true, canMove: true },
    createdBy: { id: "user-1", name: "Test User" },
    repo: null,
    channel: null,
    parentSession: null,
    childSessions: [],
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

describe("SessionService", () => {
  let service: SessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SessionService();
    // Restore default mock implementations after clearAllMocks
    eventServiceMock.create.mockResolvedValue({ id: "event-1" });
    inboxServiceMock.resolveBySource.mockResolvedValue(undefined);
    inboxServiceMock.createItem.mockResolvedValue(undefined);
    sessionRouterMock.send.mockReturnValue("delivered");
    sessionRouterMock.transitionRuntime.mockResolvedValue("delivered");
    sessionRouterMock.getRuntimeForSession.mockReturnValue(null);
    sessionRouterMock.getRuntime.mockReturnValue(null);
    sessionRouterMock.destroyRuntime.mockResolvedValue(undefined);
    vi.mocked(hasQuestionBlock).mockReturnValue(false);
    vi.mocked(hasPlanBlock).mockReturnValue(false);
  });

  describe("isFullyUnloadedSessionStatus", () => {
    it("returns true for failed and merged", () => {
      expect(isFullyUnloadedSessionStatus("failed")).toBe(true);
      expect(isFullyUnloadedSessionStatus("merged")).toBe(true);
    });

    it("returns false for active, pending, completed, needs_input, creating, paused", () => {
      for (const status of ["active", "pending", "completed", "needs_input", "creating", "paused"]) {
        expect(isFullyUnloadedSessionStatus(status as any)).toBe(false);
      }
    });
  });

  describe("list", () => {
    it("lists sessions for an organization", async () => {
      const sessions = [makeSession()];
      prismaMock.session.findMany.mockResolvedValueOnce(sessions);

      const result = await service.list("org-1");

      expect(result).toEqual(sessions);
      expect(prismaMock.session.findMany).toHaveBeenCalledWith({
        where: { organizationId: "org-1" },
        orderBy: { updatedAt: "desc" },
        include: SESSION_INCLUDE,
      });
    });

    it("applies filters", async () => {
      prismaMock.session.findMany.mockResolvedValueOnce([]);
      await service.list("org-1", { status: "active", tool: "claude_code", repoId: "repo-1", channelId: "ch-1" });

      expect(prismaMock.session.findMany).toHaveBeenCalledWith({
        where: { organizationId: "org-1", status: "active", tool: "claude_code", repoId: "repo-1", channelId: "ch-1" },
        orderBy: { updatedAt: "desc" },
        include: SESSION_INCLUDE,
      });
    });
  });

  describe("get", () => {
    it("returns session by id", async () => {
      const session = makeSession();
      prismaMock.session.findUnique.mockResolvedValueOnce(session);
      const result = await service.get("session-1");
      expect(result).toEqual(session);
    });

    it("returns null for non-existent session", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(null);
      expect(await service.get("missing")).toBeNull();
    });
  });

  describe("listByUser", () => {
    it("lists sessions filtered by user", async () => {
      prismaMock.session.findMany.mockResolvedValueOnce([]);
      await service.listByUser("org-1", "user-1", "active");
      expect(prismaMock.session.findMany).toHaveBeenCalledWith({
        where: { organizationId: "org-1", createdById: "user-1", status: "active" },
        orderBy: { updatedAt: "desc" },
        include: SESSION_INCLUDE,
      });
    });
  });

  describe("start", () => {
    it("creates a session and emits session_started event", async () => {
      const session = makeSession({ status: "creating" });
      prismaMock.session.create.mockResolvedValueOnce(session);

      const result = await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        prompt: "Build a feature",
      } as any);

      expect(result).toEqual(session);
      expect(prismaMock.session.create).toHaveBeenCalledTimes(1);
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_started",
          payload: expect.objectContaining({ prompt: "Build a feature" }),
        }),
        expect.anything(), // tx
      );
    });

    it("truncates long prompts for session name", async () => {
      prismaMock.session.create.mockResolvedValueOnce(makeSession());
      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        prompt: "A".repeat(100),
      } as any);
      expect(prismaMock.session.create.mock.calls[0][0].data.name.length).toBeLessThanOrEqual(80);
    });

    it("reuses parent session workdir", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({ workdir: "/parent/dir" });
      prismaMock.session.create.mockResolvedValueOnce(makeSession());
      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        parentSessionId: "parent-1",
      } as any);
      expect(prismaMock.session.create.mock.calls[0][0].data.workdir).toBe("/parent/dir");
    });

    it("resolves inbox when creating child session", async () => {
      prismaMock.session.create.mockResolvedValueOnce(makeSession());
      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        parentSessionId: "parent-1",
      } as any);
      expect(inboxServiceMock.resolveBySource).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: "parent-1", resolution: "Approved (new session)" }),
      );
    });

    it("binds session to runtime when runtimeInstanceId provided", async () => {
      const session = makeSession({ id: "new-session" });
      prismaMock.session.create.mockResolvedValueOnce(session);
      sessionRouterMock.getRuntime.mockReturnValueOnce({ hostingMode: "local", label: "My Runtime" });

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        runtimeInstanceId: "rt-1",
      } as any);

      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith("new-session", "rt-1");
    });

    it("creates workspace for cloud sessions", async () => {
      const session = makeSession({
        hosting: "cloud",
        repo: { id: "repo-1", name: "test", remoteUrl: "https://g.com/t", defaultBranch: "main" },
      });
      prismaMock.session.create.mockResolvedValueOnce(session);

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        repoId: "repo-1",
      } as any);

      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: session.id }),
      );
    });
  });

  describe("run", () => {
    it("queues as pendingRun when session is creating", async () => {
      const session = makeSession({ status: "creating" });
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(session);
      const updated = makeSession({ status: "creating", pendingRun: { type: "run" } });
      prismaMock.session.update.mockResolvedValueOnce(updated);

      const result = await service.run("session-1", "do stuff");

      expect(result).toEqual(updated);
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pendingRun: expect.objectContaining({ type: "run" }) }),
        }),
      );
    });

    it("returns session without action for fully unloaded sessions", async () => {
      const session = makeSession({ status: "failed" });
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(session);
      const result = await service.run("session-1", "do stuff");
      expect(result).toEqual(session);
      expect(sessionRouterMock.send).not.toHaveBeenCalled();
    });

    it("throws when worktree is deleted", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(
        makeSession({ status: "pending", worktreeDeleted: true }),
      );
      await expect(service.run("session-1", "do stuff")).rejects.toThrow("worktree has been deleted");
    });

    it("sends run command and updates to active on delivery", async () => {
      const session = makeSession({ status: "pending" });
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(session);
      // buildConversationContext — event.findMany returns empty
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      // event.findFirst for original prompt
      prismaMock.event.findFirst.mockResolvedValueOnce({ payload: { prompt: "initial" } });
      prismaMock.session.update.mockResolvedValueOnce(makeSession({ status: "active" }));

      const result = await service.run("session-1");

      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({ type: "run" }),
      );
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "active" }) }),
      );
      expect(result.status).toBe("active");
    });

    it("stores pending command when delivery fails", async () => {
      const session = makeSession({ status: "pending" });
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(session);
      prismaMock.event.findFirst.mockResolvedValueOnce({ payload: { prompt: "initial" } });
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      sessionRouterMock.send.mockReturnValueOnce("no_runtime");
      // storePendingCommand
      prismaMock.session.update.mockResolvedValue({});
      // persistConnectionFailure
      prismaMock.session.findUnique.mockResolvedValueOnce({ status: "pending", connection: null });
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(session);

      await service.run("session-1", "do stuff");

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pendingRun: expect.objectContaining({ type: "run" }) }),
        }),
      );
    });
  });

  describe("pause", () => {
    it("transitions to paused", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        hosting: "cloud",
        organizationId: "org-1",
        status: "active",
      });
      const updated = makeSession({ status: "paused" });
      prismaMock.session.update.mockResolvedValueOnce(updated);

      const result = await service.pause("session-1", "user", "user-1");

      expect(result).toEqual(updated);
      expect(sessionRouterMock.transitionRuntime).toHaveBeenCalledWith("session-1", "cloud", "pause");
    });

    it("skips transition for fully unloaded sessions", async () => {
      prismaMock.session.findUniqueOrThrow
        .mockResolvedValueOnce({ hosting: "cloud", organizationId: "org-1", status: "failed" })
        .mockResolvedValueOnce(makeSession({ status: "failed" }));

      await service.pause("session-1");

      expect(sessionRouterMock.transitionRuntime).not.toHaveBeenCalled();
    });
  });

  describe("resume", () => {
    it("transitions to active", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        hosting: "local",
        organizationId: "org-1",
        status: "paused",
      });
      prismaMock.session.update.mockResolvedValueOnce(makeSession({ status: "active" }));

      const result = await service.resume("session-1", "user", "user-1");
      expect(result.status).toBe("active");
    });
  });

  describe("terminate", () => {
    it("resolves inbox and terminates", async () => {
      // terminateWithStatus: findUniqueOrThrow for inbox lookup
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({ organizationId: "org-1" });
      // transition: findUniqueOrThrow for status check
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        hosting: "cloud",
        organizationId: "org-1",
        status: "active",
      });
      prismaMock.session.update.mockResolvedValueOnce(makeSession({ status: "completed" }));

      const result = await service.terminate("session-1", "user", "user-1");

      expect(inboxServiceMock.resolveBySource).toHaveBeenCalledWith(
        expect.objectContaining({ resolution: "Session stopped" }),
      );
      expect(result.status).toBe("completed");
    });
  });

  describe("dismiss", () => {
    it("resolves inbox with dismiss message", async () => {
      prismaMock.session.findUniqueOrThrow
        .mockResolvedValueOnce({ organizationId: "org-1" })
        .mockResolvedValueOnce({ hosting: "cloud", organizationId: "org-1", status: "active" });
      prismaMock.session.update.mockResolvedValueOnce(makeSession({ status: "completed" }));

      await service.dismiss("session-1", "user", "user-1");

      expect(inboxServiceMock.resolveBySource).toHaveBeenCalledWith(
        expect.objectContaining({ resolution: "Session dismissed" }),
      );
    });
  });

  describe("delete", () => {
    it("deletes session and cleans up resources", async () => {
      const session = makeSession();
      prismaMock.session.findUnique.mockResolvedValueOnce(session);
      // transaction mocks
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.sessionProject.deleteMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.ticketLink.deleteMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.session.delete.mockResolvedValueOnce(session);

      const result = await service.delete("session-1", "user", "user-1");

      expect(result).toEqual(session);
      expect(terminalRelayMock.destroyAllForSession).toHaveBeenCalledWith("session-1");
      expect(sessionRouterMock.destroyRuntime).toHaveBeenCalledWith("session-1", session);
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "session_deleted" }),
      );
    });

    it("throws when session not found", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(null);
      await expect(service.delete("missing")).rejects.toThrow("Session not found or already deleted");
    });

    it("orphans child sessions during deletion", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(makeSession());
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 2 });
      prismaMock.sessionProject.deleteMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.ticketLink.deleteMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.session.delete.mockResolvedValueOnce({});

      await service.delete("session-1");

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { parentSessionId: "session-1" },
        data: { parentSessionId: null },
      });
    });
  });

  describe("updateConfig", () => {
    it("updates tool and resets model", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce({
        id: "session-1",
        tool: "claude_code",
        model: "claude-sonnet-4-20250514",
      });
      prismaMock.session.update.mockResolvedValueOnce(makeSession({ tool: "cursor" }));

      await service.updateConfig("session-1", "org-1", { tool: "cursor" as any }, "user", "user-1");

      const data = prismaMock.session.update.mock.calls[0][0].data;
      expect(data.tool).toBe("cursor");
      expect(data.toolChangedAt).toBeInstanceOf(Date);
      expect(data.toolSessionId).toBeNull();
    });

    it("updates model without changing tool", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce({
        id: "session-1",
        tool: "claude_code",
        model: "claude-sonnet-4-20250514",
      });
      prismaMock.session.update.mockResolvedValueOnce(makeSession());

      await service.updateConfig("session-1", "org-1", { model: "claude-opus-4-20250514" }, "user", "user-1");

      const data = prismaMock.session.update.mock.calls[0][0].data;
      expect(data.model).toBe("claude-opus-4-20250514");
      expect(data.tool).toBeUndefined();
    });

    it("emits config_changed event", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce({
        id: "session-1",
        tool: "claude_code",
        model: "claude-sonnet-4-20250514",
      });
      prismaMock.session.update.mockResolvedValueOnce(makeSession());

      await service.updateConfig("session-1", "org-1", { model: "claude-opus-4-20250514" }, "user", "user-1");

      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_output",
          payload: expect.objectContaining({ type: "config_changed" }),
        }),
      );
    });
  });

  describe("recordOutput", () => {
    it("creates session_output event", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({ organizationId: "org-1", status: "active" });
      await service.recordOutput("session-1", { type: "result", text: "done" });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "session_output", scopeId: "session-1" }),
      );
    });

    it("does nothing when session not found", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(null);
      await service.recordOutput("missing", { type: "result" });
      expect(eventServiceMock.create).not.toHaveBeenCalled();
    });

    it("extracts and strips session title from assistant output", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({ organizationId: "org-1", status: "active" });
      // updateName call
      prismaMock.session.update.mockResolvedValueOnce({ organizationId: "org-1" });

      const data = {
        type: "assistant",
        message: {
          content: [{ type: "text", text: "<session-title>My Title</session-title>\nContent here" }],
        },
      };

      await service.recordOutput("session-1", data);

      // Title stripped from text
      expect((data.message.content[0] as any).text).toBe("Content here");
      // Session name updated
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: "My Title" } }),
      );
    });

    it("transitions to needs_input on question block", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({ organizationId: "org-1", status: "active" });
      vi.mocked(hasQuestionBlock).mockReturnValueOnce(true);
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({ createdById: "user-1", name: "Test" });

      await service.recordOutput("session-1", {
        type: "assistant",
        message: { content: [{ type: "question", questions: [{ question: "?" }] }] },
      });

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { id: "session-1", status: "active" },
        data: { status: "needs_input" },
      });
    });

    it("transitions to needs_input on plan block", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({ organizationId: "org-1", status: "active" });
      vi.mocked(hasPlanBlock).mockReturnValueOnce(true);
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({ createdById: "user-1", name: "Test" });

      await service.recordOutput("session-1", {
        type: "assistant",
        message: { content: [{ type: "plan", content: "A plan" }] },
      });

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { id: "session-1", status: "active" },
        data: { status: "needs_input" },
      });
    });
  });

  describe("updateName", () => {
    it("updates name and emits title_generated event", async () => {
      prismaMock.session.update.mockResolvedValueOnce({ organizationId: "org-1" });
      await service.updateName("session-1", "New Title");
      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: { name: "New Title" },
        select: { organizationId: true },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ payload: { type: "title_generated", name: "New Title" } }),
      );
    });
  });

  describe("complete", () => {
    it("transitions active session to completed", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({ status: "active" });
      prismaMock.event.findFirst.mockResolvedValueOnce(null);
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.update.mockResolvedValueOnce({
        organizationId: "org-1",
        createdById: "user-1",
        name: "Test",
      });

      await service.complete("session-1");

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "completed" } }),
      );
    });

    it("does nothing when session is not active", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({ status: "paused" });
      await service.complete("session-1");
      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });

    it("does nothing when session not found", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(null);
      await service.complete("missing");
      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });

    it("transitions to needs_input when plan block exists", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({ status: "active" });
      prismaMock.event.findFirst.mockResolvedValueOnce(null);
      prismaMock.event.findMany.mockResolvedValueOnce([{ payload: { type: "assistant" } }]);
      vi.mocked(hasPlanBlock).mockReturnValueOnce(true);
      prismaMock.session.update.mockResolvedValueOnce({
        organizationId: "org-1",
        createdById: "user-1",
        name: "Test",
      });

      await service.complete("session-1");

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "needs_input" } }),
      );
    });
  });

  describe("sendMessage", () => {
    it("sends message and marks as active", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        organizationId: "org-1",
        status: "needs_input",
        tool: "claude_code",
        model: "claude-sonnet-4-20250514",
        toolChangedAt: null,
        workdir: "/workspace",
        toolSessionId: "tool-1",
        repoId: null,
        connection: null,
        worktreeDeleted: false,
      });
      prismaMock.session.update.mockResolvedValueOnce({});

      await service.sendMessage("session-1", "Do this", "user", "user-1");

      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({ type: "send", prompt: "Do this" }),
      );
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "active" }) }),
      );
    });

    it("throws for fully unloaded sessions", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        status: "failed",
        organizationId: "org-1",
        worktreeDeleted: false,
      });
      await expect(service.sendMessage("session-1", "hi", "user", "user-1")).rejects.toThrow(
        "Cannot send follow-up messages to a failed session",
      );
    });

    it("throws when worktree is deleted", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        status: "pending",
        worktreeDeleted: true,
        organizationId: "org-1",
      });
      await expect(service.sendMessage("session-1", "hi", "user", "user-1")).rejects.toThrow(
        "Cannot send messages: session worktree has been deleted",
      );
    });

    it("records event with deliveryFailed when delivery fails", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        organizationId: "org-1",
        status: "pending",
        tool: "claude_code",
        model: null,
        toolChangedAt: null,
        workdir: null,
        toolSessionId: null,
        repoId: null,
        connection: null,
        worktreeDeleted: false,
      });
      sessionRouterMock.send.mockReturnValueOnce("no_runtime");
      // persistConnectionFailure
      prismaMock.session.findUnique.mockResolvedValueOnce({ status: "pending", connection: null });
      prismaMock.session.update.mockResolvedValue({});

      await service.sendMessage("session-1", "hello", "user", "user-1");

      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "message_sent",
          payload: { text: "hello", deliveryFailed: true },
        }),
      );
    });

    it("prepends conversation context when tool was switched", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        organizationId: "org-1",
        status: "pending",
        tool: "claude_code",
        model: null,
        toolChangedAt: new Date("2024-01-01"),
        workdir: null,
        toolSessionId: null,
        repoId: null,
        connection: null,
        worktreeDeleted: false,
      });
      // No message since tool switch
      prismaMock.event.findFirst.mockResolvedValueOnce(null);
      // buildConversationContext events
      prismaMock.event.findMany.mockResolvedValueOnce([
        { eventType: "session_started", payload: { prompt: "initial prompt" } },
      ]);
      prismaMock.session.update.mockResolvedValueOnce({});

      await service.sendMessage("session-1", "continue", "user", "user-1");

      const prompt = sessionRouterMock.send.mock.calls[0][1].prompt;
      expect(prompt).toContain("conversation-history");
      expect(prompt).toContain("continue");
    });
  });

  describe("workspaceReady", () => {
    it("updates session to pending with workdir", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({ pendingRun: null });
      prismaMock.session.update.mockResolvedValueOnce(makeSession({ status: "pending", workdir: "/workspace" }));

      await service.workspaceReady("session-1", "/workspace");

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "pending", workdir: "/workspace" }),
        }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: { type: "workspace_ready", workdir: "/workspace" },
        }),
      );
    });

    it("replays pending run after workspace ready", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        pendingRun: { type: "run", prompt: "do stuff", interactionMode: null },
      });
      prismaMock.session.update.mockResolvedValue(
        makeSession({ status: "pending", workdir: "/workspace", organizationId: "org-1" }),
      );
      // deliverPendingCommand: findUniqueOrThrow
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        organizationId: "org-1",
        tool: "claude_code",
        model: null,
        workdir: "/workspace",
        toolSessionId: null,
        repoId: null,
        connection: null,
      });
      prismaMock.event.findMany.mockResolvedValueOnce([]);

      await service.workspaceReady("session-1", "/workspace");

      expect(sessionRouterMock.send).toHaveBeenCalled();
    });
  });

  describe("workspaceFailed", () => {
    it("marks session as failed", async () => {
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({ status: "failed", organizationId: "org-1" }),
      );

      await service.workspaceFailed("session-1", "VM boot timeout");

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "failed", worktreeDeleted: true }),
        }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_terminated",
          payload: expect.objectContaining({ reason: "workspace_failed", error: "VM boot timeout" }),
        }),
      );
    });
  });

  describe("markConnectionLost", () => {
    it("updates connection to disconnected", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        organizationId: "org-1",
        status: "active",
        connection: { state: "connected", retryCount: 0, canRetry: true, canMove: true },
      });
      prismaMock.session.update.mockResolvedValueOnce({});

      await service.markConnectionLost("session-1", "Bridge down", "rt-1");

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            connection: expect.objectContaining({ state: "disconnected" }),
          }),
        }),
      );
    });

    it("no-ops for session not found", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(null);
      await service.markConnectionLost("missing", "reason");
      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });

    it("no-ops for fully unloaded sessions", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        organizationId: "org-1",
        status: "failed",
        connection: null,
      });
      await service.markConnectionLost("session-1", "reason");
      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });
  });

  describe("markConnectionRestored", () => {
    it("updates connection to connected", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        organizationId: "org-1",
        connection: { state: "disconnected", retryCount: 1, canRetry: true, canMove: true },
      });
      sessionRouterMock.getRuntime.mockReturnValueOnce({ label: "My Runtime" });
      prismaMock.session.update.mockResolvedValueOnce({});

      await service.markConnectionRestored("session-1", "rt-1");

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            connection: expect.objectContaining({ state: "connected", runtimeInstanceId: "rt-1" }),
          }),
        }),
      );
    });

    it("no-ops when session not found", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(null);
      await service.markConnectionRestored("missing", "rt-1");
      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });
  });

  describe("storeToolSessionId", () => {
    it("persists tool session ID", async () => {
      prismaMock.session.update.mockResolvedValueOnce({});
      await service.storeToolSessionId("session-1", "tool-abc");
      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: { toolSessionId: "tool-abc" },
      });
    });
  });

  describe("markPrOpened", () => {
    it("sets prUrl and emits event", async () => {
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });
      await service.markPrOpened({ sessionId: "s1", prUrl: "https://pr/1", organizationId: "org-1" });

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { id: "s1", status: { not: "merged" } },
        data: { prUrl: "https://pr/1" },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "session_pr_opened" }),
      );
    });

    it("no-ops when already merged (count=0)", async () => {
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 0 });
      await service.markPrOpened({ sessionId: "s1", prUrl: "url", organizationId: "org-1" });
      expect(eventServiceMock.create).not.toHaveBeenCalled();
    });
  });

  describe("markPrClosed", () => {
    it("clears prUrl and emits event", async () => {
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });
      await service.markPrClosed({ sessionId: "s1", organizationId: "org-1" });

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { id: "s1", status: { not: "merged" } },
        data: { prUrl: null },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "session_pr_closed" }),
      );
    });

    it("no-ops when already merged", async () => {
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 0 });
      await service.markPrClosed({ sessionId: "s1", organizationId: "org-1" });
      expect(eventServiceMock.create).not.toHaveBeenCalled();
    });
  });

  describe("markPrMerged", () => {
    it("transitions to merged, emits event, and unloads", async () => {
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });
      // fullyUnloadSession: findUnique
      prismaMock.session.findUnique.mockResolvedValueOnce({
        hosting: "cloud",
        workdir: "/ws",
        repoId: "repo-1",
        connection: null,
      });
      prismaMock.session.update.mockResolvedValueOnce({});

      await service.markPrMerged({ sessionId: "s1", prUrl: "https://pr/1", organizationId: "org-1" });

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { id: "s1", status: { not: "merged" } },
        data: { status: "merged", prUrl: "https://pr/1" },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "session_pr_merged" }),
      );
      expect(terminalRelayMock.destroyAllForSession).toHaveBeenCalledWith("s1");
    });

    it("still unloads if already merged (count=0)", async () => {
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 0 });
      prismaMock.session.findUnique
        .mockResolvedValueOnce({ status: "merged" })
        .mockResolvedValueOnce({ hosting: "local", workdir: null, repoId: null, connection: null });
      prismaMock.session.update.mockResolvedValueOnce({});

      await service.markPrMerged({ sessionId: "s1", prUrl: "url", organizationId: "org-1" });

      expect(terminalRelayMock.destroyAllForSession).toHaveBeenCalled();
    });
  });

  describe("restoreSessionsForRuntime", () => {
    it("binds sessions and restores disconnected ones", async () => {
      sessionRouterMock.getRuntime.mockReturnValueOnce({ label: "Local" });
      prismaMock.session.findMany.mockResolvedValueOnce([
        { id: "s1", connection: { state: "disconnected", retryCount: 0, canRetry: true, canMove: true } },
        { id: "s2", connection: { state: "connected", retryCount: 0, canRetry: true, canMove: true } },
      ]);
      // markConnectionRestored for s1
      prismaMock.session.findUnique.mockResolvedValueOnce({
        organizationId: "org-1",
        connection: { state: "disconnected", retryCount: 0, canRetry: true, canMove: true },
      });
      sessionRouterMock.getRuntime.mockReturnValueOnce({ label: "Local" });
      prismaMock.session.update.mockResolvedValueOnce({});

      await service.restoreSessionsForRuntime("rt-1");

      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith("s1", "rt-1");
      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith("s2", "rt-1");
    });

    it("no-ops when runtime not found", async () => {
      sessionRouterMock.getRuntime.mockReturnValueOnce(null);
      await service.restoreSessionsForRuntime("missing");
      expect(prismaMock.session.findMany).not.toHaveBeenCalled();
    });
  });

  describe("retryConnection", () => {
    it("returns session unchanged for fully unloaded sessions", async () => {
      const session = makeSession({ status: "failed" });
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(session);

      const result = await service.retryConnection("session-1", "org-1", "user", "user-1");

      expect(result).toEqual(session);
      expect(sessionRouterMock.bindSession).not.toHaveBeenCalled();
    });

    it("emits recovery_failed when no runtime is available", async () => {
      const session = makeSession({
        status: "pending",
        connection: { state: "disconnected", retryCount: 1, canRetry: true, canMove: true },
      });
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(session);
      sessionRouterMock.getDefaultRuntime.mockReturnValueOnce(null);
      prismaMock.session.update.mockResolvedValueOnce({});
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(session);

      await service.retryConnection("session-1", "org-1", "user", "user-1");

      // recovery_requested event
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ type: "recovery_requested" }),
        }),
      );
      // recovery_failed event
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ type: "recovery_failed", reason: "no_runtime" }),
        }),
      );
    });

    it("restores connection for non-repo session when runtime is found", async () => {
      const session = makeSession({
        status: "pending",
        connection: { state: "disconnected", retryCount: 0, canRetry: true, canMove: true },
      });
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(session);
      const runtime = { id: "rt-1", label: "Local Runtime" };
      sessionRouterMock.getDefaultRuntime.mockReturnValueOnce(runtime);
      prismaMock.session.update.mockResolvedValueOnce(makeSession({ status: "pending" }));
      // Check for pending command
      prismaMock.session.findUnique.mockResolvedValueOnce({ pendingRun: null });

      const result = await service.retryConnection("session-1", "org-1", "user", "user-1");

      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith("session-1", "rt-1");
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "pending",
            connection: expect.objectContaining({ state: "connected", runtimeInstanceId: "rt-1" }),
          }),
        }),
      );
      expect(result).toBeDefined();
    });

    it("re-runs workspace prep for repo sessions and marks as creating", async () => {
      const session = makeSession({
        status: "pending",
        repo: { id: "repo-1", name: "test", remoteUrl: "https://g.com/t", defaultBranch: "main" },
        connection: { state: "disconnected", retryCount: 0, canRetry: true, canMove: true },
      });
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(session);
      const runtime = { id: "rt-1", label: "Local" };
      sessionRouterMock.getDefaultRuntime.mockReturnValueOnce(runtime);
      prismaMock.session.update.mockResolvedValueOnce(makeSession({ status: "creating" }));

      await service.retryConnection("session-1", "org-1", "user", "user-1");

      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({ type: "prepare" }),
      );
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "creating" }),
        }),
      );
    });

    it("replays pending command after restoring non-repo session", async () => {
      const session = makeSession({
        status: "pending",
        connection: { state: "disconnected", retryCount: 0, canRetry: true, canMove: true },
      });
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(session);
      const runtime = { id: "rt-1", label: "Local" };
      sessionRouterMock.getDefaultRuntime.mockReturnValueOnce(runtime);
      prismaMock.session.update.mockResolvedValue(makeSession({ status: "pending" }));
      // findUnique for pending check
      prismaMock.session.findUnique.mockResolvedValueOnce({
        pendingRun: { type: "run", prompt: "queued", interactionMode: null },
      });
      // deliverPendingCommand internals
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        organizationId: "org-1",
        tool: "claude_code",
        model: null,
        workdir: null,
        toolSessionId: null,
        repoId: null,
        connection: null,
      });
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(makeSession());

      await service.retryConnection("session-1", "org-1", "user", "user-1");

      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({ type: "run" }),
      );
    });
  });

  describe("moveToRuntime", () => {
    const makeOpenWs = () => ({ readyState: 1, OPEN: 1 });

    it("creates a child session on the target runtime", async () => {
      const session = makeSession({
        status: "active",
        organizationId: "org-1",
        projects: [],
      });
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(session);
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([]);
      // buildConversationContext
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      // child session create
      const childSession = makeSession({ id: "child-1", status: "pending", parentSessionId: "session-1" });
      prismaMock.session.create.mockResolvedValueOnce(childSession);
      // old session update (mark as disconnected)
      prismaMock.session.update.mockResolvedValue({});

      const targetRuntime = {
        id: "rt-2",
        label: "Target",
        hostingMode: "local",
        ws: makeOpenWs(),
        supportedTools: ["claude_code"],
      };
      sessionRouterMock.getRuntime.mockReturnValueOnce(targetRuntime);

      // deliverPendingCommand for non-repo
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        organizationId: "org-1",
        tool: "claude_code",
        model: null,
        workdir: null,
        toolSessionId: null,
        repoId: null,
        connection: null,
      });
      prismaMock.event.findMany.mockResolvedValueOnce([]);

      const result = await service.moveToRuntime("session-1", "rt-2", "org-1", "user", "user-1");

      expect(result).toEqual(childSession);
      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith("child-1", "rt-2");
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_started",
          scopeId: "child-1",
        }),
      );
    });

    it("throws for fully unloaded sessions", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({ status: "failed", projects: [] }),
      );
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([]);

      await expect(
        service.moveToRuntime("session-1", "rt-2", "org-1", "user", "user-1"),
      ).rejects.toThrow("Cannot move a failed session");
    });

    it("throws when target runtime is unavailable", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({ status: "active", projects: [] }),
      );
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([]);
      sessionRouterMock.getRuntime.mockReturnValueOnce(null);

      await expect(
        service.moveToRuntime("session-1", "rt-2", "org-1", "user", "user-1"),
      ).rejects.toThrow("Selected runtime is not available");
    });

    it("throws when target runtime does not support the tool", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({ status: "active", projects: [] }),
      );
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([]);
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "rt-2",
        label: "Target",
        hostingMode: "local",
        ws: makeOpenWs(),
        supportedTools: ["cursor"],
      });

      await expect(
        service.moveToRuntime("session-1", "rt-2", "org-1", "user", "user-1"),
      ).rejects.toThrow("Selected runtime does not support this tool");
    });

    it("copies ticket links to child session", async () => {
      const session = makeSession({ status: "active", organizationId: "org-1", projects: [] });
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(session);
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([
        { ticketId: "t1", entityType: "session", entityId: "session-1" },
      ]);
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      const childSession = makeSession({ id: "child-1", status: "pending" });
      prismaMock.session.create.mockResolvedValueOnce(childSession);
      prismaMock.ticketLink.createMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.session.update.mockResolvedValue({});

      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "rt-2",
        label: "Target",
        hostingMode: "local",
        ws: makeOpenWs(),
        supportedTools: ["claude_code"],
      });

      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        organizationId: "org-1",
        tool: "claude_code",
        model: null,
        workdir: null,
        toolSessionId: null,
        repoId: null,
        connection: null,
      });
      prismaMock.event.findMany.mockResolvedValueOnce([]);

      await service.moveToRuntime("session-1", "rt-2", "org-1", "user", "user-1");

      expect(prismaMock.ticketLink.createMany).toHaveBeenCalledWith({
        data: [{ ticketId: "t1", entityType: "session", entityId: "child-1" }],
        skipDuplicates: true,
      });
    });

    it("emits rehome event on old session", async () => {
      const session = makeSession({ status: "active", organizationId: "org-1", projects: [] });
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(session);
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([]);
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.create.mockResolvedValueOnce(makeSession({ id: "child-1" }));
      prismaMock.session.update.mockResolvedValue({});

      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "rt-2",
        label: "Target",
        hostingMode: "local",
        ws: makeOpenWs(),
        supportedTools: ["claude_code"],
      });

      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        organizationId: "org-1",
        tool: "claude_code",
        model: null,
        workdir: null,
        toolSessionId: null,
        repoId: null,
        connection: null,
      });
      prismaMock.event.findMany.mockResolvedValueOnce([]);

      await service.moveToRuntime("session-1", "rt-2", "org-1", "user", "user-1");

      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeId: "session-1",
          payload: expect.objectContaining({ type: "session_rehomed", newSessionId: "child-1" }),
        }),
      );
    });
  });

  describe("moveToCloud", () => {
    it("creates a child session with cloud hosting", async () => {
      const session = makeSession({ status: "active", organizationId: "org-1", projects: [] });
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(session);
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([]);
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      const childSession = makeSession({ id: "child-1", status: "creating", hosting: "cloud" });
      prismaMock.session.create.mockResolvedValueOnce(childSession);
      prismaMock.session.update.mockResolvedValue({});

      const result = await service.moveToCloud("session-1", "org-1", "user", "user-1");

      expect(result).toEqual(childSession);
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ hosting: "cloud", status: "creating" }),
        }),
      );
      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: "child-1", hosting: "cloud" }),
      );
    });

    it("throws for fully unloaded sessions", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({ status: "merged", projects: [] }),
      );
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([]);

      await expect(
        service.moveToCloud("session-1", "org-1", "user", "user-1"),
      ).rejects.toThrow("Cannot move a merged session");
    });

    it("emits rehome event on old session", async () => {
      const session = makeSession({ status: "active", organizationId: "org-1", projects: [] });
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(session);
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([]);
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.create.mockResolvedValueOnce(makeSession({ id: "child-1", hosting: "cloud" }));
      prismaMock.session.update.mockResolvedValue({});

      await service.moveToCloud("session-1", "org-1", "user", "user-1");

      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeId: "session-1",
          payload: expect.objectContaining({
            type: "session_rehomed",
            newSessionId: "child-1",
            runtimeInstanceId: null,
          }),
        }),
      );
    });
  });

  describe("listAvailableRuntimes", () => {
    it("delegates to listRuntimesForTool with session's tool", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce({ tool: "claude_code" });
      sessionRouterMock.listRuntimes.mockReturnValueOnce([]);

      const result = await service.listAvailableRuntimes("session-1", "org-1");

      expect(result).toEqual([]);
      expect(prismaMock.session.findFirstOrThrow).toHaveBeenCalledWith({
        where: { id: "session-1", organizationId: "org-1" },
        select: { tool: true },
      });
    });
  });

  describe("listBranches", () => {
    it("lists branches via session router", async () => {
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-1" });
      sessionRouterMock.getRuntimeForRepo.mockReturnValueOnce({ id: "rt-1" });
      sessionRouterMock.listBranches.mockResolvedValueOnce(["main", "feature"]);

      const result = await service.listBranches("repo-1", "org-1");
      expect(result).toEqual(["main", "feature"]);
    });

    it("throws when repo not found", async () => {
      prismaMock.repo.findFirst.mockResolvedValueOnce(null);
      await expect(service.listBranches("missing", "org-1")).rejects.toThrow("Repo not found");
    });

    it("throws when no runtime available", async () => {
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-1" });
      sessionRouterMock.getRuntimeForRepo.mockReturnValueOnce(null);
      await expect(service.listBranches("repo-1", "org-1")).rejects.toThrow("No connected runtime");
    });

    it("uses specified runtime instance ID", async () => {
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-1" });
      sessionRouterMock.listBranches.mockResolvedValueOnce(["main"]);
      await service.listBranches("repo-1", "org-1", "rt-custom");
      expect(sessionRouterMock.listBranches).toHaveBeenCalledWith("rt-custom", "repo-1");
    });
  });
});
