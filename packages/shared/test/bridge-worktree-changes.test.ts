import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  handleCommitFileChanges,
  handleWriteFile,
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
  it("rejects a guarded write when the file changed after inspection", async () => {
    const sent: BridgeMessage[] = [];
    const fs = makeFs();
    await new Promise<void>((resolve) => {
      handleWriteFile(
        {
          type: "write_file_guarded",
          requestId: "write-1",
          sessionId: "session-1",
          relativePath: "src/design/manual.css",
          content: "next",
          expectedContent: "previous",
        },
        new Map([["session-1", "/repo"]]),
        (message) => {
          sent.push(message);
          resolve();
        },
        { fs, path },
      );
    });

    expect(fs.promises.writeFile).not.toHaveBeenCalled();
    expect(sent).toEqual([
      {
        type: "file_write_result",
        requestId: "write-1",
        error: "File changed before the edit could be saved",
      },
    ]);
  });

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
    expect(sent[0]).toMatchObject({
      type: "worktree_changes_result",
      totalCount: 201,
      truncated: true,
    });
    expect(sent[0]?.type === "worktree_changes_result" ? sent[0].files : []).toHaveLength(200);
  });

  it("truncates large per-file previews", async () => {
    const sent: BridgeMessage[] = [];
    const gitExec = vi.fn(async (args: string[]) => {
      if (args[0] === "status") return makeStatus(1);
      if (args[0] === "show") return "old".repeat(30_000);
      if (args[0] === "diff" && args[1] === "--numstat") return "1\t0\tsrc/file.ts";
      if (args[0] === "diff") return "diff".repeat(30_000);
      return "";
    });

    await handleWorktreeChanges(
      { type: "worktree_changes", requestId: "req-1", sessionId: "session-1" },
      new Map([["session-1", "/repo"]]),
      (message) => sent.push(message),
      { fs: makeFs(), path, gitExec },
    );

    const files = sent[0]?.type === "worktree_changes_result" ? sent[0].files : [];
    expect(sent[0]).toMatchObject({
      type: "worktree_changes_result",
      totalCount: 1,
      truncated: false,
    });
    expect(files).toHaveLength(1);
    expect(Buffer.byteLength(files[0]?.diff ?? "", "utf8")).toBeLessThanOrEqual(64 * 1024);
    expect(Buffer.byteLength(files[0]?.originalContent ?? "", "utf8")).toBeLessThanOrEqual(
      64 * 1024,
    );
    expect(files[0]?.truncated).toBe(true);
    expect(files[0]?.contentTruncated).toBe(true);
  });

  it("caps the total worktree changes payload", async () => {
    const sent: BridgeMessage[] = [];
    const gitExec = vi.fn(async (args: string[]) => {
      if (args[0] === "status") return makeStatus(40);
      if (args[0] === "show") return "old";
      if (args[0] === "diff" && args[1] === "--numstat") return "1\t0\tsrc/file.ts";
      if (args[0] === "diff") return "diff".repeat(20_000);
      return "";
    });

    await handleWorktreeChanges(
      { type: "worktree_changes", requestId: "req-1", sessionId: "session-1" },
      new Map([["session-1", "/repo"]]),
      (message) => sent.push(message),
      { fs: makeFs(), path, gitExec },
    );

    const files = sent[0]?.type === "worktree_changes_result" ? sent[0].files : [];
    expect(sent[0]).toMatchObject({
      type: "worktree_changes_result",
      totalCount: 40,
      truncated: true,
    });
    expect(files.length).toBeGreaterThan(0);
    expect(files.length).toBeLessThan(40);
    expect(Buffer.byteLength(JSON.stringify(files), "utf8")).toBeLessThan(600 * 1024);
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

  it("commits only explicitly scoped files without staging unrelated changes", async () => {
    const sent: BridgeMessage[] = [];
    const gitExec = vi.fn(async (args: string[]) => {
      if (args[0] === "status") return " M src/design/manual.css\0";
      if (args[0] === "rev-parse") return "scoped123\n";
      return "";
    });

    await handleCommitFileChanges(
      {
        type: "commit_scoped_file_changes",
        requestId: "req-scoped",
        sessionId: "session-1",
        message: "Save manual edits",
        paths: ["src/design/manual.css"],
      },
      new Map([["session-1", "/repo"]]),
      (message) => sent.push(message),
      { fs: makeFs(), path, gitExec },
    );

    expect(gitExec).toHaveBeenCalledWith(
      ["status", "--porcelain=v1", "-z", "--", "src/design/manual.css"],
      "/repo",
    );
    expect(gitExec).toHaveBeenCalledWith(
      ["commit", "-m", "Save manual edits", "--only", "--", "src/design/manual.css"],
      "/repo",
    );
    expect(gitExec).not.toHaveBeenCalledWith(["add", "-A"], "/repo");
    expect(sent).toEqual([
      {
        type: "file_commit_result",
        requestId: "req-scoped",
        commitSha: "scoped123",
      },
    ]);
  });
});
