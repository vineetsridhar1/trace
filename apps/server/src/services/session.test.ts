import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn().mockResolvedValue({ id: "event-1" }),
    publishCreated: vi.fn(),
  },
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
    sendToRuntime: vi.fn().mockReturnValue("delivered"),
    createRuntime: vi.fn(),
    destroyRuntime: vi.fn().mockResolvedValue(undefined),
    transitionRuntime: vi.fn().mockResolvedValue("delivered"),
    bindSession: vi.fn(),
    unbindSession: vi.fn(),
    getRuntime: vi.fn().mockReturnValue(null),
    getRuntimeForSession: vi.fn().mockReturnValue(null),
    getBoundSessionIds: vi.fn().mockReturnValue([]),
    isRuntimeAvailable: vi.fn().mockReturnValue(true),
    getRuntimeDiagnostics: vi.fn().mockReturnValue({}),
    listRuntimes: vi.fn().mockReturnValue([]),
    listBranches: vi.fn().mockResolvedValue([]),
    listFiles: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(""),
    writeFile: vi.fn().mockResolvedValue(undefined),
    commitFileChanges: vi.fn().mockResolvedValue("commit123"),
    listWorktreeChanges: vi.fn().mockResolvedValue({ files: [], totalCount: 0, truncated: false }),
    revertWorktreeFile: vi.fn().mockResolvedValue(undefined),
    getLinkedCheckoutStatus: vi.fn().mockResolvedValue(null),
    linkLinkedCheckoutRepo: vi.fn().mockResolvedValue(null),
    syncLinkedCheckout: vi.fn().mockResolvedValue(null),
    commitLinkedCheckoutChanges: vi.fn().mockResolvedValue(null),
    restoreLinkedCheckout: vi.fn().mockResolvedValue(null),
    setLinkedCheckoutAutoSync: vi.fn().mockResolvedValue(null),
    inspectSessionCurrentBranch: vi.fn().mockResolvedValue(null),
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
    getDefaultReasoningEffort: vi.fn().mockReturnValue("auto"),
    isSupportedModel: vi.fn().mockReturnValue(true),
    isSupportedReasoningEffort: vi.fn().mockReturnValue(true),
    hasQuestionBlock: vi.fn().mockReturnValue(false),
    hasPlanBlock: vi.fn().mockReturnValue(false),
    MAX_WORKSPACE_NAME_LENGTH: 80,
    CODING_TOOL_IDS: ["claude_code", "codex", "pi", "antigravity", "cursor_composer", "custom"],
  };
});

vi.mock("./api-token.js", () => ({
  apiTokenService: {
    getDecryptedTokens: vi.fn().mockResolvedValue({ github: "gh-token" }),
  },
}));

