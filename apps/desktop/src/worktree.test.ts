import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const existsSyncMock = vi.fn();
const mkdirSyncMock = vi.fn();
const execFileMock = vi.fn();
const getUsedSlugsMock = vi.fn();
const generateAnimalSlugMock = vi.fn();
const installOrRepairRepoHooksBestEffortMock = vi.fn();

vi.mock("fs", () => ({
  default: {
    existsSync: existsSyncMock,
    mkdirSync: mkdirSyncMock,
  },
}));

vi.mock("child_process", () => ({
  execFile: execFileMock,
}));

vi.mock("@trace/shared/animal-names", () => ({
  getUsedSlugs: getUsedSlugsMock,
  generateAnimalSlug: generateAnimalSlugMock,
}));

vi.mock("./repo-hooks.js", () => ({
  installOrRepairRepoHooksBestEffort: installOrRepairRepoHooksBestEffortMock,
}));

describe("createWorktree", () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    execFileMock.mockReset();
    getUsedSlugsMock.mockReset();
    generateAnimalSlugMock.mockReset();
    installOrRepairRepoHooksBestEffortMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("resets an existing worktree to the resolved base ref", async () => {
    existsSyncMock.mockReturnValue(true);
    generateAnimalSlugMock.mockReturnValue("otter");
    getUsedSlugsMock.mockResolvedValue(new Set());
    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string) => void,
      ) => {
        if (args[0] === "remote") {
          callback(null, "git@example.com:repo.git\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "fetch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          callback(args[2] === "origin/trace/gibbon" ? null : new Error("missing ref"), "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "symbolic-ref") {
          callback(null, "trace/gibbon\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "reset" || args[0] === "clean" || args[0] === "branch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }

        callback(new Error(`Unexpected git call: ${args.join(" ")}`), "");
        return {} as ReturnType<typeof execFileMock>;
      },
    );

    const { createWorktree } = await import("./worktree.js");
    const result = await createWorktree({
      repoPath: "/tmp/repo",
      repoId: "repo-1",
      sessionId: "session-1",
      slug: "gibbon",
      defaultBranch: "main",
      startBranch: "trace/gibbon",
      preserveBranchName: true,
    });

    expect(result.branch).toBe("trace/gibbon");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["reset", "--hard", "origin/trace/gibbon"],
      expect.objectContaining({
        cwd: expect.stringContaining("/trace/sessions/repo-1/gibbon"),
      }),
      expect.any(Function),
    );
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["branch", "--set-upstream-to", "origin/trace/gibbon", "trace/gibbon"],
      expect.objectContaining({ cwd: "/tmp/repo" }),
      expect.any(Function),
    );
  });

  it("reuses an existing worktree checked out to a different branch", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    existsSyncMock.mockReturnValue(true);
    generateAnimalSlugMock.mockReturnValue("otter");
    getUsedSlugsMock.mockResolvedValue(new Set());
    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string) => void,
      ) => {
        if (args[0] === "remote") {
          callback(null, "git@example.com:repo.git\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "fetch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          callback(args[2] === "origin/main" ? null : new Error("missing ref"), "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "symbolic-ref") {
          callback(null, "feature/other\n");
          return {} as ReturnType<typeof execFileMock>;
        }

        callback(new Error(`Unexpected git call: ${args.join(" ")}`), "");
        return {} as ReturnType<typeof execFileMock>;
      },
    );

    const { createWorktree } = await import("./worktree.js");

    await expect(
      createWorktree({
        repoPath: "/tmp/repo",
        repoId: "repo-1",
        sessionId: "session-1",
        slug: "otter",
        defaultBranch: "main",
      }),
    ).resolves.toEqual({
      workdir: expect.stringContaining("/trace/sessions/repo-1/otter"),
      branch: "feature/other",
      slug: "otter",
    });
    expect(execFileMock).not.toHaveBeenCalledWith(
      "git",
      ["reset", "--hard", expect.any(String)],
      expect.anything(),
      expect.any(Function),
    );
  });

  it("rejects an existing detached worktree instead of reconciling it", async () => {
    existsSyncMock.mockReturnValue(true);
    generateAnimalSlugMock.mockReturnValue("otter");
    getUsedSlugsMock.mockResolvedValue(new Set());
    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string) => void,
      ) => {
        if (args[0] === "remote") {
          callback(null, "git@example.com:repo.git\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "fetch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          callback(args[2] === "origin/main" ? null : new Error("missing ref"), "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "symbolic-ref") {
          callback(new Error("detached HEAD"), "");
          return {} as ReturnType<typeof execFileMock>;
        }

        callback(new Error(`Unexpected git call: ${args.join(" ")}`), "");
        return {} as ReturnType<typeof execFileMock>;
      },
    );

    const { createWorktree } = await import("./worktree.js");

    await expect(
      createWorktree({
        repoPath: "/tmp/repo",
        repoId: "repo-1",
        sessionId: "session-1",
        slug: "otter",
        defaultBranch: "main",
      }),
    ).rejects.toThrow("Existing session worktree");
    expect(execFileMock).not.toHaveBeenCalledWith(
      "git",
      ["reset", "--hard", expect.any(String)],
      expect.anything(),
      expect.any(Function),
    );
  });

  it("repairs an existing slug worktree when the persisted branch was renamed elsewhere", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    existsSyncMock.mockReturnValue(true);
    generateAnimalSlugMock.mockReturnValue("otter");
    getUsedSlugsMock.mockResolvedValue(new Set());
    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string) => void,
      ) => {
        if (args[0] === "remote") {
          callback(null, "git@example.com:repo.git\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "fetch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          callback(
            args[2] === "origin/trace/compact-session-timeline" ? null : new Error("missing ref"),
            "",
          );
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "symbolic-ref") {
          callback(null, "trace-otter\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (
          args[0] === "checkout" ||
          args[0] === "reset" ||
          args[0] === "clean" ||
          args[0] === "branch"
        ) {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }

        callback(new Error(`Unexpected git call: ${args.join(" ")}`), "");
        return {} as ReturnType<typeof execFileMock>;
      },
    );

    const { createWorktree } = await import("./worktree.js");
    const result = await createWorktree({
      repoPath: "/tmp/repo",
      repoId: "repo-1",
      sessionId: "session-1",
      slug: "otter",
      defaultBranch: "main",
      startBranch: "trace/compact-session-timeline",
      preserveBranchName: true,
    });

    expect(result.branch).toBe("trace/compact-session-timeline");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      [
        "checkout",
        "-f",
        "-B",
        "trace/compact-session-timeline",
        "origin/trace/compact-session-timeline",
      ],
      expect.objectContaining({ cwd: expect.stringContaining("/trace/sessions/repo-1/otter") }),
      expect.any(Function),
    );
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["reset", "--hard", "origin/trace/compact-session-timeline"],
      expect.objectContaining({ cwd: expect.stringContaining("/trace/sessions/repo-1/otter") }),
      expect.any(Function),
    );
  });

  it("reuses preserved branch mismatches and reports the actual checked-out branch", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    existsSyncMock.mockReturnValue(true);
    generateAnimalSlugMock.mockReturnValue("otter");
    getUsedSlugsMock.mockResolvedValue(new Set());
    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string) => void,
      ) => {
        if (args[0] === "remote") {
          callback(null, "git@example.com:repo.git\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "fetch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          callback(
            args[2] === "origin/trace/compact-session-timeline" ? null : new Error("missing ref"),
            "",
          );
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "symbolic-ref") {
          callback(null, "feature/unrelated\n");
          return {} as ReturnType<typeof execFileMock>;
        }

        callback(new Error(`Unexpected git call: ${args.join(" ")}`), "");
        return {} as ReturnType<typeof execFileMock>;
      },
    );

    const { createWorktree } = await import("./worktree.js");

    await expect(
      createWorktree({
        repoPath: "/tmp/repo",
        repoId: "repo-1",
        sessionId: "session-1",
        slug: "otter",
        defaultBranch: "main",
        startBranch: "trace/compact-session-timeline",
        preserveBranchName: true,
      }),
    ).resolves.toEqual({
      workdir: expect.stringContaining("/trace/sessions/repo-1/otter"),
      branch: "feature/unrelated",
      slug: "otter",
    });
    expect(execFileMock).not.toHaveBeenCalledWith(
      "git",
      ["checkout", expect.any(String), expect.any(String), expect.any(String), expect.any(String)],
      expect.anything(),
      expect.any(Function),
    );
  });

  it("reuses a persisted renamed branch when recreating a missing worktree", async () => {
    existsSyncMock.mockReturnValue(false);
    generateAnimalSlugMock.mockReturnValue("otter");
    getUsedSlugsMock.mockResolvedValue(new Set());

    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout?: string) => void,
      ) => {
        if (args[0] === "remote") {
          callback(null, "git@example.com:repo.git\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "fetch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          const ref = args[2];
          callback(
            ref === "origin/feature/reconnected" || ref === "feature/reconnected"
              ? null
              : new Error("missing ref"),
          );
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args.includes("worktree") && args.includes("add")) {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "reset" || args[0] === "clean" || args[0] === "branch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }

        callback(new Error(`Unexpected git call: ${args.join(" ")}`));
        return {} as ReturnType<typeof execFileMock>;
      },
    );

    const { createWorktree } = await import("./worktree.js");
    const result = await createWorktree({
      repoPath: "/tmp/repo",
      repoId: "repo-1",
      sessionId: "session-1",
      slug: "otter",
      defaultBranch: "main",
      startBranch: "feature/reconnected",
      preserveBranchName: true,
    });

    expect(result.branch).toBe("feature/reconnected");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      [
        "worktree",
        "add",
        expect.stringContaining("/trace/sessions/repo-1/otter"),
        "feature/reconnected",
      ],
      expect.objectContaining({ cwd: "/tmp/repo" }),
      expect.any(Function),
    );
  });

  it("fails fast with a GitHub login error when fetch needs credentials", async () => {
    existsSyncMock.mockReturnValue(false);
    generateAnimalSlugMock.mockReturnValue("otter");
    getUsedSlugsMock.mockResolvedValue(new Set());

    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout?: string, stderr?: string) => void,
      ) => {
        if (args[0] === "remote") {
          callback(null, "https://github.com/opendoor-labs/mortgages.git\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "fetch") {
          callback(
            new Error("Command failed"),
            "",
            "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
          );
          return {} as ReturnType<typeof execFileMock>;
        }

        callback(new Error(`Unexpected git call: ${args.join(" ")}`));
        return {} as ReturnType<typeof execFileMock>;
      },
    );

    const { createWorktree } = await import("./worktree.js");
    await expect(
      createWorktree({
        repoPath: "/tmp/repo",
        repoId: "repo-1",
        sessionId: "session-1",
        slug: "otter",
        defaultBranch: "main",
      }),
    ).rejects.toThrow("GitHub login required for this repository");

    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["fetch", "origin"],
      expect.objectContaining({
        cwd: "/tmp/repo",
        env: expect.objectContaining({ GIT_TERMINAL_PROMPT: "0" }),
      }),
      expect.any(Function),
    );
  });

  it("creates a Trace branch for new worktrees even when starting from another branch", async () => {
    existsSyncMock.mockReturnValue(false);
    generateAnimalSlugMock.mockReturnValue("otter");
    getUsedSlugsMock.mockResolvedValue(new Set());

    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout?: string) => void,
      ) => {
        if (args[0] === "remote") {
          callback(null, "git@example.com:repo.git\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "fetch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          const ref = args[2];
          callback(ref === "origin/feature/source" ? null : new Error("missing ref"));
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args.includes("worktree") && args.includes("add")) {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "reset" || args[0] === "clean" || args[0] === "branch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }

        callback(new Error(`Unexpected git call: ${args.join(" ")}`));
        return {} as ReturnType<typeof execFileMock>;
      },
    );

    const { createWorktree } = await import("./worktree.js");
    const result = await createWorktree({
      repoPath: "/tmp/repo",
      repoId: "repo-1",
      sessionId: "session-1",
      slug: "otter",
      defaultBranch: "main",
      startBranch: "feature/source",
    });

    expect(result.branch).toBe("trace-otter");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      [
        "worktree",
        "add",
        "-b",
        "trace-otter",
        expect.stringContaining("/trace/sessions/repo-1/otter"),
        "origin/feature/source",
      ],
      expect.objectContaining({ cwd: "/tmp/repo" }),
      expect.any(Function),
    );
  });

  it("avoids generated branch names that conflict with existing ref namespaces", async () => {
    existsSyncMock.mockReturnValue(false);
    generateAnimalSlugMock.mockReturnValue("otter");
    getUsedSlugsMock.mockResolvedValue(new Set());

    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout?: string) => void,
      ) => {
        if (args[0] === "remote") {
          callback(null, "git@example.com:repo.git\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "fetch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          callback(args[2] === "origin/main" ? null : new Error("missing ref"));
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "for-each-ref") {
          callback(null, "refs/remotes/origin/trace-otter/explain-slack-disabled\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args.includes("worktree") && args.includes("add")) {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "reset" || args[0] === "clean" || args[0] === "branch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }

        callback(new Error(`Unexpected git call: ${args.join(" ")}`));
        return {} as ReturnType<typeof execFileMock>;
      },
    );

    const { createWorktree } = await import("./worktree.js");
    const result = await createWorktree({
      repoPath: "/tmp/repo",
      repoId: "repo-1",
      sessionId: "session-1",
      slug: "otter",
      defaultBranch: "main",
    });

    expect(result.branch).toBe("trace-otter-2");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      [
        "worktree",
        "add",
        "-b",
        "trace-otter-2",
        expect.stringContaining("/trace/sessions/repo-1/otter"),
        "origin/main",
      ],
      expect.objectContaining({ cwd: "/tmp/repo" }),
      expect.any(Function),
    );
  });

  it("repairs Trace hooks best-effort after creating a worktree when hooks are enabled", async () => {
    existsSyncMock.mockReturnValue(false);
    generateAnimalSlugMock.mockReturnValue("otter");
    getUsedSlugsMock.mockResolvedValue(new Set());
    installOrRepairRepoHooksBestEffortMock.mockResolvedValue(undefined);

    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout?: string) => void,
      ) => {
        if (args[0] === "remote") {
          callback(null, "git@example.com:repo.git\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "fetch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          callback(args[2] === "origin/main" ? null : new Error("missing ref"));
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args.includes("worktree") && args.includes("add")) {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "reset" || args[0] === "clean" || args[0] === "branch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }

        callback(new Error(`Unexpected git call: ${args.join(" ")}`));
        return {} as ReturnType<typeof execFileMock>;
      },
    );

    const { createWorktree } = await import("./worktree.js");
    const result = await createWorktree({
      repoPath: "/tmp/repo",
      repoId: "repo-1",
      sessionId: "session-1",
      slug: "otter",
      defaultBranch: "main",
      gitHooksEnabled: true,
    });

    expect(result.branch).toBe("trace-otter");
    expect(installOrRepairRepoHooksBestEffortMock).toHaveBeenCalledWith(
      expect.stringContaining("/trace/sessions/repo-1/otter"),
      "session worktree creation",
    );
  });

  it("keeps a pre-assigned slug authoritative when the bridge reports it in use", async () => {
    existsSyncMock.mockReturnValue(false);
    generateAnimalSlugMock.mockReturnValue("mink");
    getUsedSlugsMock.mockResolvedValue(new Set(["otter"]));

    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout?: string) => void,
      ) => {
        if (args[0] === "remote") {
          callback(null, "git@example.com:repo.git\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "fetch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          const ref = args[2];
          callback(
            ref === "origin/main" || ref === "trace-otter" ? null : new Error("missing ref"),
          );
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args.includes("worktree") && args.includes("add")) {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "reset" || args[0] === "clean" || args[0] === "branch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }

        callback(new Error(`Unexpected git call: ${args.join(" ")}`));
        return {} as ReturnType<typeof execFileMock>;
      },
    );

    const { createWorktree } = await import("./worktree.js");
    const result = await createWorktree({
      repoPath: "/tmp/repo",
      repoId: "repo-1",
      sessionId: "session-1",
      slug: "otter",
      defaultBranch: "main",
    });

    expect(result.slug).toBe("otter");
    expect(result.branch).toBe("trace-otter");
    expect(generateAnimalSlugMock).not.toHaveBeenCalled();
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      [
        "worktree",
        "add",
        expect.stringContaining("/trace/sessions/repo-1/otter"),
        "trace-otter",
      ],
      expect.objectContaining({ cwd: "/tmp/repo" }),
      expect.any(Function),
    );
  });

  it("generates a different slug for new worktrees when a candidate is already used", async () => {
    existsSyncMock.mockReturnValue(false);
    const usedSlugs = new Set(["otter"]);
    getUsedSlugsMock.mockResolvedValue(usedSlugs);
    generateAnimalSlugMock.mockReturnValue("mink");

    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout?: string) => void,
      ) => {
        if (args[0] === "remote") {
          callback(null, "git@example.com:repo.git\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "fetch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          callback(args[2] === "origin/main" ? null : new Error("missing ref"));
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args.includes("worktree") && args.includes("add")) {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "reset" || args[0] === "clean" || args[0] === "branch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }

        callback(new Error(`Unexpected git call: ${args.join(" ")}`));
        return {} as ReturnType<typeof execFileMock>;
      },
    );

    const { createWorktree } = await import("./worktree.js");
    const result = await createWorktree({
      repoPath: "/tmp/repo",
      repoId: "repo-1",
      sessionId: "session-1",
      defaultBranch: "main",
    });

    expect(generateAnimalSlugMock).toHaveBeenCalledWith(usedSlugs);
    expect(result.slug).toBe("mink");
    expect(result.branch).toBe("trace-mink");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      [
        "worktree",
        "add",
        "-b",
        "trace-mink",
        expect.stringContaining("/trace/sessions/repo-1/mink"),
        "origin/main",
      ],
      expect.objectContaining({ cwd: "/tmp/repo" }),
      expect.any(Function),
    );
  });

  it("continues when a checkout hook fails after git creates the worktree", async () => {
    existsSyncMock.mockReturnValue(false);
    generateAnimalSlugMock.mockReturnValue("otter");
    getUsedSlugsMock.mockResolvedValue(new Set());
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        options: Record<string, unknown>,
        callback: (error: Error | null, stdout?: string) => void,
      ) => {
        if (args[0] === "remote") {
          callback(null, "git@example.com:repo.git\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "fetch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          callback(args[2] === "origin/main" ? null : new Error("missing ref"));
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "worktree" && args[1] === "add") {
          callback(new Error("post-checkout hook failed"));
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") {
          callback(
            String(options.cwd).includes("/trace/sessions/repo-1/otter")
              ? null
              : new Error("bad cwd"),
            "true\n",
          );
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "reset" || args[0] === "clean" || args[0] === "branch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }

        callback(new Error(`Unexpected git call: ${args.join(" ")}`));
        return {} as ReturnType<typeof execFileMock>;
      },
    );

    const { createWorktree } = await import("./worktree.js");
    const result = await createWorktree({
      repoPath: "/tmp/repo",
      repoId: "repo-1",
      sessionId: "session-1",
      slug: "otter",
      defaultBranch: "main",
    });

    expect(result.branch).toBe("trace-otter");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("git worktree add reported an error after creating"),
    );
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["reset", "--hard", "origin/main"],
      expect.objectContaining({
        cwd: expect.stringContaining("/trace/sessions/repo-1/otter"),
      }),
      expect.any(Function),
    );
  });

  it("creates a worktree from a local branch when no origin is configured", async () => {
    existsSyncMock.mockReturnValue(false);
    generateAnimalSlugMock.mockReturnValue("otter");
    getUsedSlugsMock.mockResolvedValue(new Set());

    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout?: string) => void,
      ) => {
        if (args[0] === "remote") {
          callback(new Error("No such remote 'origin'"));
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "fetch") {
          callback(new Error("fetch should not run without origin"));
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          callback(args[2] === "main" ? null : new Error("missing ref"));
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args.includes("worktree") && args.includes("add")) {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "reset" || args[0] === "clean") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }

        callback(new Error(`Unexpected git call: ${args.join(" ")}`));
        return {} as ReturnType<typeof execFileMock>;
      },
    );

    const { createWorktree } = await import("./worktree.js");
    const result = await createWorktree({
      repoPath: "/tmp/repo",
      repoId: "repo-1",
      sessionId: "session-1",
      slug: "otter",
      defaultBranch: "main",
    });

    expect(result.branch).toBe("trace-otter");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      [
        "worktree",
        "add",
        "-b",
        "trace-otter",
        expect.stringContaining("/trace/sessions/repo-1/otter"),
        "main",
      ],
      expect.objectContaining({ cwd: "/tmp/repo" }),
      expect.any(Function),
    );
    expect(execFileMock).not.toHaveBeenCalledWith(
      "git",
      ["fetch", "origin"],
      expect.anything(),
      expect.any(Function),
    );
  });

  it("creates an orphan worktree for repos with no commits", async () => {
    existsSyncMock.mockReturnValue(false);
    generateAnimalSlugMock.mockReturnValue("partridge");
    getUsedSlugsMock.mockResolvedValue(new Set());

    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout?: string) => void,
      ) => {
        if (args[0] === "remote") {
          callback(new Error("No such remote 'origin'"));
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          callback(new Error("invalid ref"));
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "worktree" && args[1] === "add") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }

        callback(new Error(`Unexpected git call: ${args.join(" ")}`));
        return {} as ReturnType<typeof execFileMock>;
      },
    );

    const { createWorktree } = await import("./worktree.js");
    const result = await createWorktree({
      repoPath: "/tmp/repo",
      repoId: "repo-1",
      sessionId: "session-1",
      slug: "partridge",
      defaultBranch: "main",
    });

    expect(result.branch).toBe("trace-partridge");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      [
        "worktree",
        "add",
        "--orphan",
        "-b",
        "trace-partridge",
        expect.stringContaining("/trace/sessions/repo-1/partridge"),
      ],
      expect.objectContaining({ cwd: "/tmp/repo" }),
      expect.any(Function),
    );
    expect(execFileMock).not.toHaveBeenCalledWith(
      "git",
      ["reset", expect.anything(), expect.anything()],
      expect.anything(),
      expect.any(Function),
    );
  });

  function gitCallIndex(predicate: (args: string[]) => boolean): number {
    return execFileMock.mock.calls.findIndex((call) => {
      const args = call?.[1];
      return Array.isArray(args) && args.every((a) => typeof a === "string") && predicate(args);
    });
  }

  it("registers the branch in the fetch refspec before setting upstream on a single-branch clone", async () => {
    existsSyncMock.mockReturnValue(true);
    generateAnimalSlugMock.mockReturnValue("otter");
    getUsedSlugsMock.mockResolvedValue(new Set());
    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string) => void,
      ) => {
        if (args[0] === "remote" && args[1] === "get-url") {
          callback(null, "git@example.com:repo.git\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        // Single-branch clone: refspec only covers main, not the session branch.
        if (args[0] === "config" && args.includes("remote.origin.fetch")) {
          callback(null, "+refs/heads/main:refs/remotes/origin/main\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "remote" && args[1] === "set-branches") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "fetch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          callback(args[2] === "origin/trace/gibbon" ? null : new Error("missing ref"), "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "symbolic-ref") {
          callback(null, "trace/gibbon\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "reset" || args[0] === "clean" || args[0] === "branch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }

        callback(new Error(`Unexpected git call: ${args.join(" ")}`), "");
        return {} as ReturnType<typeof execFileMock>;
      },
    );

    const { createWorktree } = await import("./worktree.js");
    await createWorktree({
      repoPath: "/tmp/repo",
      repoId: "repo-1",
      sessionId: "session-1",
      slug: "gibbon",
      defaultBranch: "main",
      startBranch: "trace/gibbon",
      preserveBranchName: true,
    });

    const setBranchesIdx = gitCallIndex(
      (args) =>
        args[0] === "remote" &&
        args[1] === "set-branches" &&
        args[2] === "--add" &&
        args[3] === "origin" &&
        args[4] === "trace/gibbon",
    );
    const setUpstreamIdx = gitCallIndex(
      (args) => args[0] === "branch" && args[1] === "--set-upstream-to",
    );
    expect(setBranchesIdx).toBeGreaterThanOrEqual(0);
    expect(setUpstreamIdx).toBeGreaterThanOrEqual(0);
    expect(setBranchesIdx).toBeLessThan(setUpstreamIdx);
  });

  it("does not register the refspec when it already covers the branch", async () => {
    existsSyncMock.mockReturnValue(true);
    generateAnimalSlugMock.mockReturnValue("otter");
    getUsedSlugsMock.mockResolvedValue(new Set());
    execFileMock.mockImplementation(
      (
        _command: string,
        args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string) => void,
      ) => {
        if (args[0] === "remote" && args[1] === "get-url") {
          callback(null, "git@example.com:repo.git\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "config" && args.includes("remote.origin.fetch")) {
          callback(null, "+refs/heads/*:refs/remotes/origin/*\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "fetch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          callback(args[2] === "origin/trace/gibbon" ? null : new Error("missing ref"), "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "symbolic-ref") {
          callback(null, "trace/gibbon\n");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "reset" || args[0] === "clean" || args[0] === "branch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }

        callback(new Error(`Unexpected git call: ${args.join(" ")}`), "");
        return {} as ReturnType<typeof execFileMock>;
      },
    );

    const { createWorktree } = await import("./worktree.js");
    await createWorktree({
      repoPath: "/tmp/repo",
      repoId: "repo-1",
      sessionId: "session-1",
      slug: "gibbon",
      defaultBranch: "main",
      startBranch: "trace/gibbon",
      preserveBranchName: true,
    });

    expect(gitCallIndex((args) => args[0] === "remote" && args[1] === "set-branches")).toBe(-1);
    expect(
      gitCallIndex((args) => args[0] === "branch" && args[1] === "--set-upstream-to"),
    ).toBeGreaterThanOrEqual(0);
  });
});
