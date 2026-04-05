import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/terminal-relay.js", () => ({
  terminalRelay: {
    createTerminal: vi.fn().mockReturnValue("term-1"),
    getTerminalsForSession: vi.fn().mockReturnValue([]),
    getTerminalsForSessionGroup: vi.fn().mockReturnValue([]),
    getSessionId: vi.fn(),
    destroyTerminal: vi.fn(),
  },
}));

// Use the real isFullyUnloadedSession — it's a pure function with no side effects
vi.mock("./session.js", async () => {
  const actual = await vi.importActual<typeof import("./session.js")>("./session.js");
  return { isFullyUnloadedSession: actual.isFullyUnloadedSession };
});

import { prisma } from "../lib/db.js";
import { terminalRelay } from "../lib/terminal-relay.js";
import { terminalService } from "./terminal.js";

const prismaMock = prisma as any;
const terminalRelayMock = terminalRelay as any;

describe("TerminalService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        sessionGroupId: "group-1",
        hosting: "local",
        createdById: "user-1",
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
      ).rejects.toThrow("Access denied: you can only access terminals on your own local sessions");
    });

    it("allows local session access by the owner", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        sessionGroupId: "group-1",
        hosting: "local",
        createdById: "user-1",
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
        120,
        40,
        undefined,
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
      });
      terminalRelayMock.getTerminalsForSessionGroup.mockReturnValueOnce(["term-1", "term-2"]);
      terminalRelayMock.getSessionId.mockImplementation((terminalId: string) => {
        if (terminalId === "term-1") return "session-1";
        if (terminalId === "term-2") return "session-2";
        return undefined;
      });
      prismaMock.session.findMany.mockResolvedValueOnce([
        { id: "session-1", hosting: "cloud", createdById: "user-1" },
        { id: "session-2", hosting: "cloud", createdById: "user-2" },
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
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        sessionGroupId: "group-1",
        hosting: "local",
        createdById: "user-1",
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

    it("filters out local terminals owned by a different user in the same group", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        sessionGroupId: "group-1",
        hosting: "cloud",
        createdById: "user-1",
      });
      terminalRelayMock.getTerminalsForSessionGroup.mockReturnValueOnce(["term-1", "term-2"]);
      terminalRelayMock.getSessionId.mockImplementation((terminalId: string) => {
        if (terminalId === "term-1") return "session-1";
        if (terminalId === "term-2") return "session-2";
        return undefined;
      });
      prismaMock.session.findMany.mockResolvedValueOnce([
        { id: "session-1", hosting: "cloud", createdById: "user-1" },
        { id: "session-2", hosting: "local", createdById: "user-2" },
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
      terminalRelayMock.getSessionId.mockReturnValueOnce("session-1");
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        hosting: "cloud",
        createdById: "user-1",
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
      terminalRelayMock.getSessionId.mockReturnValueOnce(null);

      const result = await terminalService.destroy({
        terminalId: "term-gone",
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(result).toBe(true);
      expect(terminalRelayMock.destroyTerminal).not.toHaveBeenCalled();
    });

    it("throws when session not found for terminal", async () => {
      terminalRelayMock.getSessionId.mockReturnValueOnce("session-1");
      prismaMock.session.findFirst.mockResolvedValueOnce(null);

      await expect(
        terminalService.destroy({
          terminalId: "term-1",
          organizationId: "org-1",
          userId: "user-1",
        }),
      ).rejects.toThrow("Terminal not found");
    });

    it("throws when local session accessed by wrong user", async () => {
      terminalRelayMock.getSessionId.mockReturnValueOnce("session-1");
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        hosting: "local",
        createdById: "user-1",
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
});
