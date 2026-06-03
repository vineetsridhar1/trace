import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureRepo, getRepoPath } from "./workspace.js";

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock("child_process", () => ({
  execFile: mocks.execFile,
}));

vi.mock("fs", () => ({
  default: {
    existsSync: mocks.existsSync,
    mkdirSync: mocks.mkdirSync,
    readdirSync: mocks.readdirSync,
  },
}));

function callbackFrom(args: unknown[]): ExecCallback {
  for (const arg of args) {
    if (typeof arg === "function") return arg as ExecCallback;
  }
  throw new Error("execFile callback was not provided");
}

function gitArgsAt(index: number): string[] {
  const args = mocks.execFile.mock.calls[index]?.[1];
  if (!Array.isArray(args) || !args.every((arg): arg is string => typeof arg === "string")) {
    throw new Error(`git args missing for call ${index}`);
  }
  return args;
}

describe("workspace repo setup", () => {
  const originalCacheDir = process.env.TRACE_REPO_CACHE_DIR;
  const originalGithubToken = process.env.GITHUB_TOKEN;

  beforeEach(() => {
    delete process.env.TRACE_REPO_CACHE_DIR;
    delete process.env.GITHUB_TOKEN;
    vi.clearAllMocks();
    mocks.execFile.mockImplementation((...args: unknown[]) => {
      callbackFrom(args)(null, "", "");
    });
  });

  afterEach(() => {
    if (originalCacheDir === undefined) {
      delete process.env.TRACE_REPO_CACHE_DIR;
    } else {
      process.env.TRACE_REPO_CACHE_DIR = originalCacheDir;
    }
    if (originalGithubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalGithubToken;
    }
  });

  it("uses partial clone options and the requested branch for new clones", async () => {
    mocks.existsSync.mockReturnValue(false);

    await expect(
      ensureRepo("repo-1", "https://github.com/acme/project.git", "feature/work", "main"),
    ).resolves.toBe("/repos/repo-1");

    expect(gitArgsAt(0)).toEqual([
      "clone",
      "--filter=blob:none",
      "--no-tags",
      "--single-branch",
      "--branch",
      "feature/work",
      "https://github.com/acme/project.git",
      "/repos/repo-1",
    ]);
    expect(gitArgsAt(1)).toEqual(["checkout", "--detach"]);
  });

  it("uses the default branch for new clones when no branch is requested", async () => {
    mocks.existsSync.mockReturnValue(false);

    await ensureRepo("repo-1", "https://github.com/acme/project.git", undefined, "main");

    expect(gitArgsAt(0)).toContain("main");
  });

  it("adds a cache reference when the repo cache mirror exists", async () => {
    process.env.TRACE_REPO_CACHE_DIR = "/repo-cache";
    mocks.existsSync.mockImplementation((path: unknown) => path === "/repo-cache/repo-1.git");

    await ensureRepo("repo-1", "https://github.com/acme/project.git", "main", "main");

    expect(gitArgsAt(0)).toEqual([
      "clone",
      "--filter=blob:none",
      "--no-tags",
      "--single-branch",
      "--branch",
      "main",
      "--reference-if-able",
      "/repo-cache/repo-1.git",
      "https://github.com/acme/project.git",
      "/repos/repo-1",
    ]);
  });

  it("omits the cache reference when the repo cache mirror is absent", async () => {
    process.env.TRACE_REPO_CACHE_DIR = "/repo-cache";
    mocks.existsSync.mockReturnValue(false);

    await ensureRepo("repo-1", "https://github.com/acme/project.git", "main", "main");

    expect(gitArgsAt(0)).not.toContain("--reference-if-able");
    expect(gitArgsAt(0)).toEqual([
      "clone",
      "--filter=blob:none",
      "--no-tags",
      "--single-branch",
      "--branch",
      "main",
      "https://github.com/acme/project.git",
      "/repos/repo-1",
    ]);
  });

  it("fetches the requested branch explicitly for existing repos", async () => {
    mocks.existsSync.mockImplementation((path: unknown) => path === "/repos/repo-1");

    await ensureRepo("repo-1", "https://github.com/acme/project.git", "feature/work", "main");

    expect(gitArgsAt(0)).toEqual([
      "fetch",
      "--filter=blob:none",
      "--no-tags",
      "origin",
      "+refs/heads/feature/work:refs/remotes/origin/feature/work",
    ]);
    expect(gitArgsAt(1)).toEqual(["checkout", "--detach"]);
  });

  it("keeps read-only repo paths usable after cloning", async () => {
    let cloned = false;
    mocks.existsSync.mockImplementation((path: unknown) => path === "/repos/repo-1" && cloned);
    mocks.execFile.mockImplementation((...args: unknown[]) => {
      const gitArgs = args[1];
      if (Array.isArray(gitArgs) && gitArgs[0] === "clone") cloned = true;
      callbackFrom(args)(null, "", "");
    });

    const repoPath = await ensureRepo(
      "repo-1",
      "https://github.com/acme/project.git",
      undefined,
      "main",
    );

    expect(repoPath).toBe("/repos/repo-1");
    expect(getRepoPath("repo-1")).toBe("/repos/repo-1");
    expect(gitArgsAt(0)).not.toContain("--no-checkout");
  });
});
