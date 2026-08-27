import { describe, expect, it, vi } from "vitest";
import { handleBranchDiff, type BridgeMessage } from "../src/bridge.js";

describe("branch diff bridge handler", () => {
  it("returns committed, uncommitted, and untracked workspace changes", async () => {
    const sent: BridgeMessage[] = [];
    const gitExec = vi.fn(async (args: string[]) => {
      if (args[0] === "diff" && args[1] === "--numstat") return "2\t1\tsrc/app.ts\n";
      if (args[0] === "diff" && args[1] === "--name-status") return "M\tsrc/app.ts\n";
      if (args[0] === "ls-files" && args.includes(".trace-work")) {
        return ".trace-work/plan/plan.html\0";
      }
      if (args[0] === "ls-files") return "generated/output.ts\0";
      return "";
    });

    await handleBranchDiff(
      {
        type: "branch_diff",
        requestId: "req-1",
        sessionId: "session-1",
        baseBranch: "origin/main",
      },
      new Map([["session-1", "/repo"]]),
      (message) => sent.push(message),
      gitExec,
    );

    expect(gitExec).toHaveBeenCalledWith(["diff", "--numstat", "origin/main..."], "/repo");
    expect(gitExec).toHaveBeenCalledWith(["diff", "--name-status", "origin/main..."], "/repo");
    expect(gitExec).toHaveBeenCalledWith(
      ["ls-files", "--others", "--ignored", "--exclude-standard", "-z", "--", ".trace-work"],
      "/repo",
    );
    expect(sent).toEqual([
      {
        type: "branch_diff_result",
        requestId: "req-1",
        files: [
          { path: "src/app.ts", status: "M", additions: 2, deletions: 1 },
          { path: "generated/output.ts", status: "A", additions: 0, deletions: 0 },
          { path: ".trace-work/plan/plan.html", status: "A", additions: 0, deletions: 0 },
        ],
      },
    ]);
  });
});
