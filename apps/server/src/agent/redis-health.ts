/**
 * Redis Health Monitor — tracks Redis connectivity state.
 *
 * When Redis is degraded, the agent runtime can adapt:
 * - Skip non-critical persistence (aggregation windows)
 * - Extend silence timeouts
 * - Log warnings instead of crashing
 *
 * The monitor pings Redis periodically and exposes a synchronous
 * `isHealthy()` check for hot-path code.
 */

import { redis } from "../lib/redis.js";
import { createAgentLogger } from "./logger.js";

const logger = createAgentLogger("redis-health");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let healthy = true;
let consecutiveFailures = 0;
let lastCheckAt = 0;
let timer: ReturnType<typeof setInterval> | null = null;

const CHECK_INTERVAL_MS = 10_000; // check every 10s
const UNHEALTHY_THRESHOLD = 3; // 3 consecutive failures → degraded

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns true if Redis is considered healthy. Synchronous — no I/O. */
export function isRedisHealthy(): boolean {
  return healthy;
}

/** Get the current health state for observability. */
export function getRedisHealthState(): {
  healthy: boolean;
  consecutiveFailures: number;
  lastCheckAt: number;
} {
  return { healthy, consecutiveFailures, lastCheckAt };
}

export function startRedisHealthMonitor(): void {
  if (timer) return;

  timer = setInterval(() => {
    checkHealth().catch(() => {});
  }, CHECK_INTERVAL_MS);

  // Run an initial check immediately
  checkHealth().catch(() => {});
}

export function stopRedisHealthMonitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function checkHealth(): Promise<void> {
  lastCheckAt = Date.now();
  try {
    await redis.ping();
    consecutiveFailures = 0;
    if (!healthy) {
      healthy = true;
      logger.log("Redis recovered", { consecutiveFailures: 0 });
    }
  } catch (err) {
    consecutiveFailures++;
    if (healthy && consecutiveFailures >= UNHEALTHY_THRESHOLD) {
      healthy = false;
      logger.logError(`Redis degraded after ${consecutiveFailures} consecutive failures`, err);
    }
  }
}
