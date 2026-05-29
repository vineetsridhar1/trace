import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  handleCommitFileChanges,
  handleWorktreeChanges,
  type BridgeMessage,
  type BridgeFsLike,
} from "../src/bridge.js";

function makeStatus(count: number): string {
  return Array.from({ length: count }, (_, index) => `M  src/file-${index}.ts`).join("\0") + "\0";
}

function makeFs(): BridgeFsLike {
  return {
    readFile: vi.fn((_filePath, callback) => callback(null, Buffer.from("new"))),
    promises: {
      readdir: vi.fn(),
      realpath: vi.fn(async (value: string) => value),
      stat: vi.fn(async () => ({ size: 10, isFile: () => true })),
      writeFile: vi.fn(),
    },
  };
}

describe("worktree change bridge handlers", () => {
  it("returns the first 200 changed files for review", async () => {
    const sent: BridgeMessage[] = [];
    const gitExec = vi.fn(async (args: string[]) => {
      if (args[0] === "status") return makeStatus(201);
      if (args[0] === "show") return "old";
      if (args[0] === "diff" && args[1] === "--numstat") return "1\t0\tsrc/file.ts";
      if (args[0] === "diff") return "";
      return "";
    });

    await handleWorktreeChanges(
      { type: "worktree_changes", requestId: "req-1", sessionId: "session-1" },
      new Map([["session-1", "/repo"]]),
      (message) => sent.push(message),
      { fs: makeFs(), path, gitExec },
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]?.type).toBe("worktree_changes_result");
    expect(sent[0]).toMatchObject({ requestId: "req-1" });
    expect(sent[0]?.type === "worktree_changes_result" ? sent[0].files : []).toHaveLength(200);
  });

  it("commits all workspace changes even when only 200 are shown for review", async () => {
    const sent: BridgeMessage[] = [];
    const gitExec = vi.fn(async (args: string[]) => {
      if (args[0] === "status") return makeStatus(201);
      if (args[0] === "rev-parse") return "abc123\n";
      return "";
    });

    await handleCommitFileChanges(
      { type: "commit_file_changes", requestId: "req-1", sessionId: "session-1" },
      new Map([["session-1", "/repo"]]),
      (message) => sent.push(message),
      { fs: makeFs(), path, gitExec },
    );

    expect(gitExec).toHaveBeenCalledWith(["add", "-A"], "/repo");
    expect(gitExec).toHaveBeenCalledWith(["commit", "-m", "Update files from Trace"], "/repo");
    expect(sent).toEqual([
      {
        type: "file_commit_result",
        requestId: "req-1",
        commitSha: "abc123",
      },
    ]);
  });
});
