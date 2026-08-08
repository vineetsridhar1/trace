import { randomUUID } from "crypto";
import { isLocalMode } from "./mode.js";
import { redis } from "./redis.js";

const localLocks = new Set<string>();

export type DistributedLockResult<T> = { acquired: true; value: T } | { acquired: false };

/**
 * Run one operation per key across API replicas.
 *
 * Production uses a renewable, ownership-checked Redis lease. Local mode uses
 * the same fail-fast semantics in memory so duplicate clicks are deterministic
 * without requiring Redis. Losing the lease does not cancel work already in
 * flight; correctness must still come from generation-fenced database writes.
 */
export async function withDistributedLock<T>(
  options: { key: string; ttlMs: number },
  run: () => Promise<T>,
): Promise<DistributedLockResult<T>> {
  if (isLocalMode()) {
    if (localLocks.has(options.key)) return { acquired: false };
    localLocks.add(options.key);
    try {
      return { acquired: true, value: await run() };
    } finally {
      localLocks.delete(options.key);
    }
  }

  const token = `${process.pid}:${randomUUID()}`;
  const acquired = await redis.set(options.key, token, "PX", options.ttlMs, "NX");
  if (acquired !== "OK") return { acquired: false };

  const renewEveryMs = Math.max(1_000, Math.floor(options.ttlMs / 3));
  const renewal = setInterval(() => {
    void redis
      .eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
        1,
        options.key,
        token,
        String(options.ttlMs),
      )
      .catch((error: unknown) => {
        console.warn(
          `[redis-lock] failed to renew ${options.key}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }, renewEveryMs);
  renewal.unref();

  try {
    return { acquired: true, value: await run() };
  } finally {
    clearInterval(renewal);
    await redis
      .eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        options.key,
        token,
      )
      .catch((error: unknown) => {
        console.warn(
          `[redis-lock] failed to release ${options.key}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }
}
