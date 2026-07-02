import type { ExpressContextFunctionArgument } from "@as-integrations/express5";
import type { Request } from "express";
import type { IncomingHttpHeaders } from "http";
import jwt from "jsonwebtoken";
import type { Context } from "../context.js";
import {
  authenticateMobileSecret,
  type MobileAuthSubject,
} from "../services/mobile-auth.js";
import { getCanonicalLocalOrganizationId } from "../services/local-bootstrap.js";
import { AuthenticationError } from "./errors.js";
import { assertOrgMembership } from "./org-access-guard.js";
import { prisma } from "./db.js";
import { isLocalMode } from "./mode.js";
import {
  createUserLoader,
  createSessionLoader,
  createSessionGroupLoader,
  createRepoLoader,
  createEventLoader,
  createConversationLoader,
  createBranchLoader,
  createTurnLoader,
  createChatMembersLoader,
  createSessionTicketsLoader,
  createChannelMembershipLoader,
  createChatMembershipLoader,
} from "./dataloader.js";
import { resolveJwtSecret } from "./jwt-secret.js";

const JWT_SECRET = resolveJwtSecret();
const BRIDGE_AUTH_TOKEN_TTL_SECONDS = 5 * 60;
const EXTERNAL_LOCAL_MODE_AUTH_ERROR =
  "External local-mode access requires a paired mobile token";

type SessionTokenPayload = {
  userId: string;
  organizationId?: string;
  channelId?: string;
  tokenType?: "session" | "trace_agent";
};

type BridgeAuthTokenPayload = {
  userId: string;
  organizationId: string;
  instanceId: string;
  tokenType: "bridge_auth";
};

type SessionAuthSubject = {
  kind: "session";
  userId: string;
  organizationId?: string;
  channelId?: string;
  actorType?: "user" | "agent";
};

export type AccessTokenAuthSubject = SessionAuthSubject | MobileAuthSubject;

type RequestAuthSource = {
  headers: IncomingHttpHeaders;
  socket?: { remoteAddress?: string | null } | null;
};

type ContextBuildInput = {
  token: string | undefined;
  request?: RequestAuthSource;
  requestedOrgId?: string | null;
  clientSource: string | null;
};

function parseSessionToken(token: string): SessionTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as
      | SessionTokenPayload
      | BridgeAuthTokenPayload;
    if (
      !payload ||
      typeof payload !== "object" ||
      typeof payload.userId !== "string" ||
      payload.tokenType === "bridge_auth"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function parseCookieToken(cookieHeader?: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/trace_token=([^;]+)/);
  return match?.[1];
}

function normalizeIpAddress(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("::ffff:") ? trimmed.slice(7) : trimmed;
}

function readForwardedToken(headers: IncomingHttpHeaders, token: "for" | "host"): string | null {
  const rawValue = headers.forwarded;
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  if (typeof value !== "string") return null;

  const firstEntry = value.split(",")[0];
  if (!firstEntry) return null;

  const match = firstEntry.match(new RegExp(`${token}=([^;]+)`, "i"));
  if (!match) return null;

  return match[1]?.trim().replace(/^"|"$/g, "") || null;
}

function readForwardedFor(headers: IncomingHttpHeaders): string | null {
  const rawValue = headers["x-forwarded-for"];
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  const candidate = typeof value === "string" ? value : readForwardedToken(headers, "for");
  if (typeof candidate !== "string") return null;
  const [first] = candidate.split(",");
  const trimmed = first?.trim() ?? "";
  return trimmed || null;
}

