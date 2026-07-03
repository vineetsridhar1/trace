import { createHash, randomBytes, randomUUID } from "crypto";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { prisma } from "../db.js";
import { redis } from "../redis.js";

const PENDING_AUTH_PREFIX = "oauth:pending:";
const AUTH_CODE_PREFIX = "oauth:code:";
const PENDING_AUTH_TTL_SECONDS = 10 * 60;
const AUTH_CODE_TTL_SECONDS = 60;

export const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

// A single GitHub round-trip in progress: what the MCP client asked for, parked
// while the user authenticates with GitHub. Keyed by the state we hand GitHub.
export type PendingAuthorization = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  clientState?: string;
  scopes: string[];
  resource?: string;
};

// A minted, one-time authorization code bound to an authenticated user.
export type AuthorizationCodeRecord = {
  clientId: string;
  userId: string;
  organizationId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource?: string;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// --- Registered clients (Dynamic Client Registration, RFC 7591) ---

export async function getOAuthClient(
  clientId: string,
): Promise<OAuthClientInformationFull | undefined> {
  const row = await prisma.oAuthClient.findUnique({ where: { id: clientId } });
  if (!row) return undefined;
  return row.metadata as OAuthClientInformationFull;
}

export async function registerOAuthClient(
  client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
): Promise<OAuthClientInformationFull> {
  const clientId = randomUUID();
  const full: OAuthClientInformationFull = {
    ...client,
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
  await prisma.oAuthClient.create({
    data: {
      id: clientId,
      clientName: client.client_name ?? null,
      redirectUris: client.redirect_uris,
      metadata: full as unknown as object,
    },
  });
  return full;
}

// --- Pending GitHub round-trips ---

export async function savePendingAuthorization(
  githubState: string,
  record: PendingAuthorization,
): Promise<void> {
  await redis.set(
    `${PENDING_AUTH_PREFIX}${githubState}`,
    JSON.stringify(record),
    "EX",
    PENDING_AUTH_TTL_SECONDS,
  );
}

export async function consumePendingAuthorization(
  githubState: string,
): Promise<PendingAuthorization | null> {
  const key = `${PENDING_AUTH_PREFIX}${githubState}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  await redis.del(key);
  return JSON.parse(raw) as PendingAuthorization;
}

// --- Authorization codes ---

export async function saveAuthorizationCode(
  code: string,
  record: AuthorizationCodeRecord,
): Promise<void> {
  await redis.set(
    `${AUTH_CODE_PREFIX}${code}`,
    JSON.stringify(record),
    "EX",
    AUTH_CODE_TTL_SECONDS,
  );
}

export async function peekAuthorizationCode(
  code: string,
): Promise<AuthorizationCodeRecord | null> {
  const raw = await redis.get(`${AUTH_CODE_PREFIX}${code}`);
  return raw ? (JSON.parse(raw) as AuthorizationCodeRecord) : null;
}

export async function consumeAuthorizationCode(
  code: string,
): Promise<AuthorizationCodeRecord | null> {
  const key = `${AUTH_CODE_PREFIX}${code}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  await redis.del(key);
  return JSON.parse(raw) as AuthorizationCodeRecord;
}

export function generateAuthorizationCode(): string {
  return randomBytes(32).toString("base64url");
}

// --- Refresh tokens (hashed, revocable, rotated) ---

export async function issueRefreshToken(input: {
  userId: string;
  clientId: string;
  organizationId: string;
  scopes: string[];
}): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.oAuthRefreshToken.create({
    data: {
      tokenHash: hashToken(token),
      userId: input.userId,
      clientId: input.clientId,
      organizationId: input.organizationId,
      scopes: input.scopes,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });
  return token;
}

export type ActiveRefreshToken = {
  userId: string;
  clientId: string;
  organizationId: string;
  scopes: string[];
};

/** Returns the record if the token is known, unrevoked, and unexpired. */
export async function lookupActiveRefreshToken(
  token: string,
): Promise<ActiveRefreshToken | null> {
  const row = await prisma.oAuthRefreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!row || row.revokedAt || row.expiresAt <= new Date()) return null;
  return {
    userId: row.userId,
    clientId: row.clientId,
    organizationId: row.organizationId,
    scopes: row.scopes,
  };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.oAuthRefreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
