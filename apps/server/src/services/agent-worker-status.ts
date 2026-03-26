/**
 * Agent Worker Status — Redis-based status reporting for the agent worker process.
 *
 * The agent worker runs as a separate process. This service provides:
 * - A writer (called by the worker) to publish status to Redis
 * - A reader (called by the GraphQL server) to fetch current status
 *
 * Status is stored as a Redis hash with a TTL, so stale status auto-expires.
 */

import { redis } from "../lib/redis.js";

const STATUS_KEY = "agent:worker:status";
const STATUS_TTL_SECONDS = 60; // Expire after 60s if worker stops updating

export interface WorkerStatusData {
  running: boolean;
  startedAt: number; // epoch ms
  openAggregationWindows: number;
  activeOrganizations: number;
  lastHeartbeat: number; // epoch ms
}

/**
 * Write worker status to Redis (called from agent-worker process).
 */
export async function publishWorkerStatus(status: WorkerStatusData): Promise<void> {
  try {
    await redis.hset(STATUS_KEY, {
      running: status.running ? "1" : "0",
      startedAt: String(status.startedAt),
      openAggregationWindows: String(status.openAggregationWindows),
      activeOrganizations: String(status.activeOrganizations),
      lastHeartbeat: String(status.lastHeartbeat),
    });
    await redis.expire(STATUS_KEY, STATUS_TTL_SECONDS);
  } catch {
    // Non-critical — don't crash the worker if Redis status write fails
  }
}

/**
 * Write aggregation window info to Redis (called from agent-worker process).
 */
export async function publishAggregationWindows(
  windows: Array<{
    scopeKey: string;
    organizationId: string;
    eventCount: number;
    openedAt: number;
    lastEventAt: number;
  }>,
): Promise<void> {
  const key = "agent:worker:aggregation_windows";
  try {
    await redis.set(key, JSON.stringify(windows), "EX", STATUS_TTL_SECONDS);
  } catch {
    // Non-critical
  }
}

/**
 * Read worker status from Redis (called from GraphQL server).
 */
export async function getWorkerStatus(): Promise<WorkerStatusData> {
  try {
    const data = await redis.hgetall(STATUS_KEY);
    if (!data || !data.running) {
      return {
        running: false,
        startedAt: 0,
        openAggregationWindows: 0,
        activeOrganizations: 0,
        lastHeartbeat: 0,
      };
    }
    return {
      running: data.running === "1",
      startedAt: Number(data.startedAt) || 0,
      openAggregationWindows: Number(data.openAggregationWindows) || 0,
      activeOrganizations: Number(data.activeOrganizations) || 0,
      lastHeartbeat: Number(data.lastHeartbeat) || 0,
    };
  } catch {
    return {
      running: false,
      startedAt: 0,
      openAggregationWindows: 0,
      activeOrganizations: 0,
      lastHeartbeat: 0,
    };
  }
}

/**
 * Read aggregation windows from Redis (called from GraphQL server).
 */
export async function getAggregationWindows(organizationId?: string): Promise<
  Array<{
    scopeKey: string;
    organizationId: string;
    eventCount: number;
    openedAt: number;
    lastEventAt: number;
  }>
> {
  try {
    const raw = await redis.get("agent:worker:aggregation_windows");
    if (!raw) return [];
    const windows = JSON.parse(raw) as Array<{
      scopeKey: string;
      organizationId: string;
      eventCount: number;
      openedAt: number;
      lastEventAt: number;
    }>;
    if (organizationId) {
      return windows.filter((w) => w.organizationId === organizationId);
    }
    return windows;
  } catch {
    return [];
  }
}
