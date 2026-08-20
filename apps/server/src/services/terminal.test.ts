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
    getTerminalAuthContextDistributed: vi.fn(),
    getTerminalState: vi.fn(),
    destroyTerminal: vi.fn(),
    destroyTerminalDistributed: vi.fn(),
    captureTerminalDistributed: vi.fn(),
    sendInputDistributed: vi.fn(),
    resizeTerminalDistributed: vi.fn(),
  },
}));

vi.mock("../lib/terminal-directory.js", () => ({
  terminalDirectory: {
    listForScope: vi.fn().mockResolvedValue([]),
    remove: vi.fn(),
  },
}));

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: {
    getRuntimeForSession: vi.fn(),
    getRuntime: vi.fn(),
    getRuntimeMetadata: vi.fn(),
    isRuntimeAvailable: vi.fn(),
    getLinkedCheckoutStatus: vi.fn(),
  },
}));

vi.mock("./runtime-access.js", () => ({
  runtimeAccessService: {
    assertAccess: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn().mockResolvedValue({
      id: "event-1",
      scopeType: "session",
      scopeId: "session-1",
    }),
  },
}));

vi.mock("./session.js", () => {
  return {
    isFullyUnloadedSession: (
      agentStatus: string,
      sessionStatus: string,
      worktreeDeleted?: boolean | null,
    ) =>
      agentStatus === "failed" ||
      agentStatus === "stopped" ||
      (sessionStatus === "merged" && worktreeDeleted !== false),
  };
});

import { prisma } from "../lib/db.js";
import { sessionRouter } from "../lib/session-router.js";
import { terminalDirectory } from "../lib/terminal-directory.js";
import { terminalRelay } from "../lib/terminal-relay.js";
import { runtimeAccessService } from "./runtime-access.js";
import { terminalService } from "./terminal.js";
import { eventService } from "./event.js";

const prismaMock = prisma as any;
const terminalRelayMock = terminalRelay as any;
const terminalDirectoryMock = terminalDirectory as any;
const runtimeAccessServiceMock = runtimeAccessService as any;
const sessionRouterMock = sessionRouter as any;
const eventServiceMock = eventService as any;

