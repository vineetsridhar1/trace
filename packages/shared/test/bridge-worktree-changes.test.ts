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
    readFile: vi.fn(),
    promises: {
      readdir: vi.fn(),
      realpath: vi.fn(async (value: string) => value),
      stat: vi.fn(async () => ({ size: 10, isFile: () => true })),
      writeFile: vi.fn(),
    },
  };
}

describe("worktree change bridge handlers", () => {
  it("refuses to return an incomplete review set when too many files changed", async () => {
    const sent: BridgeMessage[] = [];
    const gitExec = vi.fn(async () => makeStatus(201));

    await handleWorktreeChanges(
      { type: "worktree_changes", requestId: "req-1", sessionId: "session-1" },
      new Map([["session-1", "/repo"]]),
      (message) => sent.push(message),
      { fs: makeFs(), path, gitExec },
    );

    expect(sent).toEqual([
      {
        type: "worktree_changes_result",
        requestId: "req-1",
        files: [],
        error: "Too many workspace changes to review (201 files, 200 max)",
      },
    ]);
  });

  it("refuses to commit more files than the review dialog can show", async () => {
    const sent: BridgeMessage[] = [];
    const gitExec = vi.fn(async (args: string[]) => {
      if (args[0] === "status") return makeStatus(201);
      return "";
    });

    await handleCommitFileChanges(
      { type: "commit_file_changes", requestId: "req-1", sessionId: "session-1" },
      new Map([["session-1", "/repo"]]),
      (message) => sent.push(message),
      { fs: makeFs(), path, gitExec },
    );

    expect(gitExec).toHaveBeenCalledTimes(1);
    expect(sent).toEqual([
      {
        type: "file_commit_result",
        requestId: "req-1",
        error: "Too many workspace changes to commit safely (201 files, 200 max)",
      },
    ]);
  });
});
