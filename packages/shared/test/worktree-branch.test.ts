import { describe, expect, it } from "vitest";
import {
  generatedTraceWorktreeBranch,
  hasGitRefNamespaceConflict,
  shouldRepairRenamedTraceWorktreeBranch,
} from "../src/worktree-branch.js";

describe("worktree branch repair", () => {
  it("generates Trace worktree branches from slugs", () => {
    expect(generatedTraceWorktreeBranch("otter")).toBe("trace-otter");
  });

  it("detects git ref namespace conflicts", () => {
    expect(
      hasGitRefNamespaceConflict("trace-gharial/explain-slack-disabled", ["trace-gharial"]),
    ).toBe(true);
    expect(
      hasGitRefNamespaceConflict("trace-gharial", ["trace-gharial/explain-slack-disabled"]),
    ).toBe(true);
    expect(hasGitRefNamespaceConflict("trace-gharial", ["trace-gharial"])).toBe(false);
    expect(hasGitRefNamespaceConflict("trace-gharial-fix", ["trace-gharial"])).toBe(false);
  });

  it("repairs stale generated Trace branches after a branch rename", () => {
    expect(
      shouldRepairRenamedTraceWorktreeBranch({
        currentBranch: "trace/otter",
        requestedBranch: "trace/compact-session-timeline",
        persistedBranch: "trace/compact-session-timeline",
        preserveBranchName: true,
      }),
    ).toBe(true);
  });

  it("repairs repeated Trace branch renames across bridge handoffs", () => {
    expect(
      shouldRepairRenamedTraceWorktreeBranch({
        currentBranch: "trace/compact-session-timeline",
        requestedBranch: "trace/new-session-name",
        persistedBranch: "trace/new-session-name",
        preserveBranchName: true,
      }),
    ).toBe(true);
  });

  it("repairs Trace-owned branches renamed to non-Trace persisted branches", () => {
    expect(
      shouldRepairRenamedTraceWorktreeBranch({
        currentBranch: "trace/otter",
        requestedBranch: "feature/session-work",
        persistedBranch: "feature/session-work",
        preserveBranchName: true,
      }),
    ).toBe(true);
  });

  it("does not repair unrelated non-Trace branch mismatches", () => {
    expect(
      shouldRepairRenamedTraceWorktreeBranch({
        currentBranch: "feature/unrelated",
        requestedBranch: "trace/compact-session-timeline",
        persistedBranch: "trace/compact-session-timeline",
        preserveBranchName: true,
      }),
    ).toBe(false);
  });

  it("does not repair unless the requested branch is the persisted branch", () => {
    expect(
      shouldRepairRenamedTraceWorktreeBranch({
        currentBranch: "trace/otter",
        requestedBranch: "trace/other",
        persistedBranch: "trace/compact-session-timeline",
        preserveBranchName: true,
      }),
    ).toBe(false);
  });

  it("does not repair when preserving branch names is disabled", () => {
    expect(
      shouldRepairRenamedTraceWorktreeBranch({
        currentBranch: "trace/otter",
        requestedBranch: "trace/compact-session-timeline",
        persistedBranch: "trace/compact-session-timeline",
        preserveBranchName: false,
      }),
    ).toBe(false);
  });
});
