import { prisma } from "../lib/db.js";
import { AUTO_JOIN_GITHUB_ORG, isGitHubOrgMember } from "../lib/github-org.js";
import { orgMemberService } from "./org-member.js";

// Trace is hosted only for opendoor, so login requests read:org to detect
// membership of AUTO_JOIN_GITHUB_ORG and auto-add those users to the organization.
export const GITHUB_LOGIN_SCOPE = "read:org";

type GitHubAccessTokenResponse = { access_token?: string; error?: string; scope?: string };
type GitHubUserResponse = {
  id: number;
  login: string;
  email: string | null;
  avatar_url: string;
  name: string | null;
};

function githubClientId(): string {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) throw new Error("GITHUB_CLIENT_ID is not set");
  return clientId;
}

function isGitHubUserResponse(value: unknown): value is GitHubUserResponse {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<GitHubUserResponse>;
  return (
    typeof user.id === "number" &&
    typeof user.login === "string" &&
    (typeof user.email === "string" || user.email === null) &&
    typeof user.avatar_url === "string" &&
    (typeof user.name === "string" || user.name === null)
  );
}

export async function upsertUserFromGitHubAccessToken(accessToken: string) {
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const ghUser = (await userRes.json().catch(() => null)) as unknown;
  if (!userRes.ok || !isGitHubUserResponse(ghUser)) {
    throw new Error("Could not verify GitHub identity");
  }
  const email = `github-${ghUser.id}@trace.local`;

  let user = await prisma.user.findUnique({
    where: { githubId: ghUser.id },
  });

  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        githubId: ghUser.id,
        avatarUrl: ghUser.avatar_url,
        name: ghUser.name || ghUser.login,
      },
    });
  } else {
    user = await prisma.user.create({
      data: {
        email,
        name: ghUser.name || ghUser.login,
        githubId: ghUser.id,
        avatarUrl: ghUser.avatar_url,
      },
    });
  }

  return user;
}

// Auto-add members of the configured GitHub org to the Trace organization on login.
// Failures here never block login — the user just isn't auto-added.
export async function autoJoinOrganizationIfMember(
  userId: string,
  accessToken: string,
): Promise<void> {
  try {
    if (!(await isGitHubOrgMember(accessToken, AUTO_JOIN_GITHUB_ORG))) return;

    const organization = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!organization) return;

    const existing = await prisma.orgMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: organization.id } },
      select: { userId: true },
    });
    if (existing) return;

    await orgMemberService.addMember({
      organizationId: organization.id,
      userId,
      actorType: "system",
      actorId: "system",
    });
  } catch (error) {
    console.error("[auth] Failed to auto-join organization:", (error as Error).message);
  }
}

/** The organization an MCP OAuth token is scoped to: the user's oldest membership. */
export async function resolveDefaultOrganizationId(userId: string): Promise<string | null> {
  const membership = await prisma.orgMember.findFirst({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    select: { organizationId: true },
  });
  return membership?.organizationId ?? null;
}

/** URL that starts GitHub's web authorization-code flow (browser redirect). */
export function buildGitHubWebAuthorizeUrl(input: { state: string; redirectUri: string }): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", githubClientId());
  url.searchParams.set("scope", GITHUB_LOGIN_SCOPE);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}

/** Exchanges a GitHub web-flow authorization code for a GitHub access token. */
export async function exchangeGitHubWebCode(
  code: string,
  redirectUri: string,
): Promise<GitHubAccessTokenResponse> {
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientSecret) throw new Error("GITHUB_CLIENT_SECRET is not set");

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: githubClientId(),
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  return (await response.json().catch(() => ({}))) as GitHubAccessTokenResponse;
}
