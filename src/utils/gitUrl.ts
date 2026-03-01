/**
 * Normalize a git URL to canonical `host/owner/repo` form.
 * Handles SSH (`git@host:owner/repo.git`) and HTTPS (`https://host/owner/repo.git`).
 */
export function normalizeGitUrl(url: string): string {
  let normalized = url.trim();

  // Strip trailing .git
  normalized = normalized.replace(/\.git$/, '');

  // SSH: git@host:owner/repo → host/owner/repo
  const sshMatch = normalized.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`.toLowerCase();
  }

  // HTTPS: https://host/owner/repo → host/owner/repo
  const httpsMatch = normalized.match(/^https?:\/\/([^/]+)\/(.+)$/);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`.toLowerCase();
  }

  // Fallback: return lowercased
  return normalized.toLowerCase();
}

/** Compare two git URLs after normalization. */
export function gitUrlsMatch(a: string, b: string): boolean {
  return normalizeGitUrl(a) === normalizeGitUrl(b);
}
