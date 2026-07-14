import jwt from "jsonwebtoken";
import { resolveJwtSecret } from "../lib/jwt-secret.js";
import { endpointPreviewBaseHost, endpointPreviewScheme } from "./endpoint-utils.js";

const JWT_SECRET = resolveJwtSecret();
const TOKEN_TTL_SECONDS = 5 * 60;
export const ENDPOINT_PREVIEW_COOKIE = "__trace_endpoint_preview";

type EndpointPreviewTokenPayload = {
  tokenType: "endpoint_preview";
  userId: string;
  organizationId: string;
  endpointId: string;
  exp?: number;
};

export function createEndpointPreviewToken(input: {
  userId: string;
  organizationId: string;
  endpointId: string;
}): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);
  const token = jwt.sign(
    {
      tokenType: "endpoint_preview",
      userId: input.userId,
      organizationId: input.organizationId,
      endpointId: input.endpointId,
    } satisfies EndpointPreviewTokenPayload,
    JWT_SECRET,
    { expiresIn: TOKEN_TTL_SECONDS, algorithm: "HS256" },
  );
  return { token, expiresAt };
}

export function verifyEndpointPreviewToken(token: string): EndpointPreviewTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    }) as unknown as EndpointPreviewTokenPayload;
    return payload?.tokenType === "endpoint_preview" &&
      typeof payload.userId === "string" &&
      typeof payload.organizationId === "string" &&
      typeof payload.endpointId === "string"
      ? payload
      : null;
  } catch {
    return null;
  }
}

export function endpointPreviewTokenFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key !== ENDPOINT_PREVIEW_COOKIE) continue;
    try {
      return decodeURIComponent(value.join("="));
    } catch {
      return value.join("=") || null;
    }
  }
  return null;
}

export function endpointPreviewCookieHeader(token: string, expiresAt: Date): string {
  const hostname = endpointPreviewBaseHost().split(":")[0]?.toLowerCase();
  const secure =
    endpointPreviewScheme() === "https" ||
    hostname === "localhost" ||
    hostname?.endsWith(".localhost");
  return [
    `${ENDPOINT_PREVIEW_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    secure ? "Secure" : null,
    secure ? "SameSite=None" : "SameSite=Lax",
    secure ? "Partitioned" : null,
    `Expires=${expiresAt.toUTCString()}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join("; ");
}
