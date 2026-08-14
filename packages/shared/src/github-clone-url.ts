/**
 * Convert a GitHub SSH or HTTPS remote to an authenticated HTTPS clone URL.
 * Non-GitHub remotes and absent credentials are intentionally left unchanged.
 */
export function resolveGitHubCloneUrl(remoteUrl: string, githubToken?: string): string {
  if (!githubToken) return remoteUrl;

  const ref = parseGitHubRemote(remoteUrl);
  if (!ref) return remoteUrl;

  const url = new URL(`https://github.com/${ref.owner}/${ref.repo}.git`);
  url.username = "x-access-token";
  url.password = githubToken;
  return url.toString();
}

function parseGitHubRemote(remoteUrl: string): { owner: string; repo: string } | null {
  const trimmed = remoteUrl.trim();
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/i, "") };
  } catch {
    return null;
  }
}
