import type { ExpressContextFunctionArgument } from "@as-integrations/express5";
import jwt from "jsonwebtoken";
import type { Context } from "../context.js";
import { AuthenticationError } from "./errors.js";
import { prisma } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "trace-dev-secret";

export function parseCookieToken(cookieHeader?: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/trace_token=([^;]+)/);
  return match?.[1];
}

export async function buildContext({ req }: ExpressContextFunctionArgument): Promise<Context> {
  let userId: string | undefined;

  const token = req.cookies?.trace_token;
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
    select: { id: true, organizationId: true, role: true },
  });

  if (!user) {
    throw new AuthenticationError("User not found");
  }

  return {
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role as Context["role"],
    actorType: "user",
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
    select: { id: true, organizationId: true, role: true },
  });
  if (!user) throw new AuthenticationError("User not found");

  return {
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role as Context["role"],
    actorType: "user",
  };
}
