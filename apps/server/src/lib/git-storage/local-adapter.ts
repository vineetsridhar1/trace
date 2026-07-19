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

export function isSafeStorageId(value: string): boolean {
  return SAFE_ID.test(value);
}

export function assertSafeStorageId(kind: "organization" | "repo", value: string): void {
  if (!isSafeStorageId(value)) {
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
    // Defense in depth beyond the id regex: the resolved absolute path must
    // stay under the storage root.
    if (repoPath !== path.normalize(repoPath) || !repoPath.startsWith(this.rootDir + path.sep)) {
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
    await execFileAsync("git", ["init", "--bare", "--initial-branch", defaultBranch, repoPath]);
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

  async listRefs(organizationId: string, repoId: string): Promise<Map<string, string>> {
    if (!(await this.repoExists(organizationId, repoId))) return new Map();
    const repoPath = this.resolveRepoPath(organizationId, repoId);
    const { stdout } = await execFileAsync("git", [
      "--git-dir",
      repoPath,
      "for-each-ref",
      "--format=%(objectname) %(refname)",
    ]);
    const refs = new Map<string, string>();
    for (const line of stdout.split("\n")) {
      const sep = line.indexOf(" ");
      if (sep === -1) continue;
      const sha = line.slice(0, sep);
      const ref = line.slice(sep + 1).trim();
      if (sha && ref) refs.set(ref, sha);
    }
    return refs;
  }

  async readFileAtCommit(
    organizationId: string,
    repoId: string,
    commitSha: string,
    filePath: string,
  ): Promise<string | null> {
    const normalizedPath = path.posix.normalize(filePath);
    if (
      !/^[a-f0-9]{40,64}$/i.test(commitSha) ||
      normalizedPath !== filePath ||
      normalizedPath === "." ||
      normalizedPath === ".." ||
      normalizedPath.startsWith("../") ||
      path.posix.isAbsolute(normalizedPath)
    ) {
      throw new Error("Invalid managed Git file request");
    }
    const repoPath = this.resolveRepoPath(organizationId, repoId);
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["--git-dir", repoPath, "show", `${commitSha}:${normalizedPath}`],
        { maxBuffer: 1024 * 1024 },
      );
      return stdout;
    } catch {
      return null;
    }
  }
}