function readHeaderValue(headers: IncomingHttpHeaders, key: string): string | null {
  const rawValue = headers[key];
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readClientSource(headers: IncomingHttpHeaders): string | null {
  return readHeaderValue(headers, "x-trace-client-source");
}

function readForwardedHost(headers: IncomingHttpHeaders): string | null {
  const value = readHeaderValue(headers, "x-forwarded-host");
  const candidate = value ?? readForwardedToken(headers, "host");
  if (!candidate) return null;
  const [first] = candidate.split(",");
  const trimmed = first?.trim() ?? "";
  return trimmed || null;
}

function readRequestHost(headers: IncomingHttpHeaders): string | null {
  return readForwardedHost(headers) ?? readHeaderValue(headers, "host");
}

function extractHostname(value: string): string | null {
  try {
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
    const hostname = new URL(candidate).hostname.toLowerCase();
    if (hostname.startsWith("[") && hostname.endsWith("]")) {
      return hostname.slice(1, -1);
    }
    return hostname || null;
  } catch {
    return null;
  }
}

function isTrustedLocalHostname(value: string | null): boolean {
  const hostname = value ? extractHostname(value) : null;
  if (!hostname) return false;
  return hostname === "localhost" || isLoopbackAddress(hostname);
}

export function isLoopbackAddress(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = normalizeIpAddress(value);
  return normalized === "127.0.0.1" || normalized === "::1";
}

export function isLoopbackRequest(request: RequestAuthSource): boolean {
  const remoteAddressIsLoopback = isLoopbackAddress(request.socket?.remoteAddress);
  if (!remoteAddressIsLoopback) {
    return false;
  }
  const forwardedFor = readForwardedFor(request.headers);
  if (forwardedFor && !isLoopbackAddress(forwardedFor)) {
    return false;
  }

  if (!isTrustedLocalHostname(readRequestHost(request.headers))) {
    return false;
  }

  const origin = readHeaderValue(request.headers, "origin");
  if (origin && !isTrustedLocalHostname(origin)) {
    return false;
  }

  const referer = readHeaderValue(request.headers, "referer");
  if (referer && !isTrustedLocalHostname(referer)) {
    return false;
  }

  return true;
}

export function isExternalLocalModeRequest(request: RequestAuthSource): boolean {
  return isLocalMode() && !isLoopbackRequest(request);
}

/** Verify a JWT and return the userId, or null if invalid. */
export function verifyToken(token: string): string | null {
  return parseSessionToken(token)?.userId ?? null;
}

export async function authenticateAccessToken(
  token: string,
): Promise<AccessTokenAuthSubject | null> {
  const payload = parseSessionToken(token);
  if (payload) {
    return {
      kind: "session",
      userId: payload.userId,
      ...(payload.organizationId ? { organizationId: payload.organizationId } : {}),
      ...(payload.channelId ? { channelId: payload.channelId } : {}),
      actorType: payload.tokenType === "trace_agent" ? "agent" : "user",
    };
  }

  return authenticateMobileSecret(token);
}

export function createBridgeAuthToken(input: {
  userId: string;
  organizationId: string;
  instanceId: string;
}): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + BRIDGE_AUTH_TOKEN_TTL_SECONDS * 1000);
  const token = jwt.sign(
    {
      userId: input.userId,
      organizationId: input.organizationId,
      instanceId: input.instanceId,
      tokenType: "bridge_auth",
    } satisfies BridgeAuthTokenPayload,
    JWT_SECRET,
    { expiresIn: BRIDGE_AUTH_TOKEN_TTL_SECONDS },
  );
  return { token, expiresAt };
}

export function verifyBridgeAuthToken(token: string): BridgeAuthTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as BridgeAuthTokenPayload;
    if (
      !payload ||
      typeof payload !== "object" ||
      payload.tokenType !== "bridge_auth" ||
      typeof payload.userId !== "string" ||
      typeof payload.organizationId !== "string" ||
      typeof payload.instanceId !== "string"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Look up the user's role in an organization via OrgMember.
 * Returns null if the user is not a member.
 */
async function resolveOrgMembership(userId: string, organizationId: string) {
  const membership = await prisma.orgMember.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { role: true },
  });
  return membership;
}

/**
 * Get the user's first org membership (fallback when no org header is provided).
 */
async function getFirstOrgMembership(userId: string) {
  return prisma.orgMember.findFirst({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    select: { organizationId: true, role: true },
  });
}

async function getLocalModeOrgMembership(userId: string): Promise<{
  organizationId: string;
  role: Context["role"];
} | null> {
  if (!isLocalMode()) return null;
  const organizationId = await getCanonicalLocalOrganizationId();
  if (!organizationId) return null;
  const membership = await resolveOrgMembership(userId, organizationId);
  if (!membership) return null;
  return {
    organizationId,
    role: membership.role,
  };
}

export function getRequestToken(req: Pick<Request, "headers" | "cookies">): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return req.cookies?.trace_token ?? parseCookieToken(req.headers.cookie);
}

