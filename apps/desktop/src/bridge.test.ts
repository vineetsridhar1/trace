import { describe, expect, it, vi } from "vitest";
import type { BridgeCommand, BridgeMessage } from "@trace/shared";

const mocks = vi.hoisted(() => ({
  createWorktree: vi.fn(),
  getRepoConfig: vi.fn(),
}));

vi.mock("./config.js", () => ({
  getBridgeLabel: vi.fn(() => null),
  getOrCreateInstanceId: vi.fn(() => "bridge-instance"),
  getRepoConfig: mocks.getRepoConfig,
  readConfig: vi.fn(() => ({ repos: {}, bridgeLabel: null })),
}));

vi.mock("./worktree.js", () => ({
  createWorktree: mocks.createWorktree,
  removeWorktree: vi.fn(),
}));

vi.mock("./linked-checkout.js", () => ({
  commitLinkedCheckoutChanges: vi.fn(),
  getLinkedCheckoutChangedFile: vi.fn(),
  getLinkedCheckoutStatus: vi.fn(),
  linkLinkedCheckoutRepo: vi.fn(),
  restoreLinkedCheckout: vi.fn(),
  setAutoSyncManager: vi.fn(),
  setLinkedCheckoutAutoSync: vi.fn(),
  syncLinkedCheckout: vi.fn(),
}));

vi.mock("@trace/shared/adapters", () => ({
  ClaudeCodeAdapter: vi.fn(),
  CodexAdapter: vi.fn(),
  PiAdapter: vi.fn(),
  TerminalManager: vi.fn(() => ({})),
}));

describe("BridgeClient prepare", () => {
  it("does not create an unhandled rejection when worktree creation fails", async () => {
    const { BridgeClient } = await import("./bridge.js");
    const error = new Error("worktree already checked out");
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };

    process.on("unhandledRejection", onUnhandledRejection);
    mocks.getRepoConfig.mockReturnValue({
      path: "/tmp/repo",
      gitHooksEnabled: false,
      linkedCheckout: null,
    });
    mocks.createWorktree.mockRejectedValue(error);

    try {
      const client = new BridgeClient("https://gettrace.org", async () => null);
      const sendMock = vi.fn();
      client.send = sendMock;

      (client as unknown as { handleCommand(cmd: BridgeCommand): void }).handleCommand({
        type: "prepare",
        sessionId: "session-1",
        repoId: "repo-1",
        repoName: "Repo",
        repoRemoteUrl: null,
        defaultBranch: "main",
        slug: "caribou",
      });

      await new Promise((resolve) => setImmediate(resolve));

      expect(sendMock).toHaveBeenCalledWith({
        type: "workspace_failed",
        sessionId: "session-1",
        error: error.message,
      } satisfies BridgeMessage);
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });
});
