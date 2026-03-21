/**
 * Agent Worker — separate process that consumes org-scoped events from Redis Streams.
 *
 * This is the foundation of the ambient AI runtime. For now it boots, discovers
 * active orgs, creates consumer groups, block-reads events, logs them, and ACKs.
 *
 * Run with: pnpm dev:agent
 */

import { redis, connectRedis, disconnectRedis } from "./lib/redis.js";
import { prisma } from "./lib/db.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONSUMER_GROUP = "agent-runtime";
const CONSUMER_NAME = `agent-worker-${process.pid}`;
const STREAM_KEY_PREFIX = "stream:org:";
const STREAM_KEY_SUFFIX = ":events";
const BLOCK_MS = 5_000; // block timeout for XREADGROUP
const ORG_POLL_INTERVAL_MS = 30_000; // poll for new orgs every 30s

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Set of org IDs we're currently consuming from */
const activeOrgs = new Set<string>();

/** Whether the worker is shutting down */
let shuttingDown = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function streamKey(orgId: string): string {
  return `${STREAM_KEY_PREFIX}${orgId}${STREAM_KEY_SUFFIX}`;
}

function log(msg: string, data?: Record<string, unknown>): void {
  const prefix = `[agent-worker]`;
  if (data) {
    console.log(prefix, msg, JSON.stringify(data));
  } else {
    console.log(prefix, msg);
  }
}

