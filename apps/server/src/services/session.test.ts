import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("./runtime-access.js", () => ({
  setBridgeAccessApprovedHandler: vi.fn(),
  runtimeAccessService: {
    assertAccess: vi.fn().mockResolvedValue(undefined),
    listAccessibleRuntimeInstanceIds: vi
      .fn()
      .mockResolvedValue(new Set(["runtime-1", "runtime-a", "runtime-b"])),
    getAccessState: vi
      .fn()
      .mockResolvedValue({ hostingMode: "cloud", allowed: true, isOwner: true }),
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
    isRuntimeAvailable: vi.fn().mockReturnValue(true),
    getRuntimeDiagnostics: vi.fn().mockReturnValue({}),
    listRuntimes: vi.fn().mockReturnValue([]),
    listBranches: vi.fn().mockResolvedValue([]),
    listFiles: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(""),
    getLinkedCheckoutStatus: vi.fn().mockResolvedValue(null),
    linkLinkedCheckoutRepo: vi.fn().mockResolvedValue(null),
    syncLinkedCheckout: vi.fn().mockResolvedValue(null),
    commitLinkedCheckoutChanges: vi.fn().mockResolvedValue(null),
    restoreLinkedCheckout: vi.fn().mockResolvedValue(null),
    setLinkedCheckoutAutoSync: vi.fn().mockResolvedValue(null),
    inspectSessionGitSyncStatus: vi.fn().mockResolvedValue({
      branch: "trace/test",
      headCommitSha: "abc123",
      upstreamBranch: "origin/trace/test",
      upstreamCommitSha: "abc123",
      aheadCount: 0,
      behindCount: 0,
      remoteBranch: "origin/trace/test",
      remoteCommitSha: "abc123",
      remoteAheadCount: 0,
      remoteBehindCount: 0,
      hasUncommittedChanges: false,
    }),
  },
}));

