import { describe, expect, it } from "vitest";
import type { BridgeMessage, GitExecFn } from "@trace/shared";
import { handleBranchDiff, handleCommitDiff, handleGitIntegration } from "@trace/shared";

function createSender() {
  const messages: BridgeMessage[] = [];
  return {
    messages,
    send: (message: BridgeMessage) => {
      messages.push(message);
    },
  };
}

describe("bridge git command handlers", () => {
  it("returns bounded branch diff patches with deterministic truncation", async () => {
    const sender = createSender();
    const gitExec: GitExecFn = async (args) => {
      const command = args.join(" ");
      if (command.includes("--numstat")) return "1\t2\tsrc/a.ts\n3\t0\tsrc/b.ts\n";
      if (command.includes("--name-status")) return "M\tsrc/a.ts\nA\tsrc/b.ts\n";
      if (command.includes("--patch")) return "abcdef";
      return "";
    };

    await handleBranchDiff(
      {
        type: "branch_diff",
        requestId: "request-1",
        sessionId: "session-1",
        baseBranch: "origin/main",
        includePatch: true,
        maxPatchBytes: 3,
      },
      new Map([["session-1", "/repo"]]),
      sender.send,
      gitExec,
    );

    expect(sender.messages).toEqual([
      {
        type: "branch_diff_result",
        requestId: "request-1",
        files: [
          { path: "src/a.ts", status: "M", additions: 1, deletions: 2 },
          { path: "src/b.ts", status: "A", additions: 3, deletions: 0 },
        ],
        patch: "abc",
        truncated: true,
        omittedBytes: 3,
      },
    ]);
  });

  it("uses bounded patch reader instead of full patch output when available", async () => {
    const sender = createSender();
    const gitExec: GitExecFn = async (args) => {
      const command = args.join(" ");
      if (command.includes("--numstat")) return "1\t0\tsrc/a.ts\n";
      if (command.includes("--name-status")) return "M\tsrc/a.ts\n";
      throw new Error("unbounded patch should not be requested");
    };

    await handleCommitDiff(
      {
        type: "commit_diff",
        requestId: "request-1",
        sessionId: "session-1",
        includePatch: true,
        maxPatchBytes: 3,
      },
      new Map([["session-1", "/repo"]]),
      sender.send,
      gitExec,
      async () => ({ stdout: "abc", truncated: true, omittedBytes: 3 }),
    );

    expect(sender.messages).toEqual([
      {
        type: "commit_diff_result",
        requestId: "request-1",
        files: [{ path: "src/a.ts", status: "M", additions: 1, deletions: 0 }],
        patch: "abc",
        truncated: true,
        omittedBytes: 3,
      },
    ]);
  });

  it("rejects invalid refs before running commit diff git commands", async () => {
    const sender = createSender();
    let callCount = 0;
    const gitExec: GitExecFn = async () => {
      callCount += 1;
      return "";
    };

    await handleCommitDiff(
      {
        type: "commit_diff",
        requestId: "request-1",
        sessionId: "session-1",
        commitRef: "../main",
      },
      new Map([["session-1", "/repo"]]),
      sender.send,
      gitExec,
    );

    expect(callCount).toBe(0);
    expect(sender.messages).toEqual([
      {
        type: "commit_diff_result",
        requestId: "request-1",
        files: [],
        error: "Invalid commit ref",
      },
    ]);
  });

  it("returns structured conflicts for failed integration commands", async () => {
    const sender = createSender();
    const gitExec: GitExecFn = async (args) => {
      const command = args.join(" ");
      if (command === "checkout integration") return "";
      if (command === "merge --no-ff --no-edit ticket") throw new Error("merge conflict");
      if (command === "diff --name-only --diff-filter=U") return "src/conflict.ts\n";
      if (command === "merge --abort") return "";
      if (command === "rev-parse HEAD") return "abc123\n";
      return "";
    };

    await handleGitIntegration(
      {
        type: "git_integration",
        requestId: "request-1",
        sessionId: "session-1",
        operation: "merge",
        targetRef: "integration",
        sourceRef: "ticket",
      },
      new Map([["session-1", "/repo"]]),
      sender.send,
      gitExec,
    );

    expect(sender.messages).toEqual([
      {
        type: "git_integration_result",
        requestId: "request-1",
        result: {
          ok: false,
          operation: "merge",
          headCommitSha: "abc123",
          conflicts: ["src/conflict.ts"],
          aborted: true,
          requiresAbort: false,
          error: "merge conflict",
        },
      },
    ]);
  });

  it("rebases an explicit branch ref onto an explicit upstream ref", async () => {
    const sender = createSender();
    const commands: string[] = [];
    const gitExec: GitExecFn = async (args) => {
      const command = args.join(" ");
      commands.push(command);
      if (command === "rev-parse HEAD") return "abc123\n";
      return "";
    };

    await handleGitIntegration(
      {
        type: "git_integration",
        requestId: "request-1",
        sessionId: "session-1",
        operation: "rebase",
        branchRef: "ticket",
        ontoRef: "integration",
      },
      new Map([["session-1", "/repo"]]),
      sender.send,
      gitExec,
    );

    expect(commands).toContain("checkout ticket");
    expect(commands).toContain("rebase integration");
    expect(sender.messages[0]).toMatchObject({
      type: "git_integration_result",
      result: { ok: true, aborted: false, requiresAbort: false },
    });
  });
});
