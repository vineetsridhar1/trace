const VALID_SHA_RE = /^[0-9a-f]{7,40}$/i;

export function shortSha(commitSha: string): string {
  return commitSha.slice(0, 7);
}

export function isValidCommitSha(sha: string): boolean {
  return VALID_SHA_RE.test(sha);
}

export function assertValidCommitSha(sha: string): void {
  if (!isValidCommitSha(sha)) {
    throw new Error(`Invalid commit SHA: ${sha.slice(0, 50)}`);
  }
}
