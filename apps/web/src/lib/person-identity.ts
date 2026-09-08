/**
 * GitHub sign-in uses a verified Opendoor email when available. This synthetic
 * fallback identifies nobody, so people pickers show a GitHub label instead.
 */
const SYNTHETIC_GITHUB_EMAIL = /^github-\d+@trace\.local$/;

export function isSyntheticGitHubEmail(email: string): boolean {
  return SYNTHETIC_GITHUB_EMAIL.test(email);
}

export function personInitials(name: string): string {
  const initials = name
    .split(" ")
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("");
  return initials.toUpperCase() || "?";
}
