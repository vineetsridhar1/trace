import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const existsSyncMock = vi.fn();
const mkdirSyncMock = vi.fn();
const execFileMock = vi.fn();
const getUsedSlugsMock = vi.fn();
const generateAnimalSlugMock = vi.fn();

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

describe("createWorktree", () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    execFileMock.mockReset();
    getUsedSlugsMock.mockReset();
    generateAnimalSlugMock.mockReset();
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
        if (args[0] === "worktree" && args[1] === "add") {
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
        if (args[0] === "fetch") {
          callback(null, "");
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          const ref = args[2];
          callback(ref === "origin/feature/source" ? null : new Error("missing ref"));
          return {} as ReturnType<typeof execFileMock>;
        }
        if (args[0] === "worktree" && args[1] === "add") {
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

    expect(result.branch).toBe("trace/otter");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      [
        "worktree",
        "add",
        "-b",
        "trace/otter",
        expect.stringContaining("/trace/sessions/repo-1/otter"),
        "origin/feature/source",
      ],
      expect.objectContaining({ cwd: "/tmp/repo" }),
      expect.any(Function),
    );
  });
});
