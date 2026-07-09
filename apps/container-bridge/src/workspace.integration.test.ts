import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bootstrapAppWorkspace,
  configureManagedGitRemote,
  createWorktree,
  ensureRepo,
} from "./workspace.js";

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

describe("app workspace managed-git smoke", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "trace-app-workspace-"));
    vi.stubEnv("TRACE_REPOS_DIR", path.join(tempDir, "repos"));
    vi.stubEnv("TRACE_WORKSPACES_DIR", path.join(tempDir, "workspaces"));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("bootstraps, pushes, clones, and restores an app checkpoint by SHA", async () => {
    const remotePath = path.join(tempDir, "managed.git");
    const appWorkdir = path.join(tempDir, "app");
    await execFileAsync("git", ["init", "--bare", remotePath]);
    await execFileAsync("git", ["symbolic-ref", "HEAD", "refs/heads/main"], { cwd: remotePath });

    await bootstrapAppWorkspace(appWorkdir);
    const starterSha = await git(["rev-parse", "HEAD"], appWorkdir);
    expect(starterSha).toMatch(/^[0-9a-f]{40}$/);

    const pagePath = path.join(appWorkdir, "app/page.tsx");
    const updatedPage = `${await fs.promises.readFile(pagePath, "utf8")}\n// Checkpoint version\n`;
    await fs.promises.writeFile(pagePath, updatedPage, "utf8");
    await execFileAsync("git", ["add", "app/page.tsx"], { cwd: appWorkdir });
    await execFileAsync("git", ["commit", "-m", "Update app page"], { cwd: appWorkdir });
    const checkpointSha = await git(["rev-parse", "HEAD"], appWorkdir);
    expect(checkpointSha).not.toBe(starterSha);

    await configureManagedGitRemote({
      workdir: appWorkdir,
      remoteUrl: remotePath,
      branch: "main",
    });

    const { repoPath } = await ensureRepo("repo-managed-1", remotePath, "main", "main");
    expect(await git(["rev-parse", "origin/main"], repoPath)).toBe(checkpointSha);

    const restored = await createWorktree({
      repoId: "repo-managed-1",
      sessionId: "session-restore",
      defaultBranch: "main",
      branch: "main",
      preserveBranchName: true,
      checkpointSha,
      sessionGroupId: "group-restore",
      slug: "restore",
    });

    expect(await git(["rev-parse", "HEAD"], restored.workdir)).toBe(checkpointSha);
    await expect(
      fs.promises.readFile(path.join(restored.workdir, "app/page.tsx"), "utf8"),
    ).resolves.toContain("Checkpoint version");
  }, 30_000);
});