function logError(msg: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[agent-worker] ${msg}:`, message);
}

// ---------------------------------------------------------------------------
// Consumer group setup
// ---------------------------------------------------------------------------

/**
 * Ensure the consumer group exists for an org's stream.
 * Uses MKSTREAM so the stream is created if it doesn't exist yet.
 * Starts reading from "0" on first creation so we can backfill.
 */
async function ensureConsumerGroup(orgId: string): Promise<void> {
  const key = streamKey(orgId);
  try {
    await redis.xgroup("CREATE", key, CONSUMER_GROUP, "0", "MKSTREAM");
    log(`created consumer group for org`, { orgId });
  } catch (err: unknown) {
    // BUSYGROUP means the group already exists — that's fine
    if (err instanceof Error && err.message.includes("BUSYGROUP")) {
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Org discovery
// ---------------------------------------------------------------------------

/**
 * Query Postgres for all organizations and set up consumer groups for any new ones.
 */
async function discoverOrgs(): Promise<void> {
  try {
    const orgs = await prisma.organization.findMany({
      select: { id: true },
    });

    for (const org of orgs) {
      if (!activeOrgs.has(org.id)) {
        await ensureConsumerGroup(org.id);
        activeOrgs.add(org.id);
        log(`subscribed to org`, { orgId: org.id });
      }
    }
  } catch (err) {
    logError("failed to discover orgs", err);
  }
}

// ---------------------------------------------------------------------------
// Event consumption
// ---------------------------------------------------------------------------

interface StreamEntry {
  id: string;
  event: string;
}

/**
 * Block-read events from all active org streams using XREADGROUP.
 * Returns parsed entries grouped by org ID.
 */
async function readEvents(): Promise<Map<string, StreamEntry[]>> {
  const result = new Map<string, StreamEntry[]>();
  if (activeOrgs.size === 0) return result;

  const streams: string[] = [];
  const ids: string[] = [];

  for (const orgId of activeOrgs) {
    streams.push(streamKey(orgId));
    ids.push(">"); // only new messages not yet delivered to this group
  }

  try {
    // XREADGROUP GROUP <group> <consumer> COUNT 100 BLOCK <ms> STREAMS <keys...> <ids...>
    const response = await redis.xreadgroup(
      "GROUP",
      CONSUMER_GROUP,
      CONSUMER_NAME,
      "COUNT",
      100,
      "BLOCK",
      BLOCK_MS,
      "STREAMS",
      ...streams,
      ...ids,
    );

    if (!response) return result; // timeout, no new messages

    for (const [key, entries] of response) {
      // Extract orgId from stream key: stream:org:{orgId}:events
      const keyStr = typeof key === "string" ? key : key.toString();
      const orgId = keyStr.replace(STREAM_KEY_PREFIX, "").replace(STREAM_KEY_SUFFIX, "");

      const parsed: StreamEntry[] = [];
      for (const [entryId, fields] of entries) {
        // fields is [field1, value1, field2, value2, ...]
        const fieldMap: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) {
          fieldMap[fields[i]] = fields[i + 1];
        }
        if (fieldMap.event) {
          parsed.push({ id: typeof entryId === "string" ? entryId : entryId.toString(), event: fieldMap.event });
        }
      }

      if (parsed.length > 0) {
        result.set(orgId, parsed);
      }
    }
  } catch (err) {
    // If Redis disconnects, the error will surface here.
    // The main loop will retry after a short delay.
    if (!shuttingDown) {
      logError("XREADGROUP failed", err);
    }
  }

  return result;
}

/**
 * Acknowledge processed entries so they won't be re-delivered.
 */
async function ackEvents(orgId: string, entryIds: string[]): Promise<void> {
  if (entryIds.length === 0) return;
  try {
    await redis.xack(streamKey(orgId), CONSUMER_GROUP, ...entryIds);
  } catch (err) {
    logError(`XACK failed for org ${orgId}`, err);
  }
}

/**
 * Process a batch of events from a single org.
 * For now, just logs them. Future tickets will add routing, aggregation, etc.
 */
function processEvents(orgId: string, entries: StreamEntry[]): void {
  for (const entry of entries) {
    try {
      const event = JSON.parse(entry.event) as Record<string, unknown>;
      log("event consumed", {
        orgId,
        streamId: entry.id,
        eventType: event.eventType as string,
        scopeType: event.scopeType as string,
        scopeId: event.scopeId as string,
        actorType: event.actorType as string,
      });
    } catch {
      log("event consumed (unparseable)", { orgId, streamId: entry.id });
    }
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function consumeLoop(): Promise<void> {
  log("starting consume loop");

  while (!shuttingDown) {
    try {
      const batches = await readEvents();

      for (const [orgId, entries] of batches) {
        processEvents(orgId, entries);
        await ackEvents(orgId, entries.map((e) => e.id));
      }
    } catch (err) {
      if (!shuttingDown) {
        logError("consume loop error", err);
        // Brief pause before retrying to avoid tight error loops
        await sleep(2_000);
      }
    }
  }

  log("consume loop stopped");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Org polling (picks up new orgs created while worker is running)
// ---------------------------------------------------------------------------

let orgPollTimer: ReturnType<typeof setInterval> | null = null;

function startOrgPolling(): void {
  orgPollTimer = setInterval(() => {
    if (!shuttingDown) {
      discoverOrgs().catch((err) => logError("org poll failed", err));
    }
  }, ORG_POLL_INTERVAL_MS);
}

function stopOrgPolling(): void {
  if (orgPollTimer) {
    clearInterval(orgPollTimer);
    orgPollTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`received ${signal}, shutting down gracefully...`);

  stopOrgPolling();

  // Give the consume loop time to exit its current XREADGROUP block
  // (it will exit on next iteration since shuttingDown is true)
  await sleep(500);

  try {
    await disconnectRedis();
    log("Redis disconnected");
  } catch (err) {
    logError("error disconnecting Redis", err);
  }

  try {
    await prisma.$disconnect();
    log("Prisma disconnected");
  } catch (err) {
    logError("error disconnecting Prisma", err);
  }

  log("shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log("starting agent worker process");

  // Connect to Redis
  try {
    await connectRedis();
    log("Redis connected");
  } catch {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    console.error(`\n[agent-worker] Failed to connect to Redis at ${url}`);
    console.error("[agent-worker] Start Redis with: docker compose up -d redis\n");
    process.exit(1);
  }

  // Discover all active organizations and set up consumer groups
  await discoverOrgs();
  log(`consuming events for ${activeOrgs.size} org(s)`);

  // Start polling for new orgs
  startOrgPolling();

  // Enter the main consume loop (blocks until shutdown)
  await consumeLoop();
}

main().catch((err) => {
  console.error("[agent-worker] fatal error:", err);
  process.exit(1);
});
