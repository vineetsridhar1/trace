import { redis } from "./redis.js";

const REVOKED_PREFIX = "auth:revoked:";
// JWT default lifetime is 7 days; keep revocation entries at least that long.
const REVOCATION_TTL_SECONDS = 8 * 24 * 60 * 60;

const memoryRevocations = new Map<string, number>();

function now(): number {
  return Math.floor(Date.now() / 1000);
}

export async function revokeToken(jti: string, expSeconds?: number): Promise<void> {
  const ttl = expSeconds ? Math.max(60, expSeconds - now()) : REVOCATION_TTL_SECONDS;
  try {
    await redis.set(REVOKED_PREFIX + jti, "1", "EX", ttl);
  } catch {
    memoryRevocations.set(jti, now() + ttl);
  }
}

export async function isTokenRevoked(jti: string): Promise<boolean> {
  try {
    const value = await redis.get(REVOKED_PREFIX + jti);
    if (value) return true;
  } catch {
    // Fall through to memory check below.
  }
  const expiresAt = memoryRevocations.get(jti);
  if (!expiresAt) return false;
  if (expiresAt < now()) {
    memoryRevocations.delete(jti);
    return false;
  }
  return true;
}

export function clearRevocationsForTesting(): void {
  memoryRevocations.clear();
}
