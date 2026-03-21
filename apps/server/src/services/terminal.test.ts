import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/terminal-relay.js", () => ({
  terminalRelay: {
    createTerminal: vi.fn().mockReturnValue("term-1"),
    getTerminalsForSession: vi.fn().mockReturnValue([]),
    getSessionId: vi.fn(),
    destroyTerminal: vi.fn(),
  },
}));

vi.mock("./session.js", () => ({
  isFullyUnloadedSessionStatus: vi.fn().mockReturnValue(false),
}));

import { prisma } from "../lib/db.js";
import { terminalRelay } from "../lib/terminal-relay.js";
import { isFullyUnloadedSessionStatus } from "./session.js";
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
        workdir: "/workspace",
        hosting: "cloud",
        createdById: "user-1",
        status: "active",
        worktreeDeleted: false,
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
        workdir: null,
        hosting: "cloud",
        createdById: "user-1",
        status: "failed",
        worktreeDeleted: false,
      });
      vi.mocked(isFullyUnloadedSessionStatus).mockReturnValueOnce(true);

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
        workdir: null,
        hosting: "cloud",
        createdById: "user-1",
        status: "active",
        worktreeDeleted: true,
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

    it("throws when local session is accessed by different user", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        workdir: "/workspace",
        hosting: "local",
        createdById: "user-1",
        status: "active",
        worktreeDeleted: false,
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
        workdir: "/workspace",
        hosting: "local",
        createdById: "user-1",
        status: "active",
        worktreeDeleted: false,
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
        workdir: null,
        hosting: "cloud",
        createdById: "user-1",
        status: "active",
        worktreeDeleted: false,
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
        120,
        40,
        undefined,
      );
    });

    it("allows cloud session access by any user", async () => {
      prismaMock.session.findFirst.mockResolvedValueOnce({
        id: "session-1",
        workdir: "/workspace",
        hosting: "cloud",
        createdById: "user-1",
        status: "active",
        worktreeDeleted: false,
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
        hosting: "cloud",
        createdById: "user-1",
      });
      terminalRelayMock.getTerminalsForSession.mockReturnValueOnce(["term-1", "term-2"]);

      const result = await terminalService.listForSession({
        sessionId: "session-1",
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(result).toEqual([
        { id: "term-1", sessionId: "session-1" },
        { id: "term-2", sessionId: "session-1" },
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
        hosting: "cloud",
        createdById: "user-1",
      });
      terminalRelayMock.getTerminalsForSession.mockReturnValueOnce([]);

      const result = await terminalService.listForSession({
        sessionId: "session-1",
        organizationId: "org-1",
        userId: "user-1",
      });

      expect(result).toEqual([]);
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