vi.mock("../lib/terminal-relay.js", () => ({
  terminalRelay: {
    destroyAllForSession: vi.fn(),
    destroyAllForSessionGroup: vi.fn(),
    executeCommand: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock("../lib/runtime-debug.js", () => ({
  runtimeDebug: vi.fn(),
}));

vi.mock("../lib/storage/index.js", () => ({
  storage: {
    getGetUrl: vi.fn(async (key: string) => `https://example.test/${key}`),
  },
}));

vi.mock("@trace/shared", () => {
  return {
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
import { runtimeAccessService } from "./runtime-access.js";
import { SessionService, isFullyUnloadedSession } from "./session.js";
import type { StartSessionServiceInput } from "./session.js";

type MockedDeep<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? ReturnType<typeof vi.fn<(...args: A) => R>>
    : T[K] extends object
      ? MockedDeep<T[K]>
      : T[K];
};

const prismaMock = prisma as unknown as MockedDeep<typeof prisma>;
const eventServiceMock = eventService as unknown as MockedDeep<typeof eventService>;
const sessionRouterMock = sessionRouter as unknown as MockedDeep<typeof sessionRouter>;
const terminalRelayMock = terminalRelay as unknown as MockedDeep<typeof terminalRelay>;
const runtimeAccessServiceMock = runtimeAccessService as unknown as MockedDeep<
  typeof runtimeAccessService
>;

function makeSessionGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: "group-1",
    name: "Implement dashboard filters",
    agentStatus: "not_started",
    status: "in_progress",
    archivedAt: null,
    organizationId: "org-1",
    channelId: "channel-1",
    repoId: "repo-1",
    branch: "main",
    workdir: null,
    connection: { state: "connected", retryCount: 0, canRetry: true, canMove: true },
    prUrl: null,
    worktreeDeleted: false,
    setupStatus: "idle",
    setupError: null,
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
    lastUserMessageAt: null,
    pendingRun: null,
    readOnlyWorkspace: false,
    projects: [],
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

function makeGitSyncStatus(overrides: Record<string, unknown> = {}) {
  return {
    branch: "trace/test",
    headCommitSha: "abc123",
    upstreamBranch: "origin/trace/test",
    upstreamCommitSha: "abc123",
    aheadCount: 0,
    behindCount: 0,
    remoteBranch: "origin/trace/test",
    remoteCommitSha: "abc123",
    remoteAheadCount: 0,
    remoteBehindCount: 0,
    hasUncommittedChanges: false,
    ...overrides,
  };
}

function makeAgentEnvironment(overrides: Record<string, unknown> = {}) {
  return {
    id: "env-default",
    organizationId: "org-1",
    name: "Default Cloud",
    adapterType: "provisioned",
    config: {
      startUrl: "http://localhost:4010/start",
      stopUrl: "http://localhost:4010/stop",
      statusUrl: "http://localhost:4010/status",
      auth: { type: "bearer", secretId: "secret-1" },
      startupTimeoutSeconds: 60,
      deprovisionPolicy: "on_session_end",
    },
    enabled: true,
    isDefault: true,
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
    runtimeAccessServiceMock.assertAccess.mockResolvedValue(undefined);
    runtimeAccessServiceMock.listAccessibleRuntimeInstanceIds.mockResolvedValue(
      new Set(["runtime-1", "runtime-a", "runtime-b"]),
    );
    runtimeAccessServiceMock.getAccessState.mockResolvedValue({
      hostingMode: "cloud",
      allowed: true,
      isOwner: true,
    });
    prismaMock.agentEnvironment.findFirst.mockResolvedValue(makeAgentEnvironment());
    sessionRouterMock.send.mockReturnValue("delivered");
    sessionRouterMock.transitionRuntime.mockResolvedValue("delivered");
    sessionRouterMock.getRuntimeForSession.mockReturnValue(null);
    sessionRouterMock.getRuntime.mockReturnValue(null);
    sessionRouterMock.isRuntimeAvailable.mockReturnValue(true);
    sessionRouterMock.destroyRuntime.mockResolvedValue(undefined);
    sessionRouterMock.inspectSessionGitSyncStatus.mockResolvedValue(makeGitSyncStatus());
    prismaMock.sessionGroup.findUnique.mockResolvedValue({
      ...makeSessionGroup(),
      sessions: [{ agentStatus: "not_started", sessionStatus: "in_progress" }],
    });
    prismaMock.channel.findFirst.mockResolvedValue({
      id: "channel-1",
      type: "coding",
      sessionGroups: [],
    });
    prismaMock.channel.findUnique.mockResolvedValue(null);
    prismaMock.gitCheckpoint.findUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
        where: { channelId: "channel-1", organizationId: "org-1", archivedAt: null },
        include: expect.any(Object),
      });
      expect(result[0].sessions.map((session) => session.id)).toEqual([
        "session-newer",
        "session-older",
      ]);
    });

    it("prefers lastMessageAt over reconnect-driven updatedAt for sort order", async () => {
      const reconnectedSession = makeSession({
        id: "session-reconnected",
        updatedAt: new Date("2024-01-05T00:00:00.000Z"),
        lastMessageAt: new Date("2024-01-01T00:00:00.000Z"),
      });
      const repliedSession = makeSession({
        id: "session-replied",
        updatedAt: new Date("2024-01-04T00:00:00.000Z"),
        lastMessageAt: new Date("2024-01-06T00:00:00.000Z"),
      });

      prismaMock.sessionGroup.findMany.mockResolvedValueOnce([
        makeSessionGroup({ sessions: [reconnectedSession, repliedSession] }),
      ]);

      const result = await service.listGroups("channel-1", "org-1");

      expect(result[0].sessions.map((session) => session.id)).toEqual([
        "session-replied",
        "session-reconnected",
      ]);
      expect(result[0].sessions[0]?.lastMessageAt?.toISOString()).toBe("2024-01-06T00:00:00.000Z");
      expect(result[0].sessions[1]?.lastMessageAt?.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    });

    it("excludes merged groups by default", async () => {
      prismaMock.sessionGroup.findMany.mockResolvedValueOnce([
        makeSessionGroup({
          id: "group-merged",
          sessions: [makeSession({ id: "session-merged", sessionStatus: "merged" })],
        }),
        makeSessionGroup({
          id: "group-active",
          sessions: [makeSession({ id: "session-active", sessionStatus: "in_progress" })],
        }),
      ]);

      const result = await service.listGroups("channel-1", "org-1");

      expect(result.map((group) => group.id)).toEqual(["group-active"]);
    });

    it("returns archived groups when requested", async () => {
      prismaMock.sessionGroup.findMany.mockResolvedValueOnce([
        makeSessionGroup({
          id: "group-archived",
          archivedAt: new Date("2024-01-03T00:00:00.000Z"),
          sessions: [makeSession({ id: "session-archived", agentStatus: "stopped" })],
        }),
      ]);

      const result = await service.listGroups("channel-1", "org-1", { archived: true });

      expect(prismaMock.sessionGroup.findMany).toHaveBeenCalledWith({
        where: {
          channelId: "channel-1",
          organizationId: "org-1",
          archivedAt: { not: null },
        },
        include: expect.any(Object),
      });
      expect(result[0]?.status).toBe("archived");
    });
  });

  describe("listByUser", () => {
    it("filters merged and archived groups when requested", async () => {
      prismaMock.session.findMany.mockResolvedValueOnce([]);

      await service.listByUser("org-1", "user-1", {
        includeMerged: false,
        includeArchived: false,
      });

      expect(prismaMock.session.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: "org-1",
          createdById: "user-1",
          sessionStatus: { not: "merged" },
          OR: [
            { sessionGroupId: null },
            {
              sessionGroup: {
                is: {
                  archivedAt: null,
                  sessions: { none: { sessionStatus: "merged" } },
                },
              },
            },
          ],
        },
        orderBy: { updatedAt: "desc" },
        include: expect.any(Object),
      });
    });

    it("keeps the existing behavior when no visibility options are provided", async () => {
      prismaMock.session.findMany.mockResolvedValueOnce([]);

      await service.listByUser("org-1", "user-1", { agentStatus: "active" });

      expect(prismaMock.session.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: "org-1",
          createdById: "user-1",
          agentStatus: "active",
        },
        orderBy: { updatedAt: "desc" },
        include: expect.any(Object),
      });
    });
  });

  describe("search", () => {
    it("returns empty results when the trimmed query is shorter than 2 chars", async () => {
      const result = await service.search("org-1", "  a  ");

      expect(result).toEqual({ sessions: [], sessionGroups: [] });
      expect(prismaMock.session.findMany).not.toHaveBeenCalled();
      expect(prismaMock.sessionGroup.findMany).not.toHaveBeenCalled();
    });

    it("matches sessions by name and groups by name or slug, scoped to the org", async () => {
      const matchingSession = makeSession({ id: "session-match", name: "Deploy dashboard" });
      const matchingGroup = makeSessionGroup({
        id: "group-match",
        name: "Deploy pipeline",
        sessions: [makeSession({ id: "session-in-group" })],
      });

      prismaMock.session.findMany.mockResolvedValueOnce([matchingSession]);
      prismaMock.sessionGroup.findMany.mockResolvedValueOnce([matchingGroup]);

      const result = await service.search("org-1", "deploy");

      expect(prismaMock.session.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: "org-1",
          name: { contains: "deploy", mode: "insensitive" },
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: expect.any(Object),
      });
      expect(prismaMock.sessionGroup.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: "org-1",
          OR: [
            { name: { contains: "deploy", mode: "insensitive" } },
            { slug: { contains: "deploy", mode: "insensitive" } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: expect.any(Object),
      });
      expect(result.sessions.map((session) => session.id)).toEqual(["session-match"]);
      expect(result.sessionGroups.map((group) => group.id)).toEqual(["group-match"]);
      // Derived status + sorted sessions should be present on the snapshot
      expect(result.sessionGroups[0]?.status).toBeDefined();
    });

    it("narrows to a channel when channelId is provided", async () => {
      prismaMock.session.findMany.mockResolvedValueOnce([]);
      prismaMock.sessionGroup.findMany.mockResolvedValueOnce([]);

      await service.search("org-1", "deploy", "channel-1");

      expect(prismaMock.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "org-1",
            channelId: "channel-1",
          }),
        }),
      );
      expect(prismaMock.sessionGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "org-1",
            channelId: "channel-1",
          }),
        }),
      );
    });

    it("trims whitespace and caps query length at 200 chars", async () => {
      prismaMock.session.findMany.mockResolvedValueOnce([]);
      prismaMock.sessionGroup.findMany.mockResolvedValueOnce([]);

      const longInput = `  ${"a".repeat(500)}  `;
      await service.search("org-1", longInput);

      const sessionCall = prismaMock.session.findMany.mock.calls[0]?.[0];
      const sessionWhere = sessionCall?.where as { name?: { contains?: string } };
      expect(sessionWhere.name?.contains?.length).toBe(200);
    });
  });

  describe("start", () => {
    it("creates a new session group for a channel entrypoint", async () => {
      const sessionGroup = makeSessionGroup();
      const session = makeSession({ sessionGroup });

      prismaMock.agentEnvironment.findFirst.mockResolvedValueOnce(makeAgentEnvironment());
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
      } as unknown as StartSessionServiceInput);

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
        } as unknown as StartSessionServiceInput),
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
        } as unknown as StartSessionServiceInput),
      ).rejects.toThrow("Selected runtime does not have this repo linked");

      expect(prismaMock.sessionGroup.create).not.toHaveBeenCalled();
      expect(prismaMock.session.create).not.toHaveBeenCalled();
    });

    it("creates a new session group on a selected bridge before access is approved", async () => {
      const sessionGroup = makeSessionGroup({
        connection: {
          state: "connected",
          retryCount: 0,
          canRetry: true,
          canMove: true,
          runtimeInstanceId: "runtime-1",
          runtimeLabel: "Teammate Laptop",
        },
      });
      const session = makeSession({
        sessionGroup,
        hosting: "local",
        connection: sessionGroup.connection,
      });
      prismaMock.channel.findUnique.mockResolvedValueOnce({
        id: "channel-1",
        organizationId: "org-1",
        type: "coding",
        repoId: "repo-1",
      });
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        label: "Teammate Laptop",
        hostingMode: "local",
        registeredRepoIds: ["repo-1"],
        supportedTools: ["claude_code"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });
      runtimeAccessServiceMock.getAccessState.mockResolvedValueOnce({
        runtimeInstanceId: "runtime-1",
        bridgeRuntimeId: "bridge-runtime-1",
        label: "Teammate Laptop",
        hostingMode: "local",
        connected: true,
        ownerUser: { id: "owner-1", name: "Owner", avatarUrl: null },
        allowed: false,
        isOwner: false,
        scopeType: null,
        sessionGroupId: null,
        capabilities: [],
        expiresAt: null,
        pendingRequest: null,
      });
      prismaMock.sessionGroup.create.mockResolvedValueOnce(sessionGroup);
      prismaMock.session.create.mockResolvedValueOnce(session);

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        channelId: "channel-1",
        runtimeInstanceId: "runtime-1",
        prompt: "Use the selected bridge",
      } as unknown as StartSessionServiceInput);

      expect(runtimeAccessServiceMock.assertAccess).not.toHaveBeenCalledWith(
        expect.objectContaining({ runtimeInstanceId: "runtime-1" }),
      );
      expect(prismaMock.sessionGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            connection: expect.objectContaining({
              runtimeInstanceId: "runtime-1",
              runtimeLabel: "Teammate Laptop",
            }),
          }),
        }),
      );
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pendingRun: expect.objectContaining({
              type: "run",
              prompt: "Use the selected bridge",
            }),
          }),
        }),
      );
      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith("session-1", "runtime-1");
      expect(sessionRouterMock.createRuntime).not.toHaveBeenCalled();
    });

    it("resumes a queued initial prompt when bridge access is approved", async () => {
      const session = makeSession({
        hosting: "local",
        agentStatus: "not_started",
        workdir: null,
        pendingRun: {
          type: "run",
          prompt: "Use the selected bridge",
          interactionMode: null,
          clientSource: null,
        },
        connection: {
          state: "connected",
          retryCount: 0,
          canRetry: true,
          canMove: true,
          runtimeInstanceId: "runtime-1",
          runtimeLabel: "Teammate Laptop",
        },
      });
      prismaMock.session.findMany.mockResolvedValueOnce([session]);
      prismaMock.session.update.mockResolvedValueOnce({
        ...session,
        agentStatus: "active",
        connection: {
          ...session.connection,
          state: "connecting",
        },
      });
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        label: "Teammate Laptop",
        hostingMode: "local",
        registeredRepoIds: ["repo-1"],
        supportedTools: ["claude_code"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });

      await service.resumePendingBridgeAccessSessions({
        organizationId: "org-1",
        granteeUserId: "user-1",
        runtimeInstanceId: "runtime-1",
        scopeType: "session_group",
        sessionGroupId: "group-1",
      });

      expect(prismaMock.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdById: "user-1",
            sessionGroupId: "group-1",
            connection: { path: ["runtimeInstanceId"], equals: "runtime-1" },
          }),
        }),
      );
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "session-1" },
          data: expect.objectContaining({
            agentStatus: "active",
            connection: expect.objectContaining({
              state: "connecting",
              runtimeInstanceId: "runtime-1",
            }),
          }),
        }),
      );
      await vi.waitFor(() => {
        expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId: "session-1",
            sessionGroupId: "group-1",
            hosting: "local",
            repo: expect.objectContaining({ id: "repo-1" }),
          }),
        );
      });
    });

    it("uses an explicit runtime from a local environment config", async () => {
      const sessionGroup = makeSessionGroup();
      const session = makeSession({ sessionGroup, hosting: "local" });
      prismaMock.agentEnvironment.findFirstOrThrow.mockResolvedValueOnce({
        id: "env-1",
        organizationId: "org-1",
        name: "Local Laptop",
        adapterType: "local",
        config: { runtimeInstanceId: "runtime-env" },
        enabled: true,
        isDefault: false,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
      });
      prismaMock.channel.findUnique.mockResolvedValueOnce({
        id: "channel-1",
        organizationId: "org-1",
        type: "coding",
        repoId: "repo-1",
      });
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-env",
        label: "Env Laptop",
        hostingMode: "local",
        registeredRepoIds: ["repo-1"],
        supportedTools: ["claude_code"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });
      prismaMock.sessionGroup.create.mockResolvedValueOnce(sessionGroup);
      prismaMock.session.create.mockResolvedValueOnce(session);

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        channelId: "channel-1",
        environmentId: "env-1",
        prompt: "Use the local environment",
      } as unknown as StartSessionServiceInput);

      expect(runtimeAccessServiceMock.getAccessState).toHaveBeenCalledWith(
        expect.objectContaining({
          runtimeInstanceId: "runtime-env",
          sessionGroupId: null,
        }),
      );
      expect(prismaMock.sessionGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            connection: expect.objectContaining({
              environmentId: "env-1",
              adapterType: "local",
              runtimeInstanceId: "runtime-env",
              runtimeLabel: "Env Laptop",
            }),
          }),
        }),
      );
      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith("session-1", "runtime-env");
      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          adapterType: "local",
          environment: expect.objectContaining({ id: "env-1" }),
        }),
      );
    });

    it("rejects a runtime override that conflicts with the selected local environment", async () => {
      prismaMock.agentEnvironment.findFirstOrThrow.mockResolvedValueOnce({
        id: "env-1",
        organizationId: "org-1",
        name: "Local Laptop",
        adapterType: "local",
        config: { runtimeInstanceId: "runtime-env" },
        enabled: true,
        isDefault: false,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
      });
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
          environmentId: "env-1",
          runtimeInstanceId: "runtime-other",
        } as unknown as StartSessionServiceInput),
      ).rejects.toThrow("runtimeInstanceId does not match the selected local environment");

      expect(runtimeAccessServiceMock.assertAccess).not.toHaveBeenCalledWith(
        expect.objectContaining({ runtimeInstanceId: "runtime-other" }),
      );
      expect(prismaMock.sessionGroup.create).not.toHaveBeenCalled();
      expect(prismaMock.session.create).not.toHaveBeenCalled();
    });

    it("queues prompted starts without resolving the org default environment", async () => {
      const sessionGroup = makeSessionGroup({ connection: { state: "pending" } });
      const session = makeSession({ sessionGroup, hosting: "local" });
      prismaMock.channel.findUnique.mockResolvedValueOnce({
        id: "channel-1",
        organizationId: "org-1",
        type: "coding",
        repoId: "repo-1",
      });
      prismaMock.sessionGroup.create.mockResolvedValueOnce(sessionGroup);
      prismaMock.session.create.mockResolvedValueOnce(session);

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        channelId: "channel-1",
        prompt: "Use the default environment",
      } as unknown as StartSessionServiceInput);

      expect(prismaMock.sessionGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            connection: expect.objectContaining({
              state: "pending",
            }),
          }),
        }),
      );
      expect(prismaMock.agentEnvironment.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hosting: "local",
            pendingRun: expect.objectContaining({
              type: "run",
              prompt: "Use the default environment",
            }),
          }),
        }),
      );
      expect(sessionRouterMock.createRuntime).not.toHaveBeenCalled();
    });

    it("falls back from an inaccessible explicit local environment runtime to an accessible bridge", async () => {
      const sessionGroup = makeSessionGroup({
        connection: {
          state: "connected",
          retryCount: 0,
          canRetry: true,
          canMove: true,
          runtimeInstanceId: "runtime-accessible",
          runtimeLabel: "Accessible Laptop",
          environmentId: "env-default-local",
          adapterType: "local",
        },
      });
      const session = makeSession({
        sessionGroup,
        hosting: "local",
        connection: sessionGroup.connection,
      });

      prismaMock.agentEnvironment.findFirst.mockResolvedValueOnce(
        makeAgentEnvironment({
          id: "env-default-local",
          name: "Default Local",
          adapterType: "local",
          config: { runtimeInstanceId: "runtime-denied" },
        }),
      );
      prismaMock.channel.findUnique.mockResolvedValueOnce({
        id: "channel-1",
        organizationId: "org-1",
        type: "coding",
        repoId: "repo-1",
      });
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-denied",
        label: "Denied Laptop",
        hostingMode: "local",
        registeredRepoIds: ["repo-1"],
        supportedTools: ["claude_code"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });
      runtimeAccessServiceMock.getAccessState.mockResolvedValueOnce({
        runtimeInstanceId: "runtime-denied",
        bridgeRuntimeId: "bridge-denied",
        label: "Denied Laptop",
        hostingMode: "local",
        connected: true,
        ownerUser: { id: "owner-1", name: "Owner", avatarUrl: null },
        allowed: false,
        isOwner: false,
        scopeType: null,
        sessionGroupId: null,
        capabilities: [],
        expiresAt: null,
        pendingRequest: null,
      });
      runtimeAccessServiceMock.listAccessibleRuntimeInstanceIds.mockResolvedValueOnce(
        new Set(["runtime-accessible"]),
      );
      sessionRouterMock.listRuntimes.mockReturnValueOnce([
        {
          id: "runtime-denied",
          label: "Denied Laptop",
          organizationId: "org-1",
          hostingMode: "local",
          supportedTools: ["claude_code"],
          registeredRepoIds: ["repo-1"],
          boundSessions: new Set<string>(),
          ws: { readyState: 1, OPEN: 1 },
        },
        {
          id: "runtime-accessible",
          label: "Accessible Laptop",
          organizationId: "org-1",
          hostingMode: "local",
          supportedTools: ["claude_code"],
          registeredRepoIds: ["repo-1"],
          boundSessions: new Set<string>(),
          ws: { readyState: 1, OPEN: 1 },
        },
      ] as unknown as ReturnType<typeof sessionRouterMock.listRuntimes>);
      prismaMock.sessionGroup.create.mockResolvedValueOnce(sessionGroup);
      prismaMock.session.create.mockResolvedValueOnce(session);

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        channelId: "channel-1",
        hosting: "local",
        prompt: "Use the default local environment",
      } as unknown as StartSessionServiceInput);

      expect(prismaMock.sessionGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            connection: expect.objectContaining({
              environmentId: "env-default-local",
              adapterType: "local",
              runtimeInstanceId: "runtime-accessible",
              runtimeLabel: "Accessible Laptop",
            }),
          }),
        }),
      );
      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith("session-1", "runtime-accessible");
      expect(sessionRouterMock.bindSession).not.toHaveBeenCalledWith("session-1", "runtime-denied");
      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          adapterType: "local",
          environment: expect.objectContaining({ id: "env-default-local" }),
        }),
      );
    });

    it("creates a pending session when no default environment exists", async () => {
      const sessionGroup = makeSessionGroup({ connection: { state: "pending" } });
      const session = makeSession({ sessionGroup, hosting: "local" });
      prismaMock.channel.findUnique.mockResolvedValueOnce({
        id: "channel-1",
        organizationId: "org-1",
        type: "coding",
        repoId: "repo-1",
      });
      prismaMock.sessionGroup.create.mockResolvedValueOnce(sessionGroup);
      prismaMock.session.create.mockResolvedValueOnce(session);

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        channelId: "channel-1",
      } as unknown as StartSessionServiceInput);

      expect(prismaMock.agentEnvironment.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.sessionGroup.create).toHaveBeenCalled();
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hosting: "local",
            connection: expect.objectContaining({ state: "pending" }),
          }),
        }),
      );
    });

    it("defers runtime selection without resolving the org default environment", async () => {
      const sessionGroup = makeSessionGroup({ connection: { state: "pending" } });
      const session = makeSession({ sessionGroup, hosting: "local" });
      prismaMock.channel.findUnique.mockResolvedValueOnce({
        id: "channel-1",
        organizationId: "org-1",
        type: "coding",
        repoId: "repo-1",
      });
      prismaMock.sessionGroup.create.mockResolvedValueOnce(sessionGroup);
      prismaMock.session.create.mockResolvedValueOnce(session);

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        channelId: "channel-1",
        deferRuntimeSelection: true,
      } as unknown as StartSessionServiceInput);

      expect(prismaMock.agentEnvironment.findFirst).not.toHaveBeenCalled();
      expect(sessionRouterMock.getRuntime).not.toHaveBeenCalled();
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hosting: "local",
            connection: expect.not.objectContaining({
              environmentId: expect.any(String),
              runtimeInstanceId: expect.any(String),
            }),
          }),
        }),
      );
    });

    it("falls back to an accessible bridge for any-accessible local environments", async () => {
      const sessionGroup = makeSessionGroup();
      const session = makeSession({ sessionGroup, hosting: "local" });
      prismaMock.agentEnvironment.findFirstOrThrow.mockResolvedValueOnce({
        id: "env-1",
        organizationId: "org-1",
        name: "Any Local",
        adapterType: "local",
        config: { runtimeSelection: "any_accessible_local" },
        enabled: true,
        isDefault: false,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
      });
      prismaMock.channel.findUnique.mockResolvedValueOnce({
        id: "channel-1",
        organizationId: "org-1",
        type: "coding",
        repoId: "repo-1",
      });
      runtimeAccessServiceMock.listAccessibleRuntimeInstanceIds.mockResolvedValueOnce(
        new Set(["runtime-accessible"]),
      );
      sessionRouterMock.listRuntimes.mockReturnValueOnce([
        {
          key: "runtime-accessible",
          id: "runtime-accessible",
          label: "Accessible Laptop",
          hostingMode: "local",
          organizationId: "org-1",
          registeredRepoIds: ["repo-1"],
          supportedTools: ["claude_code"],
          boundSessions: new Set<string>(),
          ws: { readyState: 1, OPEN: 1 },
        },
      ] as unknown as ReturnType<typeof sessionRouterMock.listRuntimes>);
      prismaMock.sessionGroup.create.mockResolvedValueOnce(sessionGroup);
      prismaMock.session.create.mockResolvedValueOnce(session);

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        channelId: "channel-1",
        environmentId: "env-1",
        prompt: "Use any local runtime",
      } as unknown as StartSessionServiceInput);

      expect(prismaMock.sessionGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            connection: expect.objectContaining({
              environmentId: "env-1",
              adapterType: "local",
              runtimeInstanceId: "runtime-accessible",
              runtimeLabel: "Accessible Laptop",
            }),
          }),
        }),
      );
      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith("session-1", "runtime-accessible");
    });

    it("falls back from a stale explicit local default environment to an accessible bridge", async () => {
      const sessionGroup = makeSessionGroup();
      const session = makeSession({ sessionGroup, hosting: "local" });
      prismaMock.agentEnvironment.findFirst.mockResolvedValueOnce({
        id: "env-stale",
        organizationId: "org-1",
        name: "Old Laptop",
        adapterType: "local",
        config: {
          runtimeInstanceId: "runtime-stale",
          capabilities: { supportedTools: ["claude_code"] },
        },
        enabled: true,
        isDefault: true,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
      });
      prismaMock.channel.findUnique.mockResolvedValueOnce({
        id: "channel-1",
        organizationId: "org-1",
        type: "coding",
        repoId: "repo-1",
      });
      runtimeAccessServiceMock.listAccessibleRuntimeInstanceIds.mockResolvedValueOnce(
        new Set(["runtime-current"]),
      );
      runtimeAccessServiceMock.getAccessState.mockResolvedValueOnce({
        hostingMode: "local",
        allowed: true,
        isOwner: true,
      });
      const currentRuntime = {
        key: "org-1:runtime-current",
        id: "runtime-current",
        label: "Current Laptop",
        hostingMode: "local",
        organizationId: "org-1",
        registeredRepoIds: ["repo-1"],
        supportedTools: ["claude_code"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      };
      sessionRouterMock.getRuntime.mockImplementation(
        (runtimeId: string, organizationId?: string | null) =>
          runtimeId === "runtime-current" && organizationId === "org-1"
            ? (currentRuntime as unknown as ReturnType<typeof sessionRouterMock.getRuntime>)
            : null,
      );
      sessionRouterMock.listRuntimes.mockReturnValueOnce([currentRuntime] as unknown as ReturnType<
        typeof sessionRouterMock.listRuntimes
      >);
      prismaMock.sessionGroup.create.mockResolvedValueOnce(sessionGroup);
      prismaMock.session.create.mockResolvedValueOnce(session);

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        channelId: "channel-1",
        hosting: "local",
        prompt: "Use the current bridge",
      } as unknown as StartSessionServiceInput);

      expect(runtimeAccessServiceMock.getAccessState).toHaveBeenCalledWith(
        expect.objectContaining({
          runtimeInstanceId: "runtime-current",
          sessionGroupId: null,
        }),
      );
      expect(prismaMock.sessionGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            connection: expect.objectContaining({
              environmentId: "env-stale",
              adapterType: "local",
              runtimeInstanceId: "runtime-current",
              runtimeLabel: "Current Laptop",
            }),
          }),
        }),
      );
      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith(
        "session-1",
        "org-1:runtime-current",
      );
    });

    it("starts a session with an explicit provisioned environment", async () => {
      const sessionGroup = makeSessionGroup();
      const session = makeSession({ sessionGroup, hosting: "cloud" });
      prismaMock.agentEnvironment.findFirstOrThrow.mockResolvedValueOnce(
        makeAgentEnvironment({
          id: "env-provisioned-1",
          name: "AWS dev pool",
          isDefault: false,
          config: {
            startUrl: "https://launcher.example.test/start",
            stopUrl: "https://launcher.example.test/stop",
            statusUrl: "https://launcher.example.test/status",
            auth: { type: "bearer", secretId: "secret-1" },
            startupTimeoutSeconds: 60,
            deprovisionPolicy: "on_session_end",
          },
        }),
      );
      prismaMock.channel.findUnique.mockResolvedValueOnce({
        id: "channel-1",
        organizationId: "org-1",
        type: "coding",
        repoId: "repo-1",
      });
      prismaMock.sessionGroup.create.mockResolvedValueOnce(sessionGroup);
      prismaMock.session.create.mockResolvedValueOnce(session);

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        channelId: "channel-1",
        environmentId: "env-provisioned-1",
        prompt: "Use provisioned capacity",
      } as unknown as StartSessionServiceInput);

      expect(prismaMock.sessionGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            connection: expect.objectContaining({
              environmentId: "env-provisioned-1",
              adapterType: "provisioned",
            }),
          }),
        }),
      );
      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          hosting: "cloud",
          adapterType: "provisioned",
          environment: expect.objectContaining({ id: "env-provisioned-1" }),
        }),
      );
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
      } as unknown as StartSessionServiceInput);

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
        hosting: "cloud",
        sessionGroupId: "group-1",
      } as unknown as StartSessionServiceInput);

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
        prompt: "restore session",
      } as unknown as StartSessionServiceInput);

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
        command: "git push -u origin HEAD",
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
      runtimeAccessServiceMock.assertAccess.mockRejectedValueOnce(
        new Error("Access denied: you do not have permission to use this local bridge"),
      );
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        workdir: "/tmp/trace",
        worktreeDeleted: false,
        connection: { runtimeInstanceId: "runtime-1" },
      });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          workdir: "/tmp/trace",
          connection: { runtimeInstanceId: "runtime-1" },
        },
      ]);

      await expect(service.listFiles("group-1", "org-1", "user-1")).rejects.toThrow(
        "Access denied: you do not have permission to access files on this local bridge",
      );
      expect(sessionRouterMock.listFiles).not.toHaveBeenCalled();
    });

    it("rejects file reads for paths outside the enumerated file list", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        workdir: "/tmp/trace",
        worktreeDeleted: false,
        connection: { runtimeInstanceId: "runtime-1" },
      });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          workdir: "/tmp/trace",
          connection: { runtimeInstanceId: "runtime-1" },
        },
      ]);
      sessionRouterMock.getRuntime.mockReturnValueOnce({ id: "runtime-1" });
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

    it("records the first pending question for a tool_use id", async () => {
      const data = {
        type: "assistant",
        message: {
          content: [
            {
              type: "question",
              toolUseId: "toolu_pending_1",
              questions: [
                { header: "Choice", question: "Pick one", options: [], multiSelect: false },
              ],
            },
          ],
        },
      };

      prismaMock.session.findUnique.mockResolvedValueOnce({
        organizationId: "org-1",
        agentStatus: "active",
        sessionStatus: "in_progress",
        sessionGroupId: "group-1",
      });
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        ...makeSessionGroup(),
        sessions: [{ agentStatus: "done", sessionStatus: "needs_input" }],
      });
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        createdById: "user-1",
        name: "Implement dashboard filters",
      });

      await service.recordOutput("session-1", data as Record<string, unknown>);

      expect(eventServiceMock.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          eventType: "session_output",
          payload: data,
        }),
      );
      expect(eventServiceMock.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          eventType: "session_output",
          payload: expect.objectContaining({
            type: "question_pending",
            sessionStatus: "needs_input",
          }),
        }),
      );
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { id: "session-1", agentStatus: "active" },
        data: { sessionStatus: "needs_input" },
      });
    });

    it("records repeated pending questions even when the tool_use id matches", async () => {
      const data = {
        type: "assistant",
        message: {
          content: [
            {
              type: "question",
              toolUseId: "toolu_pending_1",
              questions: [
                { header: "Choice", question: "Pick one", options: [], multiSelect: false },
              ],
            },
          ],
        },
      };

      prismaMock.session.findUnique.mockResolvedValueOnce({
        organizationId: "org-1",
        agentStatus: "active",
        sessionStatus: "in_progress",
        sessionGroupId: "group-1",
      });
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        ...makeSessionGroup(),
        sessions: [{ agentStatus: "done", sessionStatus: "needs_input" }],
      });
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        createdById: "user-1",
        name: "Implement dashboard filters",
      });

      await service.recordOutput("session-1", data as Record<string, unknown>);

      expect(eventServiceMock.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          eventType: "session_output",
          payload: data,
        }),
      );
      expect(eventServiceMock.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          eventType: "session_output",
          payload: expect.objectContaining({
            type: "question_pending",
            sessionStatus: "needs_input",
          }),
        }),
      );
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { id: "session-1", agentStatus: "active" },
        data: { sessionStatus: "needs_input" },
      });
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
          agentStatus: "active",
          sessionStatus: "in_progress",
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

  describe("sendMessage", () => {
    it("does not preserve a channel base branch as the worktree branch for deferred sessions", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(
        makeSession({
          agentStatus: "not_started",
          workdir: null,
          toolSessionId: null,
          branch: "release",
          channel: { id: "channel-1", name: "Backend", baseBranch: "release" },
          sessionGroup: makeSessionGroup({ slug: null, branch: "release" }),
        }),
      );
      prismaMock.session.update.mockResolvedValueOnce(makeSession({ branch: "release" }));

      await service.sendMessage({
        sessionId: "session-1",
        text: "start work",
        actorType: "agent",
        actorId: "agent-1",
      });

      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          branch: "release",
          preserveBranchName: false,
        }),
      );
    });

    it("pins delivery to the session's home runtime via expectedHomeRuntimeId", async () => {
      // Scenario: session was running on Laptop A (runtime-a). sendMessage must
      // pass runtime-a as expectedHomeRuntimeId so sessionRouter.send cannot
      // auto-bind to any other connected bridge.
      const session = makeSession({
        agentStatus: "done",
        sessionStatus: "in_progress",
        workdir: "/tmp/worktree",
        toolSessionId: "tool-sess-1",
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-a",
          runtimeLabel: "Laptop A",
          retryCount: 0,
          canRetry: true,
          canMove: true,
        },
      });
      prismaMock.session.findUniqueOrThrow.mockResolvedValue(session);
      prismaMock.session.update.mockResolvedValue(session);
      sessionRouterMock.send.mockReturnValue("delivered");
      sessionRouterMock.getRuntimeForSession.mockReturnValue({
        id: "runtime-a",
        label: "Laptop A",
      });

      await service.sendMessage({
        sessionId: "session-1",
        text: "hello",
        actorType: "user",
        actorId: "user-1",
      });

      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({ type: "send", sessionId: "session-1" }),
        { expectedHomeRuntimeId: "runtime-a", organizationId: "org-1" },
      );
      // Post-delivery: session transitions to active and records the send
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "session-1" },
          data: expect.objectContaining({
            agentStatus: "active",
            sessionStatus: "in_progress",
          }),
        }),
      );
      const resumedCalls = eventServiceMock.create.mock.calls.filter((call: unknown[]) => {
        const arg = call[0] as { eventType?: string } | undefined;
        return arg?.eventType === "session_resumed";
      });
      expect(resumedCalls.length).toBe(1);
    });

    it("does not prepend conversation history twice after a tool switch", async () => {
      const session = makeSession({
        agentStatus: "done",
        sessionStatus: "in_progress",
        workdir: "/tmp/worktree",
        toolChangedAt: new Date("2024-01-03T00:00:00.000Z"),
        toolSessionId: null,
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-a",
          runtimeLabel: "Laptop A",
          retryCount: 0,
          canRetry: true,
          canMove: true,
        },
      });
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(session);
      prismaMock.event.findFirst.mockReset();
      prismaMock.event.findMany.mockReset();
      prismaMock.event.findFirst.mockResolvedValueOnce(null);
      prismaMock.event.findMany.mockResolvedValueOnce([
        {
          eventType: "session_started",
          payload: { prompt: "Initial task" },
        },
        {
          eventType: "message_sent",
          payload: { text: "Follow-up instruction" },
        },
      ]);
      prismaMock.session.update.mockResolvedValueOnce(session);
      sessionRouterMock.send.mockReturnValue("delivered");
      sessionRouterMock.getRuntimeForSession.mockReturnValue({
        id: "runtime-a",
        label: "Laptop A",
      });

      await service.sendMessage({
        sessionId: "session-1",
        text: "hello",
        actorType: "user",
        actorId: "user-1",
      });

      const sendCommand = sessionRouterMock.send.mock.calls[0]?.[1] as
        | { prompt?: string }
        | undefined;
      const prompt = sendCommand?.prompt ?? "";
      expect(prompt).toContain("[User]: Initial task");
      expect(prompt).toContain("[User]: Follow-up instruction");
      expect(prompt.match(/<conversation-history>/g) ?? []).toHaveLength(1);
    });

    it("treats delivery as disconnected when the home runtime is unavailable", async () => {
      // sessionRouter.send returns "runtime_disconnected" when the expected
      // home runtime isn't currently registered. sendMessage must queue the
      // message as pendingRun, persist the failure with autoRetryable: false,
      // and emit a connection_lost event.
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(
        makeSession({
          agentStatus: "done",
          sessionStatus: "in_progress",
          workdir: "/Users/laptop-a/worktree",
          toolSessionId: "tool-sess-1",
          connection: {
            state: "disconnected",
            runtimeInstanceId: "runtime-a",
            runtimeLabel: "Laptop A",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      prismaMock.session.findUnique.mockResolvedValueOnce({
        agentStatus: "done",
        sessionStatus: "in_progress",
        connection: {
          state: "disconnected",
          runtimeInstanceId: "runtime-a",
          runtimeLabel: "Laptop A",
          retryCount: 0,
          canRetry: true,
          canMove: true,
        },
        sessionGroupId: "group-1",
      });
      sessionRouterMock.send.mockReturnValue("runtime_disconnected");

      await service.sendMessage({
        sessionId: "session-1",
        text: "hello from laptop B",
        actorType: "user",
        actorId: "user-1",
      });

      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({ type: "send" }),
        { expectedHomeRuntimeId: "runtime-a", organizationId: "org-1" },
      );
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "session-1" },
          data: expect.objectContaining({
            pendingRun: expect.objectContaining({
              type: "send",
              prompt: expect.stringContaining("hello from laptop B"),
            }),
          }),
        }),
      );
      // persistConnectionFailure must mark this as non-auto-retryable because
      // the home bridge is the cause — only Move/home-return can unblock.
      const connectionWrites = prismaMock.session.update.mock.calls.filter((call: unknown[]) => {
        const arg = call[0] as { data?: { connection?: { autoRetryable?: boolean } } } | undefined;
        return arg?.data?.connection !== undefined;
      });
      expect(connectionWrites.length).toBeGreaterThan(0);
      const lastConn = connectionWrites[connectionWrites.length - 1][0].data.connection as {
        autoRetryable?: boolean;
        lastError?: string;
      };
      expect(lastConn.autoRetryable).toBe(false);
      expect(lastConn.lastError).toContain("Laptop A");
      const connectionLostCalls = eventServiceMock.create.mock.calls.filter((call: unknown[]) => {
        const arg = call[0] as { payload?: { type?: string } } | undefined;
        return arg?.payload?.type === "connection_lost";
      });
      expect(connectionLostCalls.length).toBeGreaterThan(0);
    });

    it("does not deliver cloud sends to an in-memory binding without a persisted cloud runtime", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "cloud",
          agentStatus: "done",
          sessionStatus: "in_progress",
          workdir: "/workspace/session-1",
          toolSessionId: "tool-sess-1",
          connection: {
            state: "connected",
            adapterType: "provisioned",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      prismaMock.session.findUnique.mockResolvedValueOnce({
        agentStatus: "done",
        sessionStatus: "in_progress",
        hosting: "cloud",
        connection: {
          state: "connected",
          adapterType: "provisioned",
          retryCount: 0,
          canRetry: true,
          canMove: true,
        },
        sessionGroupId: "group-1",
      });
      sessionRouterMock.getRuntimeForSession.mockReturnValue({
        id: "local-runtime",
        label: "Laptop",
      });

      await service.sendMessage({
        sessionId: "session-1",
        text: "hello from stale binding",
        actorType: "user",
        actorId: "user-1",
      });

      expect(sessionRouterMock.send).not.toHaveBeenCalled();
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "session-1" },
          data: expect.objectContaining({
            pendingRun: expect.objectContaining({
              type: "send",
              prompt: expect.stringContaining("hello from stale binding"),
            }),
          }),
        }),
      );
    });

    it("prepares a deferred local workspace even when the session is already bound to its bridge", async () => {
      const session = makeSession({
        agentStatus: "not_started",
        sessionStatus: "in_progress",
        hosting: "local",
        workdir: null,
        toolSessionId: null,
        pendingRun: null,
        connection: {
          state: "connected",
          adapterType: "local",
          runtimeInstanceId: "runtime-a",
          runtimeLabel: "Laptop A",
          retryCount: 0,
          canRetry: true,
          canMove: true,
        },
      });
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(session);
      prismaMock.session.update.mockResolvedValueOnce(session);
      sessionRouterMock.getRuntime.mockReturnValue({
        id: "runtime-a",
        label: "Laptop A",
        hostingMode: "local",
        registeredRepoIds: ["repo-1"],
      });
      sessionRouterMock.getRuntimeForSession.mockReturnValue({
        id: "runtime-a",
        label: "Laptop A",
      });

      await service.sendMessage({
        sessionId: "session-1",
        text: "start work",
        actorType: "user",
        actorId: "user-1",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          hosting: "local",
          adapterType: "local",
          repo: expect.objectContaining({ id: "repo-1" }),
        }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "message_sent",
          payload: expect.objectContaining({
            deliveryStatus: "pending_runtime",
          }),
        }),
      );
    });

    it("records startup lifecycle for a deferred provisioned workspace after the first message", async () => {
      const session = makeSession({
        agentStatus: "not_started",
        sessionStatus: "in_progress",
        hosting: "cloud",
        workdir: null,
        toolSessionId: null,
        pendingRun: null,
        connection: {
          state: "connected",
          adapterType: "provisioned",
          retryCount: 0,
          canRetry: true,
          canMove: true,
          version: 0,
        },
      });
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(session);
      prismaMock.session.update.mockResolvedValueOnce(session);
      prismaMock.session.findUnique.mockResolvedValueOnce({
        connection: session.connection,
      });

      await service.sendMessage({
        sessionId: "session-1",
        text: "start work",
        actorType: "user",
        actorId: "user-1",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      const createRuntimeCall = sessionRouterMock.createRuntime.mock.calls[0]?.[0];
      const onLifecycle = createRuntimeCall?.onLifecycle;
      expect(onLifecycle).toBeTypeOf("function");

      prismaMock.session.findUnique
        .mockResolvedValueOnce({
          organizationId: "org-1",
          sessionGroupId: "group-1",
          agentStatus: "active",
          sessionStatus: "in_progress",
        })
        .mockResolvedValueOnce({
          connection: session.connection,
          sessionGroupId: "group-1",
        });
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce(
        makeSessionGroup({
          id: "group-1",
          sessions: [{ agentStatus: "not_started", sessionStatus: "in_progress" }],
        }),
      );

      await onLifecycle?.("session_runtime_start_requested", {
        runtimeInstanceId: "runtime-provisioned-1",
      });

      expect(prismaMock.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            connection: expect.objectContaining({
              state: "requested",
              runtimeInstanceId: "runtime-provisioned-1",
            }),
          },
        }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_runtime_start_requested",
          payload: expect.objectContaining({
            agentStatus: "active",
            lifecycleState: "requested",
            connection: expect.objectContaining({
              state: "requested",
              runtimeInstanceId: "runtime-provisioned-1",
            }),
          }),
        }),
      );
    });
  });

  describe("recoverMissingToolSession", () => {
    it("clears a stale tool session id and retries with conversation history", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(
        makeSession({
          agentStatus: "active",
          workdir: "/tmp/worktree",
          toolSessionId: "stale-tool-session",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-a",
            runtimeLabel: "Laptop A",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      prismaMock.event.findMany.mockResolvedValueOnce([
        {
          eventType: "session_started",
          payload: { prompt: "Initial task" },
        },
        {
          eventType: "message_sent",
          payload: { text: "Follow-up instruction" },
        },
      ]);
      prismaMock.event.findFirst.mockResolvedValueOnce({ id: "event-message-1" });
      sessionRouterMock.send.mockReturnValueOnce("delivered");

      await service.recoverMissingToolSession("session-1", {
        toolSessionId: "stale-tool-session",
        message: "No conversation found with session ID stale-tool-session",
        interactionMode: "code",
      });

      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: { toolSessionId: null },
      });
      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          type: "send",
          sessionId: "session-1",
          prompt: expect.stringContaining("[User]: Follow-up instruction"),
          checkpointContext: expect.objectContaining({
            promptEventId: "event-message-1",
          }),
        }),
        { expectedHomeRuntimeId: "runtime-a", organizationId: "org-1" },
      );
      const sendCommand = sessionRouterMock.send.mock.calls[0]?.[1] as
        | Record<string, unknown>
        | undefined;
      expect(sendCommand).not.toHaveProperty("toolSessionId");
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ type: "tool_session_recovered" }),
        }),
      );
    });

    it("ignores recovery from an old bridge process after a new tool id is stored", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(
        makeSession({
          agentStatus: "active",
          toolSessionId: "new-tool-session",
        }),
      );

      await service.recoverMissingToolSession("session-1", {
        toolSessionId: "stale-tool-session",
      });

      expect(sessionRouterMock.send).not.toHaveBeenCalled();
      expect(prismaMock.session.update).not.toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: { toolSessionId: null },
      });
    });
  });

  describe("retryConnection", () => {
    beforeEach(() => {
      prismaMock.session.findFirstOrThrow.mockReset();
      prismaMock.session.findUnique.mockReset();
      prismaMock.session.findUniqueOrThrow.mockReset();
      prismaMock.session.update.mockReset();
      eventServiceMock.create.mockClear();
    });

    it("fails without picking a different bridge when the home runtime is offline", async () => {
      // Laptop A is the home bridge; Laptop B is also connected. Auto-retry
      // must not silently hand off to Laptop B — the user must explicitly Move.
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "local",
          agentStatus: "done",
          sessionStatus: "in_progress",
          connection: {
            state: "disconnected",
            runtimeInstanceId: "runtime-a",
            runtimeLabel: "Laptop A",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      prismaMock.session.findUniqueOrThrow.mockResolvedValue(
        makeSession({
          hosting: "local",
          connection: {
            state: "disconnected",
            runtimeInstanceId: "runtime-a",
            runtimeLabel: "Laptop A",
            retryCount: 1,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      prismaMock.sessionGroup.findUnique.mockResolvedValue(makeSessionGroup());
      sessionRouterMock.isRuntimeAvailable.mockImplementation((id: string) => id !== "runtime-a");
      sessionRouterMock.getRuntime.mockImplementation((id: string) =>
        id === "runtime-a" ? null : { id, label: id, ws: { readyState: 1, OPEN: 1 } },
      );

      await service.retryConnection("session-1", "org-1", "user", "user-1");
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(sessionRouterMock.bindSession).not.toHaveBeenCalled();
      expect(sessionRouterMock.send).not.toHaveBeenCalled();
      const recoveryFailedCalls = eventServiceMock.create.mock.calls.filter((call: unknown[]) => {
        const arg = call[0] as
          | {
              payload?: {
                type?: string;
                reason?: string;
                connection?: { autoRetryable?: boolean };
              };
            }
          | undefined;
        return arg?.payload?.type === "recovery_failed";
      });
      expect(recoveryFailedCalls.length).toBe(1);
      const failurePayload = recoveryFailedCalls[0][0].payload as {
        reason: string;
        connection: { autoRetryable?: boolean; lastError?: string };
      };
      expect(failurePayload.reason).toBe("home_runtime_offline");
      // Non-transient failure — frontend must stop auto-retrying.
      expect(failurePayload.connection.autoRetryable).toBe(false);
      expect(failurePayload.connection.lastError).toContain("Laptop A");
    });

    it("reprovisions cloud sessions when the previous runtime is unavailable", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "cloud",
          workdir: "/tmp/trace/worktrees/session-1",
          connection: {
            state: "timed_out",
            adapterType: "provisioned",
            environmentId: "env-1",
            runtimeInstanceId: "runtime-old",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          hosting: "cloud",
          agentStatus: "not_started",
          connection: {
            state: "connected",
            adapterType: "provisioned",
            environmentId: "env-1",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      prismaMock.session.findUnique.mockResolvedValueOnce({
        connection: {
          state: "timed_out",
          adapterType: "provisioned",
          environmentId: "env-1",
          runtimeInstanceId: "runtime-old",
          retryCount: 0,
          canRetry: true,
          canMove: true,
        },
      });
      prismaMock.agentEnvironment.findFirst.mockResolvedValueOnce(makeAgentEnvironment({ id: "env-1" }));
      sessionRouterMock.isRuntimeAvailable.mockReturnValue(false);

      await service.retryConnection("session-1", "org-1", "user", "user-1");
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(sessionRouterMock.bindSession).not.toHaveBeenCalled();
      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          hosting: "cloud",
          preserveBranchName: true,
          branch: "main",
          adapterType: "provisioned",
        }),
      );
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hosting: "cloud",
            pendingRun: expect.objectContaining({
              type: "run",
              prompt: expect.stringContaining("Source git sync was not verified"),
            }),
            connection: expect.objectContaining({
              adapterType: "provisioned",
              environmentId: "env-1",
            }),
          }),
        }),
      );
      const runtimeMoveCalls = eventServiceMock.create.mock.calls.filter((call: unknown[]) => {
        const arg = call[0] as
          | {
              eventType?: string;
              payload?: {
                type?: string;
                sourceGitStatusVerified?: boolean;
                sourceGitStatusSkippedReason?: string | null;
              };
            }
          | undefined;
        return arg?.eventType === "session_started" && arg.payload?.type === "runtime_move";
      });
      expect(runtimeMoveCalls.length).toBe(1);
      expect(runtimeMoveCalls[0][0]).toEqual(
        expect.objectContaining({
          payload: expect.objectContaining({
            sourceGitStatusVerified: false,
            sourceGitStatusSkippedReason: "source_runtime_unavailable",
          }),
        }),
      );
    });

    it("re-prepares read-only sessions without upgrading them", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          readOnlyWorkspace: true,
          connection: {
            state: "disconnected",
            runtimeInstanceId: "runtime-a",
            runtimeLabel: "Laptop A",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          readOnlyWorkspace: true,
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-a",
            runtimeLabel: "Laptop A",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      sessionRouterMock.isRuntimeAvailable.mockReturnValue(true);
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-a",
        label: "Laptop A",
        hostingMode: "local",
        ws: { readyState: 1, OPEN: 1 },
      });

      await service.retryConnection("session-1", "org-1", "user", "user-1");

      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          type: "prepare",
          readOnly: true,
        }),
        { expectedHomeRuntimeId: "runtime-a", organizationId: "org-1" },
      );
    });
  });

  describe("queueMessage", () => {
    it("preserves and provisions a queued prompt when selecting a runtime", async () => {
      const pendingRun = {
        type: "run",
        prompt: "Implement the plan",
        interactionMode: null,
        clientSource: "web",
        checkpointContext: null,
      };
      const selectedRuntime = {
        key: "org-1:runtime-a",
        id: "runtime-a",
        label: "Laptop A",
        hostingMode: "local",
        organizationId: "org-1",
        registeredRepoIds: ["repo-1"],
        supportedTools: ["claude_code"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      };
      const updatedSession = makeSession({
        agentStatus: "active",
        hosting: "local",
        pendingRun,
        connection: {
          state: "connecting",
          runtimeInstanceId: "runtime-a",
          runtimeLabel: "Laptop A",
          retryCount: 0,
          canRetry: true,
          canMove: true,
        },
      });

      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "local",
          pendingRun,
          connection: { state: "pending", retryCount: 0, canRetry: true, canMove: true },
        }),
      );
      sessionRouterMock.getRuntime.mockReturnValueOnce(
        selectedRuntime as unknown as ReturnType<typeof sessionRouterMock.getRuntime>,
      );
      prismaMock.session.update.mockResolvedValueOnce(updatedSession);

      const result = await service.updateConfig(
        "session-1",
        "org-1",
        { runtimeInstanceId: "runtime-a" },
        "user",
        "user-1",
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(result.pendingRun).toEqual(pendingRun);
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentStatus: "active",
            connection: expect.objectContaining({
              state: "connecting",
              runtimeInstanceId: "runtime-a",
              runtimeLabel: "Laptop A",
            }),
          }),
        }),
      );
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            pendingRun: expect.anything(),
          }),
        }),
      );
      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith("session-1", "org-1:runtime-a");
      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          sessionGroupId: "group-1",
          hosting: "local",
          repo: expect.objectContaining({ id: "repo-1" }),
        }),
      );
    });

    it("persists image keys and includes them in the queued message event payload", async () => {
      const queuedMessage = {
        id: "queued-1",
        sessionId: "session-1",
        text: "inspect this",
        imageKeys: ["uploads/org-1/image-a.png", "uploads/org-1/image-b.png"],
        interactionMode: "ask",
        position: 0,
        createdById: "user-1",
        organizationId: "org-1",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      };
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(
        makeSession({ organizationId: "org-1", worktreeDeleted: false }),
      );
      prismaMock.queuedMessage.aggregate.mockResolvedValueOnce({ _max: { position: null } });
      prismaMock.queuedMessage.create.mockResolvedValueOnce(queuedMessage);

      await service.queueMessage({
        sessionId: "session-1",
        text: "inspect this",
        imageKeys: queuedMessage.imageKeys,
        actorId: "user-1",
        interactionMode: "ask",
        organizationId: "org-1",
        clientSource: "web",
      });

      expect(prismaMock.queuedMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: "session-1",
          text: "inspect this",
          imageKeys: queuedMessage.imageKeys,
        }),
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "queued_message_added",
          payload: expect.objectContaining({
            queuedMessage: expect.objectContaining({
              id: "queued-1",
              imageKeys: queuedMessage.imageKeys,
            }),
          }),
        }),
      );
    });

    it("sends queued image keys as presigned image URLs when draining", async () => {
      const imageKeys = ["uploads/org-1/image-a.png", "uploads/org-1/image-b.png"];
      const session = makeSession({
        agentStatus: "done",
        sessionStatus: "in_progress",
        workdir: "/tmp/worktree",
        toolSessionId: "tool-sess-1",
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-a",
          runtimeLabel: "Laptop A",
          retryCount: 0,
          canRetry: true,
          canMove: true,
        },
      });
      prismaMock.session.findUnique.mockResolvedValueOnce({
        agentStatus: "done",
        sessionStatus: "in_progress",
        organizationId: "org-1",
      });
      prismaMock.queuedMessage.findFirst.mockResolvedValueOnce({
        id: "queued-1",
        sessionId: "session-1",
        text: "inspect this",
        imageKeys,
        interactionMode: "ask",
        position: 0,
        createdById: "user-1",
        organizationId: "org-1",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      });
      prismaMock.queuedMessage.delete.mockResolvedValueOnce({ id: "queued-1" });
      prismaMock.event.findMany.mockResolvedValueOnce([
        {
          payload: {
            clientSource: "web",
            queuedMessage: { id: "queued-1" },
          },
        },
      ]);
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(session);
      prismaMock.session.update.mockResolvedValueOnce(session);
      sessionRouterMock.send.mockReturnValue("delivered");
      sessionRouterMock.getRuntimeForSession.mockReturnValue({
        id: "runtime-a",
        label: "Laptop A",
      });

      const drained = await (
        service as unknown as {
          drainOneQueuedMessage(sessionId: string): Promise<boolean>;
        }
      ).drainOneQueuedMessage("session-1");

      expect(drained).toBe(true);
      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          type: "send",
          imageUrls: [
            "https://example.test/uploads/org-1/image-a.png",
            "https://example.test/uploads/org-1/image-b.png",
          ],
        }),
        { expectedHomeRuntimeId: "runtime-a", organizationId: "org-1" },
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "queued_messages_drained",
          payload: { sessionId: "session-1", queuedMessageId: "queued-1" },
        }),
      );
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
          readOnlyWorkspace: false,
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

    it("preserves readOnlyWorkspace for an initial read-only repo checkout", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        pendingRun: null,
        agentStatus: "not_started",
        sessionStatus: "in_progress",
        readOnlyWorkspace: true,
        workdir: null,
      });
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          readOnlyWorkspace: true,
          workdir: "/Users/vineet/src/trace",
        }),
      );
      prismaMock.sessionGroup.update.mockResolvedValueOnce(
        makeSessionGroup({ workdir: "/Users/vineet/src/trace" }),
      );
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.workspaceReady("session-1", "/Users/vineet/src/trace");

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ readOnlyWorkspace: true }),
        }),
      );
    });

    it("preserves readOnlyWorkspace when reconnecting an existing read-only checkout", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        pendingRun: null,
        agentStatus: "done",
        sessionStatus: "in_progress",
        readOnlyWorkspace: true,
        workdir: "/Users/vineet/src/trace",
      });
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          readOnlyWorkspace: true,
          workdir: "/Users/vineet/src/trace",
        }),
      );
      prismaMock.sessionGroup.update.mockResolvedValueOnce(
        makeSessionGroup({ workdir: "/Users/vineet/src/trace" }),
      );
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.workspaceReady("session-1", "/Users/vineet/src/trace");

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ readOnlyWorkspace: true }),
        }),
      );
    });

    it("clears readOnlyWorkspace after upgrading to a writable worktree", async () => {
      prismaMock.session.findUniqueOrThrow
        .mockResolvedValueOnce({
          pendingRun: {
            type: "send",
            prompt: "Continue in code mode",
            interactionMode: "code",
            workspaceUpgrade: true,
          },
          agentStatus: "done",
          sessionStatus: "in_progress",
          readOnlyWorkspace: true,
          workdir: "/Users/vineet/src/trace",
        })
        .mockResolvedValueOnce({
          organizationId: "org-1",
          tool: "claude_code",
          model: "claude-sonnet-4-20250514",
          workdir: "/tmp/trace/worktree",
          toolSessionId: null,
          repoId: "repo-1",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-a",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
          sessionGroupId: "group-1",
        });
      prismaMock.session.update
        .mockResolvedValueOnce(
          makeSession({
            readOnlyWorkspace: false,
            workdir: "/tmp/trace/worktree",
          }),
        )
        .mockResolvedValueOnce(
          makeSession({
            agentStatus: "active",
            sessionStatus: "in_progress",
            readOnlyWorkspace: false,
            workdir: "/tmp/trace/worktree",
          }),
        );
      prismaMock.sessionGroup.update
        .mockResolvedValueOnce(makeSessionGroup({ workdir: "/tmp/trace/worktree" }))
        .mockResolvedValueOnce(makeSessionGroup({ workdir: "/tmp/trace/worktree" }));
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.event.findMany.mockResolvedValueOnce([]);

      await service.workspaceReady("session-1", "/tmp/trace/worktree");

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ readOnlyWorkspace: false }),
        }),
      );
    });

    it("runs the setup script and persists completed setup state", async () => {
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
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-1",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      prismaMock.channel.findUnique.mockResolvedValueOnce({ setupScript: "pnpm install" });
      prismaMock.sessionGroup.update
        .mockResolvedValueOnce(
          makeSessionGroup({ workdir: "/tmp/trace/workspace", setupStatus: "running" }),
        )
        .mockResolvedValueOnce(
          makeSessionGroup({ workdir: "/tmp/trace/workspace", setupStatus: "completed" }),
        );
      prismaMock.session.updateMany.mockResolvedValue({ count: 1 });

      await service.workspaceReady("session-1", "/tmp/trace/workspace");

      expect(terminalRelayMock.executeCommand).toHaveBeenCalledWith(
        "session-1",
        "group-1",
        "org-1",
        "runtime-1",
        "pnpm install",
        "/tmp/trace/workspace",
      );
      expect(prismaMock.sessionGroup.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({ setupStatus: "running", setupError: null }),
        }),
      );
      expect(prismaMock.sessionGroup.update).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({ setupStatus: "completed", setupError: null }),
        }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_output",
          payload: expect.objectContaining({
            type: "setup_script_completed",
            success: true,
            exitCode: 0,
          }),
        }),
      );
    });
  });

  describe("retrySessionGroupSetup", () => {
    it("reruns the setup script for an existing workspace", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        workdir: "/tmp/trace/workspace",
        worktreeDeleted: false,
        setupStatus: "failed",
        connection: { runtimeInstanceId: "runtime-1" },
        channel: { setupScript: "pnpm install" },
        sessions: [
          {
            id: "session-1",
            hosting: "cloud",
            createdById: "user-1",
            connection: { runtimeInstanceId: "runtime-1" },
          },
        ],
      });
      prismaMock.sessionGroup.update
        .mockResolvedValueOnce(
          makeSessionGroup({ workdir: "/tmp/trace/workspace", setupStatus: "running" }),
        )
        .mockResolvedValueOnce(
          makeSessionGroup({ workdir: "/tmp/trace/workspace", setupStatus: "completed" }),
        );

      await service.retrySessionGroupSetup("group-1", "org-1", "user", "user-1");

      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_output",
          payload: expect.objectContaining({ type: "setup_script_started" }),
          actorType: "user",
          actorId: "user-1",
        }),
      );
      expect(terminalRelayMock.executeCommand).toHaveBeenCalledWith(
        "session-1",
        "group-1",
        "org-1",
        "runtime-1",
        "pnpm install",
        "/tmp/trace/workspace",
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_output",
          payload: expect.objectContaining({
            type: "setup_script_completed",
            success: true,
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

  describe("archiveGroup", () => {
    it("deletes groups with no sessions instead of archiving them", async () => {
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce(
        makeSessionGroup({
          id: "group-empty",
          organizationId: "org-1",
          sessions: [],
        }),
      );
      prismaMock.session.findMany.mockResolvedValueOnce([]);

      const result = await service.archiveGroup("group-empty", "org-1");

      expect(result).toBeNull();
      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.sessionGroup.update).not.toHaveBeenCalled();
      expect(prismaMock.sessionGroup.delete).toHaveBeenCalledWith({
        where: { id: "group-empty" },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_deleted",
          payload: {
            deletedSessionGroupId: "group-empty",
            deletionReason: "archived_empty_group",
            sourceAction: "archive",
          },
        }),
      );
    });

    it("deletes groups whose sessions never had messages", async () => {
      const groupConnection = {
        state: "connected",
        adapterType: "provisioned",
        environmentId: "env-1",
        runtimeInstanceId: "runtime-1",
        providerRuntimeId: "provider-runtime-1",
        retryCount: 0,
        canRetry: true,
        canMove: true,
      };
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce(
        makeSessionGroup({
          id: "group-no-messages",
          organizationId: "org-1",
          workdir: "/workspace/group-no-messages",
          connection: groupConnection,
          sessions: [{ id: "session-1", lastMessageAt: null }],
        }),
      );
      prismaMock.session.findMany.mockResolvedValueOnce([{ id: "session-1" }]);
      prismaMock.session.findUnique.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
          sessionGroupId: "group-no-messages",
          organizationId: "org-1",
          workdir: null,
          connection: {
            state: "connected",
            adapterType: "provisioned",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      prismaMock.session.count.mockResolvedValueOnce(0);
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        id: "group-no-messages",
        organizationId: "org-1",
        sessions: [{ id: "session-1", lastMessageAt: null }],
      });
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        workdir: "/workspace/group-no-messages",
        repoId: "repo-1",
        connection: groupConnection,
      });

      const result = await service.archiveGroup("group-no-messages", "org-1");

      expect(result).toBeNull();
      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.sessionGroup.update).not.toHaveBeenCalled();
      expect(prismaMock.sessionGroup.delete).toHaveBeenCalledWith({
        where: { id: "group-no-messages" },
      });
      expect(sessionRouterMock.destroyRuntime).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          workdir: "/workspace/group-no-messages",
          repoId: "repo-1",
          connection: groupConnection,
        }),
        expect.objectContaining({ reason: "session_deleted" }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_deleted",
          payload: expect.objectContaining({
            sessionId: "session-1",
            deletedSessionGroupId: "group-no-messages",
            deletionReason: "archived_empty_group",
            sourceAction: "archive",
          }),
        }),
      );
    });

    it("archives groups that have message history", async () => {
      const groupConnection = {
        state: "connected",
        adapterType: "provisioned",
        environmentId: "env-1",
        runtimeInstanceId: "runtime-1",
        providerRuntimeId: "provider-runtime-1",
        retryCount: 0,
        canRetry: true,
        canMove: true,
      };
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce(
        makeSessionGroup({
          id: "group-1",
          organizationId: "org-1",
          workdir: "/workspace/group-1",
          connection: groupConnection,
          sessions: [
            { id: "session-2", lastMessageAt: new Date("2024-01-02T00:00:00.000Z") },
            { id: "session-1", lastMessageAt: null },
          ],
        }),
      );
      prismaMock.sessionGroup.update.mockResolvedValueOnce(
        makeSessionGroup({
          id: "group-1",
          archivedAt: new Date("2024-01-02T00:00:00.000Z"),
        }),
      );
      prismaMock.session.findUnique.mockResolvedValueOnce(
        makeSession({
          id: "session-2",
          sessionGroupId: "group-1",
          organizationId: "org-1",
          workdir: null,
          connection: groupConnection,
        }),
      );
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        workdir: "/workspace/group-1",
        repoId: "repo-1",
        connection: groupConnection,
      });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce(
        makeSessionGroup({
          id: "group-1",
          archivedAt: new Date("2024-01-02T00:00:00.000Z"),
          worktreeDeleted: true,
          sessions: [makeSession({ id: "session-2", sessionGroupId: "group-1" })],
        }),
      );

      const result = await service.archiveGroup("group-1", "org-1");

      expect(result?.id).toBe("group-1");
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { sessionGroupId: "group-1", agentStatus: "active" },
        data: { agentStatus: "stopped" },
      });
      expect(prismaMock.sessionGroup.update).toHaveBeenCalledWith({
        where: { id: "group-1" },
        data: { archivedAt: expect.any(Date) },
      });
      expect(sessionRouterMock.destroyRuntime).toHaveBeenCalledWith(
        "session-2",
        expect.objectContaining({
          organizationId: "org-1",
          workdir: "/workspace/group-1",
          repoId: "repo-1",
          connection: groupConnection,
        }),
        expect.objectContaining({ reason: "session_unloaded" }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_group_archived",
          payload: expect.objectContaining({ sessionGroupId: "group-1" }),
        }),
      );
    });
  });

  describe("moveToRuntime", () => {
    it("rebinds the same session inside the same group", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          status: "active",
          workdir: "/tmp/trace/worktrees/session-1",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-source",
            runtimeLabel: "Cloud",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
          projects: [{ projectId: "project-1" }],
        }),
      );
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
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
      const targetRuntime = {
        key: "org-1:runtime-1",
        id: "runtime-1",
        label: "Local Dev",
        hostingMode: "local",
        organizationId: "org-1",
        supportedTools: ["claude_code"],
        registeredRepoIds: ["repo-1"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      };
      sessionRouterMock.getRuntime
        .mockReturnValueOnce(
          targetRuntime as unknown as ReturnType<typeof sessionRouterMock.getRuntime>,
        )
        .mockReturnValueOnce(
          targetRuntime as unknown as ReturnType<typeof sessionRouterMock.getRuntime>,
        );

      const result = await service.moveToRuntime(
        "session-1",
        "runtime-1",
        "org-1",
        "user",
        "user-1",
      );

      expect(result.id).toBe("session-1");
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentStatus: "not_started",
            sessionStatus: "in_progress",
            createdById: "user-1",
            hosting: "local",
            pendingRun: expect.objectContaining({
              type: "run",
              prompt: "Continue this session on the new runtime.",
            }),
            toolSessionId: null,
          }),
        }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_started",
          payload: expect.objectContaining({
            type: "runtime_move",
            sourceHosting: "cloud",
            targetHosting: "local",
            targetRuntimeLabel: "Local Dev",
          }),
        }),
      );
      expect(prismaMock.session.create).not.toHaveBeenCalled();
      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith("session-1", "org-1:runtime-1");
      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          createdById: "user-1",
        }),
      );
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

      await expect(
        service.moveToRuntime("session-1", "runtime-1", "org-1", "user", "user-1"),
      ).rejects.toThrow("Cannot move a merged session");
    });

    it("rejects moving a repo session to a bridge without the repo linked", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(makeSession({ projects: [] }));
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-2",
        label: "Laptop B",
        hostingMode: "local",
        supportedTools: ["claude_code"],
        registeredRepoIds: [],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });

      await expect(
        service.moveToRuntime("session-1", "runtime-2", "org-1", "user", "user-1"),
      ).rejects.toThrow("Selected runtime does not have this repo linked");
      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });

    it("clears stale scratch workdirs when moving to another bridge", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "local",
          repoId: null,
          repo: null,
          workdir: "/Users/laptop-a/scratch",
          projects: [],
        }),
      );
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          hosting: "local",
          repoId: null,
          repo: null,
          workdir: null,
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
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        label: "Local Dev",
        hostingMode: "local",
        supportedTools: ["claude_code"],
        registeredRepoIds: [],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });

      await service.moveToRuntime("session-1", "runtime-1", "org-1", "user", "user-1");

      const updateArgs = prismaMock.session.update.mock.calls[0]?.[0] as
        | { data?: { workdir?: string | null } }
        | undefined;
      expect(updateArgs?.data?.workdir).toBeNull();
      expect(prismaMock.sessionGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ workdir: null }),
        }),
      );
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ workdir: null }),
        }),
      );
    });

    it("allows moving a stopped session", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          agentStatus: "stopped",
          workdir: "/tmp/trace/worktrees/session-1",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-source",
            runtimeLabel: "Laptop A",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
          projects: [{ projectId: "project-1" }],
        }),
      );
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
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
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        label: "Local Dev",
        hostingMode: "local",
        supportedTools: ["claude_code"],
        registeredRepoIds: ["repo-1"],
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

      expect(result.id).toBe("session-1");
    });

    it("allows moving a failed session", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          agentStatus: "failed",
          workdir: "/tmp/trace/worktrees/session-1",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-source",
            runtimeLabel: "Laptop A",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
          projects: [{ projectId: "project-1" }],
        }),
      );
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
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
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        label: "Local Dev",
        hostingMode: "local",
        supportedTools: ["claude_code"],
        registeredRepoIds: ["repo-1"],
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

      expect(result.id).toBe("session-1");
    });

    it("rejects moving when the source worktree has not been fully synced to origin", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "local",
          workdir: "/tmp/trace/worktrees/session-1",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-source",
            runtimeLabel: "Laptop A",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        label: "Laptop B",
        hostingMode: "local",
        supportedTools: ["claude_code"],
        registeredRepoIds: ["repo-1"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });
      sessionRouterMock.inspectSessionGitSyncStatus.mockResolvedValueOnce(
        makeGitSyncStatus({ aheadCount: 1, remoteAheadCount: 1 }),
      );

      await expect(
        service.moveToRuntime("session-1", "runtime-1", "org-1", "user", "user-1"),
      ).rejects.toThrow(
        "Cannot move session: local branch must match its remote branch before moving.",
      );
      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });

    it("allows moving a disconnected session for recovery when the source runtime git sync check fails", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
          makeSession({
            hosting: "local",
            workdir: "/tmp/trace/worktrees/session-1",
            connection: {
              state: "disconnected",
              runtimeInstanceId: "runtime-source",
              runtimeLabel: "Laptop A",
              retryCount: 0,
              canRetry: true,
              canMove: true,
            },
          }),
        );
        prismaMock.session.update.mockResolvedValueOnce(
          makeSession({
            id: "session-1",
            hosting: "local",
            agentStatus: "not_started",
            sessionStatus: "in_progress",
            connection: {
              state: "connected",
              runtimeInstanceId: "runtime-1",
              runtimeLabel: "Laptop B",
              retryCount: 0,
              canRetry: true,
              canMove: true,
            },
          }),
        );
        sessionRouterMock.getRuntime.mockReturnValueOnce({
          id: "runtime-1",
          label: "Laptop B",
          hostingMode: "local",
          supportedTools: ["claude_code"],
          registeredRepoIds: ["repo-1"],
          boundSessions: new Set<string>(),
          ws: { readyState: 1, OPEN: 1 },
        });
        sessionRouterMock.inspectSessionGitSyncStatus.mockRejectedValueOnce(
          new Error("git status timed out"),
        );

        const result = await service.moveToRuntime(
          "session-1",
          "runtime-1",
          "org-1",
          "user",
          "user-1",
        );

        expect(result.id).toBe("session-1");
        expect(sessionRouterMock.inspectSessionGitSyncStatus).toHaveBeenCalledWith(
          "runtime-source",
          {
            sessionId: "session-1",
            workdirHint: "/tmp/trace/worktrees/session-1",
          },
        );
        expect(prismaMock.session.update).toHaveBeenCalled();
        expect(prismaMock.session.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              pendingRun: expect.objectContaining({
                prompt: expect.stringContaining("Source git sync was not verified"),
              }),
            }),
          }),
        );
        expect(sessionRouterMock.bindSession).toHaveBeenCalledWith("session-1", "runtime-1");
        expect(eventServiceMock.create).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType: "session_started",
            payload: expect.objectContaining({
              type: "runtime_move",
              sourceGitStatusVerified: false,
              sourceGitStatusSkippedReason: "inspection_failed",
            }),
          }),
        );
        expect(warnSpy).toHaveBeenCalledWith(
          "[session-service] skipping move source git sync check for session-1: git status timed out",
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("rejects ordinary moves when source git sync inspection fails", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "local",
          workdir: "/tmp/trace/worktrees/session-1",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-source",
            runtimeLabel: "Laptop A",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        label: "Laptop B",
        hostingMode: "local",
        supportedTools: ["claude_code"],
        registeredRepoIds: ["repo-1"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });
      sessionRouterMock.inspectSessionGitSyncStatus.mockRejectedValueOnce(
        new Error("git status timed out"),
      );

      await expect(
        service.moveToRuntime("session-1", "runtime-1", "org-1", "user", "user-1"),
      ).rejects.toThrow(
        "Cannot move session: source git status could not be verified. git status timed out",
      );
      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });

    it("rejects ordinary repo moves when the source workdir is missing", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "local",
          workdir: null,
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-source",
            runtimeLabel: "Laptop A",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        label: "Laptop B",
        hostingMode: "local",
        supportedTools: ["claude_code"],
        registeredRepoIds: ["repo-1"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });

      await expect(
        service.moveToRuntime("session-1", "runtime-1", "org-1", "user", "user-1"),
      ).rejects.toThrow(
        "Cannot move session: source git status could not be verified because the source workdir is unavailable.",
      );
      expect(sessionRouterMock.inspectSessionGitSyncStatus).not.toHaveBeenCalled();
      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });

    it("allows moving when the trace remote branch matches even if upstream is still origin/main", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "cloud",
          workdir: "/workspaces/gibbon",
          branch: null,
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-source",
            runtimeLabel: "Cloud",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
          hosting: "local",
          branch: "trace/gibbon",
          agentStatus: "not_started",
          sessionStatus: "in_progress",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-1",
            runtimeLabel: "Laptop B",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        label: "Laptop B",
        hostingMode: "local",
        supportedTools: ["claude_code"],
        registeredRepoIds: ["repo-1"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });
      sessionRouterMock.inspectSessionGitSyncStatus.mockResolvedValueOnce(
        makeGitSyncStatus({
          branch: "trace/gibbon",
          headCommitSha: "commit-pushed",
          upstreamBranch: "origin/main",
          upstreamCommitSha: "main-commit",
          aheadCount: 1,
          behindCount: 0,
          remoteBranch: "origin/trace/gibbon",
          remoteCommitSha: "commit-pushed",
          remoteAheadCount: 0,
          remoteBehindCount: 0,
        }),
      );

      await service.moveToRuntime("session-1", "runtime-1", "org-1", "user", "user-1");

      expect(prismaMock.session.update).toHaveBeenCalled();
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            branch: "trace/gibbon",
          }),
        }),
      );
      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          branch: "trace/gibbon",
          preserveBranchName: true,
        }),
      );
    });

    it("allows moving from a stale source runtime for recovery", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "local",
          workdir: "/tmp/trace/worktrees/session-1",
          connection: {
            state: "disconnected",
            runtimeInstanceId: "runtime-source",
            runtimeLabel: "Laptop A",
            retryCount: 1,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
          hosting: "local",
          agentStatus: "not_started",
          sessionStatus: "in_progress",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-1",
            runtimeLabel: "Laptop B",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        label: "Laptop B",
        hostingMode: "local",
        supportedTools: ["claude_code"],
        registeredRepoIds: ["repo-1"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });
      sessionRouterMock.isRuntimeAvailable.mockReturnValueOnce(false);

      const result = await service.moveToRuntime(
        "session-1",
        "runtime-1",
        "org-1",
        "user",
        "user-1",
      );

      expect(result.id).toBe("session-1");
      expect(sessionRouterMock.inspectSessionGitSyncStatus).not.toHaveBeenCalled();
      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith("session-1", "runtime-1");
    });

    it("marks recovery moves with missing source workdirs as unverified", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "local",
          workdir: null,
          connection: {
            state: "disconnected",
            runtimeInstanceId: "runtime-source",
            runtimeLabel: "Laptop A",
            retryCount: 1,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
          hosting: "local",
          agentStatus: "not_started",
          sessionStatus: "in_progress",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-1",
            runtimeLabel: "Laptop B",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        label: "Laptop B",
        hostingMode: "local",
        supportedTools: ["claude_code"],
        registeredRepoIds: ["repo-1"],
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

      expect(result.id).toBe("session-1");
      expect(sessionRouterMock.inspectSessionGitSyncStatus).not.toHaveBeenCalled();
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pendingRun: expect.objectContaining({
              prompt: expect.stringContaining("Source git sync was not verified"),
            }),
          }),
        }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_started",
          payload: expect.objectContaining({
            type: "runtime_move",
            sourceGitStatusVerified: false,
            sourceGitStatusSkippedReason: "missing_workdir",
          }),
        }),
      );
    });

    it("allows moving a detached repo session by restoring from the current commit", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "local",
          readOnlyWorkspace: true,
          workdir: "/tmp/trace/worktrees/session-1",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-source",
            runtimeLabel: "Laptop A",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
          hosting: "local",
          readOnlyWorkspace: true,
          agentStatus: "not_started",
          sessionStatus: "in_progress",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-1",
            runtimeLabel: "Laptop B",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        label: "Laptop B",
        hostingMode: "local",
        supportedTools: ["claude_code"],
        registeredRepoIds: ["repo-1"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });
      sessionRouterMock.inspectSessionGitSyncStatus.mockResolvedValueOnce(
        makeGitSyncStatus({
          branch: null,
          upstreamBranch: null,
          upstreamCommitSha: null,
          headCommitSha: "detached123",
        }),
      );

      await service.moveToRuntime("session-1", "runtime-1", "org-1", "user", "user-1");

      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          checkpointSha: "detached123",
          readOnly: true,
        }),
      );
    });
  });

  describe("moveToCloud", () => {
    it("rejects cloud moves in local mode", async () => {
      vi.stubEnv("TRACE_LOCAL_MODE", "1");

      await expect(service.moveToCloud("session-1", "org-1", "user", "user-1")).rejects.toThrow(
        "Cloud sessions are disabled in local mode",
      );
      expect(prismaMock.session.findFirstOrThrow).not.toHaveBeenCalled();
    });

    it("rebinds the same session to cloud inside the same group", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          status: "active",
          workdir: "/tmp/trace/worktrees/session-1",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-source",
            runtimeLabel: "Cloud",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
          projects: [{ projectId: "project-1" }],
        }),
      );
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
          agentStatus: "not_started",
          sessionStatus: "in_progress",
          hosting: "cloud",
          sessionGroupId: "group-1",
        }),
      );

      const result = await service.moveToCloud("session-1", "org-1", "user", "user-1");

      expect(result.id).toBe("session-1");
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentStatus: "not_started",
            sessionStatus: "in_progress",
            createdById: "user-1",
            hosting: "cloud",
            pendingRun: expect.objectContaining({
              type: "run",
              prompt: "Continue this session on the new runtime.",
            }),
          }),
        }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_started",
          payload: expect.objectContaining({
            type: "runtime_move",
            sourceHosting: "cloud",
            targetHosting: "cloud",
            targetRuntimeLabel: null,
          }),
        }),
      );
      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          hosting: "cloud",
          createdById: "user-1",
          environment: expect.objectContaining({ id: "env-default" }),
        }),
      );
      expect(sessionRouterMock.transitionRuntime).toHaveBeenCalledWith(
        "session-1",
        "cloud",
        "terminate",
      );
      expect(terminalRelayMock.destroyAllForSession).toHaveBeenCalledWith("session-1");
    });

    it("resolves a provisioned environment before moving a local session to cloud", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "local",
          workdir: "/tmp/trace/worktrees/session-1",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-source",
            runtimeLabel: "Laptop A",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
          projects: [{ projectId: "project-1" }],
        }),
      );
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
          agentStatus: "not_started",
          sessionStatus: "in_progress",
          hosting: "cloud",
          sessionGroupId: "group-1",
          connection: {
            state: "connected",
            adapterType: "provisioned",
            environmentId: "env-default",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );

      await service.moveToCloud("session-1", "org-1", "user", "user-1");

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            connection: expect.objectContaining({
              adapterType: "provisioned",
              environmentId: "env-default",
            }),
          }),
        }),
      );
      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          hosting: "cloud",
          environment: expect.objectContaining({ id: "env-default" }),
        }),
      );
      expect(sessionRouterMock.transitionRuntime).toHaveBeenCalledWith(
        "session-1",
        "local",
        "terminate",
      );
    });

    it("rejects moving a merged session to cloud", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({ sessionStatus: "merged" }),
      );

      await expect(service.moveToCloud("session-1", "org-1", "user", "user-1")).rejects.toThrow(
        "Cannot move a merged session",
      );
    });

    it("preserves read-only workspaces when moving to cloud", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          readOnlyWorkspace: true,
          workdir: "/tmp/trace/worktrees/session-1",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-source",
            runtimeLabel: "Cloud",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
          projects: [{ projectId: "project-1" }],
        }),
      );
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
          agentStatus: "not_started",
          sessionStatus: "in_progress",
          hosting: "cloud",
          sessionGroupId: "group-1",
          readOnlyWorkspace: true,
        }),
      );

      await service.moveToCloud("session-1", "org-1", "user", "user-1");

      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          hosting: "cloud",
          readOnly: true,
        }),
      );
    });

    it("reassigns move ownership to the actor before cloud provisioning", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          createdById: "user-1",
          createdBy: { id: "user-1", name: "Original Owner", avatarUrl: null },
          workdir: "/tmp/trace/worktrees/session-1",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-source",
            runtimeLabel: "Cloud",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
          projects: [{ projectId: "project-1" }],
        }),
      );
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
          createdById: "user-2",
          createdBy: { id: "user-2", name: "Mover", avatarUrl: null },
          agentStatus: "not_started",
          sessionStatus: "in_progress",
          hosting: "cloud",
          sessionGroupId: "group-1",
        }),
      );

      await service.moveToCloud("session-1", "org-1", "user", "user-2");

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdById: "user-2",
          }),
        }),
      );
      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          createdById: "user-2",
        }),
      );
    });

    it("allows moving a stopped session to cloud", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          agentStatus: "stopped",
          workdir: "/tmp/trace/worktrees/session-1",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-source",
            runtimeLabel: "Cloud",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
          projects: [{ projectId: "project-1" }],
        }),
      );
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
          agentStatus: "not_started",
          sessionStatus: "in_progress",
          hosting: "cloud",
          sessionGroupId: "group-1",
        }),
      );

      const result = await service.moveToCloud("session-1", "org-1", "user", "user-1");

      expect(result.id).toBe("session-1");
    });
  });

  describe("linked checkout", () => {
    beforeEach(() => {
      prismaMock.repo.findFirst.mockReset();
      prismaMock.sessionGroup.findFirst.mockReset();
      runtimeAccessServiceMock.getAccessState.mockReset();
      runtimeAccessServiceMock.getAccessState.mockResolvedValue({
        hostingMode: "cloud",
        allowed: true,
        isOwner: true,
      });
      sessionRouterMock.getRuntime.mockReset();
      sessionRouterMock.getRuntime.mockReturnValue(null);
      sessionRouterMock.listRuntimes.mockReset();
      sessionRouterMock.listRuntimes.mockReturnValue([]);
      sessionRouterMock.getLinkedCheckoutStatus.mockReset();
      sessionRouterMock.getLinkedCheckoutStatus.mockResolvedValue(null);
    });

    it("uses the session group's canonical runtime instead of the first local session runtime", async () => {
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-1" });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        repoId: "repo-1",
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-home",
        },
        sessions: [
          {
            id: "session-stale",
            repoId: "repo-1",
            hosting: "local",
            createdById: "user-1",
            connection: { state: "connected", runtimeInstanceId: "runtime-stale" },
          },
          {
            id: "session-home",
            repoId: "repo-1",
            hosting: "local",
            createdById: "user-1",
            connection: { state: "connected", runtimeInstanceId: "runtime-home" },
          },
        ],
      });
      sessionRouterMock.listRuntimes.mockReturnValue([
        {
          key: "runtime-stale",
          id: "runtime-stale",
          hostingMode: "local",
          organizationId: "org-1",
          ownerUserId: "user-1",
          registeredRepoIds: ["repo-1"],
          ws: { readyState: 1, OPEN: 1 },
        },
        {
          key: "runtime-home",
          id: "runtime-home",
          hostingMode: "local",
          organizationId: "org-1",
          ownerUserId: "user-1",
          registeredRepoIds: ["repo-1"],
          ws: { readyState: 1, OPEN: 1 },
        },
      ]);
      sessionRouterMock.getLinkedCheckoutStatus.mockResolvedValueOnce({
        repoId: "repo-1",
        repoPath: "/tmp/trace",
        isAttached: true,
        attachedSessionGroupId: "group-1",
        targetBranch: "main",
        autoSyncEnabled: true,
        currentBranch: "main",
        currentCommitSha: "abc123",
        lastSyncedCommitSha: "abc123",
        lastSyncError: null,
        restoreBranch: "main",
        restoreCommitSha: "abc123",
        hasUncommittedChanges: false,
      });

      await service.getLinkedCheckoutStatus("group-1", "repo-1", "org-1", "user-1");

      expect(sessionRouterMock.getLinkedCheckoutStatus).toHaveBeenCalledWith(
        "runtime-home",
        "repo-1",
      );
    });

    it("rejects linked-checkout access when the repo does not belong to the session group", async () => {
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-1" });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        repoId: "repo-2",
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-home",
        },
        sessions: [
          {
            id: "session-home",
            repoId: "repo-2",
            hosting: "local",
            createdById: "user-1",
            connection: { state: "connected", runtimeInstanceId: "runtime-home" },
          },
        ],
      });

      await expect(
        service.getLinkedCheckoutStatus("group-1", "repo-1", "org-1", "user-1"),
      ).rejects.toThrow("Session group is not associated with this repo");
      expect(sessionRouterMock.getLinkedCheckoutStatus).not.toHaveBeenCalled();
    });

    it("uses the current user's linked runtime for another owner's session group", async () => {
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-1" });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        repoId: "repo-1",
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-home",
        },
        sessions: [
          {
            id: "session-owner",
            repoId: "repo-1",
            hosting: "local",
            createdById: "user-2",
            connection: { state: "connected", runtimeInstanceId: "runtime-home" },
          },
          {
            id: "session-other-runtime",
            repoId: "repo-1",
            hosting: "local",
            createdById: "user-1",
            connection: { state: "connected", runtimeInstanceId: "runtime-other" },
          },
        ],
      });
      sessionRouterMock.listRuntimes.mockReturnValue([
        {
          key: "runtime-home",
          id: "runtime-home",
          hostingMode: "local",
          organizationId: "org-1",
          ownerUserId: "user-2",
          registeredRepoIds: ["repo-1"],
          ws: { readyState: 1, OPEN: 1 },
        },
        {
          key: "runtime-other",
          id: "runtime-other",
          hostingMode: "local",
          organizationId: "org-1",
          ownerUserId: "user-1",
          registeredRepoIds: ["repo-1"],
          ws: { readyState: 1, OPEN: 1 },
        },
      ]);
      sessionRouterMock.getLinkedCheckoutStatus.mockResolvedValueOnce({
        repoId: "repo-1",
        repoPath: "/tmp/trace",
        isAttached: true,
        attachedSessionGroupId: "group-1",
        targetBranch: "main",
        autoSyncEnabled: true,
        currentBranch: "main",
        currentCommitSha: "abc123",
        lastSyncedCommitSha: "abc123",
        lastSyncError: null,
        restoreBranch: "main",
        restoreCommitSha: "abc123",
        hasUncommittedChanges: false,
      });

      await service.getLinkedCheckoutStatus("group-1", "repo-1", "org-1", "user-1");

      expect(sessionRouterMock.getLinkedCheckoutStatus).toHaveBeenCalledWith(
        "runtime-other",
        "repo-1",
      );
    });

    it("requires sync actions to target a connected local runtime with the repo linked", async () => {
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-1" });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        repoId: "repo-1",
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-home",
        },
        sessions: [],
      });
      sessionRouterMock.listRuntimes.mockReturnValue([
        {
          key: "runtime-home",
          id: "runtime-home",
          hostingMode: "local",
          organizationId: "org-1",
          ownerUserId: "user-2",
          registeredRepoIds: ["repo-1"],
          ws: { readyState: 1, OPEN: 1 },
        },
      ]);

      await expect(
        service.syncLinkedCheckout("group-1", "repo-1", "trace/raccoon", "org-1", "user-1"),
      ).rejects.toThrow("No connected local runtime with this repo linked");
      expect(sessionRouterMock.syncLinkedCheckout).not.toHaveBeenCalled();
    });

    it("allows first-time linked-checkout repo linking on an explicitly selected local runtime", async () => {
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-1" });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        repoId: "repo-1",
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-owner",
        },
        sessions: [],
      });
      sessionRouterMock.listRuntimes.mockReturnValue([
        {
          key: "org-1:runtime-current",
          id: "runtime-current",
          hostingMode: "local",
          organizationId: "org-1",
          ownerUserId: "user-1",
          registeredRepoIds: [],
          ws: { readyState: 1, OPEN: 1 },
        },
      ]);
      sessionRouterMock.linkLinkedCheckoutRepo.mockResolvedValueOnce({
        ok: true,
        error: null,
        status: {
          repoId: "repo-1",
          repoPath: "/tmp/trace",
          isAttached: false,
          attachedSessionGroupId: null,
          targetBranch: null,
          autoSyncEnabled: false,
          currentBranch: "main",
          currentCommitSha: "abc123",
          lastSyncedCommitSha: null,
          lastSyncError: null,
          restoreBranch: null,
          restoreCommitSha: null,
          hasUncommittedChanges: false,
        },
      });

      await service.linkLinkedCheckoutRepo(
        "group-1",
        "repo-1",
        "/tmp/trace",
        "org-1",
        "user-1",
        "runtime-current",
      );

      expect(sessionRouterMock.linkLinkedCheckoutRepo).toHaveBeenCalledWith(
        "org-1:runtime-current",
        "repo-1",
        "/tmp/trace",
      );
    });

    it("routes linked-checkout sync through the explicitly selected local runtime", async () => {
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-1" });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        repoId: "repo-1",
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-a",
        },
        sessions: [],
      });
      sessionRouterMock.listRuntimes.mockReturnValue([
        {
          key: "org-1:runtime-a",
          id: "runtime-a",
          hostingMode: "local",
          organizationId: "org-1",
          ownerUserId: "user-1",
          registeredRepoIds: ["repo-1"],
          ws: { readyState: 1, OPEN: 1 },
        },
        {
          key: "org-1:runtime-b",
          id: "runtime-b",
          hostingMode: "local",
          organizationId: "org-1",
          ownerUserId: "user-1",
          registeredRepoIds: ["repo-1"],
          ws: { readyState: 1, OPEN: 1 },
        },
      ]);
      sessionRouterMock.syncLinkedCheckout.mockResolvedValueOnce({
        ok: true,
        error: null,
        errorCode: null,
        status: {
          repoId: "repo-1",
          repoPath: "/tmp/trace",
          isAttached: true,
          attachedSessionGroupId: "group-1",
          targetBranch: "trace/raccoon",
          autoSyncEnabled: true,
          currentBranch: null,
          currentCommitSha: "def456",
          lastSyncedCommitSha: "def456",
          lastSyncError: null,
          restoreBranch: "main",
          restoreCommitSha: "abc123",
          hasUncommittedChanges: false,
        },
      });

      await service.syncLinkedCheckout("group-1", "repo-1", "trace/raccoon", "org-1", "user-1", {
        runtimeInstanceId: "runtime-b",
      });

      expect(sessionRouterMock.syncLinkedCheckout).toHaveBeenCalledWith(
        "org-1:runtime-b",
        expect.objectContaining({
          repoId: "repo-1",
          sessionGroupId: "group-1",
          branch: "trace/raccoon",
        }),
      );
    });

    it("routes commit-back actions through the session group's canonical runtime", async () => {
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-1" });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        repoId: "repo-1",
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-home",
        },
        sessions: [
          {
            id: "session-home",
            repoId: "repo-1",
            hosting: "local",
            createdById: "user-1",
            connection: { state: "connected", runtimeInstanceId: "runtime-home" },
          },
        ],
      });
      sessionRouterMock.listRuntimes.mockReturnValue([
        {
          key: "runtime-home",
          id: "runtime-home",
          hostingMode: "local",
          organizationId: "org-1",
          ownerUserId: "user-1",
          registeredRepoIds: ["repo-1"],
          ws: { readyState: 1, OPEN: 1 },
        },
      ]);
      sessionRouterMock.commitLinkedCheckoutChanges.mockResolvedValueOnce({
        ok: true,
        error: null,
        status: {
          repoId: "repo-1",
          repoPath: "/tmp/trace",
          isAttached: true,
          attachedSessionGroupId: "group-1",
          targetBranch: "trace/raccoon",
          autoSyncEnabled: true,
          currentBranch: null,
          currentCommitSha: "def456",
          lastSyncedCommitSha: "def456",
          lastSyncError: null,
          restoreBranch: "main",
          restoreCommitSha: "abc123",
          hasUncommittedChanges: false,
        },
      });

      await service.commitLinkedCheckoutChanges("group-1", "repo-1", "org-1", "user-1");

      expect(sessionRouterMock.commitLinkedCheckoutChanges).toHaveBeenCalledWith("runtime-home", {
        repoId: "repo-1",
        sessionGroupId: "group-1",
        message: undefined,
      });
    });

    it("passes sync conflict resolution options through to the runtime", async () => {
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-1" });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        repoId: "repo-1",
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-home",
        },
        sessions: [
          {
            id: "session-home",
            repoId: "repo-1",
            hosting: "local",
            createdById: "user-1",
            connection: { state: "connected", runtimeInstanceId: "runtime-home" },
          },
        ],
      });
      sessionRouterMock.listRuntimes.mockReturnValue([
        {
          key: "runtime-home",
          id: "runtime-home",
          hostingMode: "local",
          organizationId: "org-1",
          ownerUserId: "user-1",
          registeredRepoIds: ["repo-1"],
          ws: { readyState: 1, OPEN: 1 },
        },
      ]);
      sessionRouterMock.syncLinkedCheckout.mockResolvedValueOnce({
        ok: true,
        error: null,
        errorCode: null,
        status: {
          repoId: "repo-1",
          repoPath: "/tmp/trace",
          isAttached: true,
          attachedSessionGroupId: "group-1",
          targetBranch: "trace/raccoon",
          autoSyncEnabled: true,
          currentBranch: null,
          currentCommitSha: "def456",
          lastSyncedCommitSha: "def456",
          lastSyncError: null,
          restoreBranch: "main",
          restoreCommitSha: "abc123",
          hasUncommittedChanges: false,
        },
      });

      await service.syncLinkedCheckout("group-1", "repo-1", "trace/raccoon", "org-1", "user-1", {
        conflictStrategy: "commit",
        commitMessage: "Carry local changes",
      });

      expect(sessionRouterMock.syncLinkedCheckout).toHaveBeenCalledWith("runtime-home", {
        repoId: "repo-1",
        sessionGroupId: "group-1",
        branch: "trace/raccoon",
        commitSha: undefined,
        autoSyncEnabled: undefined,
        conflictStrategy: "commit",
        commitMessage: "Carry local changes",
      });
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

    it("preserves the workdir through merged-session unload so the worktree can be removed", async () => {
      const prUrl = "https://github.com/trace/trace/pull/100";
      let currentWorkdir: string | null = "/tmp/trace/cobra";

      prismaMock.sessionGroup.findUnique
        .mockResolvedValueOnce({ prUrl })
        .mockResolvedValueOnce({
          ...makeSessionGroup({ prUrl, workdir: "/tmp/trace/cobra", worktreeDeleted: true }),
          sessions: [{ agentStatus: "done", sessionStatus: "merged" }],
        })
        .mockResolvedValueOnce({
          ...makeSessionGroup({ prUrl, workdir: null, worktreeDeleted: true }),
          sessions: [{ agentStatus: "done", sessionStatus: "merged" }],
        });
      prismaMock.session.updateMany.mockImplementation(
        async (args?: { data?: { workdir?: string | null } }) => {
          if (args?.data && Object.prototype.hasOwnProperty.call(args.data, "workdir")) {
            currentWorkdir = args.data.workdir ?? null;
          }
          return { count: 1 };
        },
      );
      prismaMock.sessionGroup.update.mockResolvedValue(makeSessionGroup());
      prismaMock.session.findUnique.mockImplementation(async () => ({
        hosting: "local",
        workdir: currentWorkdir,
        repoId: "repo-1",
        connection: { state: "connected", retryCount: 0, canRetry: true, canMove: true },
        sessionGroupId: "group-1",
      }));

      await service.markPrMerged({
        sessionGroupId: "group-1",
        eventSessionId: "session-1",
        prUrl,
        organizationId: "org-1",
      });

      expect(sessionRouterMock.destroyRuntime).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          hosting: "local",
          workdir: "/tmp/trace/cobra",
          repoId: "repo-1",
        }),
        expect.objectContaining({
          reason: "session_unloaded",
        }),
      );
      expect(prismaMock.session.updateMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({
            workdir: null,
            worktreeDeleted: true,
          }),
        }),
      );
      expect(prismaMock.sessionGroup.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({
            prUrl,
          }),
        }),
      );
      expect(prismaMock.sessionGroup.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.not.objectContaining({
            workdir: null,
            worktreeDeleted: true,
          }),
        }),
      );
      expect(prismaMock.sessionGroup.update).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({
            workdir: null,
            worktreeDeleted: true,
          }),
        }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            worktreeDeleted: true,
          }),
        }),
      );
      expect(sessionRouterMock.destroyRuntime.mock.invocationCallOrder[0]).toBeLessThan(
        eventServiceMock.create.mock.invocationCallOrder[0],
      );
    });

    it("keeps worktreeDeleted false when merged-session teardown fails", async () => {
      const prUrl = "https://github.com/trace/trace/pull/100";
      let currentWorkdir: string | null = "/tmp/trace/cobra";

      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({ prUrl }).mockResolvedValueOnce({
        ...makeSessionGroup({ prUrl, workdir: currentWorkdir, worktreeDeleted: false }),
        sessions: [{ agentStatus: "done", sessionStatus: "merged" }],
      });
      prismaMock.session.updateMany.mockImplementation(
        async (args?: { data?: { workdir?: string | null } }) => {
          if (args?.data && Object.prototype.hasOwnProperty.call(args.data, "workdir")) {
            currentWorkdir = args.data.workdir ?? null;
          }
          return { count: 1 };
        },
      );
      prismaMock.sessionGroup.update.mockResolvedValue(makeSessionGroup());
      prismaMock.session.findUnique.mockImplementation(async () => ({
        hosting: "local",
        workdir: currentWorkdir,
        repoId: "repo-1",
        connection: { state: "connected", retryCount: 0, canRetry: true, canMove: true },
        sessionGroupId: "group-1",
      }));
      sessionRouterMock.destroyRuntime.mockRejectedValueOnce(new Error("bridge offline"));

      await service.markPrMerged({
        sessionGroupId: "group-1",
        eventSessionId: "session-1",
        prUrl,
        organizationId: "org-1",
      });

      expect(currentWorkdir).toBe("/tmp/trace/cobra");
      expect(prismaMock.sessionGroup.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.session.updateMany).toHaveBeenCalledTimes(1);
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            worktreeDeleted: false,
          }),
        }),
      );
    });
  });

  describe("listRuntimesForTool", () => {
    it("returns compatible same-org local runtimes with access state even before access is granted", async () => {
      sessionRouterMock.listRuntimes.mockReturnValueOnce([
        {
          id: "runtime-owned",
          label: "Owned laptop",
          organizationId: "org-1",
          hostingMode: "local",
          supportedTools: ["claude_code"],
          registeredRepoIds: ["repo-1"],
          boundSessions: new Set<string>(),
          ws: { readyState: 1, OPEN: 1 },
        },
        {
          id: "runtime-requestable",
          label: "Teammate laptop",
          organizationId: "org-1",
          hostingMode: "local",
          supportedTools: ["claude_code"],
          registeredRepoIds: ["repo-1"],
          boundSessions: new Set<string>(),
          ws: { readyState: 1, OPEN: 1 },
        },
        {
          id: "runtime-other-org",
          label: "Other org laptop",
          organizationId: "org-2",
          hostingMode: "local",
          supportedTools: ["claude_code"],
          registeredRepoIds: ["repo-1"],
          boundSessions: new Set<string>(),
          ws: { readyState: 1, OPEN: 1 },
        },
        {
          id: "runtime-cloud",
          label: "Cloud",
          organizationId: "org-1",
          hostingMode: "cloud",
          supportedTools: ["claude_code"],
          registeredRepoIds: ["repo-1"],
          boundSessions: new Set<string>(),
          ws: { readyState: 1, OPEN: 1 },
        },
      ] as unknown as ReturnType<typeof sessionRouterMock.listRuntimes>);
      runtimeAccessServiceMock.getAccessState
        .mockResolvedValueOnce({
          runtimeInstanceId: "runtime-owned",
          hostingMode: "local",
          connected: true,
          allowed: true,
          isOwner: true,
          capabilities: ["session", "terminal"],
        })
        .mockResolvedValueOnce({
          runtimeInstanceId: "runtime-requestable",
          hostingMode: "local",
          connected: true,
          allowed: false,
          isOwner: false,
          capabilities: [],
          ownerUser: { id: "owner-1", name: "Owner One" },
          pendingRequest: null,
        });

      const result = await service.listRuntimesForTool("claude_code", "org-1", "user-1", "group-1");

      expect(result).toHaveLength(2);
      expect(result.map((runtime) => runtime.id)).toEqual(["runtime-owned", "runtime-requestable"]);
      expect(result[1].registeredRepoIds).toEqual([]);
      expect(result[1].access).toEqual(
        expect.objectContaining({
          allowed: false,
          ownerUser: { id: "owner-1", name: "Owner One" },
        }),
      );
      expect(runtimeAccessServiceMock.listAccessibleRuntimeInstanceIds).not.toHaveBeenCalled();
      expect(runtimeAccessServiceMock.getAccessState).toHaveBeenCalledWith(
        expect.objectContaining({
          runtimeInstanceId: "runtime-requestable",
          sessionGroupId: "group-1",
        }),
      );
    });

    it("only reveals the selected session repo on requestable runtimes", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce({
        tool: "claude_code",
        sessionGroupId: "group-1",
        repoId: "repo-visible",
      });
      sessionRouterMock.listRuntimes.mockReturnValueOnce([
        {
          id: "runtime-requestable",
          label: "Teammate laptop",
          organizationId: "org-1",
          hostingMode: "local",
          supportedTools: ["claude_code"],
          registeredRepoIds: ["repo-visible", "repo-hidden"],
          boundSessions: new Set<string>(),
          ws: { readyState: 1, OPEN: 1 },
        },
      ] as unknown as ReturnType<typeof sessionRouterMock.listRuntimes>);
      runtimeAccessServiceMock.getAccessState.mockResolvedValueOnce({
        runtimeInstanceId: "runtime-requestable",
        hostingMode: "local",
        connected: true,
        allowed: false,
        isOwner: false,
        capabilities: [],
        ownerUser: { id: "owner-1", name: "Owner One" },
        pendingRequest: null,
      });

      const result = await service.listAvailableRuntimes("session-1", "org-1", "user-1");

      expect(result[0].registeredRepoIds).toEqual(["repo-visible"]);
    });
  });

  describe("listBranches", () => {
    it("rejects a client-supplied sessionGroupId that doesn't own the repo", async () => {
      // Repo exists in org, session group is real, but its repoId != requested repo.
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-other" });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({ repoId: "repo-a" });

      await expect(
        service.listBranches("repo-other", "org-1", "user-2", "runtime-1", "group-a"),
      ).rejects.toThrow("Bridge access denied: this session group does not own the requested repo");
      expect(sessionRouterMock.listBranches).not.toHaveBeenCalled();
      expect(runtimeAccessServiceMock.assertAccess).not.toHaveBeenCalled();
    });

    it("allows listing branches when the sessionGroupId matches the repo", async () => {
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-a" });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({ repoId: "repo-a" });
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        key: "runtime-1",
        id: "runtime-1",
        organizationId: "org-1",
      });
      sessionRouterMock.listBranches.mockResolvedValueOnce(["main", "feat/x"]);

      const branches = await service.listBranches(
        "repo-a",
        "org-1",
        "user-2",
        "runtime-1",
        "group-a",
      );
      expect(branches).toEqual(["main", "feat/x"]);
      expect(runtimeAccessServiceMock.assertAccess).toHaveBeenCalled();
    });

    it("auto-selects the runtime that has the repo registered, not a cloud runtime without it", async () => {
      // Regression guard: previously a cloud runtime always won the find()
      // even when it hadn't cloned the repo, causing "Repo not cloned".
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-a" });
      runtimeAccessServiceMock.listAccessibleRuntimeInstanceIds.mockResolvedValueOnce(
        new Set(["local-1"]),
      );
      sessionRouterMock.listRuntimes.mockReturnValueOnce([
        {
          key: "cloud-1",
          id: "cloud-1",
          organizationId: "org-1",
          hostingMode: "cloud",
          registeredRepoIds: [],
        },
        {
          key: "local-1",
          id: "local-1",
          organizationId: "org-1",
          hostingMode: "local",
          registeredRepoIds: ["repo-a"],
        },
      ] as unknown as ReturnType<typeof sessionRouterMock.listRuntimes>);
      sessionRouterMock.listBranches.mockResolvedValueOnce(["main"]);

      const branches = await service.listBranches("repo-a", "org-1", "user-2");

      expect(sessionRouterMock.listBranches).toHaveBeenCalledWith("local-1", "repo-a");
      expect(branches).toEqual(["main"]);
    });

    it("throws when no connected runtime has the repo registered", async () => {
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-a" });
      runtimeAccessServiceMock.listAccessibleRuntimeInstanceIds.mockResolvedValueOnce(new Set());
      sessionRouterMock.listRuntimes.mockReturnValueOnce([
        { id: "cloud-1", hostingMode: "cloud", registeredRepoIds: [] },
      ] as unknown as ReturnType<typeof sessionRouterMock.listRuntimes>);

      await expect(service.listBranches("repo-a", "org-1", "user-2")).rejects.toThrow(
        "Repo not cloned on any connected runtime",
      );
      expect(sessionRouterMock.listBranches).not.toHaveBeenCalled();
    });
  });

  describe("reconcileStuckDeprovisions", () => {
    beforeEach(() => {
      prismaMock.session.findMany.mockReset();
      prismaMock.session.findUnique.mockReset();
      prismaMock.session.updateMany.mockReset();
      sessionRouterMock.destroyRuntime.mockClear();
      eventServiceMock.create.mockClear();
    });

    function provisionedConn(overrides: Record<string, unknown> = {}) {
      return {
        adapterType: "provisioned",
        state: "deprovision_failed",
        providerRuntimeId: "provider-1",
        retryCount: 1,
        canRetry: true,
        canMove: false,
        ...overrides,
      };
    }

    it("retries provisioned runtimes that have been stopping past the cutoff", async () => {
      const now = Date.now();
      const ancient = new Date(now - 5 * 60_000).toISOString();
      const conn = provisionedConn({ stoppingAt: ancient, deprovisionFailedAt: ancient });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-stuck",
          hosting: "cloud",
          organizationId: "org-1",
          workdir: null,
          repoId: null,
          connection: conn,
        },
      ] as unknown as Awaited<ReturnType<typeof prismaMock.session.findMany>>);
      // bumpReconcileAttempts → updateConnectionConditional reads + writes
      prismaMock.session.findUnique.mockResolvedValueOnce({
        connection: conn,
        sessionGroupId: null,
      } as unknown as Awaited<ReturnType<typeof prismaMock.session.findUnique>>);
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.reconcileStuckDeprovisions({ now, stuckAfterMs: 60_000 });

      expect(result.reconciled).toEqual(["session-stuck"]);
      expect(sessionRouterMock.destroyRuntime).toHaveBeenCalledWith(
        "session-stuck",
        expect.objectContaining({ id: "session-stuck", organizationId: "org-1" }),
        expect.objectContaining({ reason: "deprovision_reconciliation" }),
      );
    });

    it("skips candidates whose last attempt is within the cutoff", async () => {
      const now = Date.now();
      const recent = new Date(now - 5_000).toISOString();
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-fresh",
          hosting: "cloud",
          organizationId: "org-1",
          workdir: null,
          repoId: null,
          connection: {
            adapterType: "provisioned",
            state: "stopping",
            providerRuntimeId: "provider-1",
            stoppingAt: recent,
            retryCount: 0,
            canRetry: true,
            canMove: false,
          },
        },
      ] as unknown as Awaited<ReturnType<typeof prismaMock.session.findMany>>);

      const result = await service.reconcileStuckDeprovisions({ now, stuckAfterMs: 60_000 });

      expect(result.reconciled).toEqual([]);
      expect(sessionRouterMock.destroyRuntime).not.toHaveBeenCalled();
    });

    it("abandons candidates that have exceeded MAX_RECONCILE_ATTEMPTS", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const now = Date.now();
      const ancient = new Date(now - 5 * 60_000).toISOString();
      const conn = provisionedConn({
        stoppingAt: ancient,
        deprovisionFailedAt: ancient,
        reconcileAttempts: 10,
      });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-exhausted",
          hosting: "cloud",
          organizationId: "org-1",
          workdir: null,
          repoId: null,
          connection: conn,
        },
      ] as unknown as Awaited<ReturnType<typeof prismaMock.session.findMany>>);
      // markRuntimeAbandoned → recordRuntimeLifecycle → reads session metadata
      // and the connection (via updateConnectionConditional).
      prismaMock.session.findUnique
        .mockResolvedValueOnce({
          organizationId: "org-1",
          sessionGroupId: null,
          agentStatus: "stopped",
          sessionStatus: "in_progress",
        } as unknown as Awaited<ReturnType<typeof prismaMock.session.findUnique>>)
        .mockResolvedValueOnce({
          connection: conn,
          sessionGroupId: null,
        } as unknown as Awaited<ReturnType<typeof prismaMock.session.findUnique>>);
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.reconcileStuckDeprovisions({ now, stuckAfterMs: 60_000 });

      expect(result.abandoned).toEqual(["session-exhausted"]);
      expect(result.reconciled).toEqual([]);
      expect(sessionRouterMock.destroyRuntime).not.toHaveBeenCalled();
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_runtime_deprovision_failed",
          payload: expect.objectContaining({ abandoned: true, reconcileAttempts: 10 }),
        }),
      );
      const abandonedAlert = warnSpy.mock.calls.find((call) =>
        String(call[0]).includes("deprovision.abandoned_runtime"),
      );
      expect(abandonedAlert).toBeTruthy();
      expect(abandonedAlert?.[1]).toContain('"sessionId":"session-exhausted"');
      expect(abandonedAlert?.[1]).toContain('"providerRuntimeId":"provider-1"');
      expect(abandonedAlert?.[1]).toContain('"reconcileAttempts":10');
      warnSpy.mockRestore();
    });

    it("skips already-abandoned candidates without re-emitting the event", async () => {
      const now = Date.now();
      const ancient = new Date(now - 5 * 60_000).toISOString();
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-abandoned",
          hosting: "cloud",
          organizationId: "org-1",
          workdir: null,
          repoId: null,
          connection: {
            adapterType: "provisioned",
            state: "deprovision_failed",
            providerRuntimeId: "provider-1",
            stoppingAt: ancient,
            deprovisionFailedAt: ancient,
            reconcileAttempts: 10,
            abandonedAt: new Date(now - 30_000).toISOString(),
            autoRetryable: false,
            retryCount: 0,
            canRetry: false,
            canMove: false,
          },
        },
      ] as unknown as Awaited<ReturnType<typeof prismaMock.session.findMany>>);

      const result = await service.reconcileStuckDeprovisions({ now, stuckAfterMs: 60_000 });

      expect(result.reconciled).toEqual([]);
      expect(result.abandoned).toEqual([]);
      expect(sessionRouterMock.destroyRuntime).not.toHaveBeenCalled();
      expect(eventServiceMock.create).not.toHaveBeenCalled();
    });

    it("bumps reconcileAttempts before invoking destroyRuntime", async () => {
      const now = Date.now();
      const ancient = new Date(now - 5 * 60_000).toISOString();
      const conn = provisionedConn({
        stoppingAt: ancient,
        deprovisionFailedAt: ancient,
        reconcileAttempts: 3,
      });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-stuck",
          hosting: "cloud",
          organizationId: "org-1",
          workdir: null,
          repoId: null,
          connection: conn,
        },
      ] as unknown as Awaited<ReturnType<typeof prismaMock.session.findMany>>);
      prismaMock.session.findUnique.mockResolvedValueOnce({
        connection: conn,
        sessionGroupId: null,
      } as unknown as Awaited<ReturnType<typeof prismaMock.session.findUnique>>);
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.reconcileStuckDeprovisions({ now, stuckAfterMs: 60_000 });

      const updateManyCalls = (
        prismaMock.session.updateMany as unknown as ReturnType<typeof vi.fn>
      ).mock.calls.map((call) => call[0] as { data: { connection: unknown } });
      const bumpCall = updateManyCalls.find(
        (call) => (call.data.connection as { reconcileAttempts?: number }).reconcileAttempts === 4,
      );
      expect(bumpCall).toBeDefined();
    });

    it("skips destroyRuntime when bumpReconcileAttempts loses the optimistic-locking race", async () => {
      const now = Date.now();
      const ancient = new Date(now - 5 * 60_000).toISOString();
      const conn = provisionedConn({
        stoppingAt: ancient,
        deprovisionFailedAt: ancient,
        reconcileAttempts: 2,
      });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-raced",
          hosting: "cloud",
          organizationId: "org-1",
          workdir: null,
          repoId: null,
          connection: conn,
        },
      ] as unknown as Awaited<ReturnType<typeof prismaMock.session.findMany>>);
      // Simulate concurrent state change: every read shows the deprovision
      // state, but every conditional write loses the race (count = 0). The
      // helper retries up to MAX_CONNECTION_UPDATE_ATTEMPTS, then throws.
      prismaMock.session.findUnique.mockResolvedValue({
        connection: conn,
        sessionGroupId: null,
      } as unknown as Awaited<ReturnType<typeof prismaMock.session.findUnique>>);
      prismaMock.session.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.reconcileStuckDeprovisions({ now, stuckAfterMs: 60_000 });

      expect(result.reconciled).toEqual([]);
      expect(sessionRouterMock.destroyRuntime).not.toHaveBeenCalled();
    });
  });
});
