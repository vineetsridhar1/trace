import { describe, expect, it } from "vitest";
import {
  branchNameFromGitRef,
  branchNamesFromGitRefsOutput,
  generatedTraceWorktreeBranch,
  hasGitRefNamespaceConflict,
  resolveGeneratedTraceWorktreeBranch,
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

  it("parses branch names from full git refs", () => {
    expect(branchNameFromGitRef("refs/heads/trace-otter")).toBe("trace-otter");
    expect(branchNameFromGitRef("refs/remotes/origin/trace-otter/fix")).toBe("trace-otter/fix");
    expect(branchNameFromGitRef("refs/remotes/origin/HEAD")).toBe(null);
    expect(branchNameFromGitRef("refs/tags/v1")).toBe(null);
  });

  it("parses branch names from git ref output", () => {
    expect(
      branchNamesFromGitRefsOutput(
        [
          "refs/heads/main",
          "refs/remotes/origin/trace-otter/fix",
          "refs/remotes/origin/HEAD",
        ].join("\n"),
      ),
    ).toEqual(["main", "trace-otter/fix"]);
  });

  it("resolves generated Trace branches around namespace conflicts", () => {
    expect(resolveGeneratedTraceWorktreeBranch("otter", [])).toBe("trace-otter");
    expect(resolveGeneratedTraceWorktreeBranch("otter", ["trace-otter/fix"])).toBe(
      "trace-otter-2",
    );
    expect(resolveGeneratedTraceWorktreeBranch("otter", ["trace-otter"])).toBe("trace-otter");
  });

  it("uses a timestamp fallback when numeric suffixes are exhausted", () => {
    const refs = Array.from({ length: 999 }, (_, index) =>
      index === 0 ? "trace-otter/fix" : `trace-otter-${index + 1}/fix`,
    );

    expect(resolveGeneratedTraceWorktreeBranch("otter", refs, () => 1234)).toBe(
      "trace-otter-1234",
    );
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
