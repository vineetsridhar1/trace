import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUsedSlugsMock, generateAnimalSlugMock } = vi.hoisted(() => ({
  getUsedSlugsMock: vi.fn(),
  generateAnimalSlugMock: vi.fn(),
}));

vi.mock("@trace/shared/animal-names", () => ({
  getUsedSlugs: getUsedSlugsMock,
  generateAnimalSlug: generateAnimalSlugMock,
}));

vi.mock("./repo-hooks.js", () => ({
  installOrRepairRepoHooks: vi.fn(async () => undefined),
}));

import { createWorktree } from "./worktree.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function createRepoFixture(): Promise<{
  repoPath: string;
  headSha: string;
}> {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-worktree-"));
  const repoPath = path.join(rootDir, "repo");

  fs.mkdirSync(repoPath, { recursive: true });
  await git(repoPath, ["init", "-b", "main"]);
  await git(repoPath, ["config", "user.name", "Trace Test"]);
  await git(repoPath, ["config", "user.email", "trace@example.com"]);

  fs.writeFileSync(path.join(repoPath, "app.txt"), "base\n");
  await git(repoPath, ["add", "app.txt"]);
  await git(repoPath, ["commit", "-m", "initial commit"]);

  return {
    repoPath,
    headSha: await git(repoPath, ["rev-parse", "HEAD"]),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  getUsedSlugsMock.mockReset();
  generateAnimalSlugMock.mockReset();
});

describe("createWorktree", () => {
  it("retries when an auto-generated slug collides with an existing branch", async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-home-"));
    vi.spyOn(os, "homedir").mockReturnValue(homeDir);

    const { repoPath, headSha } = await createRepoFixture();
    await git(repoPath, ["branch", "trace/otter", headSha]);

    getUsedSlugsMock.mockResolvedValue(new Set<string>());
    generateAnimalSlugMock
      .mockReturnValueOnce("otter")
      .mockReturnValueOnce("seal");

    const result = await createWorktree({
      repoPath,
      repoId: "repo-1",
      sessionId: "session-1",
      defaultBranch: "main",
      checkpointSha: headSha,
    });

    expect(result.slug).toBe("seal");
    expect(result.branch).toBe("trace/seal");
    expect(fs.existsSync(path.join(homeDir, "trace", "sessions", "repo-1", "seal"))).toBe(true);
    expect(await git(repoPath, ["rev-parse", "trace/seal"])).toBe(headSha);
    expect(generateAnimalSlugMock).toHaveBeenCalledTimes(2);
  }, 15_000);
});