describe("TerminalService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeAccessServiceMock.assertAccess.mockResolvedValue(undefined);
    sessionRouterMock.getRuntimeForSession.mockReturnValue(undefined);
    sessionRouterMock.getRuntimeMetadata.mockImplementation((...args: unknown[]) =>
      sessionRouterMock.getRuntime(...args),
    );
    terminalRelayMock.getTerminalAuthContext.mockImplementation((terminalId: string) => ({
      kind: "session",
      sessionId: terminalRelayMock.getSessionId(terminalId) ?? "session-1",
      sessionGroupId: "group-1",
      runtimeInstanceId: "runtime-1",
      ownerUserId: "user-1",
    }));
    terminalRelayMock.getTerminalAuthContextDistributed.mockImplementation((terminalId: string) =>
      Promise.resolve(terminalRelayMock.getTerminalAuthContext(terminalId)),
    );
    terminalRelayMock.getTerminalState.mockImplementation((terminalId: string) => ({
      id: terminalId,
      sessionId: terminalRelayMock.getSessionId(terminalId) ?? "session-1",
    }));
    terminalRelayMock.captureTerminalDistributed.mockResolvedValue({
      output: "hi",
      byteCount: 2,
      truncated: false,
      closed: false,
      connected: true,
    });
    terminalRelayMock.sendInputDistributed.mockResolvedValue(true);
    terminalRelayMock.resizeTerminalDistributed.mockResolvedValue(true);
    terminalDirectoryMock.listForScope.mockResolvedValue([]);
    terminalRelayMock.destroyTerminalDistributed.mockImplementation((terminalId: string) => {
      terminalRelayMock.destroyTerminal(terminalId);
      return Promise.resolve();
    });
  });

  describe("create", () => {
    it("creates a terminal for a valid session", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
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
        clientMutationId: "request-1",
        openInWorkspace: true,
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(result).toEqual({ id: "term-1", sessionId: "session-1" });
      expect(terminalRelayMock.createTerminal).toHaveBeenCalledWith(
        "session-1",
        "group-1",
        "org-1",
        "runtime-1",
        "user-1",
        80,
        24,
        "/workspace",
      );
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "terminal_created",
          payload: expect.objectContaining({
            clientMutationId: "request-1",
            openInWorkspace: true,
            targetUserId: "user-1",
          }),
        }),
      );
    });

    it("uses the session group's bridge when a legacy session binding is stale", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        agentStatus: "active",
        sessionStatus: "in_progress",
        connection: { runtimeInstanceId: "runtime-old" },
        sessionGroup: {
          workdir: "/workspace",
          worktreeDeleted: false,
          connection: { runtimeInstanceId: "runtime-current" },
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
        expect.objectContaining({ runtimeInstanceId: "runtime-current" }),
      );
      expect(terminalRelayMock.createTerminal).toHaveBeenCalledWith(
        "session-1",
        "group-1",
        "org-1",
        "runtime-current",
        "user-1",
        80,
        24,
        "/workspace",
      );
    });

    it("rejects terminal creation for private sessions owned by another user", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        hosting: "local",
        createdById: "owner-1",
        agentStatus: "active",
        sessionStatus: "in_progress",
        connection: { runtimeInstanceId: "runtime-1" },
        sessionGroup: {
          workdir: "/workspace",
          worktreeDeleted: false,
          setupStatus: "idle",
          connection: { runtimeInstanceId: "runtime-1" },
          visibility: "private",
          ownerUserId: "owner-1",
        },
      });

      await expect(
        terminalService.create({
          sessionId: "session-1",
          cols: 80,
          rows: 24,
          organizationId: "org-1",
          userId: "user-2",
        }),
      ).rejects.toThrow("Not authorized for this session");

      expect(runtimeAccessServiceMock.assertAccess).not.toHaveBeenCalled();
      expect(terminalRelayMock.createTerminal).not.toHaveBeenCalled();
    });

    it("creates a terminal for a merged session with a retained worktree", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        hosting: "cloud",
        createdById: "user-1",
        agentStatus: "done",
        sessionStatus: "merged",
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
        "org-1",
        "runtime-1",
        "user-1",
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
        organizationId: "org-1",
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
        organizationId: "org-1",
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
        organizationId: "org-1",
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
        organizationId: "org-1",
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
        "org-1",
        "runtime-1",
        "user-1",
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

    it("lists terminals owned by another replica", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        sessionGroupId: "group-1",
        hosting: "cloud",
        createdById: "user-1",
        connection: { runtimeInstanceId: "runtime-1" },
      });
      terminalRelayMock.getTerminalsForSessionGroup.mockReturnValueOnce([]);
      terminalDirectoryMock.listForScope.mockResolvedValueOnce([
        {
          terminalId: "term-remote",
          frontendReplicaId: "replica-other",
          kind: "session",
          sessionId: "session-1",
          sessionGroupId: "group-1",
          ownerUserId: "user-1",
          runtimeInstanceId: "runtime-1",
          organizationId: "org-1",
          cols: 120,
          rows: 40,
        },
        {
          terminalId: "term-other-user",
          frontendReplicaId: "replica-other",
          kind: "session",
          sessionId: "session-1",
          sessionGroupId: "group-1",
          ownerUserId: "user-2",
          runtimeInstanceId: "runtime-1",
          organizationId: "org-1",
        },
      ]);
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          hosting: "cloud",
          createdById: "user-1",
          connection: { runtimeInstanceId: "runtime-1" },
        },
      ]);
      sessionRouterMock.isRuntimeAvailable.mockReturnValue(true);

      const result = await terminalService.listForSession({
        sessionId: "session-1",
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(result).toEqual([
        {
          id: "term-remote",
          sessionId: "session-1",
          status: "ready",
          cols: 120,
          rows: 40,
          connected: true,
          closed: false,
        },
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

    it("does not list terminals created by another user", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        connection: { runtimeInstanceId: "runtime-1" },
        sessionGroup: { connection: null },
      });
      terminalRelayMock.getTerminalsForSessionGroup.mockReturnValueOnce(["term-1", "term-2"]);
      terminalRelayMock.getSessionId.mockImplementation((terminalId: string) => {
        if (terminalId === "term-1") return "session-1";
        if (terminalId === "term-2") return "session-2";
        return undefined;
      });
      terminalRelayMock.getTerminalAuthContext.mockImplementation((terminalId: string) => ({
        kind: "session",
        sessionId: terminalRelayMock.getSessionId(terminalId) ?? "session-1",
        sessionGroupId: "group-1",
        runtimeInstanceId: "runtime-1",
        ownerUserId: terminalId === "term-1" ? "user-1" : "user-2",
      }));
      prismaMock.session.findMany.mockResolvedValueOnce([
        {
          id: "session-1",
          organizationId: "org-1",
          sessionGroupId: "group-1",
          connection: { runtimeInstanceId: "runtime-1" },
          sessionGroup: { connection: null },
        },
      ]);

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
        ownerUserId: "user-1",
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
        ownerUserId: "user-1",
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

    it("still converges the close when no runtime resolves", async () => {
      terminalRelayMock.getTerminalAuthContext.mockReturnValueOnce({
        kind: "session",
        sessionId: "session-1",
        sessionGroupId: "group-1",
        runtimeInstanceId: "runtime-1",
        ownerUserId: "user-1",
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

      // There is no reachable PTY to kill, but the relay entry and the routing
      // record still have to go — otherwise the tab keeps coming back.
      expect(result).toBe(true);
      expect(terminalRelayMock.destroyTerminalDistributed).toHaveBeenCalledWith("term-1");
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "terminal_destroyed" }),
      );
    });

    it("removes the directory entry when the owning replica cannot be reached", async () => {
      terminalRelayMock.getTerminalAuthContext.mockReturnValueOnce({
        kind: "session",
        sessionId: "session-1",
        sessionGroupId: "group-1",
        runtimeInstanceId: "runtime-1",
        ownerUserId: "user-1",
      });
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        connection: null,
        sessionGroup: { connection: null },
      });
      terminalRelayMock.destroyTerminalDistributed.mockRejectedValueOnce(
        new Error("Terminal owning replica unavailable"),
      );

      await expect(
        terminalService.destroy({
          terminalId: "term-1",
          organizationId: "org-1",
          userId: "user-1",
        }),
      ).resolves.toBe(true);

      expect(terminalDirectoryMock.remove).toHaveBeenCalledWith("term-1");
      expect(eventServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "terminal_destroyed" }),
      );
    });

    it("converges a channel terminal close when the owning replica cannot be reached", async () => {
      terminalRelayMock.getTerminalAuthContext.mockReturnValueOnce({
        kind: "channel",
        channelId: "channel-1",
        organizationId: "org-1",
        repoId: "repo-1",
        runtimeInstanceId: "runtime-1",
        ownerUserId: "user-1",
      });
      prismaMock.channel.findFirst.mockResolvedValueOnce({ organizationId: "org-1" });
      terminalRelayMock.destroyTerminalDistributed.mockRejectedValueOnce(
        new Error("Terminal owning replica unavailable"),
      );

      // Channel terminals close through the same path as session terminals, so
      // an unreachable owner must not throw out of the mutation and leave the
      // routing record behind.
      await expect(
        terminalService.destroy({
          terminalId: "term-1",
          organizationId: "org-1",
          userId: "user-1",
        }),
      ).resolves.toBe(true);
      expect(terminalDirectoryMock.remove).toHaveBeenCalledWith("term-1");
    });

    it("refuses to destroy a terminal in a group the caller cannot view", async () => {
      terminalRelayMock.getTerminalAuthContext.mockReturnValueOnce({
        kind: "session",
        sessionId: "session-1",
        sessionGroupId: "group-1",
        runtimeInstanceId: "runtime-1",
        ownerUserId: "user-1",
      });
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        connection: { runtimeInstanceId: "runtime-1" },
        sessionGroup: { connection: null, visibility: "private", ownerUserId: "user-2" },
      });

      await expect(
        terminalService.destroy({
          terminalId: "term-1",
          organizationId: "org-1",
          userId: "user-1",
        }),
      ).rejects.toThrow("Terminal not found");
      expect(terminalRelayMock.destroyTerminalDistributed).not.toHaveBeenCalled();
    });

    it("throws when local session accessed by wrong user", async () => {
      terminalRelayMock.getTerminalAuthContext.mockReturnValueOnce({
        kind: "session",
        sessionId: "session-1",
        sessionGroupId: "group-1",
        runtimeInstanceId: "runtime-1",
        ownerUserId: "user-1",
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
      ).rejects.toThrow("Terminal not found");
    });

    it("does not destroy a terminal created by another user", async () => {
      terminalRelayMock.getTerminalAuthContext.mockReturnValueOnce({
        kind: "session",
        sessionId: "session-1",
        sessionGroupId: "group-1",
        runtimeInstanceId: "runtime-1",
        ownerUserId: "user-2",
      });

      await expect(
        terminalService.destroy({
          terminalId: "term-1",
          organizationId: "org-1",
          userId: "user-1",
        }),
      ).rejects.toThrow("Terminal not found");
      expect(terminalRelayMock.destroyTerminal).not.toHaveBeenCalled();
    });
  });

  describe("terminal operations across replicas", () => {
    const ownedTerminal = () => {
      terminalRelayMock.getTerminalAuthContextDistributed.mockResolvedValueOnce({
        kind: "session",
        sessionId: "session-1",
        sessionGroupId: "group-1",
        runtimeInstanceId: "runtime-1",
        ownerUserId: "user-1",
      });
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        connection: { runtimeInstanceId: "runtime-1" },
        sessionGroup: { connection: null },
      });
    };

    it("captures, writes and resizes through the distributed path", async () => {
      ownedTerminal();
      await expect(
        terminalService.capture({
          terminalId: "term-1",
          organizationId: "org-1",
          userId: "user-1",
        }),
      ).resolves.toMatchObject({ output: "hi" });
      expect(terminalRelayMock.captureTerminalDistributed).toHaveBeenCalledWith(
        "term-1",
        50 * 1024,
      );

      ownedTerminal();
      await terminalService.sendInput({
        terminalId: "term-1",
        data: "ls",
        organizationId: "org-1",
        userId: "user-1",
      });
      expect(terminalRelayMock.sendInputDistributed).toHaveBeenCalledWith("term-1", "ls");

      ownedTerminal();
      await terminalService.resize({
        terminalId: "term-1",
        cols: 120,
        rows: 40,
        organizationId: "org-1",
        userId: "user-1",
      });
      expect(terminalRelayMock.resizeTerminalDistributed).toHaveBeenCalledWith("term-1", 120, 40);
    });

    it("propagates a closed terminal instead of reporting success", async () => {
      ownedTerminal();
      terminalRelayMock.sendInputDistributed.mockRejectedValueOnce(new Error("Terminal is closed"));

      await expect(
        terminalService.sendInput({
          terminalId: "term-1",
          data: "ls",
          organizationId: "org-1",
          userId: "user-1",
        }),
      ).rejects.toThrow("Terminal is closed");
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
        "user-1",
        80,
        24,
        "/home/user/projects/my-repo",
      );
      expect(prismaMock.channel.findFirst).toHaveBeenCalledWith({
        where: {
          id: "channel-1",
          organizationId: "org-1",
          type: "coding",
          members: { some: { userId: "user-1", leftAt: null } },
        },
        select: { id: true, repoId: true },
      });
    });

    it("creates a channel terminal when another replica owns the bridge", async () => {
      baseChannelSetup();
      sessionRouterMock.getRuntime.mockReturnValue(null);
      sessionRouterMock.getRuntimeMetadata.mockReturnValue({
        key: "org-1:runtime-1",
        id: "runtime-1",
        organizationId: "org-1",
        hostingMode: "local",
        registeredRepoIds: ["repo-1"],
      });

      await expect(
        terminalService.createForChannel({
          channelId: "channel-1",
          bridgeRuntimeId: "bridge-1",
          cols: 80,
          rows: 24,
          organizationId: "org-1",
          userId: "user-1",
        }),
      ).resolves.toEqual({ id: "term-channel-1", sessionId: "channel-1" });

      expect(sessionRouterMock.getLinkedCheckoutStatus).toHaveBeenCalledWith(
        "org-1:runtime-1",
        "repo-1",
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

    it("includes channel terminals held by another replica, pinned to the runtime", async () => {
      prismaMock.channel.findFirst.mockResolvedValueOnce({ id: "channel-1", repoId: "repo-1" });
      prismaMock.bridgeRuntime.findFirst.mockResolvedValueOnce({ instanceId: "runtime-1" });
      sessionRouterMock.getRuntime.mockReturnValue({
        id: "runtime-1",
        organizationId: "org-1",
        hostingMode: "local",
        registeredRepoIds: ["repo-1"],
      });
      sessionRouterMock.isRuntimeAvailable.mockReturnValue(true);
      terminalRelayMock.getTerminalsForChannel.mockReturnValueOnce([]);
      terminalDirectoryMock.listForScope.mockResolvedValueOnce([
        {
          terminalId: "term-remote",
          frontendReplicaId: "replica-other",
          kind: "channel",
          sessionId: "channel:channel-1",
          sessionGroupId: null,
          channelId: "channel-1",
          ownerUserId: "user-1",
          runtimeInstanceId: "runtime-1",
          organizationId: "org-1",
        },
        {
          // Same channel, different bridge — must not leak across runtimes.
          terminalId: "term-other-runtime",
          frontendReplicaId: "replica-other",
          kind: "channel",
          sessionId: "channel:channel-1",
          sessionGroupId: null,
          channelId: "channel-1",
          ownerUserId: "user-1",
          runtimeInstanceId: "runtime-2",
          organizationId: "org-1",
        },
      ]);

      const result = await terminalService.listForChannel({
        channelId: "channel-1",
        bridgeRuntimeId: "bridge-1",
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(result).toEqual([{ id: "term-remote", sessionId: "channel-1" }]);
      expect(terminalDirectoryMock.listForScope).toHaveBeenCalledWith({
        kind: "channel",
        id: "channel-1",
      });
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
