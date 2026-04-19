import type { NextFunction, Request, Response } from "express";
import { redis } from "./redis.js";

interface RateLimitOptions {
  /** Unique key for the limiter (e.g. "auth:github"). */
  name: string;
  /** Max requests in the window, per key. */
  max: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /**
   * Custom key extractor. Defaults to the client IP (Express resolves this
   * via the trust-proxy setting in index.ts).
   */
  keyBy?: (req: Request) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const memoryBuckets = new Map<string, Bucket>();

function defaultKey(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return ip;
}

async function checkRedis(
  bucketKey: string,
  max: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetSeconds: number }> {
  const incr = await redis.incr(bucketKey);
  if (incr === 1) {
    await redis.expire(bucketKey, windowSeconds);
  }
  const ttl = await redis.ttl(bucketKey);
  const resetSeconds = ttl > 0 ? ttl : windowSeconds;
  const allowed = incr <= max;
  return { allowed, remaining: Math.max(0, max - incr), resetSeconds };
}

function checkMemory(
  bucketKey: string,
  max: number,
  windowSeconds: number,
): { allowed: boolean; remaining: number; resetSeconds: number } {
  const nowMs = Date.now();
  const existing = memoryBuckets.get(bucketKey);
  if (!existing || existing.resetAt < nowMs) {
    memoryBuckets.set(bucketKey, {
      count: 1,
      resetAt: nowMs + windowSeconds * 1000,
    });
    return { allowed: true, remaining: max - 1, resetSeconds: windowSeconds };
  }
  existing.count += 1;
  const allowed = existing.count <= max;
  return {
    allowed,
    remaining: Math.max(0, max - existing.count),
    resetSeconds: Math.ceil((existing.resetAt - nowMs) / 1000),
  };
}

export function rateLimit(opts: RateLimitOptions) {
  const keyFn = opts.keyBy ?? defaultKey;
  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const clientKey = keyFn(req);
    const bucketKey = `ratelimit:${opts.name}:${clientKey}`;
    let result;
    try {
      result = await checkRedis(bucketKey, opts.max, opts.windowSeconds);
    } catch {
      result = checkMemory(bucketKey, opts.max, opts.windowSeconds);
    }
    res.setHeader("X-RateLimit-Limit", String(opts.max));
    res.setHeader("X-RateLimit-Remaining", String(result.remaining));
    res.setHeader("X-RateLimit-Reset", String(result.resetSeconds));
    if (!result.allowed) {
      res.setHeader("Retry-After", String(result.resetSeconds));
      res.status(429).json({
        error: "Too Many Requests",
        retryAfterSeconds: result.resetSeconds,
      });
      return;
    }
    next();
  };
}

export function clearRateLimitMemoryForTesting(): void {
  memoryBuckets.clear();
}
