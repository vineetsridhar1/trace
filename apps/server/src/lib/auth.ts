import type { ExpressContextFunctionArgument } from "@as-integrations/express5";
import jwt from "jsonwebtoken";
import type { Context } from "../context.js";
import { AuthenticationError } from "./errors.js";
import { prisma } from "./db.js";
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

const JWT_SECRET = process.env.JWT_SECRET || "trace-dev-secret";

export function parseCookieToken(cookieHeader?: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/trace_token=([^;]+)/);
  return match?.[1];
}

/** Verify a JWT and return the userId, or null if invalid. */
export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    return payload.userId;
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

export async function buildContext({ req }: ExpressContextFunctionArgument): Promise<Context> {
  let userId: string | undefined;

  // Accept token from Authorization header, cookie, or x-user-id fallback
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : req.cookies?.trace_token;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
      userId = payload.userId;
    } catch {
      throw new AuthenticationError("Invalid token");
    }
  } else {
    const rawUserId = req.headers["x-user-id"];
    userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
  }

  if (!userId) {
    throw new AuthenticationError();
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    throw new AuthenticationError("User not found");
  }

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
    role = membership.role as Context["role"];
  } else {
    // Fall back to first org membership
    const firstMembership = await getFirstOrgMembership(user.id);
    if (firstMembership) {
      organizationId = firstMembership.organizationId;
      role = firstMembership.role as Context["role"];
    }
  }

  return {
    userId: user.id,
    organizationId,
    role,
    actorType: "user",
    userLoader: createUserLoader(),
    sessionLoader: createSessionLoader(),
    sessionGroupLoader: createSessionGroupLoader(),
    repoLoader: createRepoLoader(),
    eventLoader: createEventLoader(),
    conversationLoader: createConversationLoader(),
    branchLoader: createBranchLoader(),
    turnLoader: createTurnLoader(),
    chatMembersLoader: createChatMembersLoader(),
    sessionTicketsLoader: createSessionTicketsLoader(),
    channelMembershipLoader: createChannelMembershipLoader(user.id),
    chatMembershipLoader: createChatMembershipLoader(user.id),
  };
}

export async function buildWsContext(connectionParams?: Record<string, unknown>, cookieHeader?: string): Promise<Context> {
  const token =
    (connectionParams?.token as string) ?? parseCookieToken(cookieHeader);

  if (!token) throw new AuthenticationError("Missing auth token for WebSocket");

  let userId: string;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    userId = payload.userId;
  } catch {
    throw new AuthenticationError("Invalid token");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) throw new AuthenticationError("User not found");

  // Resolve organization from connectionParams
  const requestedOrgId = connectionParams?.organizationId as string | undefined;

  let organizationId: string | null = null;
  let role: Context["role"] = null;

  if (requestedOrgId) {
    const membership = await resolveOrgMembership(user.id, requestedOrgId);
    if (membership) {
      organizationId = requestedOrgId;
      role = membership.role as Context["role"];
    }
  } else {
    const firstMembership = await getFirstOrgMembership(user.id);
    if (firstMembership) {
      organizationId = firstMembership.organizationId;
      role = firstMembership.role as Context["role"];
    }
  }

  return {
    userId: user.id,
    organizationId,
    role,
    actorType: "user",
    userLoader: createUserLoader(),
    sessionLoader: createSessionLoader(),
    sessionGroupLoader: createSessionGroupLoader(),
    repoLoader: createRepoLoader(),
    eventLoader: createEventLoader(),
    conversationLoader: createConversationLoader(),
    branchLoader: createBranchLoader(),
    turnLoader: createTurnLoader(),
    chatMembersLoader: createChatMembersLoader(),
    sessionTicketsLoader: createSessionTicketsLoader(),
    channelMembershipLoader: createChannelMembershipLoader(user.id),
    chatMembershipLoader: createChatMembershipLoader(user.id),
  };
}
