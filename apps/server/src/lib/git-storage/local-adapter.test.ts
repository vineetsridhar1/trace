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