async function buildAuthenticatedContext(input: ContextBuildInput): Promise<Context> {
  if (!input.token) {
    throw new AuthenticationError();
  }

  const authSubject = await authenticateAccessToken(input.token);
  if (!authSubject) {
    throw new AuthenticationError("Invalid token");
  }

  /*
   * Local mode trusts same-machine browser traffic. Public-origin traffic must
   * prove it came from a paired mobile device, so a normal session cookie cannot
   * be replayed into a local Trace server from outside the machine.
   */
  if (
    input.request &&
    isExternalLocalModeRequest(input.request) &&
    authSubject.kind !== "mobile"
  ) {
    throw new AuthenticationError(EXTERNAL_LOCAL_MODE_AUTH_ERROR);
  }
  const sessionOrganizationId =
    authSubject.kind === "session" ? authSubject.organizationId : undefined;
  const actorType = authSubject.kind === "session" ? (authSubject.actorType ?? "user") : "user";

  const user = await prisma.user.findUnique({
    where: { id: authSubject.userId },
    select: { id: true, email: true },
  });

  if (!user) {
    throw new AuthenticationError("User not found");
  }

  let organizationId: string | null = null;
  let role: Context["role"] = null;

  /*
   * Local mode has one canonical organization. It wins over client-provided
   * organization identifiers so stale clients cannot steer the auth context to
   * an arbitrary organization.
   */
  const localModeMembership = await getLocalModeOrgMembership(user.id);
  if (localModeMembership) {
    organizationId = localModeMembership.organizationId;
    role = localModeMembership.role;
  } else if (input.requestedOrgId ?? sessionOrganizationId) {
    const requestedOrganizationId = input.requestedOrgId ?? sessionOrganizationId;
    if (!requestedOrganizationId) {
      throw new AuthenticationError("Not a member of this organization");
    }
    const membership = await resolveOrgMembership(user.id, requestedOrganizationId);
    if (!membership) {
      throw new AuthenticationError("Not a member of this organization");
    }
    organizationId = requestedOrganizationId;
    role = membership.role;
  } else {
    const firstMembership = await getFirstOrgMembership(user.id);
    if (firstMembership) {
      organizationId = firstMembership.organizationId;
      role = firstMembership.role;
    }
  }

  assertOrgMembership(organizationId);

  // Data loaders are scoped to one request or connection so cached batches never
  // leak across users, organizations, or GraphQL operations.
  return {
    userId: user.id,
    organizationId,
    clientSource: input.clientSource,
    role,
    actorType,
    userLoader: createUserLoader(),
    sessionLoader: createSessionLoader(),
    sessionGroupLoader: createSessionGroupLoader(),
    repoLoader: createRepoLoader(),
    eventLoader: createEventLoader(),
    conversationLoader: createConversationLoader(),
    branchLoader: createBranchLoader(),
    turnLoader: createTurnLoader(),
    chatMembersLoader: createChatMembersLoader(),
    sessionTicketsLoader: createSessionTicketsLoader(organizationId),
    channelMembershipLoader: createChannelMembershipLoader(user.id),
    chatMembershipLoader: createChatMembershipLoader(user.id),
  };
}

export async function buildContext({ req }: ExpressContextFunctionArgument): Promise<Context> {
  const token = getRequestToken(req);
  const orgHeader = req.headers["x-organization-id"];
  const requestedOrgId = Array.isArray(orgHeader) ? orgHeader[0] : orgHeader;

  if (!token && isExternalLocalModeRequest(req)) {
    throw new AuthenticationError(EXTERNAL_LOCAL_MODE_AUTH_ERROR);
  }

  return buildAuthenticatedContext({
    token,
    request: req,
    requestedOrgId,
    clientSource: readClientSource(req.headers),
  });
}

export async function buildWsContext(
  connectionParams?: Record<string, unknown>,
  cookieHeader?: string,
  request?: RequestAuthSource,
): Promise<Context> {
  const token =
    (typeof connectionParams?.token === "string" ? connectionParams.token : undefined) ??
    parseCookieToken(cookieHeader);
  const requestedOrgId =
    typeof connectionParams?.organizationId === "string"
      ? connectionParams.organizationId
      : undefined;
  const clientSource =
    typeof connectionParams?.clientSource === "string" && connectionParams.clientSource.trim()
      ? connectionParams.clientSource.trim()
      : null;

  return buildAuthenticatedContext({
    token,
    request,
    requestedOrgId,
    clientSource,
  });
}