vi.mock("./org-secret.js", () => ({
  orgSecretService: {
    getDecryptedValueByName: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("./managed-git.js", () => ({
  managedGitService: {
    createManagedRepo: vi.fn(),
    deleteManagedRepo: vi.fn(),
    mintAccessToken: vi.fn(),
    retryPendingDesignCommitPreviews: vi.fn().mockResolvedValue(undefined),
    retryPdfCommitExport: vi.fn().mockResolvedValue(undefined),
    updatePdfFormat: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./app-checkpoint-capture.js", () => ({
  appCheckpointCaptureService: { capture: vi.fn() },
}));

vi.mock("./github-repo.js", async () => {
  const actual = await vi.importActual<typeof import("./github-repo.js")>("./github-repo.js");
  return {
    GitHubApiError: actual.GitHubApiError,
    githubRepoService: {
      listFiles: vi.fn().mockResolvedValue([]),
      listFileTree: vi.fn().mockResolvedValue({ paths: [], truncated: false }),
      listDirectoryEntries: vi.fn().mockResolvedValue([]),
      readFile: vi.fn().mockResolvedValue("file contents"),
      branchDiff: vi.fn().mockResolvedValue([]),
    },
    parseGitHubRepo: vi.fn().mockReturnValue({ owner: "trace", repo: "trace" }),
  };
});

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { sessionRouter } from "../lib/session-router.js";
import { terminalRelay } from "../lib/terminal-relay.js";
import { storage } from "../lib/storage/index.js";
import { runtimeAccessService } from "./runtime-access.js";
import { inboxService } from "./inbox.js";
import { apiTokenService } from "./api-token.js";
import { GitHubApiError, githubRepoService, parseGitHubRepo } from "./github-repo.js";
import { orgSecretService } from "./org-secret.js";
import { managedGitService } from "./managed-git.js";
import { appCheckpointCaptureService } from "./app-checkpoint-capture.js";
import { sessionApplicationService } from "./session-applications.js";
import {
  getDefaultModel,
  getDefaultReasoningEffort,
  isSupportedReasoningEffort,
  hasQuestionBlock,
  MAX_WORKSPACE_NAME_LENGTH,
} from "@trace/shared";
import { SessionService, isFullyUnloadedSession } from "./session.js";
import type { StartSessionServiceInput } from "./session.js";
import { designSourceHash } from "./design-manual-edit.js";

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
const storageMock = storage as unknown as MockedDeep<typeof storage>;
const runtimeAccessServiceMock = runtimeAccessService as unknown as MockedDeep<
  typeof runtimeAccessService
>;
const inboxServiceMock = inboxService as unknown as MockedDeep<typeof inboxService>;
const apiTokenServiceMock = apiTokenService as unknown as MockedDeep<typeof apiTokenService>;
const orgSecretServiceMock = orgSecretService as unknown as MockedDeep<typeof orgSecretService>;
const managedGitServiceMock = managedGitService as unknown as MockedDeep<typeof managedGitService>;
const appCheckpointCaptureServiceMock = appCheckpointCaptureService as unknown as MockedDeep<
  typeof appCheckpointCaptureService
>;
const githubRepoServiceMock = githubRepoService as unknown as MockedDeep<typeof githubRepoService>;
const parseGitHubRepoMock = vi.mocked(parseGitHubRepo);
const getDefaultModelMock = vi.mocked(getDefaultModel);
const getDefaultReasoningEffortMock = vi.mocked(getDefaultReasoningEffort);
const isSupportedReasoningEffortMock = vi.mocked(isSupportedReasoningEffort);

function makeSessionGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: "group-1",
    name: "Implement dashboard filters",
    agentStatus: "not_started",
    status: "in_progress",
    archivedAt: null,
    organizationId: "org-1",
    ownerUserId: "user-1",
    ownerUser: { id: "user-1", name: "Test User", avatarUrl: null },
    visibility: "public",
    channelId: "channel-1",
    repoId: "repo-1",
    slug: "ladybug",
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
    reasoningEffort: "auto",
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
    // Runtime teardown (archive/idle) reflects killed app processes; default to
    // none so tests that don't exercise forwarding stay unaffected.
    prismaMock.sessionApplicationProcess.findMany.mockResolvedValue([]);
    prismaMock.sessionEndpoint.findMany.mockResolvedValue([]);
    // Default: a group has no sibling sessions to relocate during a move. Tests
    // exercising multi-session groups override this with mockResolvedValueOnce.
    prismaMock.session.findMany.mockResolvedValue([]);
    sessionRouterMock.send.mockReturnValue("delivered");
    sessionRouterMock.transitionRuntime.mockResolvedValue("delivered");
    sessionRouterMock.getRuntimeForSession.mockReturnValue(null);
    sessionRouterMock.getRuntime.mockReturnValue(null);
    sessionRouterMock.isRuntimeAvailable.mockReturnValue(true);
    sessionRouterMock.destroyRuntime.mockResolvedValue(undefined);
    sessionRouterMock.inspectSessionCurrentBranch.mockResolvedValue(null);
    sessionRouterMock.inspectSessionGitSyncStatus.mockResolvedValue(makeGitSyncStatus());
    apiTokenServiceMock.getDecryptedTokens.mockResolvedValue({ github: "gh-token" });
    orgSecretServiceMock.getDecryptedValueByName.mockResolvedValue(null);
    managedGitServiceMock.createManagedRepo.mockResolvedValue({
      id: "managed-repo-1",
      name: "App source",
      provider: "managed",
      remoteUrl: "https://trace.test/git/org-1/managed-repo-1.git",
      defaultBranch: "main",
      setupConfig: {},
      organizationId: "org-1",
      webhookId: null,
      webhookSecret: null,
      createdAt: new Date("2026-07-09T00:00:00.000Z"),
      updatedAt: new Date("2026-07-09T00:00:00.000Z"),
    });
    appCheckpointCaptureServiceMock.capture.mockResolvedValue({ captureStatus: "unavailable" });
    githubRepoServiceMock.listFiles.mockResolvedValue([]);
    githubRepoServiceMock.listFileTree.mockResolvedValue({ paths: [], truncated: false });
    githubRepoServiceMock.listDirectoryEntries.mockResolvedValue([]);
    githubRepoServiceMock.readFile.mockResolvedValue("file contents");
    githubRepoServiceMock.branchDiff.mockResolvedValue([]);
    parseGitHubRepoMock.mockReturnValue({ owner: "trace", repo: "trace" });
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
    prismaMock.repo.findFirst.mockResolvedValue({
      id: "repo-1",
      remoteUrl: "git@github.com:trace/trace.git",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("isFullyUnloadedSession", () => {
    it("returns true for failed agent status", () => {
      expect(isFullyUnloadedSession("failed", "in_progress")).toBe(true);
      expect(isFullyUnloadedSession("stopped", "in_progress")).toBe(true);
    });

    it("returns true for merged session status when worktree state is unknown or deleted", () => {
      expect(isFullyUnloadedSession("done", "merged")).toBe(true);
      expect(isFullyUnloadedSession("done", "merged", true)).toBe(true);
    });

    it("returns false for merged session status when the worktree is retained", () => {
      expect(isFullyUnloadedSession("done", "merged", false)).toBe(false);
      expect(isFullyUnloadedSession("active", "merged", false)).toBe(false);
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

      const result = await service.listGroups("channel-1", "org-1", "user-1");

      expect(prismaMock.sessionGroup.findMany).toHaveBeenCalledWith({
        where: {
          channelId: "channel-1",
          organizationId: "org-1",
          AND: [{ OR: [{ visibility: "public" }, { ownerUserId: "user-1" }] }],
          archivedAt: null,
        },
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

      const result = await service.listGroups("channel-1", "org-1", "user-1");

      expect(result[0].sessions.map((session) => session.id)).toEqual([
        "session-replied",
        "session-reconnected",
      ]);
      expect(result[0].sessions[0]?.lastMessageAt?.toISOString()).toBe("2024-01-06T00:00:00.000Z");
      expect(result[0].sessions[1]?.lastMessageAt?.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    });

    it("keeps sessions with messages ahead of infrastructure-only sessions", async () => {
      const infrastructureOnlySession = makeSession({
        id: "session-infra",
        updatedAt: new Date("2024-01-08T00:00:00.000Z"),
        lastMessageAt: null,
      });
      const conversationSession = makeSession({
        id: "session-conversation",
        updatedAt: new Date("2024-01-04T00:00:00.000Z"),
        lastMessageAt: new Date("2024-01-02T00:00:00.000Z"),
      });

      prismaMock.sessionGroup.findMany.mockResolvedValueOnce([
        makeSessionGroup({ sessions: [infrastructureOnlySession, conversationSession] }),
      ]);

      const result = await service.listGroups("channel-1", "org-1", "user-1");

      expect(result[0].sessions.map((session) => session.id)).toEqual([
        "session-conversation",
        "session-infra",
      ]);
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

      const result = await service.listGroups("channel-1", "org-1", "user-1");

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

      const result = await service.listGroups("channel-1", "org-1", "user-1", {
        archived: true,
      });

      expect(prismaMock.sessionGroup.findMany).toHaveBeenCalledWith({
        where: {
          channelId: "channel-1",
          organizationId: "org-1",
          AND: [{ OR: [{ visibility: "public" }, { ownerUserId: "user-1" }] }],
          archivedAt: { not: null },
        },
        include: expect.any(Object),
      });
      expect(result[0]?.status).toBe("archived");
    });
  });

  describe("listAppGroups", () => {
    it("lists only non-archived app-kind groups visible to the user", async () => {
      prismaMock.sessionGroup.findMany.mockResolvedValueOnce([
        makeSessionGroup({
          id: "group-app",
          kind: "app",
          sessions: [makeSession({ id: "session-app" })],
        }),
      ]);

      const result = await service.listAppGroups("org-1", "user-1");

      expect(prismaMock.sessionGroup.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: "org-1",
          kind: "app",
          archivedAt: null,
          AND: [{ OR: [{ visibility: "public" }, { ownerUserId: "user-1" }] }],
        },
        include: expect.any(Object),
        orderBy: { updatedAt: "desc" },
        take: 200,
      });
      expect(result.map((group) => group.id)).toEqual(["group-app"]);
    });
  });

  describe("listDesignGroups", () => {
    it("lists only non-archived design groups visible to the user", async () => {
      prismaMock.sessionGroup.findMany.mockResolvedValueOnce([
        makeSessionGroup({
          id: "group-design",
          kind: "design",
          sessions: [makeSession({ id: "session-design" })],
        }),
      ]);

      const result = await service.listDesignGroups("org-1", "user-1");

      expect(prismaMock.sessionGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: "org-1", kind: "design" }),
        }),
      );
      expect(result.map((group) => group.id)).toEqual(["group-design"]);
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
          AND: [
            {
              OR: [
                { sessionGroupId: null },
                {
                  sessionGroup: {
                    is: { OR: [{ visibility: "public" }, { ownerUserId: "user-1" }] },
                  },
                },
              ],
            },
          ],
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
          AND: [
            {
              OR: [
                { sessionGroupId: null },
                {
                  sessionGroup: {
                    is: { OR: [{ visibility: "public" }, { ownerUserId: "user-1" }] },
                  },
                },
              ],
            },
          ],
          agentStatus: "active",
        },
        orderBy: { updatedAt: "desc" },
        include: expect.any(Object),
      });
    });
  });

  describe("search", () => {
    it("returns empty results when the trimmed query is shorter than 2 chars", async () => {
      const result = await service.search("org-1", "user-1", "  a  ");

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

      const result = await service.search("org-1", "user-1", "deploy");

      expect(prismaMock.session.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: "org-1",
          name: { contains: "deploy", mode: "insensitive" },
          AND: [
            {
              OR: [
                { sessionGroupId: null },
                {
                  sessionGroup: {
                    is: { OR: [{ visibility: "public" }, { ownerUserId: "user-1" }] },
                  },
                },
              ],
            },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: expect.any(Object),
      });
      expect(prismaMock.sessionGroup.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: "org-1",
          AND: [
            { OR: [{ visibility: "public" }, { ownerUserId: "user-1" }] },
            {
              OR: [
                { name: { contains: "deploy", mode: "insensitive" } },
                { slug: { contains: "deploy", mode: "insensitive" } },
              ],
            },
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

      await service.search("org-1", "user-1", "deploy", "channel-1");

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
      await service.search("org-1", "user-1", longInput);

      const sessionCall = prismaMock.session.findMany.mock.calls[0]?.[0];
      const sessionWhere = sessionCall?.where as { name?: { contains?: string } };
      expect(sessionWhere.name?.contains?.length).toBe(200);
    });
  });

  describe("start", () => {
    it("rejects app sessions linked to a user repo", async () => {
      await expect(
        service.start({
          organizationId: "org-1",
          createdById: "user-1",
          kind: "app",
          repoId: "repo-1",
          hosting: "cloud",
          prompt: "Build a CRM",
        } as unknown as StartSessionServiceInput),
      ).rejects.toThrow("App sessions cannot start from a linked repo");
    });

    it("rejects local app sessions", async () => {
      await expect(
        service.start({
          organizationId: "org-1",
          createdById: "user-1",
          kind: "app",
          hosting: "local",
          prompt: "Build a CRM",
        } as unknown as StartSessionServiceInput),
      ).rejects.toThrow("App sessions require cloud hosting");
    });

    it("creates a blank app session without provisioning a runtime", async () => {
      const repo = await managedGitServiceMock.createManagedRepo({
        organizationId: "org-1",
        name: "App source",
        actorType: "user",
        actorId: "user-1",
      });
      managedGitServiceMock.createManagedRepo.mockClear();
      const sessionGroup = makeSessionGroup({ kind: "app", repoId: repo.id, repo });
      const session = makeSession({ hosting: "cloud", repoId: repo.id, repo, sessionGroup });
      prismaMock.sessionGroup.create.mockResolvedValueOnce(sessionGroup);
      prismaMock.session.create.mockResolvedValueOnce(session);

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        kind: "app",
        hosting: "cloud",
      } as unknown as StartSessionServiceInput);

      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: "Untitled App", pendingRun: undefined }),
        }),
      );
      expect(sessionRouterMock.createRuntime).not.toHaveBeenCalled();
    });

    it("creates an app session with a hidden managed repo and cloud runtime", async () => {
      const repo = await managedGitServiceMock.createManagedRepo({
        organizationId: "org-1",
        name: "App source",
        actorType: "user",
        actorId: "user-1",
      });
      managedGitServiceMock.createManagedRepo.mockClear();
      const sessionGroup = makeSessionGroup({
        kind: "app",
        channelId: null,
        channel: null,
        repoId: repo.id,
        repo,
        slug: null,
        branch: null,
      });
      const session = makeSession({
        hosting: "cloud",
        channelId: null,
        channel: null,
        repoId: repo.id,
        repo,
        sessionGroup,
      });
      prismaMock.sessionGroup.create.mockResolvedValueOnce(sessionGroup);
      prismaMock.session.create.mockResolvedValueOnce(session);

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        kind: "app",
        hosting: "cloud",
        prompt: "Build a CRM",
      } as unknown as StartSessionServiceInput);
      await Promise.resolve();

      expect(managedGitServiceMock.createManagedRepo).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-1", actorId: "user-1" }),
      );
      expect(prismaMock.sessionGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ kind: "app", repoId: "managed-repo-1" }),
        }),
      );
      // App sessions provision immediately, so the initial prompt must be queued
      // as a pending run — otherwise workspaceReady has nothing to deliver and
      // the agent never starts.
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pendingRun: expect.objectContaining({ type: "run", prompt: "Build a CRM" }),
          }),
        }),
      );
      await vi.waitFor(() => {
        expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionGroupKind: "app",
            hosting: "cloud",
            prepareAppGit: expect.any(Function),
            repo: null,
          }),
        );
      });
    });

    it("validates design sessions as repo-less, cloud sessions", async () => {
      await expect(
        service.start({
          organizationId: "org-1",
          createdById: "user-1",
          kind: "design",
          repoId: "repo-1",
          hosting: "cloud",
          prompt: "Explore onboarding",
        } as unknown as StartSessionServiceInput),
      ).rejects.toThrow("Design sessions cannot start from a linked repo");

      await expect(
        service.start({
          organizationId: "org-1",
          createdById: "user-1",
          kind: "design",
          hosting: "local",
          prompt: "Explore onboarding",
        } as unknown as StartSessionServiceInput),
      ).rejects.toThrow("Design sessions require cloud hosting");
    });

    it("creates a blank design session without provisioning a runtime", async () => {
      const repo = await managedGitServiceMock.createManagedRepo({
        organizationId: "org-1",
        name: "Design source",
        actorType: "user",
        actorId: "user-1",
      });
      managedGitServiceMock.createManagedRepo.mockClear();
      const sessionGroup = makeSessionGroup({ kind: "design", repoId: repo.id, repo });
      const session = makeSession({ hosting: "cloud", repoId: repo.id, repo, sessionGroup });
      prismaMock.sessionGroup.create.mockResolvedValueOnce(sessionGroup);
      prismaMock.session.create.mockResolvedValueOnce(session);

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        kind: "design",
        hosting: "cloud",
      } as unknown as StartSessionServiceInput);

      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: "Untitled Design", pendingRun: undefined }),
        }),
      );
      expect(sessionRouterMock.createRuntime).not.toHaveBeenCalled();
    });

    it("rejects design sessions resolved through a local environment", async () => {
      prismaMock.agentEnvironment.findFirstOrThrow.mockResolvedValueOnce({
        id: "env-local",
        organizationId: "org-1",
        name: "Local Laptop",
        adapterType: "local",
        config: { runtimeInstanceId: "runtime-local" },
        enabled: true,
        isDefault: false,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
      });
      sessionRouterMock.getRuntime.mockReturnValue({
        id: "runtime-local",
        label: "Local Laptop",
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
          kind: "design",
          environmentId: "env-local",
          prompt: "Explore onboarding",
        } as unknown as StartSessionServiceInput),
      ).rejects.toThrow("Design sessions require cloud hosting");

      expect(managedGitServiceMock.createManagedRepo).not.toHaveBeenCalled();
    });

    it("creates a design session with managed git and design runtime preparation", async () => {
      const repo = await managedGitServiceMock.createManagedRepo({
        organizationId: "org-1",
        name: "Design source",
        actorType: "user",
        actorId: "user-1",
      });
      managedGitServiceMock.createManagedRepo.mockClear();
      const sessionGroup = makeSessionGroup({ kind: "design", repoId: repo.id, repo });
      const session = makeSession({
        hosting: "cloud",
        repoId: repo.id,
        repo,
        sessionGroup,
      });
      prismaMock.sessionGroup.create.mockResolvedValueOnce(sessionGroup);
      prismaMock.session.create.mockResolvedValueOnce(session);

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        kind: "design",
        hosting: "cloud",
        prompt: "Explore onboarding",
      } as unknown as StartSessionServiceInput);
      await Promise.resolve();

      expect(managedGitServiceMock.createManagedRepo).toHaveBeenCalled();
      expect(prismaMock.sessionGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ kind: "design", repoId: "managed-repo-1" }),
        }),
      );
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pendingRun: expect.objectContaining({ prompt: "Explore onboarding" }),
          }),
        }),
      );
      await vi.waitFor(() => {
        expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
          expect.objectContaining({ sessionGroupKind: "design", repo: null }),
        );
      });
    });

    it("rejects cloud sessions for repos without remote urls", async () => {
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-1", remoteUrl: null });
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
          hosting: "cloud",
          prompt: "Implement dashboard filters",
        } as unknown as StartSessionServiceInput),
      ).rejects.toThrow("Cloud sessions require the repo to have a remote URL.");

      expect(prismaMock.session.create).not.toHaveBeenCalled();
      expect(sessionRouterMock.createRuntime).not.toHaveBeenCalled();
    });

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
        data: expect.objectContaining({
          name: "Implement dashboard filters",
          organizationId: "org-1",
          ownerUserId: "user-1",
          visibility: "public",
          channelId: "channel-1",
          repoId: "repo-1",
          connection: expect.any(Object),
        }),
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

    it("records an initial prompt without provisioning when initial run is deferred", async () => {
      const sessionGroup = makeSessionGroup();
      const session = makeSession({ sessionGroup });
      const imageKeys = ["uploads/org-1/slack-image.png"];

      prismaMock.agentEnvironment.findFirst.mockResolvedValueOnce(makeAgentEnvironment());
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
        prompt: "Investigate this screenshot",
        imageKeys,
        deferInitialRun: true,
      } as unknown as StartSessionServiceInput);

      expect(sessionRouterMock.createRuntime).not.toHaveBeenCalled();
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pendingRun: undefined,
            lastUserMessageAt: expect.any(Date),
            lastMessageAt: expect.any(Date),
          }),
        }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_started",
          payload: expect.objectContaining({
            prompt: "Investigate this screenshot",
            imageKeys,
            attachmentKeys: imageKeys,
          }),
        }),
        expect.anything(),
      );
    });

    it("stores the default reasoning effort when none is provided", async () => {
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

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        channelId: "channel-1",
      } as unknown as StartSessionServiceInput);

      expect(getDefaultReasoningEffortMock).toHaveBeenCalledWith("claude_code");
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reasoningEffort: "auto",
          }),
        }),
      );
    });

    it("uses the user's last session config when no tool is provided", async () => {
      const sessionGroup = makeSessionGroup();
      const session = makeSession({ sessionGroup, tool: "codex", model: "gpt-5.5" });

      prismaMock.user.findUnique.mockResolvedValueOnce({
        defaultSessionTool: "codex",
        defaultSessionModel: "gpt-5.5",
        defaultSessionReasoningEffort: "high",
      });
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
        channelId: "channel-1",
      });

      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tool: "codex",
            model: "gpt-5.5",
            reasoningEffort: "high",
          }),
        }),
      );
    });

    it("falls back from an unsupported default tool to an accessible local runtime tool", async () => {
      const sessionGroup = makeSessionGroup();
      const session = makeSession({
        sessionGroup,
        tool: "codex",
        hosting: "local",
        model: "claude-sonnet-4-20250514",
      });

      prismaMock.user.findUnique.mockResolvedValueOnce({
        defaultSessionTool: "pi",
        defaultSessionModel: null,
        defaultSessionReasoningEffort: null,
      });
      prismaMock.channel.findUnique.mockResolvedValueOnce({
        id: "channel-1",
        organizationId: "org-1",
        type: "coding",
        repoId: "repo-1",
      });
      runtimeAccessServiceMock.listAccessibleRuntimeInstanceIds.mockResolvedValue(
        new Set(["runtime-1"]),
      );
      sessionRouterMock.listRuntimes.mockReturnValue([
        {
          key: "runtime-1",
          id: "runtime-1",
          label: "Laptop",
          hostingMode: "local",
          organizationId: "org-1",
          registeredRepoIds: ["repo-1"],
          supportedTools: ["codex"],
          boundSessions: new Set<string>(),
          ws: { readyState: 1, OPEN: 1 },
        },
      ] as unknown as ReturnType<typeof sessionRouterMock.listRuntimes>);
      prismaMock.sessionGroup.create.mockResolvedValueOnce(sessionGroup);
      prismaMock.session.create.mockResolvedValueOnce(session);

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        channelId: "channel-1",
      });

      expect(getDefaultModelMock).toHaveBeenCalledWith("codex");
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tool: "codex",
          }),
        }),
      );
    });

    it("falls back before resolving an explicit local hosting request", async () => {
      const sessionGroup = makeSessionGroup();
      const session = makeSession({
        sessionGroup,
        tool: "codex",
        hosting: "local",
      });

      prismaMock.user.findUnique.mockResolvedValueOnce({
        defaultSessionTool: "pi",
        defaultSessionModel: null,
        defaultSessionReasoningEffort: null,
      });
      prismaMock.agentEnvironment.findFirst.mockImplementation(async (args) => {
        const where = args?.where as { adapterType?: string } | undefined;
        if (where?.adapterType === "local") {
          return makeAgentEnvironment({
            adapterType: "local",
            config: { runtimeSelection: "any_accessible_local" },
          });
        }
        return makeAgentEnvironment();
      });
      prismaMock.channel.findUnique.mockResolvedValueOnce({
        id: "channel-1",
        organizationId: "org-1",
        type: "coding",
        repoId: "repo-1",
      });
      runtimeAccessServiceMock.listAccessibleRuntimeInstanceIds.mockResolvedValue(
        new Set(["runtime-1"]),
      );
      sessionRouterMock.listRuntimes.mockReturnValue([
        {
          key: "runtime-1",
          id: "runtime-1",
          label: "Laptop",
          hostingMode: "local",
          organizationId: "org-1",
          registeredRepoIds: ["repo-1"],
          supportedTools: ["codex"],
          boundSessions: new Set<string>(),
          ws: { readyState: 1, OPEN: 1 },
        },
      ] as unknown as ReturnType<typeof sessionRouterMock.listRuntimes>);
      prismaMock.sessionGroup.create.mockResolvedValueOnce(sessionGroup);
      prismaMock.session.create.mockResolvedValueOnce(session);

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        channelId: "channel-1",
        hosting: "local",
      });

      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tool: "codex",
            hosting: "local",
          }),
        }),
      );
    });

    it("rejects an unsupported reasoning effort on start", async () => {
      isSupportedReasoningEffortMock.mockReturnValueOnce(false);

      await expect(
        service.start({
          organizationId: "org-1",
          createdById: "user-1",
          tool: "claude_code",
          reasoningEffort: "unsupported",
        } as unknown as StartSessionServiceInput),
      ).rejects.toThrow('Unsupported reasoning effort "unsupported" for tool "claude_code"');

      expect(prismaMock.session.create).not.toHaveBeenCalled();
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

    it("allows creating an empty session before the selected runtime supports its explicit tool", async () => {
      const sessionGroup = makeSessionGroup();
      const session = makeSession({
        sessionGroup,
        tool: "codex",
        hosting: "local",
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-1",
          runtimeLabel: "Laptop",
          retryCount: 0,
          canRetry: true,
          canMove: true,
        },
      });

      prismaMock.agentEnvironment.findFirst.mockResolvedValue(
        makeAgentEnvironment({
          config: {
            ...makeAgentEnvironment().config,
            capabilities: { supportedTools: ["claude_code"] },
          },
        }),
      );
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        key: "runtime-1",
        id: "runtime-1",
        label: "Laptop",
        hostingMode: "local",
        organizationId: "org-1",
        registeredRepoIds: [],
        supportedTools: ["claude_code"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      } as unknown as ReturnType<typeof sessionRouterMock.getRuntime>);
      prismaMock.sessionGroup.create.mockResolvedValueOnce(sessionGroup);
      prismaMock.session.create.mockResolvedValueOnce(session);

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "codex",
        runtimeInstanceId: "runtime-1",
      } as unknown as StartSessionServiceInput);

      expect(prismaMock.sessionGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            connection: expect.objectContaining({
              runtimeInstanceId: "runtime-1",
              runtimeLabel: "Laptop",
            }),
          }),
        }),
      );
      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tool: "codex",
            hosting: "local",
          }),
        }),
      );
    });

    it("rejects a prompted start when the selected runtime does not support the explicit tool", async () => {
      prismaMock.agentEnvironment.findFirst.mockResolvedValue(makeAgentEnvironment());
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        key: "runtime-1",
        id: "runtime-1",
        label: "Laptop",
        hostingMode: "local",
        organizationId: "org-1",
        registeredRepoIds: [],
        supportedTools: ["claude_code"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      } as unknown as ReturnType<typeof sessionRouterMock.getRuntime>);

      await expect(
        service.start({
          organizationId: "org-1",
          createdById: "user-1",
          tool: "codex",
          runtimeInstanceId: "runtime-1",
          prompt: "Start work",
        } as unknown as StartSessionServiceInput),
      ).rejects.toThrow("Selected runtime does not support this tool");
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

    it("reuses an existing group runtime even when the default environment supports another tool", async () => {
      const groupConnection = {
        state: "connected",
        runtimeInstanceId: "runtime-codex",
        runtimeLabel: "Codex Laptop",
        retryCount: 0,
        canRetry: true,
        canMove: true,
      };
      const existingGroup = makeSessionGroup({
        workdir: "/tmp/trace/source",
        repoId: "repo-1",
        branch: "feature/source",
        connection: groupConnection,
      });

      prismaMock.agentEnvironment.findFirst.mockResolvedValue(
        makeAgentEnvironment({
          config: {
            capabilities: { supportedTools: ["claude_code"] },
            startUrl: "http://localhost:4010/start",
            stopUrl: "http://localhost:4010/stop",
            statusUrl: "http://localhost:4010/status",
            auth: { type: "bearer", secretId: "secret-1" },
          },
        }),
      );
      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: "source-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        repoId: "repo-1",
        branch: "feature/source",
        hosting: "local",
        channelId: "channel-1",
        projects: [],
        sessionGroup: existingGroup,
      });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce(existingGroup);
      prismaMock.channel.findUnique.mockResolvedValueOnce({
        id: "channel-1",
        organizationId: "org-1",
        type: "coding",
        repoId: "repo-1",
      });
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([]);
      prismaMock.session.create.mockResolvedValueOnce(
        makeSession({
          id: "session-2",
          tool: "codex",
          hosting: "local",
          workdir: "/tmp/trace/source",
          branch: "feature/source",
          connection: groupConnection,
        }),
      );

      await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "codex",
        sessionGroupId: "group-1",
        sourceSessionId: "source-1",
      } as unknown as StartSessionServiceInput);

      expect(prismaMock.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tool: "codex",
            hosting: "local",
            sessionGroupId: "group-1",
            connection: groupConnection,
          }),
        }),
      );
    });

    it("rejects runtime selection when adding a session to an established group", async () => {
      const groupConnection = {
        state: "connected",
        runtimeInstanceId: "runtime-a",
        runtimeLabel: "Laptop A",
        retryCount: 0,
        canRetry: true,
        canMove: true,
      };
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce(
        makeSessionGroup({ connection: groupConnection }),
      );
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
          hosting: "local",
          runtimeInstanceId: "runtime-a",
          sessionGroupId: "group-1",
        } as unknown as StartSessionServiceInput),
      ).rejects.toThrow(
        "New sessions inherit the session group's bridge. Move the session group to change bridges.",
      );

      expect(prismaMock.session.create).not.toHaveBeenCalled();
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

      // No prompt: the Restore action in the UI sends only restoreCheckpointId.
      // The restore must still provision immediately from the pinned SHA rather
      // than deferring (which would later clone HEAD and lose the checkpoint).
      const result = await service.start({
        organizationId: "org-1",
        createdById: "user-1",
        tool: "claude_code",
        hosting: "cloud",
        restoreCheckpointId: "checkpoint-1",
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

    it("forks a visible session into a new owned group and records source group ancestry", async () => {
      const sourceGroup = makeSessionGroup({
        id: "source-group",
        ownerUserId: "other-user",
        visibility: "public",
        branch: "feature/source",
      });
      const sourceSession = makeSession({
        id: "source-session",
        createdById: "other-user",
        sessionGroupId: "source-group",
        sessionGroup: sourceGroup,
        branch: "feature/source",
      });
      const forkedGroup = makeSessionGroup({
        id: "forked-group",
        name: sourceSession.name,
        ownerUserId: "user-1",
        branch: "feature/source",
        forkedFromSessionGroupId: "source-group",
      });
      const forkedSession = makeSession({
        id: "forked-session",
        sessionGroupId: "forked-group",
        sessionGroup: forkedGroup,
        branch: "feature/source",
      });

      prismaMock.event.findFirst.mockResolvedValueOnce({
        id: "source-message",
        organizationId: "org-1",
        scopeType: "session",
        scopeId: "source-session",
        eventType: "message_sent",
        payload: {
          text: "hello",
          sessionId: "source-session",
          groupId: "source-group",
        },
        actorType: "user",
        actorId: "other-user",
        parentId: "source-start",
        metadata: null,
        timestamp: new Date("2024-01-01T00:00:01.000Z"),
      });
      prismaMock.session.findFirst.mockResolvedValueOnce(sourceSession);
      prismaMock.gitCheckpoint.findFirst.mockResolvedValueOnce(
        makeGitCheckpoint({
          sessionId: "source-session",
          sessionGroupId: "source-group",
          commitSha: "checkpoint-sha",
          promptEventId: "source-start",
        }),
      );
      prismaMock.gitCheckpoint.findMany.mockResolvedValueOnce([
        makeGitCheckpoint({
          id: "source-checkpoint",
          sessionId: "source-session",
          sessionGroupId: "source-group",
          commitSha: "checkpoint-sha",
          promptEventId: "source-start",
        }),
      ]);
      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: "source-session",
        organizationId: "org-1",
        sessionGroupId: "source-group",
        repoId: "repo-1",
        branch: "feature/source",
        hosting: "cloud",
        channelId: "channel-1",
        projects: [{ projectId: "project-1" }],
        sessionGroup: sourceGroup,
      });
      prismaMock.ticketLink.findMany.mockResolvedValueOnce([{ ticketId: "ticket-1" }]);
      prismaMock.channel.findUnique.mockResolvedValueOnce({
        id: "channel-1",
        organizationId: "org-1",
        type: "coding",
        repoId: "repo-1",
      });
      prismaMock.sessionGroup.create.mockResolvedValueOnce(forkedGroup);
      prismaMock.session.create.mockResolvedValueOnce(forkedSession);
      prismaMock.event.findMany.mockResolvedValueOnce([
        {
          id: "source-start",
          scopeType: "session",
          scopeId: "source-session",
          eventType: "session_started",
          payload: {
            session: { id: "source-session" },
            sessionGroup: { id: "source-group" },
            prompt: "Initial source prompt",
            attachmentKeys: ["image-key"],
            imageKeys: ["image-key"],
            checkpoint: { promptEventId: "source-start" },
          },
          actorType: "user",
          actorId: "other-user",
          parentId: null,
          metadata: null,
          organizationId: "org-1",
          timestamp: new Date("2024-01-01T00:00:00.000Z"),
        },
        {
          id: "source-checkpoint-event",
          scopeType: "session",
          scopeId: "source-session",
          eventType: "session_output",
          payload: {
            type: "git_checkpoint",
            checkpoint: { id: "source-checkpoint", promptEventId: "source-start" },
          },
          actorType: "system",
          actorId: "system",
          parentId: null,
          metadata: null,
          organizationId: "org-1",
          timestamp: new Date("2024-01-01T00:00:00.500Z"),
        },
        {
          id: "source-message",
          scopeType: "session",
          scopeId: "source-session",
          eventType: "message_sent",
          payload: {
            text: "hello",
            sessionId: "source-session",
            groupId: "source-group",
            checkpoint: { id: "source-checkpoint", promptEventId: "source-start" },
          },
          actorType: "user",
          actorId: "other-user",
          parentId: "source-start",
          metadata: null,
          organizationId: "org-1",
          timestamp: new Date("2024-01-01T00:00:01.000Z"),
        },
      ]);
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(forkedSession);

      const result = await service.forkSession({
        eventId: "source-message",
        organizationId: "org-1",
        createdById: "user-1",
        actorType: "user",
      });

      expect(result).toEqual(forkedSession);
      expect(prismaMock.event.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          organizationId: "org-1",
          scopeType: "session",
          scopeId: "source-session",
          OR: [
            { timestamp: { lt: new Date("2024-01-01T00:00:01.000Z") } },
            {
              timestamp: new Date("2024-01-01T00:00:01.000Z"),
              id: { lte: "source-message" },
            },
          ],
        },
        orderBy: [{ timestamp: "asc" }, { id: "asc" }],
      });
      expect(prismaMock.gitCheckpoint.findMany).toHaveBeenCalledWith({
        where: {
          sessionGroupId: "source-group",
          id: { in: ["source-checkpoint"] },
        },
        orderBy: [{ committedAt: "asc" }, { createdAt: "asc" }],
      });
      expect(prismaMock.sessionGroup.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ownerUserId: "user-1",
          forkedFromSessionGroupId: "source-group",
          branch: "feature/source",
        }),
        select: expect.any(Object),
      });
      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "forked-session",
          sessionGroupId: "forked-group",
          checkpointSha: "checkpoint-sha",
          branch: "feature/source",
        }),
      );
      expect(prismaMock.ticketLink.createMany).toHaveBeenCalledWith({
        data: [{ ticketId: "ticket-1", entityType: "session", entityId: "forked-session" }],
        skipDuplicates: true,
      });
      const startEventCreate = eventServiceMock.create.mock.calls.find(
        ([event]) => event.eventType === "session_started",
      )?.[0];
      const messageEventCreate = eventServiceMock.create.mock.calls.find(
        ([event]) => event.eventType === "message_sent",
      )?.[0];
      expect(startEventCreate).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          scopeId: "forked-session",
          eventType: "session_started",
          timestamp: new Date("2024-01-01T00:00:00.000Z"),
          payload: expect.objectContaining({
            session: expect.objectContaining({ id: "forked-session" }),
            sessionGroup: expect.objectContaining({ id: "forked-group" }),
            prompt: "Initial source prompt",
            attachmentKeys: ["image-key"],
            imageKeys: ["image-key"],
            checkpoint: { promptEventId: expect.any(String) },
            sourceSessionId: "source-session",
          }),
          metadata: expect.objectContaining({
            forkedFromSessionId: "source-session",
            forkedFromSessionGroupId: "source-group",
            forkedFromEventId: "source-message",
          }),
          actorType: "user",
          actorId: "other-user",
        }),
      );
      expect(startEventCreate?.payload).toEqual(
        expect.objectContaining({
          checkpoint: { promptEventId: startEventCreate?.id },
        }),
      );
      expect(messageEventCreate).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          scopeId: "forked-session",
          eventType: "message_sent",
          parentId: startEventCreate?.id,
          timestamp: new Date("2024-01-01T00:00:01.000Z"),
          payload: expect.objectContaining({
            sessionId: "forked-session",
            groupId: "forked-group",
            checkpoint: {
              id: expect.any(String),
              promptEventId: startEventCreate?.id,
            },
          }),
          metadata: expect.objectContaining({
            forkedFromEventId: "source-message",
          }),
          deferPublish: true,
        }),
      );
      expect(prismaMock.gitCheckpoint.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: expect.any(String),
          sessionId: "forked-session",
          sessionGroupId: "forked-group",
          promptEventId: startEventCreate?.id,
          commitSha: "checkpoint-sha",
        }),
      });
      expect(prismaMock.event.update).not.toHaveBeenCalled();
    });

    it("rejects forking private sessions owned by another user", async () => {
      prismaMock.event.findFirst.mockResolvedValueOnce({
        id: "source-message",
        organizationId: "org-1",
        scopeType: "session",
        scopeId: "source-session",
        eventType: "message_sent",
        payload: {},
        actorType: "user",
        actorId: "other-user",
        parentId: null,
        metadata: null,
        timestamp: new Date("2024-01-01T00:00:01.000Z"),
      });
      prismaMock.session.findFirst.mockResolvedValueOnce(
        makeSession({
          id: "source-session",
          createdById: "other-user",
          sessionGroupId: "source-group",
          sessionGroup: makeSessionGroup({
            id: "source-group",
            ownerUserId: "other-user",
            visibility: "private",
          }),
        }),
      );

      await expect(
        service.forkSession({
          eventId: "source-message",
          organizationId: "org-1",
          createdById: "user-1",
        }),
      ).rejects.toThrow("Not authorized for this session");

      expect(prismaMock.sessionGroup.create).not.toHaveBeenCalled();
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

    it("captures and emits a validated app checkpoint preview", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        repoId: "repo-1",
        sessionGroup: { kind: "app", ownerUserId: "user-1" },
      });
      prismaMock.gitCheckpoint.findUnique.mockResolvedValueOnce(null);
      prismaMock.event.findFirst.mockResolvedValueOnce({ id: "prompt-1" });
      const checkpoint = makeGitCheckpoint({ promptEventId: "prompt-1" });
      prismaMock.gitCheckpoint.create.mockResolvedValueOnce(checkpoint);
      appCheckpointCaptureServiceMock.capture.mockResolvedValueOnce({
        captureStatus: "captured",
        captureKey: "uploads/org-1/app-checkpoints/checkpoint-1.png",
        captureUrl: "https://files.example/checkpoint-1.png",
        captureContentType: "image/png",
        capturedAt: new Date("2026-07-09T00:00:00.000Z"),
      });
      prismaMock.gitCheckpoint.update.mockResolvedValueOnce({
        ...checkpoint,
        captureStatus: "captured",
        captureKey: "uploads/org-1/app-checkpoints/checkpoint-1.png",
        captureUrl: "https://files.example/checkpoint-1.png",
        captureContentType: "image/png",
        capturedAt: new Date("2026-07-09T00:00:00.000Z"),
      });

      await service.recordGitCheckpoint("session-1", {
        trigger: "commit",
        command: "git commit",
        observedAt: "2026-07-09T00:00:00.000Z",
        commitSha: "abcdef1234567890",
        parentShas: [],
        treeSha: "feedface12345678",
        subject: "Build app",
        author: "Agent <agent@trace.local>",
        committedAt: "2026-07-09T00:00:00.000Z",
        filesChanged: 4,
      });

      expect(appCheckpointCaptureServiceMock.capture).toHaveBeenCalledWith({
        organizationId: "org-1",
        sessionGroupId: "group-1",
        checkpointId: "checkpoint-1",
        userId: "user-1",
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            checkpoint: expect.objectContaining({
              captureStatus: "captured",
              captureContentType: "image/png",
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
    it("rejects private session group file access for non-owners", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        branch: "trace/test",
        workdir: "/tmp/trace",
        worktreeDeleted: false,
        visibility: "private",
        ownerUserId: "owner-1",
        repo: {
          provider: "github",
          remoteUrl: "git@github.com:trace/trace.git",
          defaultBranch: "main",
        },
      });

      await expect(service.listFiles("group-1", "org-1", "user-1")).rejects.toThrow(
        "Not authorized for this session group",
      );
      expect(sessionRouterMock.listFiles).not.toHaveBeenCalled();
      expect(githubRepoServiceMock.listFiles).not.toHaveBeenCalled();
    });

    it("rejects file reads for invalid relative paths", async () => {
      await expect(
        service.readFile("group-1", "../secrets.txt", "org-1", "user-1"),
      ).rejects.toThrow("Invalid file path");
      expect(sessionRouterMock.readFile).not.toHaveBeenCalled();
      expect(githubRepoServiceMock.readFile).not.toHaveBeenCalled();
    });

    it("rejects file access when the user has no GitHub token", async () => {
      apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({});
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        branch: "trace/test",
        workdir: "/tmp/trace",
        worktreeDeleted: false,
        visibility: "public",
        ownerUserId: "user-1",
        repo: {
          provider: "github",
          remoteUrl: "git@github.com:trace/trace.git",
          defaultBranch: "main",
        },
      });

      await expect(service.listFiles("group-1", "org-1", "user-1")).rejects.toThrow(
        "No GitHub token configured",
      );
      expect(orgSecretServiceMock.getDecryptedValueByName).toHaveBeenCalledWith(
        "org-1",
        "GITHUB_TOKEN",
      );
      expect(githubRepoServiceMock.listFiles).not.toHaveBeenCalled();
    });

    it("uses the organization GitHub token when the user has no GitHub token", async () => {
      apiTokenServiceMock.getDecryptedTokens.mockResolvedValueOnce({});
      orgSecretServiceMock.getDecryptedValueByName.mockResolvedValueOnce("org-gh-token");
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        branch: "trace/test",
        workdir: "/tmp/trace",
        worktreeDeleted: false,
        visibility: "public",
        ownerUserId: "user-1",
        repo: {
          provider: "github",
          remoteUrl: "git@github.com:trace/trace.git",
          defaultBranch: "main",
        },
      });
      githubRepoServiceMock.listFiles.mockResolvedValueOnce(["src/app.ts"]);

      await expect(service.listFiles("group-1", "org-1", "user-1")).resolves.toEqual([
        "src/app.ts",
      ]);
      expect(orgSecretServiceMock.getDecryptedValueByName).toHaveBeenCalledWith(
        "org-1",
        "GITHUB_TOKEN",
      );
      expect(githubRepoServiceMock.listFiles).toHaveBeenCalledWith(
        { owner: "trace", repo: "trace" },
        "trace/test",
        "org-gh-token",
      );
    });

    it("prefers the user's GitHub token over the organization GitHub token", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        branch: "trace/test",
        workdir: "/tmp/trace",
        worktreeDeleted: false,
        visibility: "public",
        ownerUserId: "user-1",
        repo: {
          provider: "github",
          remoteUrl: "git@github.com:trace/trace.git",
          defaultBranch: "main",
        },
      });
      githubRepoServiceMock.listFiles.mockResolvedValueOnce(["src/app.ts"]);

      await expect(service.listFiles("group-1", "org-1", "user-1")).resolves.toEqual([
        "src/app.ts",
      ]);
      expect(orgSecretServiceMock.getDecryptedValueByName).not.toHaveBeenCalled();
      expect(githubRepoServiceMock.listFiles).toHaveBeenCalledWith(
        { owner: "trace", repo: "trace" },
        "trace/test",
        "gh-token",
      );
    });

    it("reads GitHub files by converting absolute workdir paths to repo-relative paths", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        branch: "trace/test",
        workdir: "/tmp/trace",
        visibility: "public",
        ownerUserId: "user-1",
        repo: {
          provider: "github",
          remoteUrl: "git@github.com:trace/trace.git",
          defaultBranch: "main",
        },
      });
      githubRepoServiceMock.readFile.mockResolvedValueOnce("hello");

      await expect(
        service.readFile("group-1", "/tmp/trace/src/app.ts", "org-1", "user-1"),
      ).resolves.toBe("hello");
      expect(githubRepoServiceMock.readFile).toHaveBeenCalledWith(
        { owner: "trace", repo: "trace" },
        "trace/test",
        "src/app.ts",
        "gh-token",
      );
      expect(sessionRouterMock.listFiles).not.toHaveBeenCalled();
      expect(sessionRouterMock.readFile).not.toHaveBeenCalled();
    });

    it("falls back to the default branch when reading the session branch fails", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        branch: "trace/test",
        workdir: "/tmp/trace",
        visibility: "public",
        ownerUserId: "user-1",
        repo: {
          provider: "github",
          remoteUrl: "git@github.com:trace/trace.git",
          defaultBranch: "main",
        },
      });
      githubRepoServiceMock.readFile
        .mockRejectedValueOnce(new GitHubApiError(404, "Not Found"))
        .mockResolvedValueOnce("default branch contents");

      await expect(
        service.readFileWithSource("group-1", "/tmp/trace/src/app.ts", "org-1", "user-1"),
      ).resolves.toEqual({
        content: "default branch contents",
        ref: "main",
        requestedRef: "trace/test",
        usedFallback: true,
      });
      expect(githubRepoServiceMock.readFile).toHaveBeenNthCalledWith(
        1,
        { owner: "trace", repo: "trace" },
        "trace/test",
        "src/app.ts",
        "gh-token",
      );
      expect(githubRepoServiceMock.readFile).toHaveBeenNthCalledWith(
        2,
        { owner: "trace", repo: "trace" },
        "main",
        "src/app.ts",
        "gh-token",
      );
    });

    it("computes branch diffs through GitHub", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        branch: "trace/test",
        workdir: "/tmp/trace",
        visibility: "public",
        ownerUserId: "user-1",
        repo: {
          provider: "github",
          remoteUrl: "git@github.com:trace/trace.git",
          defaultBranch: "main",
        },
      });
      githubRepoServiceMock.branchDiff.mockResolvedValueOnce([
        { path: "src/app.ts", status: "M", additions: 2, deletions: 1 },
      ]);

      await expect(service.branchDiff("group-1", "org-1", "user-1")).resolves.toEqual([
        { path: "src/app.ts", status: "M", additions: 2, deletions: 1 },
      ]);
      expect(githubRepoServiceMock.branchDiff).toHaveBeenCalledWith(
        { owner: "trace", repo: "trace" },
        "main",
        "trace/test",
        "gh-token",
      );
      expect(sessionRouterMock.inspectSessionGitSyncStatus).not.toHaveBeenCalled();
    });

    it("reads files at refs through GitHub", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        branch: "trace/test",
        workdir: "/tmp/trace",
        visibility: "public",
        ownerUserId: "user-1",
        repo: {
          provider: "github",
          remoteUrl: "git@github.com:trace/trace.git",
          defaultBranch: "main",
        },
      });
      githubRepoServiceMock.readFile.mockResolvedValueOnce("base");

      await expect(
        service.readFileAtRef("group-1", "/tmp/trace/src/app.ts", "origin/main", "org-1", "user-1"),
      ).resolves.toBe("base");
      expect(githubRepoServiceMock.readFile).toHaveBeenCalledWith(
        { owner: "trace", repo: "trace" },
        "main",
        "src/app.ts",
        "gh-token",
      );
    });

    it("lists files through GitHub", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        branch: "trace/test",
        workdir: "/tmp/trace",
        visibility: "public",
        ownerUserId: "user-1",
        repo: {
          provider: "github",
          remoteUrl: "git@github.com:trace/trace.git",
          defaultBranch: "main",
        },
      });
      githubRepoServiceMock.listFiles.mockResolvedValueOnce(["src/app.ts"]);

      await expect(service.listFiles("group-1", "org-1", "user-1")).resolves.toEqual([
        "src/app.ts",
      ]);
      expect(githubRepoServiceMock.listFiles).toHaveBeenCalledWith(
        { owner: "trace", repo: "trace" },
        "trace/test",
        "gh-token",
      );
      expect(sessionRouterMock.listFiles).not.toHaveBeenCalled();
    });

    it("lists directory entries through GitHub", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        branch: "trace/test",
        workdir: "/tmp/trace",
        visibility: "public",
        ownerUserId: "user-1",
        repo: {
          provider: "github",
          remoteUrl: "git@github.com:trace/trace.git",
          defaultBranch: "main",
        },
      });
      githubRepoServiceMock.listDirectoryEntries.mockResolvedValueOnce([
        { name: "src", path: "src", isDirectory: true },
        { name: "README.md", path: "README.md", isDirectory: false },
      ]);

      await expect(
        service.listDirectoryEntries("group-1", "", 2, "org-1", "user-1"),
      ).resolves.toEqual([
        { name: "src", path: "src", isDirectory: true },
        { name: "README.md", path: "README.md", isDirectory: false },
      ]);
      expect(githubRepoServiceMock.listDirectoryEntries).toHaveBeenCalledWith(
        { owner: "trace", repo: "trace" },
        "trace/test",
        "",
        "gh-token",
        2,
      );
      expect(sessionRouterMock.listFiles).not.toHaveBeenCalled();
    });

    it("rejects directory listing for invalid relative paths", async () => {
      await expect(
        service.listDirectoryEntries("group-1", "src/../secrets", 1, "org-1", "user-1"),
      ).rejects.toThrow("Invalid file path");
      expect(githubRepoServiceMock.listDirectoryEntries).not.toHaveBeenCalled();
    });

    it("returns the recursive file tree with the truncated flag", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        branch: "trace/test",
        workdir: "/tmp/trace",
        visibility: "public",
        ownerUserId: "user-1",
        repo: {
          provider: "github",
          remoteUrl: "git@github.com:trace/trace.git",
          defaultBranch: "main",
        },
      });
      githubRepoServiceMock.listFileTree.mockResolvedValueOnce({
        paths: ["README.md", "src/index.ts"],
        truncated: true,
      });

      await expect(service.listFileTree("group-1", "org-1", "user-1")).resolves.toEqual({
        paths: ["README.md", "src/index.ts"],
        truncated: true,
      });
      expect(githubRepoServiceMock.listFileTree).toHaveBeenCalledWith(
        { owner: "trace", repo: "trace" },
        "trace/test",
        "gh-token",
      );
      expect(sessionRouterMock.listFiles).not.toHaveBeenCalled();
    });

    it("falls back to the default branch when the session branch is unavailable", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        branch: "trace/test",
        workdir: "/tmp/trace",
        visibility: "public",
        ownerUserId: "user-1",
        repo: {
          provider: "github",
          remoteUrl: "git@github.com:trace/trace.git",
          defaultBranch: "main",
        },
      });
      githubRepoServiceMock.listFileTree
        .mockRejectedValueOnce(new GitHubApiError(404, "Not Found"))
        .mockResolvedValueOnce({ paths: ["README.md"], truncated: false });

      await expect(service.listFileTree("group-1", "org-1", "user-1")).resolves.toEqual({
        paths: ["README.md"],
        truncated: false,
      });
      expect(githubRepoServiceMock.listFileTree).toHaveBeenNthCalledWith(
        1,
        { owner: "trace", repo: "trace" },
        "trace/test",
        "gh-token",
      );
      expect(githubRepoServiceMock.listFileTree).toHaveBeenNthCalledWith(
        2,
        { owner: "trace", repo: "trace" },
        "main",
        "gh-token",
      );
    });

    it("does not fall back to the default branch on non-404 GitHub errors", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        branch: "trace/test",
        workdir: "/tmp/trace",
        visibility: "public",
        ownerUserId: "user-1",
        repo: {
          provider: "github",
          remoteUrl: "git@github.com:trace/trace.git",
          defaultBranch: "main",
        },
      });
      githubRepoServiceMock.listFileTree.mockRejectedValueOnce(
        new GitHubApiError(403, "rate limit exceeded"),
      );

      await expect(service.listFileTree("group-1", "org-1", "user-1")).rejects.toThrow(
        "rate limit exceeded",
      );
      expect(githubRepoServiceMock.listFileTree).toHaveBeenCalledTimes(1);
    });

    it("does not route managed repos through GitHub file APIs", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        branch: "main",
        workdir: "/tmp/trace",
        visibility: "public",
        ownerUserId: "user-1",
        repo: {
          provider: "managed",
          remoteUrl: "https://trace.test/git/org-1/repo-1.git",
          defaultBranch: "main",
        },
      });

      await expect(service.listFiles("group-1", "org-1", "user-1")).rejects.toThrow(
        "Cannot access GitHub files for a managed repo",
      );
      expect(githubRepoServiceMock.listFiles).not.toHaveBeenCalled();
    });

    it("saves files through the live session group runtime", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        branch: "trace/test",
        workdir: "/tmp/trace",
        worktreeDeleted: false,
        connection: { runtimeInstanceId: "runtime-1" },
        visibility: "public",
        ownerUserId: "user-1",
        repo: {
          provider: "github",
          remoteUrl: "git@github.com:trace/trace.git",
          defaultBranch: "main",
        },
      });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          workdir: "/tmp/trace",
          connection: { runtimeInstanceId: "runtime-1" },
        },
      ]);
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        key: "org-1:runtime-1",
        label: "Runtime",
        hostingMode: "local",
      });

      await expect(
        service.saveFile("group-1", "/tmp/trace/src/app.ts", "hello", "org-1", "user-1"),
      ).resolves.toBe(true);
      expect(runtimeAccessServiceMock.assertAccess).toHaveBeenCalledWith({
        userId: "user-1",
        organizationId: "org-1",
        runtimeInstanceId: "runtime-1",
        sessionGroupId: "group-1",
        capability: "session",
      });
      expect(sessionRouterMock.writeFile).toHaveBeenCalledWith(
        "org-1:runtime-1",
        "session-1",
        "/tmp/trace/src/app.ts",
        "hello",
        "/tmp/trace",
      );
    });

    it("rejects PDF format updates for non-PDF session groups before writing", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        kind: "app",
        workdir: "/tmp/trace",
        worktreeDeleted: false,
        connection: { runtimeInstanceId: "runtime-1" },
        visibility: "public",
        ownerUserId: "user-1",
      });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          workdir: "/tmp/trace",
          connection: { runtimeInstanceId: "runtime-1" },
        },
      ]);
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        key: "org-1:runtime-1",
        label: "Runtime",
        hostingMode: "local",
      });

      await expect(
        service.updatePdfFormat(
          "group-1",
          { width: 210, height: 297, unit: "mm" },
          "org-1",
          "user-1",
        ),
      ).rejects.toThrow("PDF session not found");

      expect(sessionRouterMock.writeFile).not.toHaveBeenCalled();
    });

    it("serves captured PDFs inline for saved previews and as attachments for downloads", async () => {
      const artifact = {
        pdfExportStatus: "captured",
        pdfExportKey: "pdf-exports/org-1/group-1/commit.pdf",
        pdfExportCommitSha: "abcdef1234567890",
      };
      prismaMock.sessionGroup.findFirst
        .mockResolvedValueOnce({ id: "group-1", visibility: "public", ownerUserId: "user-1" })
        .mockResolvedValueOnce(artifact)
        .mockResolvedValueOnce({ id: "group-1", visibility: "public", ownerUserId: "user-1" })
        .mockResolvedValueOnce(artifact);

      await expect(service.pdfPreviewUrl("group-1", "org-1", "user-1")).resolves.toBe(
        `https://example.test/${artifact.pdfExportKey}`,
      );
      expect(storageMock.getGetUrl).toHaveBeenNthCalledWith(1, artifact.pdfExportKey, undefined);

      await expect(service.pdfDownloadUrl("group-1", "org-1", "user-1")).resolves.toBe(
        `https://example.test/${artifact.pdfExportKey}`,
      );
      expect(storageMock.getGetUrl).toHaveBeenNthCalledWith(2, artifact.pdfExportKey, {
        downloadFilename: "document-abcdef12.pdf",
      });
    });

    it("writes manual element styles to the dedicated design stylesheet", async () => {
      const source = "/* Trace writes user-authored visual overrides here. */\n";
      prismaMock.sessionGroup.findFirst
        .mockResolvedValueOnce({
          id: "group-1",
          kind: "design",
          visibility: "public",
          ownerUserId: "user-1",
        })
        .mockResolvedValueOnce({
          id: "group-1",
          workdir: "/tmp/trace",
          worktreeDeleted: false,
          connection: { runtimeInstanceId: "runtime-1" },
          visibility: "public",
          ownerUserId: "user-1",
        });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          workdir: "/tmp/trace",
          connection: { runtimeInstanceId: "runtime-1" },
        },
      ]);
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        key: "org-1:runtime-1",
        label: "Runtime",
        hostingMode: "local",
      });
      sessionRouterMock.readFile.mockResolvedValueOnce(source);

      await expect(
        service.updateDesignElementStyles(
          {
            sessionGroupId: "group-1",
            elementId: "hero-title",
            styles: { color: "#112233", fontSize: 32, textAlign: "center" },
            expectedSourceHash: designSourceHash(source),
          },
          "org-1",
          "user",
          "user-1",
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          sessionGroupId: "group-1",
          elementId: "hero-title",
          styles: { color: "#112233", fontSize: 32, textAlign: "center" },
        }),
      );
      expect(sessionRouterMock.writeFile).toHaveBeenCalledWith(
        "org-1:runtime-1",
        "session-1",
        "src/design/manual.css",
        expect.stringContaining('[data-trace-id="hero-title"]'),
        "/tmp/trace",
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "design_element_styles_updated",
          payload: expect.objectContaining({
            elementId: "hero-title",
            styles: { color: "#112233", fontSize: 32, textAlign: "center" },
          }),
        }),
      );
    });

    it("commits a combined manual element edit before publishing its reconciliation event", async () => {
      const filePath = "src/design/screens/WelcomeScreen.tsx";
      const textSource = `<h1 data-trace-id="hero-title" data-trace-source="${filePath}">Processing</h1>`;
      const styleSource = "/* Trace writes user-authored visual overrides here. */\n";
      prismaMock.sessionGroup.findFirst
        .mockResolvedValueOnce({
          id: "group-1",
          kind: "design",
          visibility: "public",
          ownerUserId: "user-1",
        })
        .mockResolvedValueOnce({
          id: "group-1",
          workdir: "/tmp/trace",
          worktreeDeleted: false,
          connection: { runtimeInstanceId: "runtime-1" },
          visibility: "public",
          ownerUserId: "user-1",
        });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          workdir: "/tmp/trace",
          connection: { runtimeInstanceId: "runtime-1" },
        },
      ]);
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        key: "org-1:runtime-1",
        label: "Runtime",
        hostingMode: "local",
      });
      sessionRouterMock.readFile
        .mockResolvedValueOnce(textSource)
        .mockResolvedValueOnce(styleSource);
      sessionRouterMock.commitFileChanges.mockResolvedValueOnce("commit-123");

      await expect(
        service.saveManualElementEdit(
          {
            sessionGroupId: "group-1",
            filePath,
            elementId: "hero-title",
            text: "Under review",
            expectedTextSourceHash: designSourceHash(textSource),
            styles: { color: "#112233" },
            expectedStyleSourceHash: designSourceHash(styleSource),
          },
          "org-1",
          "user",
          "user-1",
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          filePath,
          elementId: "hero-title",
          text: "Under review",
          commitSha: "commit-123",
        }),
      );
      expect(sessionRouterMock.writeFile).toHaveBeenNthCalledWith(
        1,
        "org-1:runtime-1",
        "session-1",
        filePath,
        expect.stringContaining("Under review"),
        "/tmp/trace",
      );
      expect(sessionRouterMock.writeFile).toHaveBeenNthCalledWith(
        2,
        "org-1:runtime-1",
        "session-1",
        "src/design/manual.css",
        expect.stringContaining('[data-trace-id="hero-title"]'),
        "/tmp/trace",
      );
      expect(sessionRouterMock.commitFileChanges).toHaveBeenCalledWith(
        "org-1:runtime-1",
        "session-1",
        "Save manual design element edit",
        "/tmp/trace",
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "manual_element_saved",
          payload: expect.objectContaining({ commitSha: "commit-123", elementId: "hero-title" }),
        }),
      );
      expect(sessionRouterMock.commitFileChanges.mock.invocationCallOrder[0]!).toBeLessThan(
        eventServiceMock.create.mock.invocationCallOrder[0]!,
      );
    });

    it("uses the existing global stylesheet for legacy designs without manual.css", async () => {
      const source = "@tailwind base;\n";
      prismaMock.sessionGroup.findFirst
        .mockResolvedValueOnce({
          id: "group-1",
          kind: "design",
          visibility: "public",
          ownerUserId: "user-1",
        })
        .mockResolvedValueOnce({
          id: "group-1",
          workdir: "/tmp/trace",
          worktreeDeleted: false,
          connection: { runtimeInstanceId: "runtime-1" },
          visibility: "public",
          ownerUserId: "user-1",
        });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          workdir: "/tmp/trace",
          connection: { runtimeInstanceId: "runtime-1" },
        },
      ]);
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        key: "org-1:runtime-1",
        label: "Runtime",
        hostingMode: "local",
      });
      sessionRouterMock.readFile
        .mockRejectedValueOnce(new Error("ENOENT: no such file, src/design/manual.css"))
        .mockResolvedValueOnce(source);
      sessionRouterMock.listFiles.mockResolvedValueOnce(["src/index.css"]);

      await expect(
        service.updateDesignElementStyles(
          {
            sessionGroupId: "group-1",
            elementId: "hero-title",
            styles: { color: "#112233" },
            expectedSourceHash: designSourceHash(source),
          },
          "org-1",
          "user",
          "user-1",
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          elementId: "hero-title",
          styles: { color: "#112233" },
        }),
      );
      expect(sessionRouterMock.writeFile).toHaveBeenCalledWith(
        "org-1:runtime-1",
        "session-1",
        "src/index.css",
        expect.stringContaining('[data-trace-id="hero-title"]'),
        "/tmp/trace",
      );
    });

    it("rejects saves to visible cloud session groups owned by another user", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        branch: "trace/test",
        workdir: "/tmp/trace",
        worktreeDeleted: false,
        connection: { runtimeInstanceId: "runtime-1" },
        visibility: "public",
        ownerUserId: "owner-1",
        repo: {
          provider: "github",
          remoteUrl: "git@github.com:trace/trace.git",
          defaultBranch: "main",
        },
      });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          workdir: "/tmp/trace",
          connection: { runtimeInstanceId: "runtime-1" },
        },
      ]);
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        key: "org-1:runtime-1",
        label: "Runtime",
        hostingMode: "cloud",
      });

      await expect(
        service.saveFile("group-1", "/tmp/trace/src/app.ts", "hello", "org-1", "user-2"),
      ).rejects.toThrow("Not authorized to edit this session group");
      expect(runtimeAccessServiceMock.assertAccess).not.toHaveBeenCalled();
      expect(sessionRouterMock.writeFile).not.toHaveBeenCalled();
    });

    it("requires session bridge access before saving through another user's local runtime", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        branch: "trace/test",
        workdir: "/tmp/trace",
        worktreeDeleted: false,
        connection: { runtimeInstanceId: "runtime-1" },
        visibility: "public",
        ownerUserId: "owner-1",
        repo: {
          provider: "github",
          remoteUrl: "git@github.com:trace/trace.git",
          defaultBranch: "main",
        },
      });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          workdir: "/tmp/trace",
          connection: { runtimeInstanceId: "runtime-1" },
        },
      ]);
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        key: "org-1:runtime-1",
        label: "Runtime",
        hostingMode: "local",
      });
      runtimeAccessServiceMock.assertAccess.mockRejectedValueOnce(new Error("bridge denied"));

      await expect(
        service.saveFile("group-1", "/tmp/trace/src/app.ts", "hello", "org-1", "user-2"),
      ).rejects.toThrow("Access denied");
      expect(runtimeAccessServiceMock.assertAccess).toHaveBeenCalledWith({
        userId: "user-2",
        organizationId: "org-1",
        runtimeInstanceId: "runtime-1",
        sessionGroupId: "group-1",
        capability: "session",
      });
      expect(sessionRouterMock.writeFile).not.toHaveBeenCalled();
    });

    it("commits file changes through the live session group runtime", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        branch: "trace/test",
        workdir: "/tmp/trace",
        worktreeDeleted: false,
        connection: { runtimeInstanceId: "runtime-1" },
        visibility: "public",
        ownerUserId: "user-1",
        repo: {
          provider: "github",
          remoteUrl: "git@github.com:trace/trace.git",
          defaultBranch: "main",
        },
      });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          workdir: "/tmp/trace",
          connection: { runtimeInstanceId: "runtime-1" },
        },
      ]);
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        key: "org-1:runtime-1",
        label: "Runtime",
        hostingMode: "local",
      });
      sessionRouterMock.commitFileChanges.mockResolvedValueOnce("abcdef123456");

      await expect(
        service.commitFileChanges("group-1", "Update app", "org-1", "user-1"),
      ).resolves.toBe("abcdef123456");
      expect(sessionRouterMock.commitFileChanges).toHaveBeenCalledWith(
        "org-1:runtime-1",
        "session-1",
        "Update app",
        "/tmp/trace",
      );
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

    it("keeps non-archived merged sessions merged after a follow-up run completes", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        agentStatus: "active",
        sessionStatus: "merged",
        sessionGroupId: "group-1",
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
        data: { agentStatus: "done", sessionStatus: "merged" },
        select: { organizationId: true, createdById: true, name: true },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_terminated",
          payload: expect.objectContaining({
            sessionId: "session-1",
            reason: "bridge_complete",
            agentStatus: "done",
            sessionStatus: "merged",
          }),
        }),
      );
    });

    it("keeps merged status and still raises an inbox item when the follow-up run asks a question", async () => {
      const questionPayload = {
        message: { content: [{ type: "question", questions: [{ question: "Rename?" }] }] },
      };
      // Reset queues that earlier tests may have left primed — vi.clearAllMocks only
      // clears call history, not mockResolvedValueOnce queues.
      prismaMock.session.findUnique.mockReset();
      prismaMock.event.findFirst.mockReset();
      prismaMock.event.findMany.mockReset();
      prismaMock.session.update.mockReset();

      prismaMock.session.findUnique.mockResolvedValueOnce({
        agentStatus: "active",
        sessionStatus: "merged",
        sessionGroupId: "group-1",
      });
      prismaMock.event.findFirst.mockResolvedValueOnce(null);
      prismaMock.event.findMany.mockResolvedValueOnce([{ payload: questionPayload }]);
      prismaMock.session.update.mockResolvedValueOnce({
        organizationId: "org-1",
        createdById: "user-1",
        name: "Implement dashboard filters",
      });
      const hasQuestionBlockMock = vi.mocked(hasQuestionBlock);
      hasQuestionBlockMock.mockReturnValue(true);

      try {
        await service.complete("session-1");
      } finally {
        hasQuestionBlockMock.mockReturnValue(false);
      }

      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: { agentStatus: "done", sessionStatus: "merged" },
        select: { organizationId: true, createdById: true, name: true },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_terminated",
          payload: expect.objectContaining({
            sessionStatus: "merged",
          }),
        }),
      );
      expect(inboxServiceMock.createItem).toHaveBeenCalled();
    });
  });

  describe("reconcileIdleActiveRuns", () => {
    it("completes active sessions that the runtime no longer reports as running", async () => {
      const now = Date.parse("2026-05-12T12:00:00.000Z");
      prismaMock.session.findMany.mockResolvedValueOnce([{ id: "session-1" }]);
      prismaMock.session.findUnique.mockResolvedValueOnce({
        agentStatus: "active",
        sessionStatus: "in_progress",
        sessionGroupId: "group-1",
      });
      prismaMock.event.findFirst.mockResolvedValueOnce(null);
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.update.mockResolvedValueOnce({
        organizationId: "org-1",
        createdById: "user-1",
        name: "Implement dashboard filters",
      });

      const completed = await service.reconcileIdleActiveRuns({
        sessionIds: ["session-1", "session-2"],
        activeSessionIds: ["session-2"],
        now,
        quietAfterMs: 60_000,
      });

      expect(completed).toEqual(["session-1"]);
      expect(prismaMock.session.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["session-1"] },
          agentStatus: "active",
          OR: [
            { lastMessageAt: { lt: new Date("2026-05-12T11:59:00.000Z") } },
            { lastMessageAt: null, updatedAt: { lt: new Date("2026-05-12T11:59:00.000Z") } },
          ],
        },
        select: { id: true },
      });
      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: { agentStatus: "done", sessionStatus: "in_progress" },
        select: { organizationId: true, createdById: true, name: true },
      });
    });

    it("does not query when all bound sessions are still active", async () => {
      const completed = await service.reconcileIdleActiveRuns({
        sessionIds: ["session-1"],
        activeSessionIds: ["session-1"],
      });

      expect(completed).toEqual([]);
      expect(prismaMock.session.findMany).not.toHaveBeenCalled();
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
    it("rejects deferred cloud runs for repos without remote urls", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "cloud",
          agentStatus: "not_started",
          workdir: null,
          toolSessionId: null,
          repo: {
            id: "repo-1",
            name: "trace",
            remoteUrl: null,
            defaultBranch: "main",
          },
        }),
      );

      await expect(service.run("session-1", "Ship it")).rejects.toThrow(
        "Cloud sessions require the repo to have a remote URL.",
      );

      expect(prismaMock.session.update).not.toHaveBeenCalled();
      expect(sessionRouterMock.createRuntime).not.toHaveBeenCalled();
    });

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
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          branch: "release",
          preserveBranchName: false,
        }),
      );
    });

    it("falls back from an unsupported default tool when the first message binds a local runtime", async () => {
      const session = makeSession({
        agentStatus: "not_started",
        sessionStatus: "in_progress",
        hosting: "local",
        tool: "pi",
        model: null,
        reasoningEffort: null,
        workdir: null,
        toolSessionId: null,
        connection: {
          state: "pending",
          toolSource: "default",
          retryCount: 0,
          canRetry: true,
          canMove: true,
        },
        sessionGroup: makeSessionGroup({ slug: "session-slug" }),
      });
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(session);
      prismaMock.session.update.mockResolvedValue(makeSession({ tool: "codex", hosting: "local" }));
      runtimeAccessServiceMock.listAccessibleRuntimeInstanceIds.mockResolvedValue(
        new Set(["runtime-1"]),
      );
      sessionRouterMock.listRuntimes.mockReturnValue([
        {
          key: "runtime-1",
          id: "runtime-1",
          label: "Laptop",
          hostingMode: "local",
          organizationId: "org-1",
          registeredRepoIds: ["repo-1"],
          supportedTools: ["codex"],
          boundSessions: new Set<string>(),
          ws: { readyState: 1, OPEN: 1 },
        },
      ] as unknown as ReturnType<typeof sessionRouterMock.listRuntimes>);

      await service.sendMessage({
        sessionId: "session-1",
        text: "start work",
        actorType: "user",
        actorId: "user-1",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "session-1" },
          data: expect.objectContaining({
            tool: "codex",
            toolSessionId: null,
          }),
        }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_output",
          payload: expect.objectContaining({
            type: "config_changed",
            tool: "codex",
            toolChanged: false,
          }),
        }),
      );
      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          tool: "codex",
        }),
      );
    });

    it("does not fall back when the deferred local session tool was explicit", async () => {
      const session = makeSession({
        agentStatus: "not_started",
        sessionStatus: "in_progress",
        hosting: "local",
        tool: "pi",
        workdir: null,
        toolSessionId: null,
        connection: {
          state: "pending",
          toolSource: "explicit",
          retryCount: 0,
          canRetry: true,
          canMove: true,
        },
      });
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(session);
      runtimeAccessServiceMock.listAccessibleRuntimeInstanceIds.mockResolvedValue(
        new Set(["runtime-1"]),
      );
      sessionRouterMock.listRuntimes.mockReturnValue([
        {
          key: "runtime-1",
          id: "runtime-1",
          label: "Laptop",
          hostingMode: "local",
          organizationId: "org-1",
          registeredRepoIds: ["repo-1"],
          supportedTools: ["codex"],
          boundSessions: new Set<string>(),
          ws: { readyState: 1, OPEN: 1 },
        },
      ] as unknown as ReturnType<typeof sessionRouterMock.listRuntimes>);

      await expect(
        service.sendMessage({
          sessionId: "session-1",
          text: "start work",
          actorType: "user",
          actorId: "user-1",
        }),
      ).rejects.toThrow("No accessible local runtime available");

      expect(prismaMock.session.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tool: "codex" }),
        }),
      );
    });

    it("appends the slash-free default-branch naming instruction for repo sessions", async () => {
      const session = makeSession({
        agentStatus: "done",
        sessionStatus: "in_progress",
        hosting: "local",
        workdir: "/tmp/worktree",
        toolSessionId: "tool-sess-1",
        repoId: "repo-1",
      });
      prismaMock.session.findUniqueOrThrow.mockResolvedValue(session);
      prismaMock.session.update.mockResolvedValue(session);
      sessionRouterMock.send.mockReturnValue("delivered");

      await service.sendMessage({
        sessionId: "session-1",
        text: "implement filters",
        actorType: "agent",
        actorId: "agent-1",
      });

      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          prompt: expect.stringContaining("trace-<slug>-<descriptive-name>"),
        }),
        expect.any(Object),
      );
      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          prompt: expect.stringContaining('Do not use "/" in AI-generated branch names.'),
        }),
        expect.any(Object),
      );
      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          prompt: expect.stringContaining(
            "If the branch is already descriptive or differs from trace-<slug>, do not rename it.",
          ),
        }),
        expect.any(Object),
      );
      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          prompt: expect.stringContaining("keep the main agent process alive"),
        }),
        expect.any(Object),
      );
      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          prompt: expect.stringContaining("Do not send a final response while background work"),
        }),
        expect.any(Object),
      );
    });

    it("injects design guidance without branch instructions for managed design repos", async () => {
      const session = makeSession({
        agentStatus: "done",
        sessionStatus: "in_progress",
        hosting: "cloud",
        workdir: "/workspaces/design",
        toolSessionId: "tool-sess-1",
        repoId: "managed-repo-1",
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-design",
          runtimeLabel: "Design Runtime",
          retryCount: 0,
          canRetry: true,
          canMove: true,
        },
        sessionGroup: makeSessionGroup({ kind: "design" }),
      });
      prismaMock.session.findUniqueOrThrow.mockResolvedValue(session);
      prismaMock.session.update.mockResolvedValue(session);
      sessionRouterMock.send.mockReturnValue("delivered");

      await service.sendMessage({
        sessionId: "session-1",
        text: "add an empty state",
        actorType: "user",
        actorId: "user-1",
      });

      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          prompt: expect.not.stringContaining("trace-<slug>-<descriptive-name>"),
          appendSystemPrompt: expect.stringContaining("design.canvas.json"),
        }),
        expect.any(Object),
      );
      const command = sessionRouterMock.send.mock.calls.at(-1)?.[1];
      expect(command).toEqual(
        expect.objectContaining({
          appendSystemPrompt: expect.stringContaining("React is only the rendering medium"),
        }),
      );
      expect(command).toEqual(
        expect.objectContaining({
          appendSystemPrompt: expect.stringContaining("critique it before delivery"),
        }),
      );
      expect(command).toEqual(
        expect.objectContaining({
          appendSystemPrompt: expect.stringContaining("resolve design.brief.json"),
        }),
      );
      expect(command).toEqual(
        expect.objectContaining({
          appendSystemPrompt: expect.stringContaining("pnpm design:review"),
        }),
      );
      expect(command).toEqual(
        expect.objectContaining({
          appendSystemPrompt: expect.stringContaining(
            "do not build APIs, databases, authentication, persistence",
          ),
        }),
      );
    });

    it("passes enableClaudeInChrome on the delivery command when the creator enabled it", async () => {
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
        createdBy: { id: "user-1", name: "Test User", avatarUrl: null, enableClaudeInChrome: true },
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
        text: "implement filters",
        actorType: "user",
        actorId: "user-1",
      });

      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({ type: "send", enableClaudeInChrome: true }),
        expect.any(Object),
      );
    });

    it("does not pass enableClaudeInChrome for non-Claude tools even when the creator enabled it", async () => {
      const session = makeSession({
        agentStatus: "done",
        sessionStatus: "in_progress",
        tool: "codex",
        model: "gpt-5-codex",
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
        createdBy: { id: "user-1", name: "Test User", avatarUrl: null, enableClaudeInChrome: true },
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
        text: "implement filters",
        actorType: "user",
        actorId: "user-1",
      });

      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({ type: "send", enableClaudeInChrome: false }),
        expect.any(Object),
      );
    });

    it("defaults enableClaudeInChrome to false when the creator setting is unset", async () => {
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
        text: "implement filters",
        actorType: "user",
        actorId: "user-1",
      });

      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({ type: "send", enableClaudeInChrome: false }),
        expect.any(Object),
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

    it("keeps a non-archived merged session merged when sending another message", async () => {
      const session = makeSession({
        agentStatus: "done",
        sessionStatus: "merged",
        worktreeDeleted: false,
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
        text: "follow up after merge",
        actorType: "user",
        actorId: "user-1",
      });

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "session-1" },
          data: expect.objectContaining({
            agentStatus: "active",
            sessionStatus: "merged",
          }),
        }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_resumed",
          payload: expect.objectContaining({
            sessionStatus: "merged",
          }),
        }),
      );
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
          id: "event-start",
          eventType: "session_started",
          payload: { prompt: "Initial task" },
        },
        {
          id: "event-message",
          eventType: "message_sent",
          payload: { text: "Follow-up instruction" },
        },
      ]);
      prismaMock.event.findMany.mockResolvedValueOnce([
        {
          id: "event-message",
          eventType: "message_sent",
          payload: { text: "Follow-up instruction" },
        },
        {
          id: "event-start",
          eventType: "session_started",
          payload: { prompt: "Initial task" },
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

    it("does not auto-retry when the home runtime does not support the session tool", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(
        makeSession({
          agentStatus: "done",
          sessionStatus: "in_progress",
          tool: "pi",
          model: "openai-codex/gpt-5.5",
          workdir: "/Users/laptop-a/worktree",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-a",
            runtimeLabel: "Laptop A",
            retryCount: 2,
            canRetry: true,
            canMove: true,
          },
        }),
      );
      prismaMock.session.findUnique.mockResolvedValueOnce({
        agentStatus: "done",
        sessionStatus: "in_progress",
        tool: "pi",
        hosting: "local",
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-a",
          runtimeLabel: "Laptop A",
          retryCount: 2,
          canRetry: true,
          canMove: true,
        },
        sessionGroupId: "group-1",
      });
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      sessionRouterMock.send.mockReturnValue("no_runtime");

      await service.sendMessage({
        sessionId: "session-1",
        text: "run via pi",
        actorType: "user",
        actorId: "user-1",
      });

      const connectionWrites = prismaMock.session.update.mock.calls.filter((call: unknown[]) => {
        const arg = call[0] as { data?: { connection?: { autoRetryable?: boolean } } } | undefined;
        return arg?.data?.connection !== undefined;
      });
      expect(connectionWrites.length).toBeGreaterThan(0);
      const lastConn = connectionWrites[connectionWrites.length - 1][0].data.connection as {
        autoRetryable?: boolean;
        lastError?: string;
        retryCount?: number;
      };
      expect(lastConn.autoRetryable).toBe(false);
      expect(lastConn.retryCount).toBe(3);
      expect(lastConn.lastError).toContain("Laptop A does not have Pi installed");
      expect(lastConn.lastError).toContain("npm install -g @earendil-works/pi-coding-agent");
      expect(lastConn.lastError).toContain("https://pi.dev/docs/latest/quickstart");
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
      prismaMock.session.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 2 });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          organizationId: "org-1",
          connection: { state: "requested", version: 1, retryCount: 0 },
        },
        {
          id: "session-2",
          organizationId: "org-1",
          connection: {
            state: "failed",
            version: 7,
            retryCount: 3,
            lastError: "session-specific failure",
          },
        },
      ]);
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        key: "org-1:runtime-provisioned-1",
        id: "runtime-provisioned-1",
      });
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
      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: "session-2" },
        data: {
          connection: expect.objectContaining({
            state: "failed",
            version: 7,
            retryCount: 3,
            lastError: "session-specific failure",
            runtimeInstanceId: "runtime-provisioned-1",
          }),
        },
      });
      expect(terminalRelayMock.destroyAllForSessionGroup).toHaveBeenCalledWith("group-1");
      expect(sessionRouterMock.unbindSession).toHaveBeenCalledWith("session-1");
      expect(sessionRouterMock.unbindSession).toHaveBeenCalledWith("session-2");
      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith(
        "session-2",
        "org-1:runtime-provisioned-1",
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

    it("ignores stale lifecycle events after a newer runtime binding was cleared", async () => {
      prismaMock.session.findUnique
        .mockResolvedValueOnce({
          organizationId: "org-1",
          sessionGroupId: "group-1",
          agentStatus: "active",
          sessionStatus: "in_progress",
        })
        .mockResolvedValueOnce({
          sessionGroupId: "group-1",
          connection: {
            state: "connecting",
            version: 2,
            adapterType: "provisioned",
          },
        });

      await (
        service as unknown as {
          recordRuntimeLifecycle: (
            sessionId: string,
            eventType: "session_runtime_stopped",
            update: { runtimeInstanceId: string },
          ) => Promise<void>;
        }
      ).recordRuntimeLifecycle("session-1", "session_runtime_stopped", {
        runtimeInstanceId: "runtime-old",
      });

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
      expect(eventServiceMock.create).not.toHaveBeenCalled();
    });

    it("lets a fresh provision claim a connection left terminal by a dead runtime", async () => {
      prismaMock.session.findUnique.mockReset();
      prismaMock.session.updateMany.mockReset();
      prismaMock.session.findUnique
        .mockResolvedValueOnce({
          organizationId: "org-1",
          sessionGroupId: null,
          agentStatus: "active",
          sessionStatus: "in_progress",
        })
        .mockResolvedValueOnce({
          sessionGroupId: null,
          connection: {
            state: "timed_out",
            version: 3,
            adapterType: "provisioned",
            runtimeInstanceId: "runtime-old",
          },
        });
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });

      await (
        service as unknown as {
          recordRuntimeLifecycle: (
            sessionId: string,
            eventType: "session_runtime_start_requested",
            update: { runtimeInstanceId: string },
          ) => Promise<void>;
        }
      ).recordRuntimeLifecycle("session-1", "session_runtime_start_requested", {
        runtimeInstanceId: "runtime-new",
      });

      // The dead runtime's terminal connection is superseded by the new launch.
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { id: "session-1", connection: { path: ["version"], equals: 3 } },
        data: {
          connection: expect.objectContaining({
            state: "requested",
            runtimeInstanceId: "runtime-new",
          }),
        },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "session_runtime_start_requested" }),
      );
    });

    it("still fences a fresh provision from claiming a live connection bound to another runtime", async () => {
      prismaMock.session.findUnique.mockReset();
      prismaMock.session.updateMany.mockReset();
      prismaMock.session.findUnique
        .mockResolvedValueOnce({
          organizationId: "org-1",
          sessionGroupId: null,
          agentStatus: "active",
          sessionStatus: "in_progress",
        })
        .mockResolvedValueOnce({
          sessionGroupId: null,
          connection: {
            state: "connected",
            version: 5,
            adapterType: "provisioned",
            runtimeInstanceId: "runtime-live",
          },
        });

      await (
        service as unknown as {
          recordRuntimeLifecycle: (
            sessionId: string,
            eventType: "session_runtime_start_requested",
            update: { runtimeInstanceId: string },
          ) => Promise<void>;
        }
      ).recordRuntimeLifecycle("session-1", "session_runtime_start_requested", {
        runtimeInstanceId: "runtime-new",
      });

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
      expect(eventServiceMock.create).not.toHaveBeenCalled();
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
          id: "event-start",
          eventType: "session_started",
          payload: { prompt: "Initial task" },
        },
        {
          id: "event-message",
          eventType: "message_sent",
          payload: { text: "Follow-up instruction" },
        },
      ]);
      prismaMock.event.findMany.mockResolvedValueOnce([
        {
          id: "event-message",
          eventType: "message_sent",
          payload: { text: "Follow-up instruction" },
        },
        {
          id: "event-start",
          eventType: "session_started",
          payload: { prompt: "Initial task" },
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

    it("clips long recovery conversation history before sending it to the runtime", async () => {
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
          id: "event-start",
          eventType: "session_started",
          payload: { prompt: "Initial task" },
        },
      ]);
      prismaMock.event.findMany.mockResolvedValueOnce([
        ...Array.from({ length: 16 }, (_value, offset) => {
          const index = 15 - offset;
          return {
            id: `event-output-${index}`,
            eventType: "session_output",
            payload: {
              type: "assistant",
              message: {
                content: [
                  {
                    type: "text",
                    text: `${index === 15 ? "latest-final" : `entry-${index}`} ${"x".repeat(
                      20_000,
                    )} ${index === 15 ? "latest-final-tail" : `entry-${index}-tail`}`,
                  },
                ],
              },
            },
          };
        }),
        {
          id: "event-start",
          eventType: "session_started",
          payload: { prompt: "Initial task" },
        },
      ]);
      prismaMock.event.findFirst.mockResolvedValueOnce({ id: "event-message-1" });
      sessionRouterMock.send.mockReturnValueOnce("delivered");

      await service.recoverMissingToolSession("session-1", {
        toolSessionId: "stale-tool-session",
        message: "No conversation found with session ID stale-tool-session",
        interactionMode: "code",
      });

      const sendCommand = sessionRouterMock.send.mock.calls[0]?.[1] as
        | { prompt?: string }
        | undefined;
      expect(sendCommand?.prompt?.length).toBeLessThan(110_000);
      expect(sendCommand?.prompt).toContain("[User]: Initial task");
      expect(sendCommand?.prompt).toContain("Trace omitted");
      expect(sendCommand?.prompt).toContain("Trace clipped earlier content");
      expect(sendCommand?.prompt).not.toContain("entry-0-tail");
      expect(sendCommand?.prompt).not.toContain("latest-final ");
      expect(sendCommand?.prompt).toContain("latest-final-tail");
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

    it.each([
      {
        name: "stopped",
        session: {
          agentStatus: "stopped" as const,
          sessionStatus: "in_progress" as const,
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-a",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        },
      },
      {
        name: "merged",
        session: {
          agentStatus: "done" as const,
          sessionStatus: "merged" as const,
          worktreeDeleted: true,
          connection: {
            state: "failed",
            runtimeInstanceId: "runtime-a",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        },
      },
    ])(
      "does not retry terminal $name sessions even when connection canRetry is true",
      async ({ session }) => {
        const terminalSession = makeSession(session);
        prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(terminalSession);

        const result = await service.retryConnection("session-1", "org-1", "user", "user-1");

        expect(result).toBe(terminalSession);
        expect(eventServiceMock.create).not.toHaveBeenCalled();
        expect(sessionRouterMock.bindSession).not.toHaveBeenCalled();
        expect(sessionRouterMock.send).not.toHaveBeenCalled();
        expect(prismaMock.session.update).not.toHaveBeenCalled();
      },
    );

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
      prismaMock.agentEnvironment.findFirst.mockResolvedValueOnce(
        makeAgentEnvironment({ id: "env-1" }),
      );
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

    it("refreshes managed-git credentials before re-preparing a retried app session", async () => {
      const appRepo = {
        id: "repo-1",
        name: "Generated app",
        remoteUrl: "https://trace.test/git/org-1/repo-1.git",
        defaultBranch: "main",
      };
      const appSession = makeSession({
        connection: {
          state: "disconnected",
          runtimeInstanceId: "runtime-a",
          runtimeLabel: "Cloud A",
          retryCount: 1,
          canRetry: true,
          canMove: true,
        },
        repo: appRepo,
        sessionGroup: makeSessionGroup({ kind: "app", repo: appRepo }),
      });
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(appSession);
      prismaMock.session.update.mockResolvedValue(makeSession({ repo: appRepo }));
      managedGitServiceMock.mintAccessToken.mockResolvedValue({
        token: "replacement-runtime-token",
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      });
      sessionRouterMock.isRuntimeAvailable.mockReturnValue(true);
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-a",
        key: "org-1:runtime-a",
        label: "Cloud A",
        hostingMode: "cloud",
        ws: { readyState: 1, OPEN: 1 },
      });

      await service.retryConnection("session-1", "org-1", "user", "user-1");

      expect(managedGitServiceMock.mintAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: "runtime",
          sessionId: "session-1",
          subject: "runtime-a",
          capabilities: ["read", "write"],
        }),
      );
      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          type: "prepare_app",
          repoRemoteUrl: "https://trace:replacement-runtime-token@trace.test/git/org-1/repo-1.git",
        }),
        { expectedHomeRuntimeId: "runtime-a", organizationId: "org-1" },
      );
      const connectedUpdateIndex = prismaMock.session.update.mock.calls.findIndex((call) => {
        const data = call[0].data as { connection?: { state?: string } };
        return data.connection?.state === "connected";
      });
      expect(connectedUpdateIndex).toBeGreaterThanOrEqual(0);
      const connectedUpdate = prismaMock.session.update.mock.calls[connectedUpdateIndex];
      expect(connectedUpdate?.[0].data.connection).toEqual(
        expect.objectContaining({ runtimeInstanceId: "runtime-a" }),
      );
      expect(prismaMock.session.update.mock.invocationCallOrder[connectedUpdateIndex]!).toBeLessThan(
        sessionRouterMock.send.mock.invocationCallOrder[0]!,
      );
    });

    it("retries failed sessions when the connection is explicitly retryable", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "local",
          agentStatus: "failed",
          sessionStatus: "in_progress",
          workdir: "/tmp/trace/workspace",
          worktreeDeleted: false,
          connection: {
            state: "failed",
            runtimeInstanceId: "runtime-a",
            runtimeLabel: "Laptop A",
            lastError: "Command failed: git clean -ffdx\n",
            retryCount: 0,
            canRetry: true,
            canMove: true,
            autoRetryable: false,
          },
        }),
      );
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          agentStatus: "done",
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
        key: "org-1:runtime-a",
        label: "Laptop A",
        hostingMode: "local",
        ws: { readyState: 1, OPEN: 1 },
      });

      await service.retryConnection("session-1", "org-1", "user", "user-1");

      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith("session-1", "org-1:runtime-a");
      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({ type: "prepare" }),
        { expectedHomeRuntimeId: "runtime-a", organizationId: "org-1" },
      );
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentStatus: "done",
            connection: expect.objectContaining({
              state: "connected",
            }),
          }),
        }),
      );
    });
  });

  describe("updateConfig", () => {
    it.each(["app", "design"] as const)(
      "keeps %s sessions on their fixed cloud runtime",
      async (kind) => {
        prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
          makeSession({
            hosting: "cloud",
            sessionGroup: makeSessionGroup({ kind }),
          }),
        );

        await expect(
          service.updateConfig("session-1", "org-1", { hosting: "local" }, "user", "user-1"),
        ).rejects.toThrow("App and Design sessions use a fixed cloud runtime");

        expect(prismaMock.session.update).not.toHaveBeenCalled();
      },
    );

    it("updates reasoning effort and emits a config change", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(makeSession());
      prismaMock.session.update.mockResolvedValueOnce(makeSession({ reasoningEffort: "xhigh" }));

      const result = await service.updateConfig(
        "session-1",
        "org-1",
        { reasoningEffort: "xhigh" },
        "user",
        "user-1",
      );

      expect(result.reasoningEffort).toBe("xhigh");
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reasoningEffort: "xhigh",
          }),
        }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_output",
          payload: expect.objectContaining({
            type: "config_changed",
            reasoningEffort: "xhigh",
          }),
        }),
      );
    });

    it("resets reasoning effort to the new tool default when switching tools", async () => {
      getDefaultReasoningEffortMock.mockReturnValueOnce("medium");
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({ tool: "claude_code", reasoningEffort: "max" }),
      );
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({ tool: "codex", reasoningEffort: "medium" }),
      );

      await service.updateConfig("session-1", "org-1", { tool: "codex" }, "user", "user-1");

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tool: "codex",
            reasoningEffort: "medium",
            toolSessionId: null,
          }),
        }),
      );
    });

    it("rejects invalid reasoning effort updates", async () => {
      isSupportedReasoningEffortMock.mockReturnValueOnce(false);
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(makeSession());

      await expect(
        service.updateConfig(
          "session-1",
          "org-1",
          { reasoningEffort: "unsupported" },
          "user",
          "user-1",
        ),
      ).rejects.toThrow('Unsupported reasoning effort "unsupported" for tool "claude_code"');

      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });

    it("rejects empty reasoning effort updates", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(makeSession());

      await expect(
        service.updateConfig("session-1", "org-1", { reasoningEffort: "   " }, "user", "user-1"),
      ).rejects.toThrow("Reasoning effort cannot be empty");

      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });

    it("rejects switching a no-remote repo session to cloud", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "local",
          repo: {
            id: "repo-1",
            name: "trace",
            remoteUrl: null,
            defaultBranch: "main",
          },
        }),
      );

      await expect(
        service.updateConfig("session-1", "org-1", { hosting: "cloud" }, "user", "user-1"),
      ).rejects.toThrow("Cloud sessions require the repo to have a remote URL.");

      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });

    it("switches the group bridge before the session starts", async () => {
      const selectedRuntime = {
        key: "org-1:runtime-b",
        id: "runtime-b",
        label: "Laptop B",
        hostingMode: "local",
      };
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
          agentStatus: "not_started",
          sessionGroupId: "group-1",
          connection: { runtimeInstanceId: "runtime-a" },
          sessionGroup: makeSessionGroup({
            connection: { runtimeInstanceId: "runtime-a" },
            sessions: [{ id: "session-1", agentStatus: "not_started" }],
          }),
        }),
      );
      sessionRouterMock.getRuntime.mockReturnValueOnce(
        selectedRuntime as unknown as ReturnType<typeof sessionRouterMock.getRuntime>,
      );
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          hosting: "local",
          connection: { runtimeInstanceId: "runtime-b", runtimeLabel: "Laptop B" },
        }),
      );
      prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));

      await service.updateConfig(
        "session-1",
        "org-1",
        { runtimeInstanceId: "runtime-b" },
        "user",
        "user-1",
      );

      expect(prismaMock.sessionGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "group-1" },
          data: expect.objectContaining({
            connection: expect.objectContaining({ runtimeInstanceId: "runtime-b" }),
          }),
        }),
      );
      expect(terminalRelayMock.destroyAllForSessionGroup).toHaveBeenCalledWith("group-1");
    });

    it("requires a group move when a peer session has started", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
          agentStatus: "not_started",
          sessionGroupId: "group-1",
          connection: { runtimeInstanceId: "runtime-a" },
          sessionGroup: makeSessionGroup({
            connection: { runtimeInstanceId: "runtime-a" },
            sessions: [
              { id: "session-1", agentStatus: "not_started" },
              { id: "session-2", agentStatus: "done" },
            ],
          }),
        }),
      );

      await expect(
        service.updateConfig(
          "session-1",
          "org-1",
          { runtimeInstanceId: "runtime-b" },
          "user",
          "user-1",
        ),
      ).rejects.toThrow(
        "This session group already has started sessions on a bridge. Use Move to switch the entire session group.",
      );

      expect(prismaMock.session.update).not.toHaveBeenCalled();
      expect(terminalRelayMock.destroyAllForSessionGroup).not.toHaveBeenCalled();
    });
  });

  describe("updateDefaults", () => {
    it("stores explicit user session defaults", async () => {
      prismaMock.user.update.mockResolvedValueOnce({
        id: "user-1",
        defaultSessionTool: "codex",
        defaultSessionModel: "gpt-5.5",
        defaultSessionReasoningEffort: "high",
      });

      await service.updateDefaults("user-1", {
        tool: "codex",
        model: "gpt-5.5",
        reasoningEffort: "high",
      });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          defaultSessionTool: "codex",
          defaultSessionModel: "gpt-5.5",
          defaultSessionReasoningEffort: "high",
        },
      });
    });

    it("uses tool defaults when model and effort are omitted", async () => {
      getDefaultModelMock.mockReturnValueOnce("gpt-5.5");
      getDefaultReasoningEffortMock.mockReturnValueOnce("medium");
      prismaMock.user.update.mockResolvedValueOnce({
        id: "user-1",
        defaultSessionTool: "codex",
        defaultSessionModel: "gpt-5.5",
        defaultSessionReasoningEffort: "medium",
      });

      await service.updateDefaults("user-1", { tool: "codex" });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          defaultSessionTool: "codex",
          defaultSessionModel: "gpt-5.5",
          defaultSessionReasoningEffort: "medium",
        },
      });
    });

    it("updates auto-archive preference without clearing model defaults", async () => {
      prismaMock.user.update.mockResolvedValueOnce({
        id: "user-1",
        autoArchiveMergedSessions: false,
      });

      await service.updateDefaults("user-1", { autoArchiveMergedSessions: false });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          autoArchiveMergedSessions: false,
        },
      });
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

    it("reorders queued messages and emits reordered payloads", async () => {
      const first = {
        id: "queued-1",
        sessionId: "session-1",
        text: "first",
        imageKeys: [],
        interactionMode: null,
        position: 0,
        createdById: "user-1",
        organizationId: "org-1",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      };
      const second = {
        ...first,
        id: "queued-2",
        text: "second",
        position: 1,
      };
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce(
        makeSession({ organizationId: "org-1" }),
      );
      prismaMock.queuedMessage.findMany.mockResolvedValueOnce([first, second]);

      const reordered = await service.reorderQueuedMessages(
        "session-1",
        ["queued-2", "queued-1"],
        "user-1",
        "org-1",
      );

      expect(reordered.map((message) => message.id)).toEqual(["queued-2", "queued-1"]);
      expect(prismaMock.queuedMessage.update).toHaveBeenCalledWith({
        where: { id: "queued-2" },
        data: { position: 0 },
      });
      expect(prismaMock.queuedMessage.update).toHaveBeenCalledWith({
        where: { id: "queued-1" },
        data: { position: 1 },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "queued_messages_reordered",
          deferPublish: true,
          payload: expect.objectContaining({
            sessionId: "session-1",
            queuedMessages: [
              expect.objectContaining({ id: "queued-2", position: 0 }),
              expect.objectContaining({ id: "queued-1", position: 1 }),
            ],
          }),
        }),
        prismaMock,
      );
      expect(eventServiceMock.publishCreated).toHaveBeenCalledTimes(1);
    });

    it("updates queued message text and emits an update event", async () => {
      const updated = {
        id: "queued-1",
        sessionId: "session-1",
        text: "edited",
        imageKeys: [],
        interactionMode: null,
        position: 0,
        createdById: "user-1",
        organizationId: "org-1",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      };
      prismaMock.queuedMessage.findUniqueOrThrow.mockResolvedValueOnce({
        sessionId: "session-1",
        organizationId: "org-1",
        imageKeys: [],
      });
      prismaMock.queuedMessage.update.mockResolvedValueOnce(updated);

      await service.updateQueuedMessage("queued-1", "edited", "user-1", "org-1");

      expect(prismaMock.queuedMessage.update).toHaveBeenCalledWith({
        where: { id: "queued-1" },
        data: { text: "edited" },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "queued_message_updated",
          deferPublish: true,
          payload: expect.objectContaining({
            sessionId: "session-1",
            queuedMessage: expect.objectContaining({ id: "queued-1", text: "edited" }),
          }),
        }),
        prismaMock,
      );
      expect(eventServiceMock.publishCreated).toHaveBeenCalledWith({ id: "event-1" });
    });

    it("allows attachment-only queued message edits", async () => {
      const updated = {
        id: "queued-1",
        sessionId: "session-1",
        text: "",
        imageKeys: ["uploads/org-1/file.png"],
        interactionMode: null,
        position: 0,
        createdById: "user-1",
        organizationId: "org-1",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      };
      prismaMock.queuedMessage.findUniqueOrThrow.mockResolvedValueOnce({
        sessionId: "session-1",
        organizationId: "org-1",
        imageKeys: ["uploads/org-1/file.png"],
      });
      prismaMock.queuedMessage.update.mockResolvedValueOnce(updated);

      await service.updateQueuedMessage("queued-1", "", "user-1", "org-1");

      expect(prismaMock.queuedMessage.update).toHaveBeenCalledWith({
        where: { id: "queued-1" },
        data: { text: "" },
      });
    });

    it("rejects empty text edits without attachments", async () => {
      prismaMock.queuedMessage.findUniqueOrThrow.mockResolvedValueOnce({
        sessionId: "session-1",
        organizationId: "org-1",
        imageKeys: [],
      });

      await expect(service.updateQueuedMessage("queued-1", "", "user-1", "org-1")).rejects.toThrow(
        "Queued message text cannot be empty",
      );

      expect(prismaMock.queuedMessage.update).not.toHaveBeenCalled();
    });

    it("steers a queued message by removing it before sending", async () => {
      const queuedMessage = {
        id: "queued-1",
        sessionId: "session-1",
        text: "steer now",
        imageKeys: ["uploads/org-1/file.png"],
        interactionMode: "ask",
        position: 0,
        createdById: "user-2",
        organizationId: "org-1",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      };
      const sentEvent = { id: "sent-event" } as Awaited<ReturnType<SessionService["sendMessage"]>>;
      const sendSpy = vi.spyOn(service, "sendMessage").mockResolvedValueOnce(sentEvent);
      prismaMock.queuedMessage.findUniqueOrThrow.mockResolvedValueOnce(queuedMessage);
      eventServiceMock.create.mockResolvedValueOnce({ id: "removed-event" });

      const result = await service.steerQueuedMessage("queued-1", "user-1", "org-1");

      expect(result).toBe(sentEvent);
      expect(prismaMock.queuedMessage.delete).toHaveBeenCalledWith({ where: { id: "queued-1" } });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "queued_message_removed",
          deferPublish: true,
          payload: { sessionId: "session-1", queuedMessageId: "queued-1" },
        }),
        prismaMock,
      );
      expect(eventServiceMock.publishCreated).toHaveBeenCalledWith({ id: "removed-event" });
      expect(sendSpy).toHaveBeenCalledWith({
        sessionId: "session-1",
        text: "steer now",
        imageKeys: ["uploads/org-1/file.png"],
        actorType: "user",
        actorId: "user-1",
        interactionMode: "ask",
      });
      expect(prismaMock.queuedMessage.create).not.toHaveBeenCalled();
    });

    it("restores a steered queued message when sending fails", async () => {
      const queuedMessage = {
        id: "queued-1",
        sessionId: "session-1",
        text: "steer now",
        imageKeys: [],
        interactionMode: null,
        position: 0,
        createdById: "user-2",
        organizationId: "org-1",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      };
      const sendError = new Error("send failed");
      vi.spyOn(service, "sendMessage").mockRejectedValueOnce(sendError);
      prismaMock.queuedMessage.findUniqueOrThrow.mockResolvedValueOnce(queuedMessage);
      prismaMock.queuedMessage.create.mockResolvedValueOnce(queuedMessage);
      eventServiceMock.create
        .mockResolvedValueOnce({ id: "removed-event" })
        .mockResolvedValueOnce({ id: "restored-event" });

      await expect(service.steerQueuedMessage("queued-1", "user-1", "org-1")).rejects.toThrow(
        "send failed",
      );

      expect(prismaMock.queuedMessage.create).toHaveBeenCalledWith({
        data: {
          id: "queued-1",
          sessionId: "session-1",
          text: "steer now",
          imageKeys: [],
          interactionMode: null,
          position: 0,
          createdById: "user-2",
          organizationId: "org-1",
          createdAt: queuedMessage.createdAt,
        },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "queued_message_added",
          deferPublish: true,
          payload: expect.objectContaining({
            sessionId: "session-1",
            queuedMessage: expect.objectContaining({ id: "queued-1", text: "steer now" }),
          }),
        }),
        prismaMock,
      );
      expect(eventServiceMock.publishCreated).toHaveBeenCalledWith({ id: "removed-event" });
      expect(eventServiceMock.publishCreated).toHaveBeenCalledWith({ id: "restored-event" });
    });
  });

  describe("restoreSessionsForRuntime", () => {
    it("rehydrates tracked workdirs back into a reconnected local bridge", async () => {
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        key: "org-1:runtime-a",
        id: "runtime-a",
        label: "Laptop A",
        hostingMode: "local",
        organizationId: "org-1",
        supportedTools: ["claude_code"],
        registeredRepoIds: ["repo-1"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          agentStatus: "active",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-a",
            runtimeLabel: "Laptop A",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
          organizationId: "org-1",
          workdir: "/tmp/trace/worktrees/session-1",
          readOnlyWorkspace: true,
          sessionGroupId: "group-1",
        },
      ]);

      await service.restoreSessionsForRuntime("runtime-a", "org-1");

      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith("session-1", "org-1:runtime-a");
      expect(sessionRouterMock.sendToRuntime).toHaveBeenCalledWith(
        "runtime-a",
        {
          type: "track_session",
          sessionId: "session-1",
          workdir: "/tmp/trace/worktrees/session-1",
          readOnly: true,
          sessionGroupId: "group-1",
        },
        "org-1",
      );
    });

    it("heals a timed-out cloud session when its runtime reconnects", async () => {
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        key: "runtime-cloud",
        id: "runtime-cloud",
        label: "Cloud Runtime",
        hostingMode: "cloud",
        organizationId: "org-1",
        supportedTools: ["codex"],
        registeredRepoIds: [],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          agentStatus: "active",
          connection: { state: "timed_out", runtimeInstanceId: "runtime-cloud" },
          organizationId: "org-1",
          workdir: null,
          readOnlyWorkspace: false,
          sessionGroupId: "group-1",
        },
      ]);
      prismaMock.session.findUnique.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
          organizationId: "org-1",
          agentStatus: "active",
          sessionStatus: "in_progress",
          sessionGroupId: "group-1",
          connection: { state: "timed_out", runtimeInstanceId: "runtime-cloud" },
        }),
      );
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        connection: { state: "timed_out", runtimeInstanceId: "runtime-cloud" },
      });

      await service.restoreSessionsForRuntime("runtime-cloud", "org-1");

      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith("session-1", "runtime-cloud");
      // The timed-out connection is healed back to connected.
      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: { connection: expect.objectContaining({ state: "connected" }) },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ type: "connection_restored" }),
        }),
      );
    });

    it("does not rehydrate tracked workdirs into cloud runtimes", async () => {
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        key: "runtime-cloud",
        id: "runtime-cloud",
        label: "Cloud Runtime",
        hostingMode: "cloud",
        organizationId: "org-1",
        supportedTools: ["codex"],
        registeredRepoIds: [],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          agentStatus: "active",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-cloud",
            runtimeLabel: "Cloud Runtime",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
          organizationId: "org-1",
          workdir: "/home/coder",
          readOnlyWorkspace: false,
          sessionGroupId: "group-1",
        },
      ]);

      await service.restoreSessionsForRuntime("runtime-cloud", "org-1");

      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith("session-1", "runtime-cloud");
      expect(sessionRouterMock.sendToRuntime).not.toHaveBeenCalled();
    });
  });

  describe("workspaceReady", () => {
    it("auto-starts design sessions through the shared application service", async () => {
      const startApplication = vi
        .spyOn(sessionApplicationService, "startApplication")
        .mockResolvedValueOnce([]);
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        pendingRun: null,
        agentStatus: "not_started",
        sessionStatus: "in_progress",
        readOnlyWorkspace: false,
        workdir: null,
      });
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          workdir: "/tmp/trace/design",
          sessionGroup: makeSessionGroup({ kind: "design" }),
        }),
      );
      prismaMock.sessionGroup.update.mockResolvedValueOnce(
        makeSessionGroup({ kind: "design", workdir: "/tmp/trace/design" }),
      );
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.workspaceReady("session-1", "/tmp/trace/design");

      await vi.waitFor(() => {
        expect(startApplication).toHaveBeenCalledWith(
          "group-1",
          "app",
          "org-1",
          "user-1",
          { asSystem: true },
        );
      });
      startApplication.mockRestore();
    });

    it("dispatches the live preview before delivering the first generated-project prompt", async () => {
      const pendingRun = {
        type: "send",
        prompt: "Build an operations dashboard",
        interactionMode: null,
        checkpointContext: null,
      };
      let releasePreviewStart: (() => void) | undefined;
      const startApplication = vi
        .spyOn(sessionApplicationService, "startApplication")
        .mockReturnValueOnce(
          new Promise((resolve) => {
            releasePreviewStart = () => resolve([]);
          }),
        );
      prismaMock.session.findUniqueOrThrow
        .mockResolvedValueOnce({
          pendingRun,
          agentStatus: "active",
          sessionStatus: "in_progress",
          readOnlyWorkspace: false,
          workdir: null,
        })
        .mockResolvedValueOnce(
          makeSession({
            workdir: "/tmp/trace/app",
            sessionGroup: makeSessionGroup({ kind: "app", workdir: "/tmp/trace/app" }),
          }),
        );
      prismaMock.session.update
        .mockResolvedValueOnce(
          makeSession({
            workdir: "/tmp/trace/app",
            sessionGroup: makeSessionGroup({ kind: "app", workdir: "/tmp/trace/app" }),
          }),
        )
        .mockResolvedValueOnce(
          makeSession({
            agentStatus: "active",
            workdir: "/tmp/trace/app",
            sessionGroup: makeSessionGroup({ kind: "app", workdir: "/tmp/trace/app" }),
          }),
        );
      prismaMock.sessionGroup.update.mockResolvedValue(
        makeSessionGroup({ kind: "app", workdir: "/tmp/trace/app" }),
      );
      prismaMock.session.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.event.findMany.mockResolvedValue([]);

      const ready = service.workspaceReady("session-1", "/tmp/trace/app");

      await vi.waitFor(() => {
        expect(startApplication).toHaveBeenCalled();
      });
      expect(sessionRouterMock.send).not.toHaveBeenCalled();

      releasePreviewStart?.();
      await ready;

      expect(sessionRouterMock.send).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          type: "send",
          prompt: expect.stringContaining("Build an operations dashboard"),
        }),
        expect.any(Object),
      );
      startApplication.mockRestore();
    });

    it("only mirrors the ready workdir to sessions on the same runtime", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        pendingRun: null,
        agentStatus: "not_started",
        sessionStatus: "in_progress",
        readOnlyWorkspace: false,
        workdir: null,
      });
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          workdir: "/workspaces/crocodile-2",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime_99a9d155",
            runtimeLabel: "Cloud",
          },
        }),
      );
      prismaMock.sessionGroup.update.mockResolvedValueOnce(makeSessionGroup());
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        ...makeSessionGroup(),
        sessions: [{ agentStatus: "not_started", sessionStatus: "in_progress" }],
      });
      prismaMock.session.updateMany.mockResolvedValue({ count: 1 });

      await service.workspaceReady("session-1", "/workspaces/crocodile-2");

      // The group's canonical workdir is always updated.
      expect(prismaMock.sessionGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ workdir: "/workspaces/crocodile-2" }),
        }),
      );
      // The concrete path is mirrored ONLY to sessions bound to that same runtime,
      // never blanket-applied to every session in the group.
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: {
          sessionGroupId: "group-1",
          connection: { path: ["runtimeInstanceId"], equals: "runtime_99a9d155" },
        },
        data: { workdir: "/workspaces/crocodile-2" },
      });
      const blanketWorkdirMirror = prismaMock.session.updateMany.mock.calls.some(
        ([arg]) =>
          !arg?.where?.connection &&
          (arg?.data as { workdir?: unknown } | undefined)?.workdir === "/workspaces/crocodile-2",
      );
      expect(blanketWorkdirMirror).toBe(false);
      expect(prismaMock.session.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionGroupId: "group-1" },
          data: expect.objectContaining({ connection: expect.anything() }),
        }),
      );
    });

    it("reconciles an existing group branch from workspace_ready for the same workdir", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        pendingRun: null,
        agentStatus: "not_started",
        sessionStatus: "in_progress",
        readOnlyWorkspace: false,
        workdir: "/tmp/trace/starling",
      });
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          branch: "mobile-app-rebased",
          sessionGroup: makeSessionGroup({
            branch: "trace/starling",
            prUrl: "https://github.com/trace/trace/pull/123",
            workdir: "/tmp/trace/starling",
          }),
          workdir: "/tmp/trace/starling",
        }),
      );
      prismaMock.sessionGroup.update.mockResolvedValueOnce(
        makeSessionGroup({ branch: "mobile-app-rebased", workdir: "/tmp/trace/starling" }),
      );
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        ...makeSessionGroup({ branch: "mobile-app-rebased", workdir: "/tmp/trace/starling" }),
        sessions: [{ agentStatus: "not_started", sessionStatus: "in_progress" }],
      });
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.workspaceReady("session-1", "/tmp/trace/starling", "mobile-app-rebased");

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            branch: "mobile-app-rebased",
            workdir: "/tmp/trace/starling",
          }),
        }),
      );
      expect(prismaMock.sessionGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            branch: "mobile-app-rebased",
            prUrl: null,
            workdir: "/tmp/trace/starling",
          }),
        }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_output",
          payload: expect.objectContaining({
            type: "workspace_ready",
            sessionGroup: expect.objectContaining({ branch: "mobile-app-rebased" }),
          }),
        }),
      );
    });

    it("clears a stale PR URL when workspace_ready sets a branch from null", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        pendingRun: null,
        agentStatus: "not_started",
        sessionStatus: "in_progress",
        readOnlyWorkspace: false,
        workdir: "/tmp/trace/starling",
      });
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          branch: "mobile-app-rebased",
          sessionGroup: makeSessionGroup({
            branch: null,
            prUrl: "https://github.com/trace/trace/pull/123",
            workdir: "/tmp/trace/starling",
          }),
          workdir: "/tmp/trace/starling",
        }),
      );
      prismaMock.sessionGroup.update.mockResolvedValueOnce(
        makeSessionGroup({ branch: "mobile-app-rebased", workdir: "/tmp/trace/starling" }),
      );
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        ...makeSessionGroup({ branch: "mobile-app-rebased", workdir: "/tmp/trace/starling" }),
        sessions: [{ agentStatus: "not_started", sessionStatus: "in_progress" }],
      });
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.workspaceReady("session-1", "/tmp/trace/starling", "mobile-app-rebased");

      expect(prismaMock.sessionGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            branch: "mobile-app-rebased",
            prUrl: null,
          }),
        }),
      );
    });

    it("allows a branch change when workspace_ready moves to a new workdir", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        pendingRun: null,
        agentStatus: "not_started",
        sessionStatus: "in_progress",
        readOnlyWorkspace: false,
        workdir: null,
      });
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          branch: "trace/ladybug",
          workdir: "/tmp/trace/ladybug",
        }),
      );
      prismaMock.sessionGroup.update.mockResolvedValueOnce(
        makeSessionGroup({ branch: "trace/ladybug", workdir: "/tmp/trace/ladybug" }),
      );
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.workspaceReady("session-1", "/tmp/trace/ladybug", "trace/ladybug");

      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            branch: "trace/ladybug",
            workdir: "/tmp/trace/ladybug",
          }),
        }),
      );
    });

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

    it("emits a workspace_restored_from_base event when the branch was missing on origin", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        pendingRun: null,
        agentStatus: "not_started",
        sessionStatus: "in_progress",
        readOnlyWorkspace: false,
        workdir: null,
      });
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({ branch: "trace/missing", workdir: "/tmp/trace/missing" }),
      );
      prismaMock.sessionGroup.update.mockResolvedValueOnce(
        makeSessionGroup({ branch: "trace/missing", workdir: "/tmp/trace/missing" }),
      );
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.workspaceReady("session-1", "/tmp/trace/missing", "trace/missing", undefined, {
        type: "branch_missing_restored_from_base",
        branch: "trace/missing",
        baseBranch: "develop",
        message:
          "Branch trace/missing did not exist on origin, so Trace created it from develop. " +
          "Local-only changes from the previous workspace were not restored.",
      });

      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_output",
          payload: expect.objectContaining({
            type: "workspace_restored_from_base",
            branch: "trace/missing",
            baseBranch: "develop",
            message: expect.stringContaining("did not exist on origin"),
          }),
        }),
      );
      // The workspace_ready event itself must stay free of warning data.
      const readyCall = eventServiceMock.create.mock.calls.find(
        ([arg]: [{ payload?: { type?: string } }]) => arg.payload?.type === "workspace_ready",
      );
      expect(readyCall?.[0].payload).not.toHaveProperty("warning");
    });

    it("does not emit a workspace_restored_from_base event when there is no warning", async () => {
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        pendingRun: null,
        agentStatus: "not_started",
        sessionStatus: "in_progress",
        readOnlyWorkspace: false,
        workdir: null,
      });
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({ branch: "trace/ok", workdir: "/tmp/trace/ok" }),
      );
      prismaMock.sessionGroup.update.mockResolvedValueOnce(
        makeSessionGroup({ branch: "trace/ok", workdir: "/tmp/trace/ok" }),
      );
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.workspaceReady("session-1", "/tmp/trace/ok", "trace/ok");

      const restoredCall = eventServiceMock.create.mock.calls.find(
        ([arg]: [{ payload?: { type?: string } }]) =>
          arg.payload?.type === "workspace_restored_from_base",
      );
      expect(restoredCall).toBeUndefined();
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

  describe("workspaceFailed", () => {
    it("keeps workspace failures retryable without marking the worktree deleted", async () => {
      const pendingRun = {
        type: "send",
        prompt: "Continue",
        interactionMode: "code",
      };
      const failedConnection = {
        state: "failed",
        runtimeInstanceId: "runtime-a",
        runtimeLabel: "Laptop A",
        lastError: "Command failed: git clean -ffdx\n",
        retryCount: 0,
        canRetry: true,
        canMove: true,
        autoRetryable: false,
        failedAt: "2026-05-09T04:29:16.000Z",
      };

      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-a",
          runtimeLabel: "Laptop A",
          retryCount: 0,
          canRetry: true,
          canMove: true,
        },
      });
      prismaMock.session.update.mockResolvedValueOnce(
        makeSession({
          agentStatus: "done",
          workdir: "/tmp/trace/workspace",
          worktreeDeleted: false,
          pendingRun,
          connection: failedConnection,
        }),
      );
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce(
        makeSessionGroup({
          workdir: "/tmp/trace/workspace",
          worktreeDeleted: false,
          connection: failedConnection,
        }),
      );

      await service.workspaceFailed("session-1", "Command failed: git clean -ffdx\n");

      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: expect.objectContaining({
          agentStatus: "done",
          worktreeDeleted: false,
          connection: expect.objectContaining({
            state: "failed",
            canRetry: true,
            canMove: true,
            autoRetryable: false,
            lastError: "Command failed: git clean -ffdx\n",
          }),
        }),
        include: expect.any(Object),
      });
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            workdir: null,
            pendingRun: expect.anything(),
          }),
        }),
      );
      expect(prismaMock.sessionGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            worktreeDeleted: false,
            connection: expect.objectContaining({
              state: "failed",
              canRetry: true,
            }),
          }),
        }),
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_output",
          payload: expect.objectContaining({
            type: "workspace_failed",
            agentStatus: "done",
            worktreeDeleted: false,
            connection: expect.objectContaining({
              state: "failed",
              canRetry: true,
            }),
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

  describe("renameGroup", () => {
    it("renames a workspace and emits session_group_renamed", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        visibility: "public",
        ownerUserId: "user-1",
      });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        name: "Old workspace",
        sessions: [{ id: "session-1" }],
      });
      prismaMock.sessionGroup.update.mockResolvedValueOnce(
        makeSessionGroup({ id: "group-1", name: "New workspace" }),
      );
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        ...makeSessionGroup({ id: "group-1", name: "New workspace" }),
        sessions: [],
      });

      const result = await service.renameGroup(
        "group-1",
        "org-1",
        "  New workspace  ",
        "user",
        "user-1",
      );

      expect(result.name).toBe("New workspace");
      expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function));
      expect(prismaMock.sessionGroup.update).toHaveBeenCalledWith({
        where: { id: "group-1" },
        data: { name: "New workspace" },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org-1",
          scopeType: "session",
          scopeId: "session-1",
          eventType: "session_group_renamed",
          payload: expect.objectContaining({
            sessionGroupId: "group-1",
            name: "New workspace",
            sessionGroup: expect.objectContaining({
              id: "group-1",
              name: "New workspace",
            }),
          }),
          actorType: "user",
          actorId: "user-1",
        }),
        prismaMock,
      );
    });

    it("does not complete if the rename event cannot be recorded", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        name: "Old workspace",
        sessions: [{ id: "session-1" }],
      });
      prismaMock.sessionGroup.update.mockResolvedValueOnce(
        makeSessionGroup({ id: "group-1", name: "New workspace" }),
      );
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        ...makeSessionGroup({ id: "group-1", name: "New workspace" }),
        sessions: [],
      });
      eventServiceMock.create.mockRejectedValueOnce(new Error("event failed"));

      await expect(service.renameGroup("group-1", "org-1", "New workspace")).rejects.toThrow(
        "event failed",
      );

      expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function));
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "session_group_renamed" }),
        prismaMock,
      );
    });

    it("rejects empty workspace names", async () => {
      await expect(service.renameGroup("group-1", "org-1", "   ")).rejects.toThrow(
        "Workspace name cannot be empty",
      );

      expect(prismaMock.sessionGroup.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.sessionGroup.update).not.toHaveBeenCalled();
      expect(eventServiceMock.create).not.toHaveBeenCalled();
    });

    it("rejects workspace names over the maximum length", async () => {
      await expect(
        service.renameGroup("group-1", "org-1", "a".repeat(MAX_WORKSPACE_NAME_LENGTH + 1)),
      ).rejects.toThrow(`Workspace name cannot exceed ${MAX_WORKSPACE_NAME_LENGTH} characters`);

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.sessionGroup.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.sessionGroup.update).not.toHaveBeenCalled();
      expect(eventServiceMock.create).not.toHaveBeenCalled();
    });
  });

  describe("updateGroupVisibility", () => {
    it("updates visibility and records events atomically", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        visibility: "public",
        ownerUserId: "user-1",
        channelId: "channel-1",
        connection: { runtimeInstanceId: "runtime-1" },
        sessions: [{ id: "session-1" }],
      });
      sessionRouterMock.getRuntime.mockReturnValueOnce({
        id: "runtime-1",
        key: "org-1:runtime-1",
        hostingMode: "local",
        ownerUserId: "user-1",
      });
      prismaMock.sessionGroup.update.mockResolvedValueOnce({
        id: "group-1",
        visibility: "private",
        ownerUserId: "user-1",
        channelId: "channel-1",
        connection: { runtimeInstanceId: "runtime-1" },
        sessions: [{ id: "session-1" }],
      });
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        ...makeSessionGroup({ id: "group-1", visibility: "private" }),
        sessions: [{ agentStatus: "not_started", sessionStatus: "in_progress" }],
      });
      eventServiceMock.create
        .mockResolvedValueOnce({ id: "event-visible" })
        .mockResolvedValueOnce({ id: "event-removed" });

      const result = await service.updateGroupVisibility(
        "group-1",
        "org-1",
        "private",
        "user",
        "user-1",
      );

      expect(result.visibility).toBe("private");
      expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function));
      expect(prismaMock.sessionGroup.update).toHaveBeenCalledWith({
        where: { id: "group-1" },
        data: { visibility: "private" },
        select: expect.any(Object),
      });
      expect(eventServiceMock.create).toHaveBeenCalledTimes(2);
      expect(eventServiceMock.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          eventType: "session_group_visibility_updated",
          deferPublish: true,
          payload: expect.objectContaining({
            sessionGroupId: "group-1",
            visibility: "private",
            sessionGroup: expect.objectContaining({ id: "group-1", visibility: "private" }),
          }),
        }),
        prismaMock,
      );
      expect(eventServiceMock.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          eventType: "session_group_visibility_updated",
          deferPublish: true,
          payload: expect.objectContaining({
            sessionGroupId: "group-1",
            removed: true,
          }),
        }),
        prismaMock,
      );
      expect(eventServiceMock.publishCreated).toHaveBeenCalledWith({ id: "event-visible" });
      expect(eventServiceMock.publishCreated).toHaveBeenCalledWith({ id: "event-removed" });
    });

    it("rejects visibility updates from non-owners", async () => {
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        visibility: "public",
        ownerUserId: "owner-1",
        channelId: "channel-1",
        connection: null,
        sessions: [{ id: "session-1" }],
      });

      await expect(
        service.updateGroupVisibility("group-1", "org-1", "private", "user", "user-2"),
      ).rejects.toThrow("Only the session group owner can change visibility");

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(eventServiceMock.create).not.toHaveBeenCalled();
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

  describe("deleteGroup", () => {
    it("deletes an app group's managed git repo", async () => {
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce(
        makeSessionGroup({
          id: "app-group",
          kind: "app",
          organizationId: "org-1",
          repoId: "managed-repo-1",
        }),
      );
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "app-group",
        visibility: "public",
        ownerUserId: "user-1",
      });
      prismaMock.session.findMany.mockResolvedValueOnce([]);
      prismaMock.sessionGroup.count.mockResolvedValueOnce(0);

      await service.deleteGroup("app-group", "org-1", "user", "user-1");

      expect(managedGitServiceMock.deleteManagedRepo).toHaveBeenCalledWith({
        organizationId: "org-1",
        repoId: "managed-repo-1",
        actorType: "user",
        actorId: "user-1",
      });
    });

    it("keeps a managed git repo still shared by another group", async () => {
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce(
        makeSessionGroup({
          id: "app-group",
          kind: "app",
          organizationId: "org-1",
          repoId: "managed-repo-1",
        }),
      );
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "app-group",
        visibility: "public",
        ownerUserId: "user-1",
      });
      prismaMock.session.findMany.mockResolvedValueOnce([]);
      // A restored sibling group still references the repo.
      prismaMock.sessionGroup.count.mockResolvedValueOnce(1);

      await service.deleteGroup("app-group", "org-1", "user", "user-1");

      expect(managedGitServiceMock.deleteManagedRepo).not.toHaveBeenCalled();
    });
  });

  describe("markConnectionLost", () => {
    it("does not rewrite already-disconnected done cloud sessions for the same runtime", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
          hosting: "cloud",
          agentStatus: "done",
          sessionStatus: "in_progress",
          worktreeDeleted: false,
          connection: {
            state: "disconnected",
            runtimeInstanceId: "runtime-1",
            lastError: "runtime_disconnected",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
        }),
      );

      await service.markConnectionLost("session-1", "runtime_disconnected", "runtime-1");

      expect(prismaMock.session.update).not.toHaveBeenCalled();
      expect(eventServiceMock.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_output",
          payload: expect.objectContaining({ type: "connection_lost" }),
        }),
      );
    });
  });

  describe("markConnectionRestored", () => {
    it("propagates a changed bridge binding without overwriting sibling lifecycle state", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
          connection: { state: "disconnected", runtimeInstanceId: "runtime-a" },
        }),
      );
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        connection: { state: "disconnected", runtimeInstanceId: "runtime-a" },
      });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          organizationId: "org-1",
          connection: { state: "connected", version: 2, runtimeInstanceId: "runtime-b" },
        },
        {
          id: "session-2",
          organizationId: "org-1",
          connection: {
            state: "failed",
            version: 9,
            lastError: "tool crashed",
            runtimeInstanceId: "runtime-a",
          },
        },
      ]);
      sessionRouterMock.getRuntime.mockReturnValue({
        id: "runtime-b",
        key: "org-1:runtime-b",
        label: "Laptop B",
      });

      await service.markConnectionRestored("session-1", "runtime-b");

      expect(prismaMock.session.update).toHaveBeenCalledWith({
        where: { id: "session-2" },
        data: {
          connection: expect.objectContaining({
            state: "failed",
            version: 9,
            lastError: "tool crashed",
            runtimeInstanceId: "runtime-b",
            runtimeLabel: "Laptop B",
          }),
        },
      });
      expect(terminalRelayMock.destroyAllForSessionGroup).toHaveBeenCalledWith("group-1");
      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith(
        "session-2",
        "org-1:runtime-b",
      );
    });
  });

  describe("cleanupIdleCloudSessionGroups", () => {
    beforeEach(() => {
      prismaMock.sessionGroup.findMany.mockReset();
      prismaMock.session.findUnique.mockReset();
      prismaMock.sessionGroup.findUnique.mockReset();
      prismaMock.session.updateMany.mockReset();
    });

    it("unloads idle cloud session groups", async () => {
      const connection = {
        state: "connected",
        adapterType: "provisioned",
        environmentId: "env-1",
        runtimeInstanceId: "runtime-1",
        providerRuntimeId: "provider-runtime-1",
        retryCount: 0,
        canRetry: true,
        canMove: true,
      };
      prismaMock.sessionGroup.findMany.mockResolvedValueOnce([
        {
          id: "group-1",
          organizationId: "org-1",
          updatedAt: new Date("2026-05-12T11:00:00.000Z"),
          workdir: "/workspace/group-1",
          connection,
          sessions: [
            {
              id: "session-1",
              hosting: "cloud",
              agentStatus: "done",
              sessionStatus: "in_progress",
              createdAt: new Date("2026-05-12T10:00:00.000Z"),
              lastUserMessageAt: new Date("2026-05-12T11:00:00.000Z"),
              lastMessageAt: new Date("2026-05-12T11:30:00.000Z"),
              updatedAt: new Date("2026-05-12T11:31:00.000Z"),
            },
          ],
        },
      ]);
      const disconnectOnDeprovisionConnection = {
        ...connection,
        disconnectOnDeprovision: true,
        disconnectReason: "idle_session_group_cleanup",
        version: 1,
      };
      const disconnectedConnection = {
        ...disconnectOnDeprovisionConnection,
        state: "disconnected",
        stoppedAt: expect.any(String),
        deprovisionedAt: expect.any(String),
        disconnectedAt: expect.any(String),
        lastError: "idle_session_group_cleanup",
        autoRetryable: false,
        disconnectOnDeprovision: false,
        version: 2,
      };
      prismaMock.session.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });
      prismaMock.session.findUnique
        .mockResolvedValueOnce(
          makeSession({
            id: "session-1",
            sessionGroupId: "group-1",
            organizationId: "org-1",
            workdir: null,
            connection,
          }),
        )
        .mockResolvedValueOnce(
          makeSession({
            id: "session-1",
            sessionGroupId: "group-1",
            organizationId: "org-1",
            workdir: null,
            connection: disconnectOnDeprovisionConnection,
          }),
        )
        // Final pre-destroy race re-read: still not starting up, reap proceeds.
        .mockResolvedValueOnce(
          makeSession({
            id: "session-1",
            sessionGroupId: "group-1",
            organizationId: "org-1",
            workdir: null,
            connection: disconnectOnDeprovisionConnection,
          }),
        )
        .mockResolvedValueOnce(
          makeSession({
            id: "session-1",
            sessionGroupId: "group-1",
            organizationId: "org-1",
            agentStatus: "done",
            sessionStatus: "in_progress",
          }),
        )
        .mockResolvedValueOnce(
          makeSession({
            id: "session-1",
            sessionGroupId: "group-1",
            connection: disconnectOnDeprovisionConnection,
          }),
        );
      prismaMock.sessionGroup.findUnique
        .mockResolvedValueOnce(
          makeSessionGroup({
            id: "group-1",
            workdir: "/workspace/group-1",
            worktreeDeleted: false,
            sessions: [{ agentStatus: "done", sessionStatus: "in_progress" }],
          }),
        )
        .mockResolvedValueOnce({
          workdir: "/workspace/group-1",
          repoId: "repo-1",
          connection: disconnectOnDeprovisionConnection,
        })
        .mockResolvedValueOnce(
          makeSessionGroup({
            id: "group-1",
            workdir: "/workspace/group-1",
            worktreeDeleted: false,
            sessions: [{ agentStatus: "done", sessionStatus: "in_progress" }],
          }),
        );
      sessionRouterMock.destroyRuntime.mockImplementationOnce(
        async (_sessionId, _session, options) => {
          await options?.onLifecycle?.("session_runtime_stopped", {
            providerRuntimeId: "provider-runtime-1",
          });
        },
      );

      const result = await service.cleanupIdleCloudSessionGroups({
        idleAfterMs: 10 * 60 * 1000,
        now: Date.parse("2026-05-12T11:45:00.000Z"),
      });

      expect(result).toEqual({ scanned: 1, cleaned: ["group-1"] });
      expect(prismaMock.sessionGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sessions: expect.objectContaining({
              some: { hosting: "cloud" },
              none: {
                OR: [
                  { agentStatus: "active" },
                  { lastMessageAt: { gt: new Date("2026-05-12T11:35:00.000Z") } },
                  { lastUserMessageAt: { gt: new Date("2026-05-12T11:35:00.000Z") } },
                  {
                    lastMessageAt: null,
                    lastUserMessageAt: null,
                    createdAt: { gt: new Date("2026-05-12T11:35:00.000Z") },
                  },
                ],
              },
            }),
          }),
        }),
      );
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { id: "session-1", connection: { path: ["version"], equals: 0 } },
        data: {
          connection: expect.objectContaining({
            disconnectOnDeprovision: true,
            disconnectReason: "idle_session_group_cleanup",
          }),
        },
      });
      expect(terminalRelayMock.destroyAllForSessionGroup).toHaveBeenCalledWith("group-1");
      expect(sessionRouterMock.destroyRuntime).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          organizationId: "org-1",
          workdir: "/workspace/group-1",
          repoId: "repo-1",
          connection: disconnectOnDeprovisionConnection,
        }),
        expect.objectContaining({ reason: "idle_session_group_cleanup" }),
      );
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { id: "session-1", connection: { path: ["version"], equals: 1 } },
        data: { connection: expect.objectContaining(disconnectedConnection) },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_runtime_stopped",
          payload: expect.objectContaining({
            connection: expect.objectContaining({
              state: "disconnected",
              lastError: "idle_session_group_cleanup",
              canRetry: true,
              canMove: true,
            }),
          }),
        }),
      );
      expect(eventServiceMock.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "session_terminated" }),
      );
    });

    it("unloads stale cloud groups even when connection churn refreshed updatedAt", async () => {
      const connection = {
        state: "disconnected",
        adapterType: "provisioned",
        environmentId: "env-1",
        runtimeInstanceId: "runtime-1",
        providerRuntimeId: "provider-runtime-1",
        retryCount: 0,
        canRetry: true,
        canMove: true,
        lastError: "runtime_disconnected",
      };
      prismaMock.sessionGroup.findMany.mockResolvedValueOnce([
        {
          id: "group-1",
          organizationId: "org-1",
          updatedAt: new Date("2026-05-12T11:44:00.000Z"),
          workdir: "/workspace/group-1",
          connection,
          sessions: [
            {
              id: "session-1",
              hosting: "cloud",
              agentStatus: "done",
              sessionStatus: "in_progress",
              createdAt: new Date("2026-05-12T10:00:00.000Z"),
              lastUserMessageAt: new Date("2026-05-12T11:00:00.000Z"),
              lastMessageAt: new Date("2026-05-12T11:20:00.000Z"),
              updatedAt: new Date("2026-05-12T11:44:00.000Z"),
            },
          ],
        },
      ]);
      const disconnectOnDeprovisionConnection = {
        ...connection,
        disconnectOnDeprovision: true,
        disconnectReason: "idle_session_group_cleanup",
        version: 1,
      };
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.session.findUnique
        .mockResolvedValueOnce(
          makeSession({
            id: "session-1",
            sessionGroupId: "group-1",
            organizationId: "org-1",
            workdir: null,
            connection,
          }),
        )
        .mockResolvedValueOnce(
          makeSession({
            id: "session-1",
            sessionGroupId: "group-1",
            organizationId: "org-1",
            workdir: null,
            connection: disconnectOnDeprovisionConnection,
          }),
        );
      prismaMock.sessionGroup.findUnique
        .mockResolvedValueOnce(
          makeSessionGroup({
            id: "group-1",
            workdir: "/workspace/group-1",
            worktreeDeleted: false,
            sessions: [{ agentStatus: "done", sessionStatus: "in_progress" }],
          }),
        )
        .mockResolvedValueOnce({
          workdir: "/workspace/group-1",
          repoId: "repo-1",
          connection: disconnectOnDeprovisionConnection,
        });

      const result = await service.cleanupIdleCloudSessionGroups({
        idleAfterMs: 10 * 60 * 1000,
        now: Date.parse("2026-05-12T11:45:00.000Z"),
      });

      expect(result).toEqual({ scanned: 1, cleaned: ["group-1"] });
      expect(sessionRouterMock.destroyRuntime).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          connection: disconnectOnDeprovisionConnection,
        }),
        expect.objectContaining({ reason: "idle_session_group_cleanup" }),
      );
    });

    it("keeps active cloud session groups running even without recent messages", async () => {
      prismaMock.sessionGroup.findMany.mockResolvedValueOnce([
        {
          id: "group-1",
          organizationId: "org-1",
          updatedAt: new Date("2026-05-12T11:00:00.000Z"),
          workdir: "/workspace/group-1",
          connection: { runtimeInstanceId: "runtime-1" },
          sessions: [
            {
              id: "session-1",
              hosting: "cloud",
              agentStatus: "active",
              sessionStatus: "in_progress",
              createdAt: new Date("2026-05-12T11:00:00.000Z"),
              lastUserMessageAt: new Date("2026-05-12T11:10:00.000Z"),
              lastMessageAt: new Date("2026-05-12T11:20:00.000Z"),
              updatedAt: new Date("2026-05-12T11:21:00.000Z"),
            },
          ],
        },
      ]);

      const result = await service.cleanupIdleCloudSessionGroups({
        idleAfterMs: 10 * 60 * 1000,
        now: Date.parse("2026-05-12T11:45:00.000Z"),
      });

      expect(result).toEqual({ scanned: 1, cleaned: [] });
      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
      expect(sessionRouterMock.destroyRuntime).not.toHaveBeenCalled();
    });

    it("keeps a reviving cloud runtime that is still within the startup grace window", async () => {
      // Reviving an idle group provisions fresh compute without a new message,
      // so the group still matches the idle query while its runtime boots. The
      // sweep must not reap a runtime mid-startup.
      prismaMock.sessionGroup.findMany.mockResolvedValueOnce([
        {
          id: "group-1",
          organizationId: "org-1",
          updatedAt: new Date("2026-05-12T11:00:00.000Z"),
          workdir: "/workspace/group-1",
          connection: {
            state: "provisioning",
            adapterType: "provisioned",
            environmentId: "env-1",
            runtimeInstanceId: "runtime-1",
            providerRuntimeId: "provider-runtime-1",
            provisioningAt: "2026-05-12T11:44:30.000Z",
            retryCount: 0,
            canRetry: true,
            canMove: true,
          },
          sessions: [
            {
              id: "session-1",
              hosting: "cloud",
              agentStatus: "done",
              sessionStatus: "in_progress",
              createdAt: new Date("2026-05-12T10:00:00.000Z"),
              lastUserMessageAt: new Date("2026-05-12T11:00:00.000Z"),
              lastMessageAt: new Date("2026-05-12T11:30:00.000Z"),
              updatedAt: new Date("2026-05-12T11:44:31.000Z"),
            },
          ],
        },
      ]);

      const result = await service.cleanupIdleCloudSessionGroups({
        idleAfterMs: 10 * 60 * 1000,
        now: Date.parse("2026-05-12T11:45:00.000Z"),
      });

      expect(result).toEqual({ scanned: 1, cleaned: [] });
      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
      expect(sessionRouterMock.destroyRuntime).not.toHaveBeenCalled();
    });

    it("reaps a cloud runtime stuck starting up past the startup grace window", async () => {
      const connection = {
        state: "provisioning",
        adapterType: "provisioned",
        environmentId: "env-1",
        runtimeInstanceId: "runtime-1",
        providerRuntimeId: "provider-runtime-1",
        // Startup began well beyond the 5-minute grace window: genuinely stuck,
        // so the leaked compute is still reclaimable.
        provisioningAt: "2026-05-12T11:35:00.000Z",
        retryCount: 0,
        canRetry: true,
        canMove: true,
      };
      prismaMock.sessionGroup.findMany.mockResolvedValueOnce([
        {
          id: "group-1",
          organizationId: "org-1",
          updatedAt: new Date("2026-05-12T11:00:00.000Z"),
          workdir: "/workspace/group-1",
          connection,
          sessions: [
            {
              id: "session-1",
              hosting: "cloud",
              agentStatus: "done",
              sessionStatus: "in_progress",
              createdAt: new Date("2026-05-12T10:00:00.000Z"),
              lastUserMessageAt: new Date("2026-05-12T11:00:00.000Z"),
              lastMessageAt: new Date("2026-05-12T11:30:00.000Z"),
              updatedAt: new Date("2026-05-12T11:35:01.000Z"),
              connection,
            },
          ],
        },
      ]);
      const disconnectOnDeprovisionConnection = {
        ...connection,
        disconnectOnDeprovision: true,
        disconnectReason: "idle_session_group_cleanup",
        version: 1,
      };
      prismaMock.session.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });
      prismaMock.session.findUnique
        .mockResolvedValueOnce(
          makeSession({
            id: "session-1",
            sessionGroupId: "group-1",
            organizationId: "org-1",
            workdir: null,
            connection,
          }),
        )
        .mockResolvedValueOnce(
          makeSession({
            id: "session-1",
            sessionGroupId: "group-1",
            organizationId: "org-1",
            workdir: null,
            connection: disconnectOnDeprovisionConnection,
          }),
        )
        .mockResolvedValueOnce(
          makeSession({
            id: "session-1",
            sessionGroupId: "group-1",
            connection: disconnectOnDeprovisionConnection,
          }),
        );
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        workdir: "/workspace/group-1",
        repoId: "repo-1",
        connection: disconnectOnDeprovisionConnection,
      });
      sessionRouterMock.destroyRuntime.mockImplementationOnce(
        async (_sessionId, _session, options) => {
          await options?.onLifecycle?.("session_runtime_stopped", {
            providerRuntimeId: "provider-runtime-1",
          });
        },
      );

      const result = await service.cleanupIdleCloudSessionGroups({
        idleAfterMs: 10 * 60 * 1000,
        now: Date.parse("2026-05-12T11:45:00.000Z"),
      });

      expect(result).toEqual({ scanned: 1, cleaned: ["group-1"] });
      expect(sessionRouterMock.destroyRuntime).toHaveBeenCalledWith(
        "session-1",
        expect.anything(),
        expect.objectContaining({ reason: "idle_session_group_cleanup" }),
      );
    });

    it("aborts the reap when a restart provisions a fresh runtime mid-sweep", async () => {
      // Idle-at-rest (disconnected, no deprovisionedAt) → reap-worthy at flag
      // time. A restart then flips it to provisioning before teardown; the final
      // pre-destroy re-read must abort so we don't kill the freshly-started
      // runtime.
      const restingConnection = {
        state: "disconnected",
        adapterType: "provisioned",
        environmentId: "env-1",
        runtimeInstanceId: "runtime-old",
        providerRuntimeId: "provider-runtime-old",
        retryCount: 0,
        canRetry: true,
        canMove: true,
      };
      const startingConnection = {
        state: "provisioning",
        adapterType: "provisioned",
        environmentId: "env-1",
        runtimeInstanceId: "runtime-new",
        provisioningAt: "2026-05-12T11:44:50.000Z",
        disconnectOnDeprovision: true,
        disconnectReason: "idle_session_group_cleanup",
        retryCount: 0,
        canRetry: true,
        canMove: true,
      };
      prismaMock.sessionGroup.findMany.mockResolvedValueOnce([
        {
          id: "group-1",
          organizationId: "org-1",
          updatedAt: new Date("2026-05-12T11:00:00.000Z"),
          workdir: "/workspace/group-1",
          connection: restingConnection,
          sessions: [
            {
              id: "session-1",
              hosting: "cloud",
              agentStatus: "done",
              sessionStatus: "in_progress",
              createdAt: new Date("2026-05-12T10:00:00.000Z"),
              lastUserMessageAt: new Date("2026-05-12T11:00:00.000Z"),
              lastMessageAt: new Date("2026-05-12T11:30:00.000Z"),
              updatedAt: new Date("2026-05-12T11:31:00.000Z"),
              connection: restingConnection,
            },
          ],
        },
      ]);
      prismaMock.session.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.sessionGroup.findUnique.mockResolvedValue({
        workdir: "/workspace/group-1",
        repoId: "repo-1",
        connection: restingConnection,
      });
      prismaMock.session.findUnique
        .mockResolvedValueOnce(
          makeSession({ id: "session-1", sessionGroupId: "group-1", organizationId: "org-1", connection: restingConnection }),
        )
        .mockResolvedValueOnce(
          makeSession({ id: "session-1", sessionGroupId: "group-1", organizationId: "org-1", connection: restingConnection }),
        )
        // Final pre-destroy re-read: a restart is now provisioning → abort.
        .mockResolvedValueOnce(
          makeSession({ id: "session-1", sessionGroupId: "group-1", organizationId: "org-1", connection: startingConnection }),
        )
        // Clear-flag conditional read.
        .mockResolvedValueOnce(
          makeSession({ id: "session-1", sessionGroupId: "group-1", organizationId: "org-1", connection: startingConnection }),
        );

      const result = await service.cleanupIdleCloudSessionGroups({
        idleAfterMs: 10 * 60 * 1000,
        now: Date.parse("2026-05-12T11:45:00.000Z"),
      });

      expect(result).toEqual({ scanned: 1, cleaned: [] });
      expect(sessionRouterMock.destroyRuntime).not.toHaveBeenCalled();
    });

    it("unloads idle cloud session groups when the runtime binding is on the session", async () => {
      const connection = {
        state: "connected",
        adapterType: "provisioned",
        environmentId: "env-1",
        runtimeInstanceId: "runtime-1",
        providerRuntimeId: "provider-runtime-1",
        retryCount: 0,
        canRetry: true,
        canMove: true,
      };
      prismaMock.sessionGroup.findMany.mockResolvedValueOnce([
        {
          id: "group-1",
          organizationId: "org-1",
          updatedAt: new Date("2026-05-12T11:00:00.000Z"),
          workdir: null,
          connection: null,
          sessions: [
            {
              id: "session-1",
              hosting: "cloud",
              agentStatus: "done",
              sessionStatus: "in_progress",
              createdAt: new Date("2026-05-12T10:00:00.000Z"),
              lastUserMessageAt: new Date("2026-05-12T11:00:00.000Z"),
              lastMessageAt: new Date("2026-05-12T11:30:00.000Z"),
              updatedAt: new Date("2026-05-12T11:31:00.000Z"),
              connection,
            },
          ],
        },
      ]);
      const disconnectOnDeprovisionConnection = {
        ...connection,
        disconnectOnDeprovision: true,
        disconnectReason: "idle_session_group_cleanup",
        version: 1,
      };
      prismaMock.session.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });
      prismaMock.session.findUnique
        .mockResolvedValueOnce(
          makeSession({
            id: "session-1",
            sessionGroupId: "group-1",
            organizationId: "org-1",
            workdir: null,
            connection,
          }),
        )
        .mockResolvedValueOnce(
          makeSession({
            id: "session-1",
            sessionGroupId: "group-1",
            organizationId: "org-1",
            workdir: null,
            connection: disconnectOnDeprovisionConnection,
          }),
        )
        .mockResolvedValueOnce(
          makeSession({
            id: "session-1",
            sessionGroupId: "group-1",
            organizationId: "org-1",
            agentStatus: "done",
            sessionStatus: "in_progress",
          }),
        )
        .mockResolvedValueOnce(
          makeSession({
            id: "session-1",
            sessionGroupId: "group-1",
            connection: disconnectOnDeprovisionConnection,
          }),
        );
      prismaMock.sessionGroup.findUnique
        .mockResolvedValueOnce(
          makeSessionGroup({
            id: "group-1",
            workdir: null,
            connection: null,
            worktreeDeleted: false,
            sessions: [{ agentStatus: "done", sessionStatus: "in_progress" }],
          }),
        )
        .mockResolvedValueOnce({
          workdir: null,
          repoId: null,
          connection: null,
        })
        .mockResolvedValueOnce(
          makeSessionGroup({
            id: "group-1",
            workdir: null,
            connection: null,
            worktreeDeleted: false,
            sessions: [{ agentStatus: "done", sessionStatus: "in_progress" }],
          }),
        );
      sessionRouterMock.destroyRuntime.mockImplementationOnce(
        async (_sessionId, _session, options) => {
          await options?.onLifecycle?.("session_runtime_stopped", {
            providerRuntimeId: "provider-runtime-1",
          });
        },
      );

      const result = await service.cleanupIdleCloudSessionGroups({
        idleAfterMs: 10 * 60 * 1000,
        now: Date.parse("2026-05-12T11:45:00.000Z"),
      });

      expect(result).toEqual({ scanned: 1, cleaned: ["group-1"] });
      expect(sessionRouterMock.destroyRuntime).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          connection: disconnectOnDeprovisionConnection,
        }),
        expect.objectContaining({ reason: "idle_session_group_cleanup" }),
      );
    });

    it("does not re-stop a group whose runtime is already disconnected", async () => {
      // Regression: a provisioned runtime stopped by a prior idle sweep lands in
      // `state: "disconnected"` while keeping its runtime binding ids. The group
      // still looks idle, so without a guard the sweep re-stops the already-gone
      // runtime and re-emits stopping/stopped events on every tick forever.
      const disconnectedConnection = {
        state: "disconnected",
        providerStatus: "stopped",
        adapterType: "provisioned",
        environmentId: "env-1",
        runtimeInstanceId: "runtime-1",
        providerRuntimeId: "provider-runtime-1",
        disconnectReason: "idle_session_group_cleanup",
        disconnectOnDeprovision: false,
        deprovisionedAt: "2026-05-12T11:32:00.000Z",
        canRetry: true,
        canMove: true,
        version: 5,
      };
      prismaMock.sessionGroup.findMany.mockResolvedValueOnce([
        {
          id: "group-1",
          organizationId: "org-1",
          updatedAt: new Date("2026-05-12T11:00:00.000Z"),
          workdir: "/workspace/group-1",
          connection: disconnectedConnection,
          sessions: [
            {
              id: "session-1",
              hosting: "cloud",
              agentStatus: "done",
              sessionStatus: "in_progress",
              createdAt: new Date("2026-05-12T10:00:00.000Z"),
              lastUserMessageAt: new Date("2026-05-12T11:00:00.000Z"),
              lastMessageAt: new Date("2026-05-12T11:30:00.000Z"),
              updatedAt: new Date("2026-05-12T11:31:00.000Z"),
              connection: disconnectedConnection,
            },
          ],
        },
      ]);

      const result = await service.cleanupIdleCloudSessionGroups({
        idleAfterMs: 10 * 60 * 1000,
        now: Date.parse("2026-05-12T11:45:00.000Z"),
      });

      // The early compute-gone skip aborts before touching the connection, so
      // no per-session read, update, or runtime teardown is issued.
      expect(result).toEqual({ scanned: 1, cleaned: [] });
      expect(prismaMock.session.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
      expect(sessionRouterMock.destroyRuntime).not.toHaveBeenCalled();
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
      expect(inboxServiceMock.resolveBySource).toHaveBeenCalledWith({
        sourceType: "session",
        sourceId: "session-2",
        orgId: "org-1",
        resolution: "session_archived",
      });
      expect(inboxServiceMock.resolveBySource).toHaveBeenCalledWith({
        sourceType: "session",
        sourceId: "session-1",
        orgId: "org-1",
        resolution: "session_archived",
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
      expect(sessionRouterMock.destroyRuntime).toHaveBeenCalledWith(
        "session-1",
        expect.objectContaining({
          hosting: "cloud",
          connection: expect.objectContaining({
            runtimeInstanceId: "runtime-source",
          }),
        }),
        expect.objectContaining({
          reason: "session_moved_to_local",
          skipBridgeDelete: true,
          skipUnbind: true,
        }),
      );
      expect(terminalRelayMock.destroyAllForSessionGroup).toHaveBeenCalledWith("group-1");
    });

    it("relocates every sibling session in the group onto the same runtime", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
          hosting: "local",
          workdir: "/tmp/trace/worktrees/session-1",
          sessionGroupId: "group-1",
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
          hosting: "local",
          sessionGroupId: "group-1",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-1",
            runtimeLabel: "Local Dev",
          },
        }),
      );
      // Active and merged siblings are both part of the bridge invariant.
      prismaMock.session.findMany.mockResolvedValueOnce([
        makeSession({
          id: "session-2",
          hosting: "local",
          sessionGroupId: "group-1",
          connection: {
            state: "connected",
            runtimeInstanceId: "runtime-source",
            runtimeLabel: "Laptop A",
          },
        }),
        makeSession({
          id: "session-merged",
          hosting: "local",
          sessionStatus: "merged",
          agentStatus: "done",
          sessionGroupId: "group-1",
          connection: {
            state: "stopped",
            runtimeInstanceId: "runtime-source",
            runtimeLabel: "Laptop A",
          },
        }),
      ]);
      prismaMock.session.update
        .mockResolvedValueOnce(
          makeSession({
            id: "session-2",
            hosting: "local",
            sessionGroupId: "group-1",
            connection: {
              state: "connected",
              runtimeInstanceId: "runtime-1",
              runtimeLabel: "Local Dev",
            },
          }),
        )
        .mockResolvedValueOnce(
          makeSession({
            id: "session-merged",
            hosting: "local",
            sessionStatus: "merged",
            agentStatus: "done",
            sessionGroupId: "group-1",
            connection: {
              state: "connected",
              runtimeInstanceId: "runtime-1",
              runtimeLabel: "Local Dev",
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
      sessionRouterMock.getRuntime.mockReturnValue(
        targetRuntime as unknown as ReturnType<typeof sessionRouterMock.getRuntime>,
      );

      await service.moveToRuntime("session-1", "runtime-1", "org-1", "user", "user-1");

      // Sibling relocated: terminated on the old bridge, re-pointed, re-bound.
      expect(terminalRelayMock.destroyAllForSessionGroup).toHaveBeenCalledWith("group-1");
      expect(sessionRouterMock.transitionRuntime).toHaveBeenCalledWith(
        "session-2",
        "local",
        "terminate",
      );
      expect(sessionRouterMock.unbindSession).toHaveBeenCalledWith("session-2");
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "session-2" },
          data: expect.objectContaining({
            hosting: "local",
            workdir: null,
            toolSessionId: null,
            connection: expect.objectContaining({ runtimeInstanceId: "runtime-1" }),
          }),
        }),
      );
      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith("session-2", "org-1:runtime-1");
      expect(prismaMock.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "session-merged" },
          data: expect.not.objectContaining({
            agentStatus: expect.anything(),
            sessionStatus: expect.anything(),
          }),
        }),
      );
      expect(sessionRouterMock.bindSession).toHaveBeenCalledWith(
        "session-merged",
        "org-1:runtime-1",
      );
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: {
          sessionGroupId: "group-1",
          id: { notIn: ["session-1", "session-2", "session-merged"] },
        },
        data: expect.objectContaining({
          hosting: "local",
          connection: expect.objectContaining({ runtimeInstanceId: "runtime-1" }),
        }),
      });
      // The sibling must not spin up its own workspace — only the primary provisions.
      expect(sessionRouterMock.createRuntime).toHaveBeenCalledTimes(1);
      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: "session-1" }),
      );
    });

    it("does not commit any group binding when a live sibling cannot terminate", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
          hosting: "local",
          workdir: "/tmp/trace/worktrees/session-1",
          connection: { state: "connected", runtimeInstanceId: "runtime-source" },
          projects: [{ projectId: "project-1" }],
        }),
      );
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.findMany.mockResolvedValueOnce([
        makeSession({
          id: "session-2",
          hosting: "local",
          connection: { state: "connected", runtimeInstanceId: "runtime-source" },
        }),
      ]);
      sessionRouterMock.getRuntime.mockReturnValue({
        id: "runtime-1",
        key: "org-1:runtime-1",
        label: "Local Dev",
        hostingMode: "local",
        organizationId: "org-1",
        supportedTools: ["claude_code"],
        registeredRepoIds: ["repo-1"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });
      sessionRouterMock.transitionRuntime
        .mockResolvedValueOnce("delivered")
        .mockRejectedValueOnce(new Error("bridge refused termination"));

      await expect(
        service.moveToRuntime("session-1", "runtime-1", "org-1", "user", "user-1"),
      ).rejects.toThrow("bridge refused termination");

      expect(prismaMock.sessionGroup.update).not.toHaveBeenCalled();
      expect(prismaMock.session.update).not.toHaveBeenCalled();
      expect(sessionRouterMock.bindSession).not.toHaveBeenCalled();
      expect(terminalRelayMock.destroyAllForSessionGroup).not.toHaveBeenCalled();
    });

    it("rejects a group move when the target bridge cannot run a sibling tool", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          id: "session-1",
          hosting: "local",
          workdir: "/tmp/trace/worktrees/session-1",
          connection: { state: "connected", runtimeInstanceId: "runtime-source" },
          projects: [{ projectId: "project-1" }],
        }),
      );
      prismaMock.event.findMany.mockResolvedValueOnce([]);
      prismaMock.session.findMany.mockResolvedValueOnce([
        makeSession({
          id: "session-2",
          tool: "codex",
          hosting: "local",
          connection: { state: "connected", runtimeInstanceId: "runtime-source" },
        }),
      ]);
      sessionRouterMock.getRuntime.mockReturnValue({
        id: "runtime-1",
        key: "org-1:runtime-1",
        label: "Claude-only bridge",
        hostingMode: "local",
        organizationId: "org-1",
        supportedTools: ["claude_code"],
        registeredRepoIds: ["repo-1"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });

      await expect(
        service.moveToRuntime("session-1", "runtime-1", "org-1", "user", "user-1"),
      ).rejects.toThrow("The selected coding tool is not installed on Claude-only bridge.");

      expect(sessionRouterMock.transitionRuntime).not.toHaveBeenCalled();
      expect(prismaMock.sessionGroup.update).not.toHaveBeenCalled();
      expect(prismaMock.session.update).not.toHaveBeenCalled();
    });

    it("provisions from the source HEAD when moving an unpushed branch to another runtime", async () => {
      sessionRouterMock.inspectSessionGitSyncStatus.mockResolvedValueOnce({
        branch: "trace/local-only",
        headCommitSha: "df9a24bc0b0653723657926b83c69926f08ffe44",
        upstreamBranch: "origin/main",
        upstreamCommitSha: "df9a24bc0b0653723657926b83c69926f08ffe44",
        aheadCount: 0,
        behindCount: 0,
        remoteBranch: null,
        remoteCommitSha: null,
        remoteAheadCount: 0,
        remoteBehindCount: 0,
        hasUncommittedChanges: false,
      });
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "local",
          branch: "trace/local-only",
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
          branch: "trace/local-only",
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
        key: "org-1:runtime-1",
        label: "Local Dev",
        hostingMode: "local",
        supportedTools: ["claude_code"],
        registeredRepoIds: ["repo-1"],
        boundSessions: new Set<string>(),
        ws: { readyState: 1, OPEN: 1 },
      });

      await service.moveToRuntime("session-1", "runtime-1", "org-1", "user", "user-1");

      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          hosting: "local",
          branch: "trace/local-only",
          checkpointSha: "df9a24bc0b0653723657926b83c69926f08ffe44",
        }),
      );
    });

    it("rejects moving a merged session with a deleted worktree", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({ sessionStatus: "merged", worktreeDeleted: true }),
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
          5_000,
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

    it("falls back to a force move when source git sync inspection fails", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
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
        expect(prismaMock.session.update).toHaveBeenCalled();
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

    it("falls back to a force move when the source workdir is missing", async () => {
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
      expect(prismaMock.session.update).toHaveBeenCalled();
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

    it("blocks moving a branch that was never pushed to origin", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "cloud",
          workdir: "/workspaces/gibbon",
          branch: "trace/gibbon",
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
          headCommitSha: "commit-local-only",
          upstreamBranch: null,
          upstreamCommitSha: null,
          aheadCount: 0,
          behindCount: 0,
          remoteBranch: null,
          remoteCommitSha: null,
          remoteAheadCount: 0,
          remoteBehindCount: 0,
        }),
      );

      await expect(
        service.moveToRuntime("session-1", "runtime-1", "org-1", "user", "user-1"),
      ).rejects.toThrow(/push this branch to origin/);
      expect(sessionRouterMock.createRuntime).not.toHaveBeenCalled();
      expect(sessionRouterMock.transitionRuntime).not.toHaveBeenCalled();
    });

    it("allows moving a pushed branch that has no local upstream tracking", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "cloud",
          workdir: "/workspaces/gibbon",
          branch: "trace/gibbon",
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
      // No upstream tracking, but the authoritative remote lookup resolved the
      // branch tip from origin and it matches HEAD — the branch is pushed.
      sessionRouterMock.inspectSessionGitSyncStatus.mockResolvedValueOnce(
        makeGitSyncStatus({
          branch: "trace/gibbon",
          headCommitSha: "pushed-head",
          upstreamBranch: null,
          upstreamCommitSha: null,
          aheadCount: 0,
          behindCount: 0,
          remoteBranch: "origin/trace/gibbon",
          remoteCommitSha: "pushed-head",
          remoteAheadCount: 0,
          remoteBehindCount: 0,
        }),
      );

      await service.moveToRuntime("session-1", "runtime-1", "org-1", "user", "user-1");

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
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_started",
          payload: expect.objectContaining({
            type: "runtime_move",
            sourceGitStatusVerified: true,
          }),
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

    it("rejects moving a no-remote repo session to cloud", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "local",
          repo: {
            id: "repo-1",
            name: "trace",
            remoteUrl: null,
            defaultBranch: "main",
          },
        }),
      );

      await expect(service.moveToCloud("session-1", "org-1", "user", "user-1")).rejects.toThrow(
        "Cloud sessions require the repo to have a remote URL.",
      );

      expect(prismaMock.session.update).not.toHaveBeenCalled();
      expect(sessionRouterMock.createRuntime).not.toHaveBeenCalled();
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
      expect(terminalRelayMock.destroyAllForSessionGroup).toHaveBeenCalledWith("group-1");
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

    it("provisions from the source HEAD when moving an unpushed local branch", async () => {
      sessionRouterMock.inspectSessionGitSyncStatus.mockResolvedValueOnce({
        branch: "trace/local-only",
        headCommitSha: "df9a24bc0b0653723657926b83c69926f08ffe44",
        upstreamBranch: "origin/main",
        upstreamCommitSha: "df9a24bc0b0653723657926b83c69926f08ffe44",
        aheadCount: 0,
        behindCount: 0,
        remoteBranch: null,
        remoteCommitSha: null,
        remoteAheadCount: 0,
        remoteBehindCount: 0,
        hasUncommittedChanges: false,
      });
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({
          hosting: "local",
          branch: "trace/local-only",
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
          branch: "trace/local-only",
          sessionGroupId: "group-1",
        }),
      );

      await service.moveToCloud("session-1", "org-1", "user", "user-1");

      expect(sessionRouterMock.createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-1",
          hosting: "cloud",
          branch: "trace/local-only",
          checkpointSha: "df9a24bc0b0653723657926b83c69926f08ffe44",
        }),
      );
    });

    it("rejects moving a merged session with a deleted worktree to cloud", async () => {
      prismaMock.session.findFirstOrThrow.mockResolvedValueOnce(
        makeSession({ sessionStatus: "merged", worktreeDeleted: true }),
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

    it("preserves creator ownership while provisioning as the move actor", async () => {
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
          createdById: "user-1",
          createdBy: { id: "user-1", name: "Original Owner", avatarUrl: null },
          agentStatus: "not_started",
          sessionStatus: "in_progress",
          hosting: "cloud",
          sessionGroupId: "group-1",
        }),
      );

      await service.moveToCloud("session-1", "org-1", "user", "user-2");

      expect(prismaMock.session.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdById: expect.any(String) }),
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
      sessionRouterMock.inspectSessionCurrentBranch.mockReset();
      sessionRouterMock.inspectSessionCurrentBranch.mockResolvedValue(null);
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
        changedFiles: [],
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
        changedFiles: [],
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
          changedFiles: [],
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
          changedFiles: [],
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
          refreshBeforeSync: true,
        }),
      );
    });

    it("refreshes a stale tracked branch from the bridge before syncing", async () => {
      const workdir = "/tmp/trace/worktrees/raccoon";
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-1" });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        repoId: "repo-1",
        branch: "trace/old-raccoon",
        workdir,
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-home",
        },
        visibility: "public",
        ownerUserId: "user-1",
        sessions: [
          {
            id: "session-home",
            repoId: "repo-1",
            branch: "trace/old-raccoon",
            workdir,
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
      sessionRouterMock.inspectSessionCurrentBranch.mockResolvedValueOnce("trace/new-raccoon");
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        organizationId: "org-1",
        sessionGroupId: "group-1",
      });
      prismaMock.sessionGroup.update.mockResolvedValueOnce(
        makeSessionGroup({ branch: "trace/new-raccoon" }),
      );
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        ...makeSessionGroup({ branch: "trace/new-raccoon" }),
        sessions: [{ agentStatus: "not_started", sessionStatus: "in_progress" }],
      });
      sessionRouterMock.syncLinkedCheckout.mockResolvedValueOnce({
        ok: true,
        error: null,
        errorCode: null,
        status: {
          repoId: "repo-1",
          repoPath: "/tmp/trace",
          isAttached: true,
          attachedSessionGroupId: "group-1",
          targetBranch: "trace/new-raccoon",
          autoSyncEnabled: true,
          currentBranch: null,
          currentCommitSha: "def456",
          lastSyncedCommitSha: "def456",
          lastSyncError: null,
          restoreBranch: "main",
          restoreCommitSha: "abc123",
          hasUncommittedChanges: false,
          changedFiles: [],
        },
      });

      await service.syncLinkedCheckout("group-1", "repo-1", "trace/old-raccoon", "org-1", "user-1");

      expect(sessionRouterMock.inspectSessionCurrentBranch).toHaveBeenCalledWith(
        "runtime-home",
        { sessionId: "session-home", workdirHint: workdir },
        1500,
      );
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
        where: { sessionGroupId: "group-1" },
        data: { branch: "trace/new-raccoon" },
      });
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "session_output",
          scopeId: "session-home",
          payload: expect.objectContaining({
            type: "branch_renamed",
            branch: "trace/new-raccoon",
          }),
        }),
      );
      expect(sessionRouterMock.syncLinkedCheckout).toHaveBeenCalledWith(
        "runtime-home",
        expect.objectContaining({
          branch: "trace/new-raccoon",
          refreshBeforeSync: false,
        }),
      );
    });

    it("refreshes branch from the session group runtime instead of the linked-checkout runtime", async () => {
      const workdir = "/tmp/trace/worktrees/session";
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-1" });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        repoId: "repo-1",
        branch: "trace/old-branch",
        workdir,
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-code",
        },
        visibility: "public",
        ownerUserId: "user-1",
        sessions: [
          {
            id: "session-code",
            repoId: "repo-1",
            branch: "trace/old-branch",
            workdir,
            connection: { state: "connected", runtimeInstanceId: "runtime-code" },
          },
        ],
      });
      sessionRouterMock.listRuntimes.mockReturnValue([
        {
          key: "runtime-code-key",
          id: "runtime-code",
          hostingMode: "local",
          organizationId: "org-1",
          ownerUserId: "user-1",
          registeredRepoIds: [],
          ws: { readyState: 1, OPEN: 1 },
        },
        {
          key: "runtime-sync-key",
          id: "runtime-sync",
          hostingMode: "local",
          organizationId: "org-1",
          ownerUserId: "user-1",
          registeredRepoIds: ["repo-1"],
          ws: { readyState: 1, OPEN: 1 },
        },
      ]);
      sessionRouterMock.inspectSessionCurrentBranch.mockResolvedValueOnce("trace/current-branch");
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        organizationId: "org-1",
        sessionGroupId: "group-1",
      });
      prismaMock.sessionGroup.update.mockResolvedValueOnce(
        makeSessionGroup({ branch: "trace/current-branch" }),
      );
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        ...makeSessionGroup({ branch: "trace/current-branch" }),
        sessions: [{ agentStatus: "not_started", sessionStatus: "in_progress" }],
      });
      sessionRouterMock.syncLinkedCheckout.mockResolvedValueOnce({
        ok: true,
        error: null,
        errorCode: null,
        status: null,
      });

      await service.syncLinkedCheckout("group-1", "repo-1", "trace/old-branch", "org-1", "user-1", {
        runtimeInstanceId: "runtime-sync",
      });

      expect(sessionRouterMock.inspectSessionCurrentBranch).toHaveBeenCalledWith(
        "runtime-code-key",
        { sessionId: "session-code", workdirHint: workdir },
        1500,
      );
      expect(sessionRouterMock.syncLinkedCheckout).toHaveBeenCalledWith(
        "runtime-sync-key",
        expect.objectContaining({
          branch: "trace/current-branch",
          refreshBeforeSync: true,
        }),
      );
    });

    it("uses the session group runtime over a conflicting session runtime for branch refresh", async () => {
      const workdir = "/tmp/trace/worktrees/session";
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-1" });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        repoId: "repo-1",
        branch: "trace/old-branch",
        workdir,
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-code",
        },
        visibility: "public",
        ownerUserId: "user-1",
        sessions: [
          {
            id: "session-code",
            repoId: "repo-1",
            branch: "trace/old-branch",
            workdir,
            connection: { state: "connected", runtimeInstanceId: "runtime-other" },
          },
        ],
      });
      sessionRouterMock.listRuntimes.mockReturnValue([
        {
          key: "runtime-code-key",
          id: "runtime-code",
          hostingMode: "local",
          organizationId: "org-1",
          ownerUserId: "user-1",
          registeredRepoIds: [],
          ws: { readyState: 1, OPEN: 1 },
        },
        {
          key: "runtime-other-key",
          id: "runtime-other",
          hostingMode: "local",
          organizationId: "org-1",
          ownerUserId: "user-1",
          registeredRepoIds: [],
          ws: { readyState: 1, OPEN: 1 },
        },
        {
          key: "runtime-sync-key",
          id: "runtime-sync",
          hostingMode: "local",
          organizationId: "org-1",
          ownerUserId: "user-1",
          registeredRepoIds: ["repo-1"],
          ws: { readyState: 1, OPEN: 1 },
        },
      ]);
      sessionRouterMock.inspectSessionCurrentBranch.mockResolvedValueOnce("trace/current-branch");
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        organizationId: "org-1",
        sessionGroupId: "group-1",
      });
      prismaMock.sessionGroup.update.mockResolvedValueOnce(
        makeSessionGroup({ branch: "trace/current-branch" }),
      );
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        ...makeSessionGroup({ branch: "trace/current-branch" }),
        sessions: [{ agentStatus: "not_started", sessionStatus: "in_progress" }],
      });
      sessionRouterMock.syncLinkedCheckout.mockResolvedValueOnce({
        ok: true,
        error: null,
        errorCode: null,
        status: null,
      });

      await service.syncLinkedCheckout("group-1", "repo-1", "trace/old-branch", "org-1", "user-1", {
        runtimeInstanceId: "runtime-sync",
      });

      expect(sessionRouterMock.inspectSessionCurrentBranch).toHaveBeenCalledWith(
        "runtime-code-key",
        { sessionId: "session-code", workdirHint: workdir },
        1500,
      );
      expect(sessionRouterMock.inspectSessionCurrentBranch).not.toHaveBeenCalledWith(
        "runtime-other-key",
        expect.anything(),
        expect.anything(),
      );
      expect(sessionRouterMock.syncLinkedCheckout).toHaveBeenCalledWith(
        "runtime-sync-key",
        expect.objectContaining({
          branch: "trace/current-branch",
        }),
      );
    });

    it("refreshes branch from a cloud session group runtime", async () => {
      const workdir = "/tmp/trace/worktrees/session";
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-1" });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        repoId: "repo-1",
        branch: "trace/old-branch",
        workdir,
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-cloud",
        },
        visibility: "public",
        ownerUserId: "user-1",
        sessions: [
          {
            id: "session-code",
            repoId: "repo-1",
            branch: "trace/old-branch",
            workdir,
          },
        ],
      });
      sessionRouterMock.listRuntimes.mockReturnValue([
        {
          key: "runtime-cloud-key",
          id: "runtime-cloud",
          hostingMode: "cloud",
          organizationId: "org-1",
          ownerUserId: "user-1",
          registeredRepoIds: [],
          ws: { readyState: 1, OPEN: 1 },
        },
        {
          key: "runtime-sync-key",
          id: "runtime-sync",
          hostingMode: "local",
          organizationId: "org-1",
          ownerUserId: "user-1",
          registeredRepoIds: ["repo-1"],
          ws: { readyState: 1, OPEN: 1 },
        },
      ]);
      sessionRouterMock.inspectSessionCurrentBranch.mockResolvedValueOnce("trace/current-branch");
      prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
        organizationId: "org-1",
        sessionGroupId: "group-1",
      });
      prismaMock.sessionGroup.update.mockResolvedValueOnce(
        makeSessionGroup({ branch: "trace/current-branch" }),
      );
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        ...makeSessionGroup({ branch: "trace/current-branch" }),
        sessions: [{ agentStatus: "not_started", sessionStatus: "in_progress" }],
      });
      sessionRouterMock.syncLinkedCheckout.mockResolvedValueOnce({
        ok: true,
        error: null,
        errorCode: null,
        status: null,
      });

      await service.syncLinkedCheckout("group-1", "repo-1", "trace/old-branch", "org-1", "user-1", {
        runtimeInstanceId: "runtime-sync",
      });

      expect(sessionRouterMock.inspectSessionCurrentBranch).toHaveBeenCalledWith(
        "runtime-cloud-key",
        { sessionId: "session-code", workdirHint: workdir },
        1500,
      );
      expect(sessionRouterMock.syncLinkedCheckout).toHaveBeenCalledWith(
        "runtime-sync-key",
        expect.objectContaining({
          branch: "trace/current-branch",
        }),
      );
    });

    it("skips branch refresh instead of falling back to a session runtime", async () => {
      const workdir = "/tmp/trace/worktrees/session";
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-1" });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        repoId: "repo-1",
        branch: "trace/stored-branch",
        workdir,
        connection: null,
        visibility: "public",
        ownerUserId: "user-1",
        sessions: [
          {
            id: "session-code",
            repoId: "repo-1",
            branch: "trace/stored-branch",
            workdir,
            connection: { state: "connected", runtimeInstanceId: "runtime-session" },
          },
        ],
      });
      sessionRouterMock.listRuntimes.mockReturnValue([
        {
          key: "runtime-session-key",
          id: "runtime-session",
          hostingMode: "local",
          organizationId: "org-1",
          ownerUserId: "user-1",
          registeredRepoIds: [],
          ws: { readyState: 1, OPEN: 1 },
        },
        {
          key: "runtime-sync-key",
          id: "runtime-sync",
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
        status: null,
      });

      await service.syncLinkedCheckout(
        "group-1",
        "repo-1",
        "trace/stored-branch",
        "org-1",
        "user-1",
        { runtimeInstanceId: "runtime-sync" },
      );

      expect(sessionRouterMock.inspectSessionCurrentBranch).not.toHaveBeenCalled();
      expect(sessionRouterMock.syncLinkedCheckout).toHaveBeenCalledWith(
        "runtime-sync-key",
        expect.objectContaining({
          branch: "trace/stored-branch",
        }),
      );
    });

    it("skips branch refresh when the session group runtime is unavailable", async () => {
      const workdir = "/tmp/trace/worktrees/session";
      prismaMock.repo.findFirst.mockResolvedValueOnce({ id: "repo-1" });
      prismaMock.sessionGroup.findFirst.mockResolvedValueOnce({
        id: "group-1",
        repoId: "repo-1",
        branch: "trace/stored-branch",
        workdir,
        connection: {
          state: "connected",
          runtimeInstanceId: "runtime-code",
        },
        visibility: "public",
        ownerUserId: "user-1",
        sessions: [
          {
            id: "session-code",
            repoId: "repo-1",
            branch: "trace/stored-branch",
            workdir,
            connection: { state: "connected", runtimeInstanceId: "runtime-code" },
          },
        ],
      });
      sessionRouterMock.listRuntimes.mockReturnValue([
        {
          key: "runtime-sync-key",
          id: "runtime-sync",
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
        status: null,
      });

      await service.syncLinkedCheckout(
        "group-1",
        "repo-1",
        "trace/stored-branch",
        "org-1",
        "user-1",
        { runtimeInstanceId: "runtime-sync" },
      );

      expect(sessionRouterMock.inspectSessionCurrentBranch).not.toHaveBeenCalled();
      expect(sessionRouterMock.syncLinkedCheckout).toHaveBeenCalledWith(
        "runtime-sync-key",
        expect.objectContaining({
          branch: "trace/stored-branch",
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
          changedFiles: [],
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
          changedFiles: [],
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
        refreshBeforeSync: false,
        conflictStrategy: "commit",
        commitMessage: "Carry local changes",
      });
    });
  });

  describe("pr lifecycle", () => {
    it("does not emit a duplicate PR-opened event when the group already tracks that PR", async () => {
      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({
        prUrl: "https://github.com/trace/trace/pull/100",
      });

      await service.markPrOpened({
        sessionGroupId: "group-1",
        eventSessionId: "session-1",
        prUrl: "https://github.com/trace/trace/pull/100",
        organizationId: "org-1",
      });

      expect(prismaMock.session.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.sessionGroup.update).not.toHaveBeenCalled();
      expect(eventServiceMock.create).not.toHaveBeenCalled();
    });

    it("routes local bridge PR observations through markPrOpened", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: "session-1",
        hosting: "local",
        organizationId: "org-1",
        connection: { runtimeInstanceId: "runtime-home" },
        sessionGroupId: "group-1",
        sessionGroup: {
          id: "group-1",
          branch: "trace/branch",
          connection: null,
          prUrl: null,
          sessions: [{ id: "session-2" }],
        },
      });
      const markPrOpenedSpy = vi.spyOn(service, "markPrOpened").mockResolvedValue(undefined);
      sessionRouterMock.getRuntime.mockReturnValue({
        id: "runtime-home",
        ownerUserId: "user-1",
      });

      await service.syncPrObservation({
        sessionId: "session-1",
        runtimeInstanceId: "runtime-home",
        organizationId: "org-1",
        ownerUserId: "user-1",
        branch: "trace/branch",
        observedAt: "2026-05-01T00:00:00.000Z",
        pr: {
          url: "https://github.com/trace/trace/pull/100",
          state: "OPEN",
          merged: false,
        },
      });

      expect(markPrOpenedSpy).toHaveBeenCalledWith({
        sessionGroupId: "group-1",
        eventSessionId: "session-2",
        prUrl: "https://github.com/trace/trace/pull/100",
        organizationId: "org-1",
        actorId: "github-bridge-poll",
      });
      expect(prismaMock.sessionGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "group-1" },
          data: expect.objectContaining({
            prSyncObservedAt: new Date("2026-05-01T00:00:00.000Z"),
            prSyncError: null,
          }),
        }),
      );
    });

    it("routes tracked local bridge PR observations through close and merge handlers", async () => {
      prismaMock.session.findUnique
        .mockResolvedValueOnce({
          id: "session-1",
          hosting: "local",
          organizationId: "org-1",
          connection: { runtimeInstanceId: "runtime-home" },
          sessionGroupId: "group-1",
          sessionGroup: {
            id: "group-1",
            branch: "trace/branch",
            connection: null,
            prUrl: "https://github.com/trace/trace/pull/100",
            sessions: [{ id: "session-2" }],
          },
        })
        .mockResolvedValueOnce({
          id: "session-1",
          hosting: "local",
          organizationId: "org-1",
          connection: { runtimeInstanceId: "runtime-home" },
          sessionGroupId: "group-1",
          sessionGroup: {
            id: "group-1",
            branch: "trace/branch",
            connection: null,
            prUrl: "https://github.com/trace/trace/pull/100",
            sessions: [{ id: "session-2" }],
          },
        });
      const markPrClosedSpy = vi.spyOn(service, "markPrClosed").mockResolvedValue(undefined);
      const markPrMergedSpy = vi.spyOn(service, "markPrMerged").mockResolvedValue(undefined);
      sessionRouterMock.getRuntime.mockReturnValue({
        id: "runtime-home",
        ownerUserId: "user-1",
      });

      await service.syncPrObservation({
        sessionId: "session-1",
        runtimeInstanceId: "runtime-home",
        organizationId: "org-1",
        ownerUserId: "user-1",
        branch: "trace/branch",
        observedAt: "2026-05-01T00:00:00.000Z",
        pr: {
          url: "https://github.com/trace/trace/pull/100",
          state: "CLOSED",
          merged: false,
        },
      });

      await service.syncPrObservation({
        sessionId: "session-1",
        runtimeInstanceId: "runtime-home",
        organizationId: "org-1",
        ownerUserId: "user-1",
        branch: "trace/branch",
        observedAt: "2026-05-01T00:01:00.000Z",
        pr: {
          url: "https://github.com/trace/trace/pull/100",
          state: "MERGED",
          merged: true,
        },
      });

      expect(markPrClosedSpy).toHaveBeenCalledWith({
        sessionGroupId: "group-1",
        eventSessionId: "session-2",
        prUrl: "https://github.com/trace/trace/pull/100",
        organizationId: "org-1",
        actorId: "github-bridge-poll",
      });
      expect(markPrMergedSpy).toHaveBeenCalledWith({
        sessionGroupId: "group-1",
        eventSessionId: "session-2",
        prUrl: "https://github.com/trace/trace/pull/100",
        organizationId: "org-1",
        actorId: "github-bridge-poll",
      });
    });

    it("ignores PR observations from the wrong runtime", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: "session-1",
        hosting: "local",
        organizationId: "org-1",
        connection: { runtimeInstanceId: "runtime-home" },
        sessionGroupId: "group-1",
        sessionGroup: {
          id: "group-1",
          branch: "trace/branch",
          connection: null,
          prUrl: null,
          sessions: [{ id: "session-2" }],
        },
      });
      const markPrOpenedSpy = vi.spyOn(service, "markPrOpened").mockResolvedValue(undefined);

      await service.syncPrObservation({
        sessionId: "session-1",
        runtimeInstanceId: "runtime-other",
        organizationId: "org-1",
        ownerUserId: "user-1",
        branch: "trace/branch",
        observedAt: "2026-05-01T00:00:00.000Z",
        pr: {
          url: "https://github.com/trace/trace/pull/100",
          state: "OPEN",
          merged: false,
        },
      });

      expect(markPrOpenedSpy).not.toHaveBeenCalled();
      expect(prismaMock.sessionGroup.update).not.toHaveBeenCalled();
    });

    it("records branch mismatch errors without mutating PR state", async () => {
      prismaMock.session.findUnique.mockResolvedValueOnce({
        id: "session-1",
        hosting: "local",
        organizationId: "org-1",
        connection: { runtimeInstanceId: "runtime-home" },
        sessionGroupId: "group-1",
        sessionGroup: {
          id: "group-1",
          branch: "trace/expected",
          connection: null,
          prUrl: null,
          sessions: [{ id: "session-2" }],
        },
      });
      sessionRouterMock.getRuntime.mockReturnValue({
        id: "runtime-home",
        ownerUserId: "user-1",
      });
      const markPrOpenedSpy = vi.spyOn(service, "markPrOpened").mockResolvedValue(undefined);

      await service.syncPrObservation({
        sessionId: "session-1",
        runtimeInstanceId: "runtime-home",
        organizationId: "org-1",
        ownerUserId: "user-1",
        branch: "trace/actual",
        observedAt: "2026-05-01T00:00:00.000Z",
        pr: {
          url: "https://github.com/trace/trace/pull/100",
          state: "OPEN",
          merged: false,
        },
      });

      expect(markPrOpenedSpy).not.toHaveBeenCalled();
      expect(prismaMock.sessionGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "group-1" },
          data: expect.objectContaining({
            prSyncObservedAt: new Date("2026-05-01T00:00:00.000Z"),
            prSyncError:
              "Observed branch trace/actual does not match tracked branch trace/expected",
          }),
        }),
      );
    });

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
      prismaMock.session.findMany.mockResolvedValueOnce([
        { createdBy: { autoArchiveMergedSessions: true } },
      ]);
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
      prismaMock.session.findMany.mockResolvedValueOnce([
        { createdBy: { autoArchiveMergedSessions: true } },
      ]);
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

    it("keeps the worktree when any contributor has disabled auto-archive", async () => {
      const prUrl = "https://github.com/trace/trace/pull/100";

      prismaMock.sessionGroup.findUnique.mockResolvedValueOnce({ prUrl }).mockResolvedValueOnce({
        ...makeSessionGroup({ prUrl, workdir: "/tmp/trace/workspace", worktreeDeleted: false }),
        sessions: [{ agentStatus: "done", sessionStatus: "merged" }],
      });
      // Two distinct contributors — one opted out is enough to retain the worktree.
      prismaMock.session.findMany.mockResolvedValueOnce([
        { createdBy: { autoArchiveMergedSessions: true } },
        { createdBy: { autoArchiveMergedSessions: false } },
      ]);
      prismaMock.session.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.sessionGroup.update.mockResolvedValue(makeSessionGroup());

      await service.markPrMerged({
        sessionGroupId: "group-1",
        eventSessionId: "session-1",
        prUrl,
        organizationId: "org-1",
      });

      expect(sessionRouterMock.destroyRuntime).not.toHaveBeenCalled();
      expect(terminalRelayMock.destroyAllForSessionGroup).not.toHaveBeenCalled();
      expect(prismaMock.sessionGroup.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.sessionGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ prUrl }),
        }),
      );
      expect(prismaMock.session.updateMany).toHaveBeenCalledTimes(1);
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            sessionStatus: "merged",
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
