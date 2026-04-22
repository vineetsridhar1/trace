import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/terminal-relay.js", () => ({
  terminalRelay: {
    createTerminal: vi.fn().mockReturnValue("term-1"),
    createChannelTerminal: vi.fn().mockReturnValue("term-channel-1"),
    getTerminalsForSession: vi.fn().mockReturnValue([]),
    getTerminalsForSessionGroup: vi.fn().mockReturnValue([]),
    getTerminalsForChannel: vi.fn().mockReturnValue([]),
    getSessionId: vi.fn(),
    getTerminalAuthContext: vi.fn(),
    destroyTerminal: vi.fn(),
  },
}));

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: {
    getRuntimeForSession: vi.fn(),
    getRuntime: vi.fn(),
    isRuntimeAvailable: vi.fn(),
    getLinkedCheckoutStatus: vi.fn(),
  },
}));

vi.mock("./runtime-access.js", () => ({
  runtimeAccessService: {
    assertAccess: vi.fn().mockResolvedValue(undefined),
  },
}));

// Use the real isFullyUnloadedSession — it's a pure function with no side effects
vi.mock("./session.js", async () => {
  const actual = await vi.importActual<typeof import("./session.js")>("./session.js");
  return { isFullyUnloadedSession: actual.isFullyUnloadedSession };
});

import { prisma } from "../lib/db.js";
import { sessionRouter } from "../lib/session-router.js";
import { terminalRelay } from "../lib/terminal-relay.js";
import { runtimeAccessService } from "./runtime-access.js";
import { terminalService } from "./terminal.js";

const prismaMock = prisma as any;
const terminalRelayMock = terminalRelay as any;
const runtimeAccessServiceMock = runtimeAccessService as any;
const sessionRouterMock = sessionRouter as any;

