export function gitRemoteToBrowserUrl(gitUrl: string): string {
  const sshMatch = gitUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2]}`;
  if (/^https?:\/\//i.test(gitUrl)) return gitUrl.replace(/\.git$/i, "");
  return gitUrl;
}

export function resolveBrowserUrl(
  overrideUrl: string | null | undefined,
  prUrl: string | null | undefined,
  remoteUrl: string | null | undefined,
): string {
  if (overrideUrl) return overrideUrl;
  if (prUrl) return prUrl;
  return remoteUrl ? gitRemoteToBrowserUrl(remoteUrl) : "";
}

export function normalizeBrowserInputUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
