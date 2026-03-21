import { afterEach, beforeEach, vi } from "vitest";

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "trace-dev-secret";
process.env.TOKEN_ENCRYPTION_KEY =
  process.env.TOKEN_ENCRYPTION_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL ?? "https://trace.test";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
