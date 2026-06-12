// GitHub organization membership helpers. Trace is hosted only for opendoor,
// so members of AUTO_JOIN_GITHUB_ORG are auto-added on login.

const GITHUB_API_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
} as const;

const MEMBERSHIP_CHECK_TIMEOUT_MS = 5_000;

export const AUTO_JOIN_GITHUB_ORG = process.env.AUTO_JOIN_GITHUB_ORG?.trim() || "opendoor-labs";

// Whether the holder of accessToken is an active member of orgSlug. Requires the
// token to carry the read:org scope; without it GitHub returns 403. Any non-OK
// status or network/timeout error is treated as non-membership, but logged with
// its status so a genuine member who isn't auto-added can be diagnosed (403 =
// scope/app-approval problem, 404 = not a member, 5xx/429 = transient).
export async function isGitHubOrgMember(accessToken: string, orgSlug: string): Promise<boolean> {
  let res: Response;
  try {
    res = await fetch(
      `https://api.github.com/user/memberships/orgs/${encodeURIComponent(orgSlug)}`,
      {
        headers: { ...GITHUB_API_HEADERS, Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(MEMBERSHIP_CHECK_TIMEOUT_MS),
      },
    );
  } catch (error) {
    console.warn(
      `[github-org] membership check for ${orgSlug} failed: ${(error as Error).message}`,
    );
    return false;
  }
  if (!res.ok) {
    console.warn(`[github-org] membership check for ${orgSlug} returned ${res.status}`);
    return false;
  }
  const body = (await res.json().catch(() => null)) as { state?: string } | null;
  return body?.state === "active";
}
