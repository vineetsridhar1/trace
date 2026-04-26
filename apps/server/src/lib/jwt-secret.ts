export function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "test") return "trace-test-secret";
  throw new Error("JWT_SECRET must be set");
}
