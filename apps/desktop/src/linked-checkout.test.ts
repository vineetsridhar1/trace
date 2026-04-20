import { beforeEach, describe, expect, it, vi } from "vitest";

const { execFileAsyncMock, runGitMock } = vi.hoisted(() => ({
  execFileAsyncMock: vi.fn(),
  runGitMock: vi.fn(),
}));

vi.mock("@trace/shared", () => ({
  assertValidCommitSha: (sha: string) => {
    if (!/^[0-9a-f]{40}$/i.test(sha)) {
      throw new Error(`Invalid commit SHA: ${sha}`);
    }
  },
}));

vi.mock("./config.js", () => ({
  getRepoConfig: vi.fn(),
  saveRepoPath: vi.fn(),
  setRepoLinkedCheckout: vi.fn(),
}));

vi.mock("./repo-hooks.js", () => ({
  installOrRepairRepoHooks: vi.fn(),
}));

vi.mock("./git-utils.js", () => ({
  assertSafeGitRef: (ref: string) => {
    if (!ref || ref.startsWith("-") || ref.includes("..") || /[\x00-\x1f\x7f\s]/.test(ref)) {
      throw new Error(`Unsafe git ref: ${ref}`);
    }
  },
  execFileAsync: execFileAsyncMock,
  formatGitError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  getCurrentBranch: vi.fn(),
  GIT_MAX_BUFFER: 5 * 1024 * 1024,
  isSafeGitRef: (ref: string) =>
    !!ref && !ref.startsWith("-") && !ref.includes("..") && !/[\x00-\x1f\x7f\s]/.test(ref),
  runGit: runGitMock,
}));

import { resolveTargetCommitSha } from "./linked-checkout.js";

const repoPath = "/tmp/repo";

function notFoundError(message: string, code = 128): Error & { code: number } {
  return Object.assign(new Error(message), { code });
}

function seedGitState({
  refs = {},
  ancestors = [],
}: {
  refs?: Record<string, string>;
  ancestors?: Array<[string, string]>;
} = {}) {
  const refMap = new Map(Object.entries(refs));
  const ancestorSet = new Set(ancestors.map(([ancestor, descendant]) => `${ancestor}->${descendant}`));

  execFileAsyncMock.mockImplementation(async (_cmd: string, args: string[]) => {
    if (args[0] === "rev-parse" && args[1] === "--verify") {
      const ref = args[2]?.replace(/\^\{commit\}$/, "");
      if (ref && refMap.has(ref)) return { stdout: "", stderr: "" };
      throw notFoundError(`missing ref ${ref}`);
    }

    if (args[0] === "merge-base" && args[1] === "--is-ancestor") {
      const ancestor = args[2];
      const descendant = args[3];
      if (ancestorSet.has(`${ancestor}->${descendant}`)) {
        return { stdout: "", stderr: "" };
      }
      throw notFoundError("not ancestor", 1);
    }

    throw new Error(`Unexpected execFileAsync call: ${args.join(" ")}`);
  });

  runGitMock.mockImplementation(async (_repoPath: string, args: string[]) => {
    if (args[0] === "rev-parse") {
      const ref = args[1]?.replace(/\^\{commit\}$/, "");
      const sha = ref ? refMap.get(ref) : null;
      if (sha) return sha;
      throw new Error(`missing ref ${ref}`);
    }

    if (args[0] === "cat-file" && args[1] === "-e") {
      return "";
    }

    throw new Error(`Unexpected runGit call: ${args.join(" ")}`);
  });
}

beforeEach(() => {
  execFileAsyncMock.mockReset();
  runGitMock.mockReset();
});

describe("resolveTargetCommitSha", () => {
  it("returns the local branch sha when there is no remote ref", async () => {
    seedGitState({
      refs: {
        "trace/session": "a".repeat(40),
      },
    });

    await expect(resolveTargetCommitSha(repoPath, "trace/session")).resolves.toBe("a".repeat(40));
  });

  it("returns the remote branch sha when there is no local ref", async () => {
    seedGitState({
      refs: {
        "origin/trace/session": "b".repeat(40),
      },
    });

    await expect(resolveTargetCommitSha(repoPath, "trace/session")).resolves.toBe("b".repeat(40));
  });

  it("prefers the remote ref when the local branch is behind", async () => {
    const localSha = "a".repeat(40);
    const remoteSha = "b".repeat(40);
    seedGitState({
      refs: {
        "trace/session": localSha,
        "origin/trace/session": remoteSha,
      },
      ancestors: [[localSha, remoteSha]],
    });

    await expect(resolveTargetCommitSha(repoPath, "trace/session")).resolves.toBe(remoteSha);
  });

  it("prefers the local ref when it is ahead of origin", async () => {
    const localSha = "b".repeat(40);
    const remoteSha = "a".repeat(40);
    seedGitState({
      refs: {
        "trace/session": localSha,
        "origin/trace/session": remoteSha,
      },
      ancestors: [[remoteSha, localSha]],
    });

    await expect(resolveTargetCommitSha(repoPath, "trace/session")).resolves.toBe(localSha);
  });

  it("throws when local and remote refs diverge", async () => {
    seedGitState({
      refs: {
        "trace/session": "a".repeat(40),
        "origin/trace/session": "b".repeat(40),
      },
    });

    await expect(resolveTargetCommitSha(repoPath, "trace/session")).rejects.toThrow(
      "Local and remote refs diverged for branch: trace/session",
    );
  });
});
