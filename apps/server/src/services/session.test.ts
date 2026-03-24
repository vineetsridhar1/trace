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
    unbindSession: vi.fn(),
    getRuntime: vi.fn().mockReturnValue(null),
    getRuntimeForSession: vi.fn().mockReturnValue(null),
    getRuntimeDiagnostics: vi.fn().mockReturnValue({}),
    listRuntimes: vi.fn().mockReturnValue([]),
    listBranches: vi.fn().mockResolvedValue([]),
    listFiles: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(""),
  },
}));

vi.mock("../lib/terminal-relay.js", () => ({
  terminalRelay: {
    destroyAllForSession: vi.fn(),
    destroyAllForSessionGroup: vi.fn(),
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
import { sessionRouter } from "../lib/session-router.js";
import { terminalRelay } from "../lib/terminal-relay.js";
import { SessionService, isFullyUnloadedSession } from "./session.js";

const prismaMock = prisma as any;
const eventServiceMock = eventService as any;
const sessionRouterMock = sessionRouter as any;
const terminalRelayMock = terminalRelay as any;

function makeSessionGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: "group-1",
    name: "Implement dashboard filters",
    organizationId: "org-1",
    channelId: "channel-1",
    repoId: "repo-1",
    branch: "main",
    workdir: null,
    connection: { state: "connected", retryCount: 0, canRetry: true, canMove: true },
    prUrl: null,
    worktreeDeleted: false,
    channel: { id: "channel-1", name: "Backend" },
    repo: {
      id: "repo-1",
      name: "trace",
      remoteUrl: "git@github.com:trace/trace.git",
      defaultBranch: "main",
    },
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    sessions: [],
    ...overrides,
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  const sessionGroup = makeSessionGroup();
  return {
    id: "session-1",
    name: "Implement dashboard filters",
    agentStatus: "active",
    sessionStatus: "not_started",
    tool: "claude_code",
    model: "claude-sonnet-4-20250514",
    hosting: "cloud",
    organizationId: "org-1",
    createdById: "user-1",
    repoId: "repo-1",
    branch: "main",
    channelId: "channel-1",
    sessionGroupId: sessionGroup.id,
    workdir: null,
    toolSessionId: null,
    toolChangedAt: null,
    pendingRun: null,
    worktreeDeleted: false,
    prUrl: null,
    connection: { state: "connected", retryCount: 0, canRetry: true, canMove: true },
    createdBy: { id: "user-1", name: "Test User", avatarUrl: null },
    repo: {
      id: "repo-1",
      name: "trace",
      remoteUrl: "git@github.com:trace/trace.git",
      defaultBranch: "main",
    },
    channel: { id: "channel-1", name: "Backend" },
    sessionGroup,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("SessionService", () => {
  let service: SessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SessionService();
    eventServiceMock.create.mockResolvedValue({ id: "event-1" });
    sessionRouterMock.send.mockReturnValue("delivered");
    sessionRouterMock.transitionRuntime.mockResolvedValue("delivered");
    sessionRouterMock.getRuntimeForSession.mockReturnValue(null);
    sessionRouterMock.getRuntime.mockReturnValue(null);
    sessionRouterMock.getDefaultRuntime?.mockReturnValue?.(null);
    sessionRouterMock.destroyRuntime.mockResolvedValue(undefined);
    prismaMock.channel.findFirst.mockResolvedValue({
      id: "channel-1",
      type: "coding",
      sessionGroups: [],
    });
  });

  describe("isFullyUnloadedSession", () => {
    it("returns true for failed agent status", () => {
      expect(isFullyUnloadedSession("failed", "in_progress")).toBe(true);
      expect(isFullyUnloadedSession("stopped", "in_progress")).toBe(true);
    });

    it("returns true for merged session status", () => {
      expect(isFullyUnloadedSession("done", "merged")).toBe(true);
    });

    it("returns false for active agent with non-merged session status", () => {
      for (const sessionStatus of ["not_started", "in_progress", "needs_input", "in_review"] as const) {
        expect(isFullyUnloadedSession("active", sessionStatus)).toBe(false);
        expect(isFullyUnloadedSession("done", sessionStatus)).toBe(false);
      }
    });
  });

  describe("listGroups", () => {
    it("lists session groups ordered by their most recent session", async () => {
      const olderSession = makeSession({
        id: "session-older",
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
      });
      const newerSession = makeSession({
        id: "session-newer",
        updatedAt: new Date("2024-01-02T00:00:00.000Z"),
      });

      prismaMock.sessionGroup.findMany.mockResolvedValueOnce([
        makeSessionGroup({ sessions: [olderSession, newerSession] }),
      ]);

      const result = await service.listGroups("channel-1", "org-1");

      expect(prismaMock.sessionGroup.findMany).toHaveBeenCalledWith({
        where: { channelId: "channel-1", organizationId: "org-1" },
        include: expect.any(Object),
      });
      expect(result[0].sessions.map((session) => session.id)).toEqual([
        "session-newer",
        "session-older",
      ]);
    });
  });

  describe("start", () => {
    it("creates a new session group for a channel entrypoint", async () => {
      const sessionGroup = makeSessionGroup();
      const session = makeSession({ sessionGroup });

      prismaMock.channel.findUnique.mockResolvedValueOnce({
        id: "channel-1",
        organizationId: "org-1",
        type: "coding",
        repoId: "repo-1",
      });
      prismaMock.sessionGroup.create.mockResolvedValueOnce(sessionGroup);
      prismaMock.session.create.mockResolvedValueOnce(session);

      const result = await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        channelId: "channel-1",
        prompt: "Implement dashboard filters",
      } as any);

      expect(result).toEqual(session);
      expect(prismaMock.sessionGroup.create).toHaveBeenCalledWith({
        data: {
          name: "Implement dashboard filters",
          organizationId: "org-1",
          channelId: "channel-1",
          repoId: "repo-1",
          connection: expect.any(Object),
        },
        select: expect.any(Object),
      });
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentStatus: "done",
            sessionStatus: "not_started",
            sessionGroupId: "group-1",
            channelId: "channel-1",
            repoId: "repo-1",
          }),
        }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_started",
          payload: expect.objectContaining({
            prompt: "Implement dashboard filters",
            sessionGroup: expect.objectContaining({ id: "group-1" }),
          }),
        }),
        expect.anything(),
      );
    });

    it("rejects a repo that conflicts with the channel repo", async () => {
      prismaMock.channel.findUnique.mockResolvedValueOnce({
        id: "channel-1",
        organizationId: "org-1",
        type: "coding",
        repoId: "repo-1",
      });

      await expect(
        service.start({
          organizationId: "org-1",
          createdById: "user-1",
          tool: "claude_code",
          channelId: "channel-1",
          repoId: "repo-2",
        } as any),
      ).rejects.toThrow("Coding channel sessions must use the channel's linked repo");

      expect(prismaMock.sessionGroup.create).not.toHaveBeenCalled();
      expect(prismaMock.session.create).not.toHaveBeenCalled();
    });

    it("rejects a local runtime that is not linked to the channel repo", async () => {
      prismaMock.channel.findUnique.mockResolvedValueOnce({
        id: "channel-1",
        organizationId: "org-1",
        type: "coding",
        repoId: "repo-1",
      });
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        label: "Local Dev",
        hostingMode: "local",
        registeredRepoIds: [],
        supportedTools: ["claude_code"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });

      await expect(
        service.start({
          organizationId: "org-1",
          createdById: "user-1",
          tool: "claude_code",
          channelId: "channel-1",
          runtimeInstanceId: "runtime-1",
        } as any),
      ).rejects.toThrow("Selected runtime does not have this repo linked");

      expect(prismaMock.sessionGroup.create).not.toHaveBeenCalled();
      expect(prismaMock.session.create).not.toHaveBeenCalled();
    });

    it("creates a new chat inside an existing group and copies workdir plus links from the source session", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: "source-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        repoId: "repo-1",
        branch: "feature/source",
        hosting: "cloud",
        channelId: "channel-1",
        projects: [{ projectId: "project-1" }],
        sessionGroup: makeSessionGroup({
          workdir: "/tmp/trace/source",
          repoId: "repo-1",
          branch: "feature/source",
        }),
      });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce(
        makeSessionGroup({
          workdir: "/tmp/trace/source",
          repoId: "repo-1",
          branch: "feature/source",
        }),
      );
      prismaMock.channel.findUnique.mockResolvedValueOnce({
        id: "channel-1",
        organizationId: "org-1",
        type: "coding",
        repoId: "repo-1",
      });
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([{ ticketId: "ticket-1" }]);
      prismaMock.session.create.mockResolvedValueOnce(
        makeSession({
          id: "session-2",
          agentStatus: "done",
          workdir: "/tmp/trace/source",
          branch: "feature/source",
        }),
      );

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        sessionGroupId: "group-1",
        sourceSessionId: "source-1",
      } as any);

      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentStatus: "done",
            sessionStatus: "not_started",
            sessionGroupId: "group-1",
            workdir: "/tmp/trace/source",
            repoId: "repo-1",
            branch: "feature/source",
            channelId: "channel-1",
            projects: {
              create: [{ projectId: "project-1" }],
            },
          }),
        }),
      );
      expect(prismaMock.ticketLink.createMany).toHaveBeenCalledWith({
        data: [
          {
            ticketId: "ticket-1",
            entityType: "session",
            entityId: "session-2",
          },
        ],
        skipDuplicates: true,
      });
    });

    it("inherits repo and branch from the existing group for a clean new chat", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce(
        makeSessionGroup({
          workdir: "/tmp/trace/shared",
          repoId: "repo-1",
          branch: "feature/shared",
        }),
      );
      prismaMock.channel.findUnique.mockResolvedValueOnce({
        id: "channel-1",
        organizationId: "org-1",
        type: "coding",
        repoId: "repo-1",
      });
      prismaMock.session.create.mockResolvedValueOnce(
        makeSession({
          id: "session-2",
          agentStatus: "done",
          workdir: "/tmp/trace/shared",
          branch: "feature/shared",
        }),
      );

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        sessionGroupId: "group-1",
      } as any);

      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentStatus: "done",
            sessionStatus: "not_started",
            sessionGroupId: "group-1",
            repoId: "repo-1",
            branch: "feature/shared",
            workdir: "/tmp/trace/shared",
          }),
        }),
      );
    });
  });

  describe("file access", () => {
    it("rejects local file access for non-owners", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        workdir: "/tmp/trace",
        worktreeDeleted: false,
      });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          workdir: "/tmp/trace",
          hosting: "local",
          createdById: "user-2",
        },
      ]);

      await expect(service.listFiles("group-1", "org-1", "user-1")).rejects.toThrow(
        "Access denied: you can only access files on your own local sessions",
      );
      expect(sessionRouterMock.listFiles).not.toHaveBeenCalled();
    });

    it("rejects file reads for paths outside the enumerated file list", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        workdir: "/tmp/trace",
        worktreeDeleted: false,
      });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          workdir: "/tmp/trace",
          hosting: "cloud",
          createdById: "user-1",
        },
      ]);
      sessionRouterMock.getRuntimeForSession.mockReturnValueOnce({ id: "runtime-1" });
      sessionRouterMock.listFiles.mockResolvedValueOnce(["src/app.ts"]);

      await expect(
        service.readFile("group-1", "secrets.txt", "org-1", "user-1"),
      ).rejects.toThrow("Invalid file path");
      expect(sessionRouterMock.readFile).not.toHaveBeenCalled();
    });
  });

  describe("updateName", () => {
    it("syncs the session group name when the group still matches the renamed session", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        name: "Implement dashboard filters",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        sessionGroup: { name: "Implement dashboard filters" },
      });
      prismaMock.session.update.mockResolvedValueOnce({ organizationId: "org-1" });
      prismaMock.sessionGroup.update.mockResolvedValueOnce(
        makeSessionGroup({ name: "Dashboard filters" }),
      );

      await service.updateName("session-1", "Dashboard filters");

      expect(prismaMock.sessionGroup.update).toHaveBeenCalledWith({
        where: { id: "group-1" },
        data: { name: "Dashboard filters" },
        select: expect.any(Object),
      });
    });
  });

  describe("complete", () => {
    it("returns finished sessions to not_started when no follow-up input is needed", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        agentStatus: "active",
        sessionStatus: "in_progress",
      });
      prismaMock.event.findFirst.mockResolvedValueOnce(null);
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.update.mockResolvedValueOnce({
        organizationId: "org-1",
        createdById: "user-1",
        name: "Implement dashboard filters",
      });

      await service.complete("session-1");

      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: { agentStatus: "done", sessionStatus: "not_started" },
        select: { organizationId: true, createdById: true, name: true },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_terminated",
          payload: expect.objectContaining({
            sessionId: "session-1",
            reason: "bridge_complete",
            agentStatus: "done",
            sessionStatus: "not_started",
          }),
        }),
      );
    });
  });

  describe("workspaceReady", () => {
    it("keeps a session not_started until a queued command is actually delivered", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        pendingRun: null,
        sessionStatus: "not_started",
      });
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          agentStatus: "done",
          sessionStatus: "not_started",
          workdir: "/tmp/trace/workspace",
        }),
      );
      prismaMock.sessionGroup.update.mockResolvedValueOnce(
        makeSessionGroup({ workdir: "/tmp/trace/workspace" }),
      );
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.workspaceReady("session-1", "/tmp/trace/workspace");

      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: {
          agentStatus: "done",
          sessionStatus: "not_started",
          workdir: "/tmp/trace/workspace",
          pendingRun: expect.anything(),
        },
        include: expect.any(Object),
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_output",
          payload: expect.objectContaining({
            type: "workspace_ready",
            workdir: "/tmp/trace/workspace",
            agentStatus: "done",
            sessionStatus: "not_started",
          }),
        }),
      );
    });
  });

  describe("delete", () => {
    it("removes the session group when the last session is deleted", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(makeSession());
      prismaMock.session.count.mockResolvedValueOnce(0);

      const result = await service.delete("session-1");

      expect(result.id).toBe("session-1");
      expect(terminalRelayMock.destroyAllForSessionGroup).toHaveBeenCalledWith("group-1");
      expect(prismaMock.sessionGroup.delete).toHaveBeenCalledWith({
        where: { id: "group-1" },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_deleted",
          payload: expect.objectContaining({
            deletedSessionGroupId: "group-1",
            sessionGroupId: "group-1",
          }),
        }),
      );
    });
  });

  describe("moveToRuntime", () => {
    it("creates the replacement session inside the same group", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          status: "active",
          projects: [{ projectId: "project-1" }],
        }),
      );
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([{ ticketId: "ticket-1" }]);
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.create.mockResolvedValueOnce(
        makeSession({
          id: "session-2",
          agentStatus: "done",
          sessionStatus: "not_started",
          hosting: "local",
          sessionGroupId: "group-1",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-1",
            runtimeLabel: "Local Dev",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      prismaMock.session.update.mockResolvedValueOnce(makeSession());
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        label: "Local Dev",
        hostingMode: "local",
        supportedTools: ["claude_code"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });

      const result = await service.moveToRuntime(
        "session-1",
        "runtime-1",
        "org-1",
        "user",
        "user-1",
      );

      expect(result.id).toBe("session-2");
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentStatus: "done",
            sessionStatus: "not_started",
            sessionGroupId: "group-1",
          }),
        }),
      );
      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith("session-2", "runtime-1");
      expect(sessionRouterMock.transitionRuntime).toHaveBeenCalledWith(
        "session-1",
        "cloud",
        "terminate",
      );
      expect(terminalRelayMock.destroyAllForSession).toHaveBeenCalledWith("session-1");
    });
  });

  describe("moveToCloud", () => {
    it("creates the cloud session inside the same group", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          status: "active",
          projects: [{ projectId: "project-1" }],
        }),
      );
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([]);
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.create.mockResolvedValueOnce(
        makeSession({
          id: "session-3",
          agentStatus: "done",
          sessionStatus: "not_started",
          hosting: "cloud",
          sessionGroupId: "group-1",
        }),
      );
      prismaMock.session.update.mockResolvedValueOnce(makeSession());

      const result = await service.moveToCloud(
        "session-1",
        "org-1",
        "user",
        "user-1",
      );

      expect(result.id).toBe("session-3");
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentStatus: "done",
            sessionStatus: "not_started",
            sessionGroupId: "group-1",
          }),
        }),
      );
      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-3",
          hosting: "cloud",
        }),
      );
      expect(sessionRouterMock.transitionRuntime).toHaveBeenCalledWith(
        "session-1",
        "cloud",
        "terminate",
      );
      expect(terminalRelayMock.destroyAllForSession).toHaveBeenCalledWith("session-1");
    });
  });

  describe("pr lifecycle", () => {
    it("ignores stale PR close events from an old session in the group", async () => {
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        prUrl: "https://github.com/trace/trace/pull/100",
      });

      await service.markPrClosed({
        sessionGroupId: "group-1",
        eventSessionId: "session-1",
        prUrl: "https://github.com/trace/trace/pull/99",
        organizationId: "org-1",
      });

      expect(prismaMock.sessionGroup.update).not.toHaveBeenCalled();
      expect(eventServiceMock.create).not.toHaveBeenCalled();
    });

    it("ignores stale PR merge events from an old session in the group", async () => {
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        prUrl: "https://github.com/trace/trace/pull/100",
      });

      await service.markPrMerged({
        sessionGroupId: "group-1",
        eventSessionId: "session-1",
        prUrl: "https://github.com/trace/trace/pull/99",
        organizationId: "org-1",
      });

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
      expect(eventServiceMock.create).not.toHaveBeenCalled();
    });
  });
});
