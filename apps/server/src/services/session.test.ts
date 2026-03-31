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
    agentStatus: "not_started",
    status: "in_progress",
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
    agentStatus: "not_started",
    sessionStatus: "in_progress",
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

function makeGitCheckpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: "checkpoint-1",
    sessionId: "session-1",
    sessionGroupId: "group-1",
    repoId: "repo-1",
    promptEventId: "event-prompt-1",
    commitSha: "abcdef1234567890",
    parentShas: ["1234567890abcdef"],
    treeSha: "feedface12345678",
    subject: "Add checkpoint support",
    author: "Test User <test@example.com>",
    committedAt: new Date("2024-01-02T00:00:00.000Z"),
    filesChanged: 3,
    createdAt: new Date("2024-01-02T00:00:01.000Z"),
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
    prismaMock.sessionGroup.findUnique.mockResolvedValue({
      ...makeSessionGroup(),
      sessions: [{ agentStatus: "not_started", sessionStatus: "in_progress" }],
    });
    prismaMock.channel.findFirst.mockResolvedValue({
      id: "channel-1",
      type: "coding",
      sessionGroups: [],
    });
    prismaMock.gitCheckpoint.findUnique.mockResolvedValue(null);
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
      for (const sessionStatus of ["in_progress", "needs_input", "in_review"] as const) {
        expect(isFullyUnloadedSession("active", sessionStatus)).toBe(false);
        expect(isFullyUnloadedSession("done", sessionStatus)).toBe(false);
        expect(isFullyUnloadedSession("not_started", sessionStatus)).toBe(false);
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
            agentStatus: "not_started",
            sessionStatus: "in_progress",
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
            agentStatus: "not_started",
            sessionStatus: "in_progress",
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
            agentStatus: "not_started",
            sessionStatus: "in_progress",
            sessionGroupId: "group-1",
            repoId: "repo-1",
            branch: "feature/shared",
            workdir: "/tmp/trace/shared",
          }),
        }),
      );
    });

    it("restores a checkpoint into a fresh session group and provisions from the checkpoint sha", async () => {
      prismaMock.gitCheckpoint.findUnique.mockResolvedValueOnce(
        makeGitCheckpoint({
          sessionId: "source-1",
          sessionGroupId: "group-source",
          commitSha: "abcdef1234567890",
          subject: "Restore me",
        }),
      );
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce(
        makeSessionGroup({
          id: "group-source",
          branch: "feature/source",
        }),
      );
      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: "source-1",
        organizationId: "org-1",
        sessionGroupId: "group-source",
        repoId: "repo-1",
        branch: "feature/source",
        hosting: "cloud",
        channelId: "channel-1",
        projects: [{ projectId: "project-1" }],
        sessionGroup: makeSessionGroup({
          id: "group-source",
          branch: "feature/source",
        }),
      });
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([{ ticketId: "ticket-1" }]);
      prismaMock.channel.findUnique.mockResolvedValueOnce({
        id: "channel-1",
        organizationId: "org-1",
        type: "coding",
        repoId: "repo-1",
      });
      prismaMock.sessionGroup.create.mockResolvedValueOnce(
        makeSessionGroup({
          id: "group-restored",
          name: "Restore abcdef1 Restore me",
          branch: "feature/source",
        }),
      );
      prismaMock.session.create.mockResolvedValueOnce(
        makeSession({
          id: "session-restored",
          sessionGroupId: "group-restored",
          branch: "feature/source",
          sessionGroup: makeSessionGroup({
            id: "group-restored",
            name: "Restore abcdef1 Restore me",
            branch: "feature/source",
          }),
        }),
      );

      const result = await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        hosting: "cloud",
        restoreCheckpointId: "checkpoint-1",
      } as any);

      expect(result.id).toBe("session-restored");
      expect(prismaMock.sessionGroup.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: "org-1",
          repoId: "repo-1",
          branch: "feature/source",
        }),
        select: expect.any(Object),
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_started",
          payload: expect.objectContaining({
            restoreCheckpointId: "checkpoint-1",
            restoreCheckpointSha: "abcdef1234567890",
            sourceSessionId: null,
          }),
        }),
        expect.anything(),
      );
      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-restored",
          checkpointSha: "abcdef1234567890",
        }),
      );
    });
  });

  describe("recordGitCheckpoint", () => {
    it("persists a checkpoint and emits a git_checkpoint session output", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        repoId: "repo-1",
      });
      prismaMock.gitCheckpoint.findUnique.mockResolvedValueOnce(null);
      prismaMock.event.findFirst.mockResolvedValueOnce({ id: "prompt-1" });
      prismaMock.gitCheckpoint.create.mockResolvedValueOnce(
        makeGitCheckpoint({
          promptEventId: "prompt-1",
        }),
      );

      const result = await service.recordGitCheckpoint("session-1", {
        trigger: "commit",
        command: "git commit -m 'test'",
        observedAt: "2024-01-02T00:00:02.000Z",
        commitSha: "abcdef1234567890",
        parentShas: ["1234567890abcdef"],
        treeSha: "feedface12345678",
        subject: "Add checkpoint support",
        author: "Test User <test@example.com>",
        committedAt: "2024-01-02T00:00:00.000Z",
        filesChanged: 3,
      });

      expect(result).toEqual(makeGitCheckpoint({ promptEventId: "prompt-1" }));
      expect(prismaMock.gitCheckpoint.create).toHaveBeenCalledWith({
        data: {
          sessionId: "session-1",
          sessionGroupId: "group-1",
          repoId: "repo-1",
          promptEventId: "prompt-1",
          commitSha: "abcdef1234567890",
          parentShas: ["1234567890abcdef"],
          treeSha: "feedface12345678",
          subject: "Add checkpoint support",
          author: "Test User <test@example.com>",
          committedAt: new Date("2024-01-02T00:00:00.000Z"),
          filesChanged: 3,
        },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_output",
          payload: expect.objectContaining({
            type: "git_checkpoint",
            checkpoint: expect.objectContaining({
              id: "checkpoint-1",
              promptEventId: "prompt-1",
              commitSha: "abcdef1234567890",
            }),
          }),
        }),
      );
    });

    it("deduplicates checkpoints by session group and commit sha", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        repoId: "repo-1",
      });
      prismaMock.gitCheckpoint.findUnique.mockResolvedValueOnce(makeGitCheckpoint());

      const result = await service.recordGitCheckpoint("session-1", {
        trigger: "push",
        command: "git push origin HEAD",
        observedAt: "2024-01-02T00:00:02.000Z",
        commitSha: "abcdef1234567890",
        parentShas: ["1234567890abcdef"],
        treeSha: "feedface12345678",
        subject: "Add checkpoint support",
        author: "Test User <test@example.com>",
        committedAt: "2024-01-02T00:00:00.000Z",
        filesChanged: 3,
      });

      expect(result).toEqual(makeGitCheckpoint());
      expect(prismaMock.gitCheckpoint.create).not.toHaveBeenCalled();
      expect(eventServiceMock.create).not.toHaveBeenCalled();
    });

    it("prefers explicit checkpoint context ids over observedAt timestamp matching", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        repoId: "repo-1",
      });
      prismaMock.gitCheckpoint.findUnique.mockResolvedValueOnce(null);
      prismaMock.event.findFirst.mockResolvedValueOnce({ id: "prompt-explicit" });
      prismaMock.gitCheckpoint.create.mockResolvedValueOnce(
        makeGitCheckpoint({
          promptEventId: "prompt-explicit",
        }),
      );

      await service.recordGitCheckpoint("session-1", {
        trigger: "commit",
        command: "git post-commit",
        observedAt: "2024-01-02T00:00:02.000Z",
        commitSha: "abcdef1234567890",
        parentShas: ["1234567890abcdef"],
        treeSha: "feedface12345678",
        subject: "Add checkpoint support",
        author: "Test User <test@example.com>",
        committedAt: "2024-01-02T00:00:00.000Z",
        filesChanged: 3,
        source: "git_hook",
        checkpointContextId: "ctx-1",
      });

      expect(prismaMock.event.findFirst).toHaveBeenCalledWith({
        where: {
          scopeId: "session-1",
          scopeType: "session",
          eventType: { in: ["session_started", "message_sent"] },
          metadata: { path: ["checkpointContextId"], equals: "ctx-1" },
        },
        orderBy: { timestamp: "desc" },
        select: { id: true },
      });
      expect(prismaMock.gitCheckpoint.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          promptEventId: "prompt-explicit",
        }),
      });
    });

    it("updates rewritten checkpoints in place when the replacement sha is not stored yet", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        repoId: "repo-1",
      });
      prismaMock.gitCheckpoint.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(
        makeGitCheckpoint({
          id: "checkpoint-old",
          commitSha: "oldsha1234567890",
          promptEventId: "prompt-old",
        }),
      );
      prismaMock.event.findFirst.mockResolvedValueOnce({ id: "prompt-new" });
      prismaMock.gitCheckpoint.update.mockResolvedValueOnce(
        makeGitCheckpoint({
          id: "checkpoint-old",
          commitSha: "newsha1234567890",
          promptEventId: "prompt-new",
        }),
      );

      const result = await service.recordGitCheckpoint("session-1", {
        trigger: "rewrite",
        command: "git post-rewrite amend",
        observedAt: "2024-01-02T00:00:02.000Z",
        commitSha: "newsha1234567890",
        parentShas: ["1234567890abcdef"],
        treeSha: "feedface12345678",
        subject: "Add checkpoint support",
        author: "Test User <test@example.com>",
        committedAt: "2024-01-02T00:00:00.000Z",
        filesChanged: 3,
        source: "git_hook",
        checkpointContextId: "ctx-2",
        rewrittenFromCommitSha: "oldsha1234567890",
      });

      expect(result).toEqual(
        makeGitCheckpoint({
          id: "checkpoint-old",
          commitSha: "newsha1234567890",
          promptEventId: "prompt-new",
        }),
      );
      expect(prismaMock.gitCheckpoint.update).toHaveBeenCalledWith({
        where: { id: "checkpoint-old" },
        data: expect.objectContaining({
          promptEventId: "prompt-new",
          commitSha: "newsha1234567890",
        }),
      });
      expect(prismaMock.gitCheckpoint.delete).not.toHaveBeenCalled();
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_output",
          payload: expect.objectContaining({
            type: "git_checkpoint",
            checkpoint: expect.objectContaining({
              id: "checkpoint-old",
              commitSha: "newsha1234567890",
            }),
          }),
        }),
      );
    });

    it("removes superseded checkpoints when a rewritten sha already exists", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        repoId: "repo-1",
      });
      prismaMock.gitCheckpoint.findUnique
        .mockResolvedValueOnce(
          makeGitCheckpoint({
            id: "checkpoint-new",
            commitSha: "newsha1234567890",
            promptEventId: "prompt-new",
          }),
        )
        .mockResolvedValueOnce(
          makeGitCheckpoint({
            id: "checkpoint-old",
            commitSha: "oldsha1234567890",
            promptEventId: "prompt-old",
          }),
        );

      const result = await service.recordGitCheckpoint("session-1", {
        trigger: "rewrite",
        command: "git post-rewrite amend",
        observedAt: "2024-01-02T00:00:02.000Z",
        commitSha: "newsha1234567890",
        parentShas: ["1234567890abcdef"],
        treeSha: "feedface12345678",
        subject: "Add checkpoint support",
        author: "Test User <test@example.com>",
        committedAt: "2024-01-02T00:00:00.000Z",
        filesChanged: 3,
        source: "git_hook",
        rewrittenFromCommitSha: "oldsha1234567890",
      });

      expect(result).toEqual(
        makeGitCheckpoint({
          id: "checkpoint-new",
          commitSha: "newsha1234567890",
          promptEventId: "prompt-new",
        }),
      );
      expect(prismaMock.gitCheckpoint.delete).toHaveBeenCalledWith({
        where: { id: "checkpoint-old" },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_output",
          payload: expect.objectContaining({
            type: "git_checkpoint_rewrite",
            replacedCommitSha: "oldsha1234567890",
            checkpoint: expect.objectContaining({
              id: "checkpoint-new",
              commitSha: "newsha1234567890",
            }),
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

      await expect(service.readFile("group-1", "secrets.txt", "org-1", "user-1")).rejects.toThrow(
        "Invalid file path",
      );
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

  describe("recordOutput", () => {
    it("preserves the full branch name when syncing a trace-branch tag", async () => {
      const branch = `feature/${"x".repeat(140)}`;
      const data = {
        type: "assistant",
        message: {
          content: [
            {
              type: "text",
              text: `<trace-branch>${branch}</trace-branch>\nCreated the branch.`,
            },
          ],
        },
      };

      prismaMock.session.findUnique.mockResolvedValueOnce({
        organizationId: "org-1",
        agentStatus: "done",
        sessionStatus: "in_progress",
        sessionGroupId: "group-1",
      });
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        organizationId: "org-1",
        sessionGroupId: "group-1",
      });
      prismaMock.sessionGroup.update.mockResolvedValueOnce(makeSessionGroup({ branch }));
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        ...makeSessionGroup({ branch }),
        sessions: [{ agentStatus: "done", sessionStatus: "in_progress" }],
      });

      await service.recordOutput("session-1", data as Record<string, unknown>);

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { sessionGroupId: "group-1" },
        data: { branch },
      });
      expect(eventServiceMock.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          eventType: "session_output",
          payload: expect.objectContaining({
            type: "branch_renamed",
            branch,
          }),
        }),
      );
      expect(
        (data.message as { content: Array<{ text?: string }> }).content[0].text ?? "",
      ).not.toContain("<trace-branch>");
    });
  });

  describe("complete", () => {
    it("returns finished sessions to in_progress when no follow-up input is needed", async () => {
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
        data: { agentStatus: "done", sessionStatus: "in_progress" },
        select: { organizationId: true, createdById: true, name: true },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_terminated",
          payload: expect.objectContaining({
            sessionId: "session-1",
            reason: "bridge_complete",
            agentStatus: "done",
            sessionStatus: "in_progress",
          }),
        }),
      );
    });
  });

  describe("dismiss", () => {
    it("stops the current run without making the session terminal", async () => {
      prismaMock.session.findUniqueOrThrow
        .mockResolvedValueOnce({ organizationId: "org-1" })
        .mockResolvedValueOnce(
          makeSession({
            agentStatus: "done",
            sessionStatus: "in_progress",
          }),
        );
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          agentStatus: "done",
          sessionStatus: "in_progress",
        }),
      );

      await service.dismiss("session-1", "user", "user-1");

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "session-1" },
          data: { agentStatus: "done" },
        }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_terminated",
          payload: expect.objectContaining({
            sessionId: "session-1",
            agentStatus: "done",
            sessionStatus: "in_progress",
            reason: "manual_stop",
          }),
        }),
      );
    });

    it("clears needs_input when dismissing a session waiting for user input", async () => {
      prismaMock.session.findUniqueOrThrow
        .mockResolvedValueOnce({ organizationId: "org-1" })
        .mockResolvedValueOnce(
          makeSession({
            agentStatus: "active",
            sessionStatus: "needs_input",
          }),
        );
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          agentStatus: "done",
          sessionStatus: "in_progress",
        }),
      );

      await service.dismiss("session-1", "user", "user-1");

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "session-1" },
          data: { agentStatus: "done", sessionStatus: "in_progress" },
        }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_terminated",
          payload: expect.objectContaining({
            sessionId: "session-1",
            agentStatus: "done",
            sessionStatus: "in_progress",
            reason: "manual_stop",
          }),
        }),
      );
    });
  });

  describe("run", () => {
    it("queues checkpoint context when the initial run waits for workspace preparation", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(
        makeSession({
          agentStatus: "not_started",
          sessionStatus: "in_progress",
          workdir: null,
          toolSessionId: null,
          repoId: "repo-1",
          sessionGroupId: "group-1",
        }),
      );
      prismaMock.event.findFirst.mockResolvedValueOnce({
        id: "event-start-1",
        payload: { prompt: "Original prompt" },
        metadata: { checkpointContextId: "ctx-queued-1" },
      });
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          pendingRun: {
            type: "run",
            prompt: "Ship it",
            interactionMode: null,
          },
        }),
      );

      await service.run("session-1", "Ship it");

      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: {
          pendingRun: expect.objectContaining({
            type: "run",
            prompt: "Ship it",
            interactionMode: null,
            checkpointContext: expect.objectContaining({
              checkpointContextId: "ctx-queued-1",
              promptEventId: "event-start-1",
              sessionId: "session-1",
              sessionGroupId: "group-1",
              repoId: "repo-1",
              updatedAt: expect.any(String),
            }),
          }),
        },
        include: expect.any(Object),
      });
    });
  });

  describe("workspaceReady", () => {
    it("keeps a session in_progress while a queued command is waiting for delivery", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        pendingRun: null,
        agentStatus: "not_started",
        sessionStatus: "in_progress",
      });
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          agentStatus: "not_started",
          sessionStatus: "in_progress",
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
          agentStatus: "not_started",
          sessionStatus: "in_progress",
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
            agentStatus: "not_started",
            sessionStatus: "in_progress",
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
          agentStatus: "not_started",
          sessionStatus: "in_progress",
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
            agentStatus: "not_started",
            sessionStatus: "in_progress",
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

    it("rejects moving a merged session", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({ sessionStatus: "merged" }),
      );
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([]);

      await expect(
        service.moveToRuntime("session-1", "runtime-1", "org-1", "user", "user-1"),
      ).rejects.toThrow("Cannot move a merged session");
    });

    it("allows moving a stopped session", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          agentStatus: "stopped",
          projects: [{ projectId: "project-1" }],
        }),
      );
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([]);
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.create.mockResolvedValueOnce(
        makeSession({
          id: "session-2",
          agentStatus: "not_started",
          sessionStatus: "in_progress",
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
    });

    it("allows moving a failed session", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          agentStatus: "failed",
          projects: [{ projectId: "project-1" }],
        }),
      );
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([]);
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.create.mockResolvedValueOnce(
        makeSession({
          id: "session-2",
          agentStatus: "not_started",
          sessionStatus: "in_progress",
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
          agentStatus: "not_started",
          sessionStatus: "in_progress",
          hosting: "cloud",
          sessionGroupId: "group-1",
        }),
      );
      prismaMock.session.update.mockResolvedValueOnce(makeSession());

      const result = await service.moveToCloud("session-1", "org-1", "user", "user-1");

      expect(result.id).toBe("session-3");
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentStatus: "not_started",
            sessionStatus: "in_progress",
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

    it("rejects moving a merged session to cloud", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({ sessionStatus: "merged" }),
      );
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([]);

      await expect(service.moveToCloud("session-1", "org-1", "user", "user-1")).rejects.toThrow(
        "Cannot move a merged session",
      );
    });

    it("allows moving a stopped session to cloud", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          agentStatus: "stopped",
          projects: [{ projectId: "project-1" }],
        }),
      );
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([]);
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.create.mockResolvedValueOnce(
        makeSession({
          id: "session-3",
          agentStatus: "not_started",
          sessionStatus: "in_progress",
          hosting: "cloud",
          sessionGroupId: "group-1",
        }),
      );
      prismaMock.session.update.mockResolvedValueOnce(makeSession());

      const result = await service.moveToCloud("session-1", "org-1", "user", "user-1");

      expect(result.id).toBe("session-3");
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
