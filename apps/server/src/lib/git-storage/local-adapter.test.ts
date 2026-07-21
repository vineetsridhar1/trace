import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { LocalGitStorageAdapter } from "./local-adapter.js";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("LocalGitStorageAdapter.readFileAtCommit", () => {
  it("reads an exact commit and rejects unsafe file paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "trace-git-storage-"));
    const checkout = await mkdtemp(path.join(os.tmpdir(), "trace-git-checkout-"));
    tempDirs.push(root, checkout);
    const adapter = new LocalGitStorageAdapter(root);
    const bareRepo = await adapter.initBareRepo("org-1", "repo-1");

    await execFileAsync("git", ["init", "--initial-branch", "main"], { cwd: checkout });
    await execFileAsync("git", ["config", "user.name", "Trace Test"], { cwd: checkout });
    await execFileAsync("git", ["config", "user.email", "trace@example.test"], { cwd: checkout });
    await writeFile(
      path.join(checkout, "document.format.json"),
      '{"width":297,"height":297,"unit":"mm"}\n',
    );
    await execFileAsync("git", ["add", "document.format.json"], { cwd: checkout });
    await execFileAsync("git", ["commit", "-m", "Add PDF format"], { cwd: checkout });
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: checkout });
    const commitSha = stdout.trim();
    await execFileAsync("git", ["push", bareRepo, "HEAD:refs/heads/main"], { cwd: checkout });

    await expect(
      adapter.readFileAtCommit("org-1", "repo-1", commitSha, "document.format.json"),
    ).resolves.toContain('"width":297');
    await expect(
      adapter.readFileAtCommit("org-1", "repo-1", commitSha, "../secret"),
    ).rejects.toThrow("Invalid managed Git file request");
  });
});

describe("LocalGitStorageAdapter exact commit artifacts", () => {
  it("enumerates every introduced commit and archives only its tracked tree", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "trace-git-storage-"));
    const worktree = path.join(root, "worktree");
    const adapter = new LocalGitStorageAdapter(path.join(root, "bare"));
    try {
      await adapter.initBareRepo("org-1", "repo-1");
      await execFileAsync("git", ["clone", adapter.resolveRepoPath("org-1", "repo-1"), worktree]);
      await execFileAsync("git", ["config", "user.email", "fixture@trace.local"], {
        cwd: worktree,
      });
      await execFileAsync("git", ["config", "user.name", "Fixture"], { cwd: worktree });
      await writeFile(path.join(worktree, "one.txt"), "one");
      await execFileAsync("git", ["add", "one.txt"], { cwd: worktree });
      await execFileAsync("git", ["commit", "-m", "one"], { cwd: worktree });
      const first = (
        await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: worktree })
      ).stdout.trim();
      await writeFile(path.join(worktree, "two.txt"), "two");
      await execFileAsync("git", ["add", "two.txt"], { cwd: worktree });
      await execFileAsync("git", ["commit", "-m", "two"], { cwd: worktree });
      const second = (
        await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: worktree })
      ).stdout.trim();
      await execFileAsync("git", ["push", "origin", "main"], { cwd: worktree });
      expect(await adapter.listCommitsBetween("org-1", "repo-1", "0".repeat(40), second)).toEqual([
        first,
        second,
      ]);
      expect(await adapter.getBranchHead("org-1", "repo-1", "main")).toBe(second);
      expect(
        (await adapter.archiveTreeAtCommit("org-1", "repo-1", first)).byteLength,
      ).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
