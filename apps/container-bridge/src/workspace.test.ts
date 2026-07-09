import { promisify } from "util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bootstrapAppWorkspace,
  configureManagedGitRemote,
  createWorktree,
  ensureRepo,
  getRepoPath,
} from "./workspace.js";

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  rmSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("child_process", () => {
  // Mirror real execFile's promisify behavior: resolve to { stdout, stderr }
  // (a plain vi.fn would make promisify resolve with the raw stdout string).
  // The wrapper still invokes mocks.execFile with a callback, so call args and
  // the callback-based test mocks keep working.
  (mocks.execFile as unknown as Record<symbol, unknown>)[promisify.custom] = (
    ...callArgs: unknown[]
  ) =>
    new Promise((resolve, reject) => {
      mocks.execFile(...callArgs, (err: Error | null, stdout: string, stderr: string) =>
        err ? reject(err) : resolve({ stdout, stderr }),
      );
    });
  return { execFile: mocks.execFile };
});

vi.mock("fs", () => ({
  default: {
    existsSync: mocks.existsSync,
    mkdirSync: mocks.mkdirSync,
    readdirSync: mocks.readdirSync,
    rmSync: mocks.rmSync,
    writeFileSync: mocks.writeFileSync,
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
  const originalRuntimeToken = process.env.TRACE_RUNTIME_TOKEN;
  const originalTraceServerPublicUrl = process.env.TRACE_SERVER_PUBLIC_URL;

  beforeEach(() => {
    delete process.env.TRACE_REPO_CACHE_DIR;
    delete process.env.GITHUB_TOKEN;
    delete process.env.TRACE_RUNTIME_TOKEN;
    delete process.env.TRACE_SERVER_PUBLIC_URL;
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
    if (originalRuntimeToken === undefined) {
      delete process.env.TRACE_RUNTIME_TOKEN;
    } else {
      process.env.TRACE_RUNTIME_TOKEN = originalRuntimeToken;
    }
    if (originalTraceServerPublicUrl === undefined) {
      delete process.env.TRACE_SERVER_PUBLIC_URL;
    } else {
      process.env.TRACE_SERVER_PUBLIC_URL = originalTraceServerPublicUrl;
    }
  });

  it("uses partial clone options and the requested branch for new clones", async () => {
    mocks.existsSync.mockReturnValue(false);

    await expect(
      ensureRepo("repo-1", "https://github.com/acme/project.git", "feature/work", "main"),
    ).resolves.toEqual({ repoPath: "/repos/repo-1" });

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

  it("injects the runtime token for Trace managed git remotes", async () => {
    process.env.TRACE_RUNTIME_TOKEN = "runtime-token";
    process.env.TRACE_SERVER_PUBLIC_URL = "https://trace.example";
    mocks.existsSync.mockReturnValue(false);

    await ensureRepo("repo-1", "https://trace.example/git/org-1/repo-1.git", "main", "main");

    expect(gitArgsAt(0)).toContain(
      "https://x-token:runtime-token@trace.example/git/org-1/repo-1.git",
    );
  });

  it("configures and pushes a managed remote with the runtime token", async () => {
    process.env.TRACE_RUNTIME_TOKEN = "runtime-token";
    process.env.TRACE_SERVER_PUBLIC_URL = "https://trace.example";
    mocks.execFile.mockImplementation((...args: unknown[]) => {
      const gitArgs = args[1];
      callbackFrom(args)(null, Array.isArray(gitArgs) && gitArgs[0] === "remote" ? "" : "", "");
    });

    await configureManagedGitRemote({
      workdir: "/home/coder",
      remoteUrl: "https://trace.example/git/org-1/repo-1.git",
      branch: "main",
    });

    expect(mocks.execFile).toHaveBeenNthCalledWith(
      1,
      "git",
      ["remote"],
      {
        cwd: "/home/coder",
      },
      expect.any(Function),
    );
    expect(gitArgsAt(1)).toEqual([
      "remote",
      "add",
      "origin",
      "https://x-token:runtime-token@trace.example/git/org-1/repo-1.git",
    ]);
    expect(gitArgsAt(2)).toEqual(["push", "-u", "origin", "HEAD:main"]);
  });

  it("replaces an existing origin before pushing a managed remote", async () => {
    mocks.execFile.mockImplementation((...args: unknown[]) => {
      const gitArgs = args[1];
      callbackFrom(args)(
        null,
        Array.isArray(gitArgs) && gitArgs[0] === "remote" ? "origin\n" : "",
        "",
      );
    });

    await configureManagedGitRemote({
      workdir: "/home/coder",
      remoteUrl: "https://trace.example/git/org-1/repo-1.git",
      branch: "trace-app",
    });

    expect(gitArgsAt(1)).toEqual([
      "remote",
      "set-url",
      "origin",
      "https://trace.example/git/org-1/repo-1.git",
    ]);
    expect(gitArgsAt(2)).toEqual(["push", "-u", "origin", "HEAD:trace-app"]);
  });

  it("bootstraps an app workspace with starter files and an initial commit", async () => {
    mocks.existsSync.mockReturnValue(false);

    await expect(bootstrapAppWorkspace("/home/coder")).resolves.toEqual({
      workdir: "/home/coder",
      branch: "main",
    });

    expect(mocks.writeFileSync).toHaveBeenCalledWith(
      "/home/coder/package.json",
      expect.stringContaining('"next": "latest"'),
    );
    expect(mocks.writeFileSync).toHaveBeenCalledWith(
      "/home/coder/app/page.tsx",
      expect.stringContaining("Trace app session"),
    );
    expect(gitArgsAt(0)).toEqual(["init", "-b", "main"]);
    expect(gitArgsAt(1)).toEqual(["config", "user.name", "Trace"]);
    expect(gitArgsAt(2)).toEqual(["config", "user.email", "trace@trace.dev"]);
    expect(gitArgsAt(3)).toEqual(["add", "."]);
    expect(gitArgsAt(4)).toEqual(["commit", "-m", "Initialize Trace app"]);
  });

  it("does not overwrite an existing app workspace git history", async () => {
    mocks.existsSync.mockImplementation((path: unknown) => String(path).endsWith(".git"));

    await bootstrapAppWorkspace("/home/coder");

    expect(mocks.execFile).not.toHaveBeenCalled();
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

  it("creates the requested branch from the default branch for existing repos when fetch reports it missing", async () => {
    mocks.existsSync.mockImplementation((path: unknown) => path === "/repos/repo-1");
    mocks.execFile.mockImplementation((...args: unknown[]) => {
      const gitArgs = args[1];
      const callback = callbackFrom(args);
      if (
        Array.isArray(gitArgs) &&
        gitArgs[0] === "fetch" &&
        String(gitArgs[4]).includes("feature/work")
      ) {
        callback(
          new Error("fatal: couldn't find remote ref refs/heads/feature/work"),
          "",
          "fatal: couldn't find remote ref refs/heads/feature/work",
        );
        return;
      }
      callback(null, "", "");
    });

    await expect(
      ensureRepo("repo-1", "https://github.com/acme/project.git", "feature/work", "main"),
    ).resolves.toEqual({
      repoPath: "/repos/repo-1",
      warning: {
        type: "branch_missing_restored_from_base",
        branch: "feature/work",
        baseBranch: "main",
        message:
          "Branch feature/work did not exist on origin, so Trace created it from main. " +
          "Local-only changes from the previous workspace were not restored.",
      },
    });

    expect(gitArgsAt(0)).toEqual([
      "fetch",
      "--filter=blob:none",
      "--no-tags",
      "origin",
      "+refs/heads/feature/work:refs/remotes/origin/feature/work",
    ]);
    expect(gitArgsAt(1)).toEqual([
      "fetch",
      "--filter=blob:none",
      "--no-tags",
      "origin",
      "+refs/heads/main:refs/remotes/origin/main",
    ]);
    expect(gitArgsAt(2)).toEqual(["checkout", "-B", "feature/work", "origin/main"]);
    expect(gitArgsAt(3)).toEqual(["push", "-u", "origin", "HEAD:feature/work"]);
    expect(gitArgsAt(4)).toEqual(["checkout", "--detach"]);
  });

  it("keeps read-only repo paths usable after cloning", async () => {
    let cloned = false;
    mocks.existsSync.mockImplementation((path: unknown) => path === "/repos/repo-1" && cloned);
    mocks.execFile.mockImplementation((...args: unknown[]) => {
      const gitArgs = args[1];
      if (Array.isArray(gitArgs) && gitArgs[0] === "clone") cloned = true;
      callbackFrom(args)(null, "", "");
    });

    const result = await ensureRepo(
      "repo-1",
      "https://github.com/acme/project.git",
      undefined,
      "main",
    );

    expect(result).toEqual({ repoPath: "/repos/repo-1" });
    expect(getRepoPath("repo-1")).toBe("/repos/repo-1");
    expect(gitArgsAt(0)).not.toContain("--no-checkout");
  });

  it("creates the requested branch from the default branch when clone reports it missing", async () => {
    mocks.existsSync.mockReturnValue(false);
    mocks.execFile.mockImplementation((...args: unknown[]) => {
      const gitArgs = args[1];
      const callback = callbackFrom(args);
      if (Array.isArray(gitArgs) && gitArgs[0] === "clone" && gitArgs.includes("feature/work")) {
        const error = new Error(
          "Command failed: git clone --branch feature/work https://github.com/acme/project.git /repos/repo-1\n" +
            "warning: Could not find remote branch feature/work to clone.\n" +
            "fatal: Remote branch feature/work not found in upstream origin\n",
        );
        callback(error, "", "warning: Could not find remote branch feature/work to clone.");
        return;
      }
      callback(null, "", "");
    });

    await expect(
      ensureRepo("repo-1", "https://github.com/acme/project.git", "feature/work", "main"),
    ).resolves.toEqual({
      repoPath: "/repos/repo-1",
      warning: {
        type: "branch_missing_restored_from_base",
        branch: "feature/work",
        baseBranch: "main",
        message:
          "Branch feature/work did not exist on origin, so Trace created it from main. " +
          "Local-only changes from the previous workspace were not restored.",
      },
    });

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
    expect(gitArgsAt(1)).toEqual([
      "clone",
      "--filter=blob:none",
      "--no-tags",
      "--single-branch",
      "--branch",
      "main",
      "https://github.com/acme/project.git",
      "/repos/repo-1",
    ]);
    expect(gitArgsAt(2)).toEqual(["checkout", "-B", "feature/work", "origin/main"]);
    expect(gitArgsAt(3)).toEqual(["push", "-u", "origin", "HEAD:feature/work"]);
    expect(gitArgsAt(4)).toEqual(["checkout", "--detach"]);
    expect(mocks.rmSync).toHaveBeenCalledWith("/repos/repo-1", {
      recursive: true,
      force: true,
    });
  });
});

describe("createWorktree upstream tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existsSync.mockReturnValue(false);
    mocks.execFile.mockImplementation((...args: unknown[]) => {
      callbackFrom(args)(null, "", "");
    });
  });

  function gitCallIndex(predicate: (args: string[]) => boolean): number {
    return mocks.execFile.mock.calls.findIndex((call) => {
      const args = call?.[1];
      return Array.isArray(args) && args.every((a) => typeof a === "string") && predicate(args);
    });
  }

  it("registers the branch in the fetch refspec before setting upstream (single-branch clone)", async () => {
    // Default mock: `git config --get-all remote.origin.fetch` returns "" — i.e. a
    // single-branch clone whose refspec does not cover the session branch.
    await createWorktree({
      repoId: "repo-1",
      sessionId: "session-1",
      defaultBranch: "main",
      branch: "feature/work",
      preserveBranchName: true,
      slug: "otter",
    });

    const setBranchesIdx = gitCallIndex(
      (args) =>
        args[0] === "remote" &&
        args[1] === "set-branches" &&
        args[2] === "--add" &&
        args[3] === "origin" &&
        args[4] === "feature/work",
    );
    const setUpstreamIdx = gitCallIndex(
      (args) => args[0] === "branch" && args[1] === "--set-upstream-to",
    );

    expect(setBranchesIdx).toBeGreaterThanOrEqual(0);
    expect(setUpstreamIdx).toBeGreaterThanOrEqual(0);
    // The refspec must be registered before git validates the upstream.
    expect(setBranchesIdx).toBeLessThan(setUpstreamIdx);
    expect(gitArgsAt(setUpstreamIdx)).toEqual([
      "branch",
      "--set-upstream-to",
      "origin/feature/work",
      "feature/work",
    ]);
  });

  it("does not touch the fetch refspec when it already covers the branch", async () => {
    mocks.execFile.mockImplementation((...args: unknown[]) => {
      const callback = callbackFrom(args);
      const cmd = Array.isArray(args[1]) ? (args[1] as string[]) : [];
      if (cmd[0] === "config" && cmd.includes("remote.origin.fetch")) {
        callback(null, "+refs/heads/*:refs/remotes/origin/*\n", "");
        return;
      }
      callback(null, "", "");
    });

    await createWorktree({
      repoId: "repo-1",
      sessionId: "session-1",
      defaultBranch: "main",
      branch: "feature/work",
      preserveBranchName: true,
      slug: "otter",
    });

    expect(gitCallIndex((args) => args[0] === "remote" && args[1] === "set-branches")).toBe(-1);
    expect(
      gitCallIndex((args) => args[0] === "branch" && args[1] === "--set-upstream-to"),
    ).toBeGreaterThanOrEqual(0);
  });

  it("does not re-add a refspec entry that already lists the exact branch (idempotent on resume)", async () => {
    mocks.execFile.mockImplementation((...args: unknown[]) => {
      const callback = callbackFrom(args);
      const cmd = Array.isArray(args[1]) ? (args[1] as string[]) : [];
      if (cmd[0] === "config" && cmd.includes("remote.origin.fetch")) {
        callback(
          null,
          "+refs/heads/main:refs/remotes/origin/main\n" +
            "+refs/heads/feature/work:refs/remotes/origin/feature/work\n",
          "",
        );
        return;
      }
      callback(null, "", "");
    });

    await createWorktree({
      repoId: "repo-1",
      sessionId: "session-1",
      defaultBranch: "main",
      branch: "feature/work",
      preserveBranchName: true,
      slug: "otter",
    });

    expect(gitCallIndex((args) => args[0] === "remote" && args[1] === "set-branches")).toBe(-1);
  });

  it("does not fail worktree creation when setting upstream errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.execFile.mockImplementation((...args: unknown[]) => {
      const callback = callbackFrom(args);
      const cmd = Array.isArray(args[1]) ? (args[1] as string[]) : [];
      if (cmd[0] === "branch" && cmd[1] === "--set-upstream-to") {
        callback(new Error("fatal: cannot set up tracking information"), "", "");
        return;
      }
      callback(null, "", "");
    });

    await expect(
      createWorktree({
        repoId: "repo-1",
        sessionId: "session-1",
        defaultBranch: "main",
        branch: "feature/work",
        preserveBranchName: true,
        slug: "otter",
      }),
    ).resolves.toEqual({
      workdir: "/workspaces/otter",
      branch: "feature/work",
      slug: "otter",
    });
  });
});
