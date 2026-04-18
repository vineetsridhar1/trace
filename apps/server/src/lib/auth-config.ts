const DEV_ENVS = new Set(["development", "test"]);

function isDevLike(): boolean {
  return DEV_ENVS.has(process.env.NODE_ENV ?? "");
}

export function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (isDevLike()) return "trace-dev-secret";
  throw new Error(
    "JWT_SECRET must be set to a value at least 16 characters long outside development/test",
  );
}

export function resolveTokenEncryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (key && /^[0-9a-fA-F]{64}$/.test(key)) return key;
  if (isDevLike()) {
    return "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  }
  throw new Error(
    "TOKEN_ENCRYPTION_KEY must be a 64-character hex string outside development/test",
  );
}

export function allowDevHeaderAuth(): boolean {
  return process.env.ALLOW_DEV_HEADER_AUTH === "1" && isDevLike();
}

let cachedSuperAdmins: Set<string> | null = null;

export function getSuperAdminEmails(): Set<string> {
  if (cachedSuperAdmins) return cachedSuperAdmins;
  const raw = process.env.SUPER_ADMIN_EMAILS ?? "";
  cachedSuperAdmins = new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  return cachedSuperAdmins;
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getSuperAdminEmails().has(email.toLowerCase());
}

export function resolveBridgeSharedSecret(): string | null {
  const secret = process.env.TRACE_BRIDGE_SHARED_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (isDevLike()) return "trace-dev-bridge-secret-change-me";
  // In production, missing secret means local bridges cannot connect.
  return null;
}

export function resetAuthConfigCacheForTesting(): void {
  cachedSuperAdmins = null;
}
