import { execFile } from "child_process";
import { access, mkdir, rm } from "fs/promises";
import path from "path";
import { promisify } from "util";
import type { GitStorageAdapter } from "./types.js";

const execFileAsync = promisify(execFile);

// Ids are Trace-generated UUIDs. Constrain hard so a crafted org/repo id can
// never escape the storage root via traversal or absolute paths — this string
// becomes a filesystem path segment.
const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

export function assertSafeStorageId(kind: "organization" | "repo", value: string): void {
  if (!SAFE_ID.test(value)) {
    throw new Error(`Invalid ${kind} id for managed git storage`);
  }
}

/**
 * Filesystem-backed managed git storage. Bare repos live under
 * `${rootDir}/${organizationId}/${repoId}.git`. Suitable for a single-writer
 * durable mounted volume (the v1 target). Multi-node deployments would swap in
 * a different adapter behind the same interface.
 */
export class LocalGitStorageAdapter implements GitStorageAdapter {
  readonly rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = path.resolve(
      rootDir ?? process.env.GIT_STORAGE_ROOT ?? path.join(process.cwd(), ".trace-git"),
    );
  }

  resolveRepoPath(organizationId: string, repoId: string): string {
    assertSafeStorageId("organization", organizationId);
    assertSafeStorageId("repo", repoId);
    const repoPath = path.join(this.rootDir, organizationId, `${repoId}.git`);
    // Defense in depth: the resolved path must stay inside the org directory.
    const orgDir = path.join(this.rootDir, organizationId);
    if (repoPath !== path.join(orgDir, `${repoId}.git`)) {
      throw new Error("Resolved managed git path escaped its storage root");
    }
    return repoPath;
  }

  async repoExists(organizationId: string, repoId: string): Promise<boolean> {
    const repoPath = this.resolveRepoPath(organizationId, repoId);
    try {
      await access(path.join(repoPath, "HEAD"));
      return true;
    } catch {
      return false;
    }
  }

  async initBareRepo(
    organizationId: string,
    repoId: string,
    options?: { defaultBranch?: string },
  ): Promise<string> {
    const repoPath = this.resolveRepoPath(organizationId, repoId);
    if (await this.repoExists(organizationId, repoId)) return repoPath;

    await mkdir(path.dirname(repoPath), { recursive: true });
    const defaultBranch = options?.defaultBranch?.trim() || "main";
    // Arg array — never a shell string. `git init` is idempotent, but we guard
    // with repoExists above so a partially-created dir is re-initialized safely.
    await execFileAsync("git", [
      "init",
      "--bare",
      "--initial-branch",
      defaultBranch,
      repoPath,
    ]);
    return repoPath;
  }

  async deleteRepo(organizationId: string, repoId: string): Promise<void> {
    const repoPath = this.resolveRepoPath(organizationId, repoId);
    await rm(repoPath, { recursive: true, force: true });
  }

  async gc(organizationId: string, repoId: string): Promise<void> {
    if (!(await this.repoExists(organizationId, repoId))) return;
    const repoPath = this.resolveRepoPath(organizationId, repoId);
    await execFileAsync("git", ["--git-dir", repoPath, "gc", "--auto"]);
  }
}
