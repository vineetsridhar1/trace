import { AuthenticationError, AuthorizationError } from "./errors.js";
import { isLocalMode } from "./mode.js";

const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_API_VERSION = "2022-11-28";
const TOKEN_CACHE_TTL_MS = 60_000;

// Briefly cache tokens we've already verified so we don't call GitHub on every
// single GraphQL operation. Keyed by the token itself; entries self-expire.
const verifiedTokenExpiry = new Map<string, number>();

async function isValidGitHubToken(token: string): Promise<boolean> {
  const cachedUntil = verifiedTokenExpiry.get(token);
  if (cachedUntil && cachedUntil > Date.now()) return true;

  let response: Response;
  try {
    response = await fetch(GITHUB_USER_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
    });
  } catch {
    return false;
  }

  if (!response.ok) {
    verifiedTokenExpiry.delete(token);
    return false;
  }

  verifiedTokenExpiry.set(token, Date.now() + TOKEN_CACHE_TTL_MS);
  return true;
}

/**
 * Gate for every GraphQL operation: the caller must present a valid GitHub API
 * token and belong to a Trace organization. Either check failing rejects the
 * request before any resolver runs. Skipped in local mode, where GitHub auth is
 * disabled (see routes/auth.ts).
 */
export async function assertGitHubOrgAccess(input: {
  githubToken: string | null;
  organizationId: string | null;
}): Promise<void> {
  if (isLocalMode()) return;

  if (!input.githubToken) {
    throw new AuthenticationError("GitHub API token required");
  }
  if (!(await isValidGitHubToken(input.githubToken))) {
    throw new AuthenticationError("Invalid GitHub API token");
  }
  if (!input.organizationId) {
    throw new AuthorizationError("Not a member of any organization");
  }
}
