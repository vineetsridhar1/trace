import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { afterEach, describe, expect, it } from "vitest";
import { getGitInfo } from "./git-info.js";

const execFileAsync = promisify(execFile);

const tempRoots: string[] = [];

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trace-git-info-"));
  tempRoots.push(root);
  return root;
}

async function createOriginFixture(): Promise<{ repoPath: string; remoteUrl: string }> {
  const root = makeTempRoot();
  const sourcePath = path.join(root, "source");
  const originPath = path.join(root, "origin.git");
  const repoPath = path.join(root, "repo");

  fs.mkdirSync(sourcePath);
  await git(sourcePath, ["init", "-b", "main"]);
  await git(sourcePath, ["config", "user.name", "Trace Test"]);
  await git(sourcePath, ["config", "user.email", "trace@example.com"]);
  fs.writeFileSync(path.join(sourcePath, "app.txt"), "base\n");
  await git(sourcePath, ["add", "app.txt"]);
  await git(sourcePath, ["commit", "-m", "initial commit"]);
  await git(root, ["clone", "--bare", sourcePath, originPath]);
  await git(root, ["clone", originPath, repoPath]);

  return { repoPath, remoteUrl: originPath };
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("getGitInfo", () => {
  it("returns git info for a checked-out branch", async () => {
    const { repoPath, remoteUrl } = await createOriginFixture();

    await expect(getGitInfo(repoPath)).resolves.toEqual({
      remoteUrl,
      defaultBranch: "main",
      name: "repo",
    });
  });

  it("does not use the current branch as the default branch", async () => {
    const { repoPath, remoteUrl } = await createOriginFixture();
    await git(repoPath, ["checkout", "-b", "feature/work"]);

    await expect(getGitInfo(repoPath)).resolves.toEqual({
      remoteUrl,
      defaultBranch: "main",
      name: "repo",
    });
  });

  it("accepts detached HEAD checkouts with an origin remote", async () => {
    const { repoPath, remoteUrl } = await createOriginFixture();
    const headSha = await git(repoPath, ["rev-parse", "HEAD"]);
    await git(repoPath, ["checkout", "--detach", headSha]);

    await expect(getGitInfo(repoPath)).resolves.toEqual({
      remoteUrl,
      defaultBranch: "main",
      name: "repo",
    });
  });

  it("accepts folders without an origin remote", async () => {
    const root = makeTempRoot();
    const repoPath = path.join(root, "repo");
    fs.mkdirSync(repoPath);
    await git(repoPath, ["init", "-b", "main"]);

    await expect(getGitInfo(repoPath)).resolves.toEqual({
      remoteUrl: null,
      defaultBranch: "main",
      name: "repo",
    });
  });
});
