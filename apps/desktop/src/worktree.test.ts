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

  it("returns the current checked out branch when reusing an existing worktree", async () => {
    existsSyncMock.mockReturnValue(true);
    generateAnimalSlugMock.mockReturnValue("otter");
    getUsedSlugsMock.mockResolvedValue(new Set());
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string) => void,
      ) => {
        callback(null, "feature/reconnected\n");
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

    expect(result.branch).toBe("feature/reconnected");
    expect(execFileMock).toHaveBeenCalledWith(
      "git",
      ["symbolic-ref", "--short", "-q", "HEAD"],
      expect.objectContaining({
        cwd: expect.stringContaining("/trace/sessions/repo-1/otter"),
      }),
      expect.any(Function),
    );
  });
});
