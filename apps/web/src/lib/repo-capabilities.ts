export const CLOUD_REPO_REMOTE_REQUIRED =
  "Cloud sessions need a remote URL so the runtime can clone the repo.";

export const WEBHOOK_REPO_REMOTE_REQUIRED =
  "GitHub webhooks need a GitHub remote URL for this repo.";

export type RepoRemoteRef =
  | {
      remoteUrl?: string | null;
    }
  | null
  | undefined;

export function hasRepoRemote(repo: RepoRemoteRef): boolean {
  return typeof repo?.remoteUrl === "string" && repo.remoteUrl.trim().length > 0;
}

export function repoRemoteKnownMissing(repo: RepoRemoteRef): boolean {
  return repo != null && "remoteUrl" in repo && !hasRepoRemote(repo);
}

export function resolveSupportedHostingForRepo(
  hosting: string | null | undefined,
  _repo: RepoRemoteRef,
): string | undefined {
  return hosting ?? undefined;
}
