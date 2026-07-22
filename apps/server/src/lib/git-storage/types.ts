/**
 * Storage seam for Trace-managed bare git repositories.
 *
 * Managed repos give generated app/design sessions durable git history without
 * forcing a GitHub repo. The adapter owns *where* the bare repos live and their
 * on-disk lifecycle (path resolution, init, existence, delete, gc). It knows
 * nothing about auth, provider rows, or the smart-HTTP protocol — those live in
 * the managed-git service and route layers.
 */
export interface GitStorageAdapter {
  /**
   * Absolute filesystem path of a repo's bare directory. Pure (no I/O) so
   * callers can hand it to `git ... --stateless-rpc <path>`. Implementations
   * must reject ids that could escape the storage root.
   */
  resolveRepoPath(organizationId: string, repoId: string): string;
  /** Whether the bare repo has been initialized on disk. */
  repoExists(organizationId: string, repoId: string): Promise<boolean>;
  /**
   * Initialize the bare repo if it does not already exist. Idempotent — a
   * second call against an initialized repo is a no-op. Returns the repo path.
   */
  initBareRepo(
    organizationId: string,
    repoId: string,
    options?: { defaultBranch?: string },
  ): Promise<string>;
  /** Remove the bare repo directory. Safe to call when it does not exist. */
  deleteRepo(organizationId: string, repoId: string): Promise<void>;
  /** Run `git gc` to compact the bare repo. No-op when the repo is missing. */
  gc(organizationId: string, repoId: string): Promise<void>;
  /**
   * Current ref state as a map of ref name → commit sha. Used after a push to
   * report which refs were actually accepted (receive-pack can exit 0 while
   * rejecting individual updates). Returns an empty map for a missing repo.
   */
  listRefs(organizationId: string, repoId: string): Promise<Map<string, string>>;
  /** Read a UTF-8 file from an exact commit without checking out a worktree. */
  readFileAtCommit(
    organizationId: string,
    repoId: string,
    commitSha: string,
    filePath: string,
  ): Promise<string | null>;
}