describe("TerminalService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeAccessServiceMock.assertAccess.mockResolvedValue(undefined);
    sessionRouterMock.getRuntimeForSession.mockReturnValue(undefined);
    terminalRelayMock.getTerminalAuthContext.mockReturnValue(null);
  });

  describe("create", () => {
    it("creates a terminal for a valid session", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        sessionGroupId: "group-1",
        hosting: "cloud",
        createdById: "user-1",
        agentStatus: "active",
        sessionStatus: "in_progress",
        connection: { runtimeInstanceId: "runtime-1" },
        sessionGroup: { workdir: "/workspace", worktreeDeleted: false },
      });

      const result = await terminalService.create({
        sessionId: "session-1",
        cols: 80,
        rows: 24,
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(result).toEqual({ id: "term-1", sessionId: "session-1" });
      expect(terminalRelayMock.createTerminal).toHaveBeenCalledWith(
        "session-1",
        "group-1",
        "runtime-1",
        80,
        24,
        "/workspace",
      );
    });

    it("throws when session not found", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce(null);

      await expect(
        terminalService.create({
          sessionId: "missing",
          cols: 80,
          rows: 24,
          organizationId: "org-1",
          userId: "user-1",
        }),
      ).rejects.toThrow("Session not found");
    });

    it("throws when session is fully unloaded", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        sessionGroupId: "group-1",
        hosting: "cloud",
        createdById: "user-1",
        agentStatus: "failed",
        sessionStatus: "in_progress",
        connection: { runtimeInstanceId: "runtime-1" },
        sessionGroup: { workdir: null, worktreeDeleted: false },
      });
      await expect(
        terminalService.create({
          sessionId: "session-1",
          cols: 80,
          rows: 24,
          organizationId: "org-1",
          userId: "user-1",
        }),
      ).rejects.toThrow("Cannot create terminal on a failed session");
    });

    it("throws when worktree is deleted", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        sessionGroupId: "group-1",
        hosting: "cloud",
        createdById: "user-1",
        agentStatus: "active",
        sessionStatus: "in_progress",
        sessionGroup: { workdir: null, worktreeDeleted: true },
      });

      await expect(
        terminalService.create({
          sessionId: "session-1",
          cols: 80,
          rows: 24,
          organizationId: "org-1",
          userId: "user-1",
        }),
      ).rejects.toThrow("Cannot create terminal: session worktree has been deleted");
    });

    it("throws when the setup script is still running", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        sessionGroupId: "group-1",
        hosting: "cloud",
        createdById: "user-1",
        agentStatus: "active",
        sessionStatus: "in_progress",
        sessionGroup: { workdir: "/workspace", worktreeDeleted: false, setupStatus: "running" },
      });

      await expect(
        terminalService.create({
          sessionId: "session-1",
          cols: 80,
          rows: 24,
          organizationId: "org-1",
          userId: "user-1",
        }),
      ).rejects.toThrow("Cannot create terminal while the setup script is still running");
    });

    it("throws when local session is accessed by different user", async () => {
      runtimeAccessServiceMock.assertAccess.mockRejectedValueOnce(
        new Error("Access denied: you do not have permission to use this local bridge"),
      );
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        connection: { runtimeInstanceId: "runtime-1" },
        agentStatus: "active",
        sessionStatus: "in_progress",
        sessionGroup: { workdir: "/workspace", worktreeDeleted: false },
      });

      await expect(
        terminalService.create({
          sessionId: "session-1",
          cols: 80,
          rows: 24,
          organizationId: "org-1",
          userId: "user-2",
        }),
      ).rejects.toThrow("Access denied: you do not have permission to use this local bridge");
    });

    it("allows local session access by the owner", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        connection: { runtimeInstanceId: "runtime-1" },
        agentStatus: "active",
        sessionStatus: "in_progress",
        sessionGroup: { workdir: "/workspace", worktreeDeleted: false },
      });

      const result = await terminalService.create({
        sessionId: "session-1",
        cols: 80,
        rows: 24,
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(result).toEqual({ id: "term-1", sessionId: "session-1" });
    });

    it("passes undefined workdir when session has no workdir", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        sessionGroupId: "group-1",
        hosting: "cloud",
        createdById: "user-1",
        agentStatus: "active",
        sessionStatus: "in_progress",
        connection: { runtimeInstanceId: "runtime-1" },
        sessionGroup: { workdir: null, worktreeDeleted: false },
      });

      await terminalService.create({
        sessionId: "session-1",
        cols: 120,
        rows: 40,
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(terminalRelayMock.createTerminal).toHaveBeenCalledWith(
        "session-1",
        "group-1",
        "runtime-1",
        120,
        40,
        undefined,
      );
    });

    it("throws when session has no bound runtime", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        connection: null,
        agentStatus: "active",
        sessionStatus: "in_progress",
        sessionGroup: { workdir: "/workspace", worktreeDeleted: false, connection: null },
      });
      sessionRouterMock.getRuntimeForSession.mockReturnValue(undefined);

      await expect(
        terminalService.create({
          sessionId: "session-1",
          cols: 80,
          rows: 24,
          organizationId: "org-1",
          userId: "user-1",
        }),
      ).rejects.toThrow("Cannot open terminal: this session is not connected to a runtime");
    });

    it("falls back to session group runtime when session has no connection", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        connection: null,
        agentStatus: "active",
        sessionStatus: "in_progress",
        sessionGroup: {
          workdir: "/workspace",
          worktreeDeleted: false,
          connection: { runtimeInstanceId: "group-runtime" },
        },
      });

      await terminalService.create({
        sessionId: "session-1",
        cols: 80,
        rows: 24,
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(runtimeAccessServiceMock.assertAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          runtimeInstanceId: "group-runtime",
          capability: "terminal",
        }),
      );
    });

    it("passes capability=terminal to runtimeAccessService.assertAccess", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        connection: { runtimeInstanceId: "runtime-1" },
        agentStatus: "active",
        sessionStatus: "in_progress",
        sessionGroup: { workdir: "/workspace", worktreeDeleted: false },
      });

      await terminalService.create({
        sessionId: "session-1",
        cols: 80,
        rows: 24,
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(runtimeAccessServiceMock.assertAccess).toHaveBeenCalledWith(
        expect.objectContaining({ capability: "terminal" }),
      );
    });

    it("allows cloud session access by any user", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        sessionGroupId: "group-1",
        hosting: "cloud",
        createdById: "user-1",
        agentStatus: "active",
        sessionStatus: "in_progress",
        connection: { runtimeInstanceId: "runtime-1" },
        sessionGroup: { workdir: "/workspace", worktreeDeleted: false },
      });

      const result = await terminalService.create({
        sessionId: "session-1",
        cols: 80,
        rows: 24,
        organizationId: "org-1",
        userId: "user-2",
      });

      expect(result).toEqual({ id: "term-1", sessionId: "session-1" });
    });
  });

  describe("listForSession", () => {
    it("lists terminals for a valid session", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        sessionGroupId: "group-1",
        hosting: "cloud",
        createdById: "user-1",
        connection: { runtimeInstanceId: "runtime-1" },
      });
      terminalRelayMock.getTerminalsForSessionGroup.mockReturnValueOnce(["term-1", "term-2"]);
      terminalRelayMock.getSessionId.mockImplementation((terminalId: string) => {
        if (terminalId === "term-1") return "session-1";
        if (terminalId === "term-2") return "session-2";
        return undefined;
      });
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          hosting: "cloud",
          createdById: "user-1",
          connection: { runtimeInstanceId: "runtime-1" },
        },
        {
          id: "session-2",
          hosting: "cloud",
          createdById: "user-2",
          connection: { runtimeInstanceId: "runtime-1" },
        },
      ]);

      const result = await terminalService.listForSession({
        sessionId: "session-1",
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(result).toEqual([
        { id: "term-1", sessionId: "session-1" },
        { id: "term-2", sessionId: "session-2" },
      ]);
    });

    it("throws when session not found", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce(null);

      await expect(
        terminalService.listForSession({
          sessionId: "missing",
          organizationId: "org-1",
          userId: "user-1",
        }),
      ).rejects.toThrow("Session not found");
    });

    it("throws when local session accessed by wrong user", async () => {
      runtimeAccessServiceMock.assertAccess.mockRejectedValueOnce(
        new Error("Access denied: you do not have permission to use this local bridge"),
      );
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        sessionGroupId: "group-1",
        hosting: "local",
        createdById: "user-1",
        connection: { runtimeInstanceId: "runtime-1" },
      });

      await expect(
        terminalService.listForSession({
          sessionId: "session-1",
          organizationId: "org-1",
          userId: "user-2",
        }),
      ).rejects.toThrow("Access denied");
    });

    it("returns empty array when no terminals exist", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        sessionGroupId: "group-1",
        hosting: "cloud",
        createdById: "user-1",
      });
      terminalRelayMock.getTerminalsForSessionGroup.mockReturnValueOnce([]);

      const result = await terminalService.listForSession({
        sessionId: "session-1",
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(result).toEqual([]);
    });

    it("returns [] when no runtime resolves for the session (fail closed)", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        sessionGroupId: "group-1",
        connection: null,
        sessionGroup: { connection: null },
      });

      const result = await terminalService.listForSession({
        sessionId: "session-1",
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(result).toEqual([]);
      expect(runtimeAccessServiceMock.assertAccess).not.toHaveBeenCalled();
    });

    it("filters out local terminals owned by a different user in the same group", async () => {
      // mockResolvedValueOnce queues persist across tests (vi.clearAllMocks
      // only clears call history). Use mockImplementation (not -Once) so the
      // implementation doesn't get consumed by a leftover queued value from a
      // previous `it` block.
      prismaMock.session.findFirst.mockReset();
      prismaMock.session.findMany.mockReset();
      terminalRelayMock.getTerminalsForSessionGroup.mockReset();
      terminalRelayMock.getSessionId.mockReset();
      prismaMock.session.findFirst.mockImplementation(() =>
        Promise.resolve({
          id: "session-1",
          organizationId: "org-1",
          sessionGroupId: "group-1",
          hosting: "cloud",
          createdById: "user-1",
          connection: { runtimeInstanceId: "runtime-1" },
          sessionGroup: { connection: null },
        }),
      );
      terminalRelayMock.getTerminalsForSessionGroup.mockReturnValueOnce(["term-1", "term-2"]);
      terminalRelayMock.getSessionId.mockImplementation((terminalId: string) => {
        if (terminalId === "term-1") return "session-1";
        if (terminalId === "term-2") return "session-2";
        return undefined;
      });
      prismaMock.session.findMany.mockImplementation(() =>
        Promise.resolve([
          {
            id: "session-1",
            organizationId: "org-1",
            sessionGroupId: "group-1",
            connection: { runtimeInstanceId: "runtime-1" },
            sessionGroup: { connection: null },
          },
          {
            id: "session-2",
            organizationId: "org-1",
            sessionGroupId: "group-1",
            connection: { runtimeInstanceId: "runtime-2" },
            sessionGroup: { connection: null },
          },
        ]),
      );
      // user-1 allowed on their own session-1 runtime; denied on session-2's local bridge.
      runtimeAccessServiceMock.assertAccess.mockReset();
      runtimeAccessServiceMock.assertAccess.mockImplementation(
        (input: { runtimeInstanceId: string }) => {
          if (input.runtimeInstanceId === "runtime-2") {
            return Promise.reject(new Error("Access denied"));
          }
          return Promise.resolve(undefined);
        },
      );

      const result = await terminalService.listForSession({
        sessionId: "session-1",
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(result).toEqual([{ id: "term-1", sessionId: "session-1" }]);
    });
  });

  describe("destroy", () => {
    it("destroys a terminal successfully", async () => {
      terminalRelayMock.getTerminalAuthContext.mockReturnValueOnce({
        kind: "session",
        sessionId: "session-1",
        sessionGroupId: "group-1",
        runtimeInstanceId: "runtime-1",
      });
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        connection: { runtimeInstanceId: "runtime-1" },
        sessionGroup: { connection: null },
      });

      const result = await terminalService.destroy({
        terminalId: "term-1",
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(result).toBe(true);
      expect(terminalRelayMock.destroyTerminal).toHaveBeenCalledWith("term-1");
    });

    it("returns true when terminal already gone (no-op)", async () => {
      terminalRelayMock.getTerminalAuthContext.mockReturnValueOnce(null);

      const result = await terminalService.destroy({
        terminalId: "term-gone",
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(result).toBe(true);
      expect(terminalRelayMock.destroyTerminal).not.toHaveBeenCalled();
    });

    it("throws when session not found for terminal", async () => {
      terminalRelayMock.getTerminalAuthContext.mockReturnValueOnce({
        kind: "session",
        sessionId: "session-1",
        sessionGroupId: "group-1",
        runtimeInstanceId: "runtime-1",
      });
      prismaMock.session.findFirst.mockResolvedValueOnce(null);

      await expect(
        terminalService.destroy({
          terminalId: "term-1",
          organizationId: "org-1",
          userId: "user-1",
        }),
      ).rejects.toThrow("Terminal not found");
    });

    it("no-ops fail-closed when no runtime resolves", async () => {
      terminalRelayMock.getTerminalAuthContext.mockReturnValueOnce({
        kind: "session",
        sessionId: "session-1",
        sessionGroupId: "group-1",
        runtimeInstanceId: "runtime-1",
      });
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        connection: null,
        sessionGroup: { connection: null },
      });

      const result = await terminalService.destroy({
        terminalId: "term-1",
        organizationId: "org-1",
        userId: "user-1",
      });
      expect(result).toBe(true);
      expect(terminalRelayMock.destroyTerminal).not.toHaveBeenCalled();
    });

    it("throws when local session accessed by wrong user", async () => {
      runtimeAccessServiceMock.assertAccess.mockRejectedValueOnce(
        new Error("Access denied: you do not have permission to use this local bridge"),
      );
      terminalRelayMock.getTerminalAuthContext.mockReturnValueOnce({
        kind: "session",
        sessionId: "session-1",
        sessionGroupId: "group-1",
        runtimeInstanceId: "runtime-1",
      });
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        connection: { runtimeInstanceId: "runtime-1" },
        sessionGroup: { connection: null },
      });

      await expect(
        terminalService.destroy({
          terminalId: "term-1",
          organizationId: "org-1",
          userId: "user-2",
        }),
      ).rejects.toThrow("Access denied");
    });
  });

  describe("createForChannel", () => {
    const baseChannelSetup = () => {
      prismaMock.channel.findFirst.mockResolvedValueOnce({
        id: "channel-1",
        repoId: "repo-1",
      });
      prismaMock.bridgeRuntime.findFirst.mockResolvedValueOnce({
        instanceId: "runtime-1",
      });
      sessionRouterMock.getRuntime.mockReturnValue({
        id: "runtime-1",
        organizationId: "org-1",
        hostingMode: "local",
        registeredRepoIds: ["repo-1"],
      });
      sessionRouterMock.isRuntimeAvailable.mockReturnValue(true);
      sessionRouterMock.getLinkedCheckoutStatus.mockResolvedValue({
        repoPath: "/home/user/projects/my-repo",
      });
    };

    it("creates a channel terminal at the repo path", async () => {
      baseChannelSetup();

      const result = await terminalService.createForChannel({
        channelId: "channel-1",
        bridgeRuntimeId: "bridge-1",
        cols: 80,
        rows: 24,
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(result).toEqual({ id: "term-channel-1", sessionId: "channel-1" });
      expect(terminalRelayMock.createChannelTerminal).toHaveBeenCalledWith(
        "channel-1",
        "org-1",
        "repo-1",
        "runtime-1",
        80,
        24,
        "/home/user/projects/my-repo",
      );
    });

    it("throws when channel is not found or user is not a member", async () => {
      prismaMock.channel.findFirst.mockResolvedValueOnce(null);

      await expect(
        terminalService.createForChannel({
          channelId: "missing",
          bridgeRuntimeId: "bridge-1",
          cols: 80,
          rows: 24,
          organizationId: "org-1",
          userId: "user-1",
        }),
      ).rejects.toThrow("Channel not found");
    });

    it("throws when repo is not linked on the bridge", async () => {
      prismaMock.channel.findFirst.mockResolvedValueOnce({
        id: "channel-1",
        repoId: "repo-1",
      });
      prismaMock.bridgeRuntime.findFirst.mockResolvedValueOnce({
        instanceId: "runtime-1",
      });
      sessionRouterMock.getRuntime.mockReturnValue({
        id: "runtime-1",
        organizationId: "org-1",
        hostingMode: "local",
        registeredRepoIds: [], // repo-1 not registered
      });
      sessionRouterMock.isRuntimeAvailable.mockReturnValue(true);

      await expect(
        terminalService.createForChannel({
          channelId: "channel-1",
          bridgeRuntimeId: "bridge-1",
          cols: 80,
          rows: 24,
          organizationId: "org-1",
          userId: "user-1",
        }),
      ).rejects.toThrow("Repo is not linked on this bridge");
    });

    it("throws when access is denied (no terminal capability)", async () => {
      prismaMock.channel.findFirst.mockResolvedValueOnce({
        id: "channel-1",
        repoId: "repo-1",
      });
      prismaMock.bridgeRuntime.findFirst.mockResolvedValueOnce({
        instanceId: "runtime-1",
      });
      sessionRouterMock.getRuntime.mockReturnValue({
        id: "runtime-1",
        organizationId: "org-1",
        hostingMode: "local",
        registeredRepoIds: ["repo-1"],
      });
      sessionRouterMock.isRuntimeAvailable.mockReturnValue(true);
      runtimeAccessServiceMock.assertAccess.mockRejectedValueOnce(
        new Error("Access denied: you do not have permission to use this local bridge"),
      );

      await expect(
        terminalService.createForChannel({
          channelId: "channel-1",
          bridgeRuntimeId: "bridge-1",
          cols: 80,
          rows: 24,
          organizationId: "org-1",
          userId: "user-2",
        }),
      ).rejects.toThrow("Access denied");
    });

    it("throws when bridge has no repoPath for the linked checkout", async () => {
      prismaMock.channel.findFirst.mockResolvedValueOnce({
        id: "channel-1",
        repoId: "repo-1",
      });
      prismaMock.bridgeRuntime.findFirst.mockResolvedValueOnce({
        instanceId: "runtime-1",
      });
      sessionRouterMock.getRuntime.mockReturnValue({
        id: "runtime-1",
        organizationId: "org-1",
        hostingMode: "local",
        registeredRepoIds: ["repo-1"],
      });
      sessionRouterMock.isRuntimeAvailable.mockReturnValue(true);
      sessionRouterMock.getLinkedCheckoutStatus.mockResolvedValue({ repoPath: null });

      await expect(
        terminalService.createForChannel({
          channelId: "channel-1",
          bridgeRuntimeId: "bridge-1",
          cols: 80,
          rows: 24,
          organizationId: "org-1",
          userId: "user-1",
        }),
      ).rejects.toThrow("Repo is not linked on this bridge");
    });
  });

  describe("listForChannel", () => {
    it("returns terminals for a valid channel+bridge pair", async () => {
      prismaMock.channel.findFirst.mockResolvedValueOnce({
        id: "channel-1",
        repoId: "repo-1",
      });
      prismaMock.bridgeRuntime.findFirst.mockResolvedValueOnce({
        instanceId: "runtime-1",
      });
      sessionRouterMock.getRuntime.mockReturnValue({
        id: "runtime-1",
        organizationId: "org-1",
        hostingMode: "local",
        registeredRepoIds: ["repo-1"],
      });
      sessionRouterMock.isRuntimeAvailable.mockReturnValue(true);
      terminalRelayMock.getTerminalsForChannel.mockReturnValueOnce(["term-a", "term-b"]);

      const result = await terminalService.listForChannel({
        channelId: "channel-1",
        bridgeRuntimeId: "bridge-1",
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(result).toEqual([
        { id: "term-a", sessionId: "channel-1" },
        { id: "term-b", sessionId: "channel-1" },
      ]);
    });

    it("returns empty array when no terminals exist for the channel", async () => {
      prismaMock.channel.findFirst.mockResolvedValueOnce({
        id: "channel-1",
        repoId: "repo-1",
      });
      prismaMock.bridgeRuntime.findFirst.mockResolvedValueOnce({
        instanceId: "runtime-1",
      });
      sessionRouterMock.getRuntime.mockReturnValue({
        id: "runtime-1",
        organizationId: "org-1",
        hostingMode: "local",
        registeredRepoIds: ["repo-1"],
      });
      sessionRouterMock.isRuntimeAvailable.mockReturnValue(true);
      terminalRelayMock.getTerminalsForChannel.mockReturnValueOnce([]);

      const result = await terminalService.listForChannel({
        channelId: "channel-1",
        bridgeRuntimeId: "bridge-1",
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(result).toEqual([]);
    });
  });
});
