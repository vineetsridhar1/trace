import type { ExpressContextFunctionArgument } from "@as-integrations/express5";
import type { Request } from "express";
import jwt from "jsonwebtoken";
import type { Context } from "../context.js";
import { AuthenticationError } from "./errors.js";
import { prisma } from "./db.js";
import { isTokenRevoked } from "./token-revocation.js";
import {
  allowDevHeaderAuth,
  isSuperAdminEmail,
  resolveJwtSecret,
} from "./auth-config.js";
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

const JWT_SECRET = resolveJwtSecret();
const BRIDGE_AUTH_TOKEN_TTL_SECONDS = 5 * 60;

type SessionTokenPayload = {
  userId: string;
  jti?: string;
  iat?: number;
  exp?: number;
  tokenType?: "session";
};

type BridgeAuthTokenPayload = {
  userId: string;
  organizationId: string;
  instanceId: string;
  tokenType: "bridge_auth";
};

function parseSessionTokenSync(token: string): SessionTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as SessionTokenPayload | BridgeAuthTokenPayload;
    if (
      !payload ||
      typeof payload !== "object" ||
      typeof payload.userId !== "string" ||
      (payload as BridgeAuthTokenPayload).tokenType === "bridge_auth"
    ) {
      return null;
    }
    return payload as SessionTokenPayload;
  } catch {
    return null;
  }
}

async function parseSessionTokenAsync(token: string): Promise<SessionTokenPayload | null> {
  const payload = parseSessionTokenSync(token);
  if (!payload) return null;
  if (payload.jti && (await isTokenRevoked(payload.jti))) {
    return null;
  }
  return payload;
}

export function parseCookieToken(cookieHeader?: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/trace_token=([^;]+)/);
  return match?.[1];
}

/**
 * Verify a session JWT and return the userId, or null if invalid.
 *
 * Sync variant: does not check the token-revocation list. Used by callers
 * that cannot run async (local storage token verification, upload routes
 * where the blast radius of a revoked-but-not-yet-expired token is small).
 * For the GraphQL request path, {@link buildContext} performs the async
 * revocation check.
 */
export function verifyToken(token: string): string | null {
  return parseSessionTokenSync(token)?.userId ?? null;
}

export async function verifyTokenAsync(token: string): Promise<string | null> {
  return (await parseSessionTokenAsync(token))?.userId ?? null;
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
    const payload = jwt.verify(token, JWT_SECRET) as BridgeAuthTokenPayload;
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

export function getRequestToken(req: Pick<Request, "headers" | "cookies">): string | undefined {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : req.cookies?.trace_token;
}

export async function buildContext({ req }: ExpressContextFunctionArgument): Promise<Context> {
  let userId: string | undefined;

  // Accept token from Authorization header or cookie. x-user-id is a
  // development-only fallback gated on NODE_ENV + ALLOW_DEV_HEADER_AUTH=1 so
  // it cannot be reached in production builds even accidentally.
  const token = getRequestToken(req);
  if (token) {
    const payload = await parseSessionTokenAsync(token);
    if (!payload) {
      throw new AuthenticationError("Invalid token");
    }
    userId = payload.userId;
  } else if (allowDevHeaderAuth()) {
    const rawUserId = req.headers["x-user-id"];
    userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
  }

  if (!userId) {
    throw new AuthenticationError();
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });

  if (!user) {
    throw new AuthenticationError("User not found");
  }

  const isSuperAdmin = isSuperAdminEmail(user.email);

  // Resolve organization from X-Organization-Id header
  const orgHeader = req.headers["x-organization-id"];
  const requestedOrgId = Array.isArray(orgHeader) ? orgHeader[0] : orgHeader;

  let organizationId: string | null = null;
  let role: Context["role"] = null;

  if (requestedOrgId) {
    const membership = await resolveOrgMembership(user.id, requestedOrgId);
    if (!membership) {
      throw new AuthenticationError("Not a member of this organization");
    }
    organizationId = requestedOrgId;
    role = isSuperAdmin ? "admin" : (membership.role as Context["role"]);
  } else {
    // Fall back to first org membership
    const firstMembership = await getFirstOrgMembership(user.id);
    if (firstMembership) {
      organizationId = firstMembership.organizationId;
      role = isSuperAdmin ? "admin" : (firstMembership.role as Context["role"]);
    }
  }

  return {
    userId: user.id,
    organizationId,
    role,
    actorType: "user",
    userLoader: createUserLoader(),
    sessionLoader: createSessionLoader(organizationId),
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

export async function buildWsContext(connectionParams?: Record<string, unknown>, cookieHeader?: string): Promise<Context> {
  const token =
    (connectionParams?.token as string) ?? parseCookieToken(cookieHeader);

  if (!token) throw new AuthenticationError("Missing auth token for WebSocket");

  const payload = await parseSessionTokenAsync(token);
  if (!payload) {
    throw new AuthenticationError("Invalid token");
  }
  const userId = payload.userId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) throw new AuthenticationError("User not found");

  const isSuperAdmin = isSuperAdminEmail(user.email);

  // Resolve organization from connectionParams
  const requestedOrgId = connectionParams?.organizationId as string | undefined;

  let organizationId: string | null = null;
  let role: Context["role"] = null;

  if (requestedOrgId) {
    const membership = await resolveOrgMembership(user.id, requestedOrgId);
    if (membership) {
      organizationId = requestedOrgId;
      role = isSuperAdmin ? "admin" : (membership.role as Context["role"]);
    }
  } else {
    const firstMembership = await getFirstOrgMembership(user.id);
    if (firstMembership) {
      organizationId = firstMembership.organizationId;
      role = isSuperAdmin ? "admin" : (firstMembership.role as Context["role"]);
    }
  }

  return {
    userId: user.id,
    organizationId,
    role,
    actorType: "user",
    userLoader: createUserLoader(),
    sessionLoader: createSessionLoader(organizationId),
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
