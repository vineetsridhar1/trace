// GitHub organization membership helpers. Trace is hosted only for opendoor,
// so members of AUTO_JOIN_GITHUB_ORG are auto-added on login and reconciled out
// when they leave the org.

const GITHUB_API_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
} as const;

export const AUTO_JOIN_GITHUB_ORG = process.env.AUTO_JOIN_GITHUB_ORG?.trim() || "opendoor-labs";

// Whether the holder of accessToken is an active member of orgSlug. Requires the
// token to carry the read:org scope; without it GitHub returns 403 and we treat
// the user as a non-member.
export async function isGitHubOrgMember(accessToken: string, orgSlug: string): Promise<boolean> {
  const res = await fetch(
    `https://api.github.com/user/memberships/orgs/${encodeURIComponent(orgSlug)}`,
    {
      headers: { ...GITHUB_API_HEADERS, Authorization: `Bearer ${accessToken}` },
    },
  );
  // 404 = not a member, 403 = read:org not granted; either way, do not auto-join.
  if (!res.ok) return false;
  const body = (await res.json().catch(() => null)) as { state?: string } | null;
  return body?.state === "active";
}

// All GitHub user ids that are members of orgSlug, using a server-side token with
// read:org. Returns null if any page fails or the response is malformed, so callers
// can distinguish "could not determine membership" from "org has no members".
export async function listGitHubOrgMemberIds(
  token: string,
  orgSlug: string,
): Promise<Set<number> | null> {
  const ids = new Set<number>();
  const perPage = 100;
  for (let page = 1; page <= 100; page += 1) {
    const res = await fetch(
      `https://api.github.com/orgs/${encodeURIComponent(orgSlug)}/members?per_page=${perPage}&page=${page}`,
      {
        headers: { ...GITHUB_API_HEADERS, Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as unknown;
    if (!Array.isArray(body)) return null;
    for (const entry of body) {
      const id = (entry as { id?: unknown }).id;
      if (typeof id === "number") ids.add(id);
    }
    if (body.length < perPage) break;
  }
  return ids;
}
