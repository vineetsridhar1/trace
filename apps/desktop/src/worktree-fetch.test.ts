import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorktree } from "./worktree.js";

const execFileAsync = promisify(execFile);
const tempRoots: string[] = [];
const nestedBranch = "test/siren-staging-flags-on";

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function createConflictingOriginFixture(): Promise<{
  repoPath: string;
  commitSha: string;
}> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trace-worktree-fetch-"));
  tempRoots.push(root);
  vi.spyOn(os, "homedir").mockReturnValue(root);
  const sourcePath = path.join(root, "source");
  const originPath = path.join(root, "origin.git");
  const repoPath = path.join(root, "repo");

  fs.mkdirSync(sourcePath);
  await git(sourcePath, ["init", "-b", "main"]);
  await git(sourcePath, ["config", "user.name", "Trace Test"]);
  await git(sourcePath, ["config", "user.email", "trace@example.com"]);
  await git(sourcePath, ["config", "commit.gpgsign", "false"]);
  await git(sourcePath, ["config", "core.hooksPath", "/dev/null"]);
  fs.writeFileSync(path.join(sourcePath, "app.txt"), "base\n");
  await git(sourcePath, ["add", "app.txt"]);
  await git(sourcePath, ["commit", "-m", "initial commit"]);
  await git(sourcePath, ["branch", "test"]);
  await git(root, ["clone", "--bare", sourcePath, originPath]);
  await git(root, ["clone", originPath, repoPath]);
  await git(repoPath, ["config", "fetch.prune", "false"]);
  await git(repoPath, ["config", "remote.origin.prune", "false"]);

  await git(sourcePath, ["remote", "add", "origin", originPath]);
  await git(sourcePath, ["push", "origin", "--delete", "test"]);
  await git(sourcePath, ["branch", "-d", "test"]);
  await git(sourcePath, ["checkout", "-b", nestedBranch]);
  fs.writeFileSync(path.join(sourcePath, "app.txt"), "nested branch\n");
  await git(sourcePath, ["commit", "-am", "nested branch commit"]);
  await git(sourcePath, ["push", "origin", nestedBranch]);

  return { repoPath, commitSha: await git(sourcePath, ["rev-parse", "HEAD"]) };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("createWorktree fetches", () => {
  it("prunes a deleted parent branch before fetching its nested replacement", async () => {
    const { repoPath, commitSha } = await createConflictingOriginFixture();
    await git(repoPath, ["rev-parse", "--verify", "refs/remotes/origin/test"]);

    const result = await createWorktree({
      repoPath,
      repoId: "repo-1",
      sessionId: "session-1",
      slug: "otter",
      defaultBranch: "main",
      startBranch: nestedBranch,
    });

    await expect(
      git(repoPath, ["show-ref", "--verify", "refs/remotes/origin/test"]),
    ).rejects.toThrow();
    await expect(git(repoPath, ["rev-parse", "refs/remotes/origin/" + nestedBranch])).resolves.toBe(
      commitSha,
    );
    await expect(git(result.workdir, ["rev-parse", "HEAD"])).resolves.toBe(commitSha);
  });

  it("prunes conflicting refs when fetching an unavailable restoration commit", async () => {
    const { repoPath, commitSha } = await createConflictingOriginFixture();
    await expect(git(repoPath, ["cat-file", "-t", commitSha])).rejects.toThrow();

    const result = await createWorktree({
      repoPath,
      repoId: "repo-1",
      sessionId: "session-1",
      slug: "otter",
      defaultBranch: "main",
      baseCommitSha: commitSha,
    });

    await expect(
      git(repoPath, ["show-ref", "--verify", "refs/remotes/origin/test"]),
    ).rejects.toThrow();
    await expect(git(repoPath, ["rev-parse", "refs/remotes/origin/" + nestedBranch])).resolves.toBe(
      commitSha,
    );
    await expect(git(result.workdir, ["rev-parse", "HEAD"])).resolves.toBe(commitSha);
  });
});
