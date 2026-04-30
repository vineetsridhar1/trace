import { timingSafeEqual } from "node:crypto";

export function isAuthorized(
  authorizationHeader: string | undefined,
  expectedToken: string,
): boolean {
  const token = parseBearerToken(authorizationHeader);
  if (!token || !expectedToken) {
    return false;
  }

  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expectedToken);
  if (tokenBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(tokenBuffer, expectedBuffer);
}

function parseBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, ...rest] = authorizationHeader.split(" ");
  if (scheme.toLowerCase() !== "bearer" || rest.length !== 1) {
    return null;
  }

  return rest[0] || null;
}
