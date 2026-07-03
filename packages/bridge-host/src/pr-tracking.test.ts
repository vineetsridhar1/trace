import { describe, expect, it } from "vitest";
import { collectTrackedPrWorkspaces } from "./pr-tracking.js";

describe("collectTrackedPrWorkspaces", () => {
  it("keeps every session mapped to a shared read-only checkout", () => {
    const workspaces = collectTrackedPrWorkspaces(
      new Map([
        ["session-1", "/repos/trace"],
        ["session-2", "/repos/trace"],
        ["session-3", "/repos/other"],
      ]),
      new Map([
        ["session-1", null],
        ["session-2", null],
        ["session-3", null],
      ]),
    );

    expect(workspaces).toEqual([
      { sessionIds: ["session-1", "session-2"], workdir: "/repos/trace" },
      { sessionIds: ["session-3"], workdir: "/repos/other" },
    ]);
  });

  it("deduplicates shared writable workspaces by session group", () => {
    const workspaces = collectTrackedPrWorkspaces(
      new Map([
        ["session-1", "/tmp/worktrees/group-1"],
        ["session-2", "/tmp/worktrees/group-1"],
        ["session-3", "/tmp/worktrees/group-2"],
      ]),
      new Map([
        ["session-1", "group-1"],
        ["session-2", "group-1"],
        ["session-3", "group-2"],
      ]),
    );

    expect(workspaces).toEqual([
      { sessionIds: ["session-1", "session-2"], workdir: "/tmp/worktrees/group-1" },
      { sessionIds: ["session-3"], workdir: "/tmp/worktrees/group-2" },
    ]);
  });
});
