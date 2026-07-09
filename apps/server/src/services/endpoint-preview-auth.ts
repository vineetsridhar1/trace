import jwt from "jsonwebtoken";
import { resolveJwtSecret } from "../lib/jwt-secret.js";
import { endpointPreviewScheme } from "./endpoint-utils.js";

const JWT_SECRET = resolveJwtSecret();
const ENDPOINT_PREVIEW_TOKEN_TTL_SECONDS = 5 * 60;
export const ENDPOINT_PREVIEW_COOKIE = "__trace_endpoint_preview";

type EndpointPreviewTokenPayload = {
  tokenType: "endpoint_preview";
  userId: string;
  organizationId: string;
  endpointId: string;
  exp?: number;
};

function encodeCookieValue(value: string): string {
  return encodeURIComponent(value);
}

function parseCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValueParts] = part.trim().split("=");
    if (rawKey !== name) continue;
    const rawValue = rawValueParts.join("=");
    if (!rawValue) return null;
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }
  return null;
}

export function createEndpointPreviewToken(input: {
  userId: string;
  organizationId: string;
  endpointId: string;
  ttlSeconds?: number | null;
}): { token: string; expiresAt: Date } {
  const ttlSeconds =
    typeof input.ttlSeconds === "number" && Number.isFinite(input.ttlSeconds)
      ? Math.min(Math.max(Math.floor(input.ttlSeconds), 60), ENDPOINT_PREVIEW_TOKEN_TTL_SECONDS)
      : ENDPOINT_PREVIEW_TOKEN_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const token = jwt.sign(
    {
      tokenType: "endpoint_preview",
      userId: input.userId,
      organizationId: input.organizationId,
      endpointId: input.endpointId,
    } satisfies EndpointPreviewTokenPayload,
    JWT_SECRET,
    { expiresIn: ttlSeconds },
  );
  return { token, expiresAt };
}

export function verifyEndpointPreviewToken(token: string): EndpointPreviewTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as EndpointPreviewTokenPayload;
    if (
      !payload ||
      typeof payload !== "object" ||
      payload.tokenType !== "endpoint_preview" ||
      typeof payload.userId !== "string" ||
      typeof payload.organizationId !== "string" ||
      typeof payload.endpointId !== "string"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function endpointPreviewTokenFromCookie(cookieHeader: string | undefined): string | null {
  return parseCookie(cookieHeader, ENDPOINT_PREVIEW_COOKIE);
}

export function endpointPreviewCookieHeader(token: string, expiresAt: Date): string {
  const secure = endpointPreviewScheme() === "https";
  return [
    `${ENDPOINT_PREVIEW_COOKIE}=${encodeCookieValue(token)}`,
    "Path=/",
    "HttpOnly",
    secure ? "Secure" : null,
    secure ? "SameSite=None" : "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join("; ");
}
