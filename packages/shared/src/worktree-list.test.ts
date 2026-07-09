import { describe, expect, it } from "vitest";
import { parseWorktreeListPorcelain } from "./bridge.js";

describe("parseWorktreeListPorcelain", () => {
  const managedPrefix = "/Users/me/trace/sessions/repo-1";

  it("parses main and linked worktrees with branches", () => {
    const stdout = [
      "worktree /Users/me/dev/my-repo",
      "HEAD abc123",
      "branch refs/heads/main",
      "",
      "worktree /Users/me/dev/feature-checkout",
      "HEAD def456",
      "branch refs/heads/feature/login",
      "",
    ].join("\n");

    const result = parseWorktreeListPorcelain(stdout, managedPrefix, "/");
    expect(result).toEqual([
      {
        path: "/Users/me/dev/my-repo",
        head: "abc123",
        branch: "main",
        isMain: true,
        isTraceManaged: false,
      },
      {
        path: "/Users/me/dev/feature-checkout",
        head: "def456",
        branch: "feature/login",
        isMain: false,
        isTraceManaged: false,
      },
    ]);
  });

  it("flags detached worktrees with a null branch", () => {
    const stdout = ["worktree /Users/me/dev/detached", "HEAD abc123", "detached", ""].join("\n");
    const [entry] = parseWorktreeListPorcelain(stdout, managedPrefix, "/");
    expect(entry.branch).toBeNull();
    expect(entry.head).toBe("abc123");
  });

  it("flags worktrees under the Trace-managed prefix", () => {
    const stdout = [
      "worktree /Users/me/dev/my-repo",
      "HEAD abc123",
      "branch refs/heads/main",
      "",
      "worktree /Users/me/trace/sessions/repo-1/otter",
      "HEAD def456",
      "branch refs/heads/trace-otter",
      "",
    ].join("\n");

    const result = parseWorktreeListPorcelain(stdout, managedPrefix, "/");
    expect(result.map((w) => w.isTraceManaged)).toEqual([false, true]);
  });

  it("handles trailing output without a final blank line", () => {
    const stdout = "worktree /Users/me/dev/my-repo\nHEAD abc123\nbranch refs/heads/main";
    const result = parseWorktreeListPorcelain(stdout, managedPrefix, "/");
    expect(result).toHaveLength(1);
    expect(result[0].branch).toBe("main");
  });
});
