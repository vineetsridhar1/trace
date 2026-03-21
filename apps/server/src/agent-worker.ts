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
import { agentIdentityService, type OrgAgentSettings } from "./services/agent-identity.js";
import {
  routeEvent,
  updateChatMembership,
  seedChatMemberships,
  cleanupRateLimits,
  type AgentEvent,
} from "./agent/router.js";
import { EventAggregator, type AggregatedBatch } from "./agent/aggregator.js";
import { summaryService } from "./services/summary.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONSUMER_GROUP = "agent-runtime";
const CONSUMER_NAME = `agent-worker-${process.pid}`;
const STREAM_KEY_PREFIX = "stream:org:";
const STREAM_KEY_SUFFIX = ":events";
const BLOCK_MS = 5_000; // block timeout for XREADGROUP
const ORG_POLL_INTERVAL_MS = 30_000; // poll for new orgs every 30s
const SUMMARY_REFRESH_INTERVAL_MS = 60_000; // check for stale summaries every 60s

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Set of org IDs we're currently consuming from */
const activeOrgs = new Set<string>();

/** Agent identity settings per org */
const agentContexts = new Map<string, OrgAgentSettings>();

/** Whether the worker is shutting down */
let shuttingDown = false;

/** Event aggregator instance */
const aggregator = new EventAggregator(handleBatch);

/**
 * Handle a closed aggregation window.
 * Future tickets will send this to the context builder (#10) and planner (#11).
 * For now, log the batch.
 */
function handleBatch(batch: AggregatedBatch): void {
  log("batch ready", {
    scopeKey: batch.scopeKey,
    orgId: batch.organizationId,
    eventCount: batch.events.length,
    closeReason: batch.closeReason,
    durationMs: batch.closedAt - batch.openedAt,
    ...(batch.maxTier !== undefined ? { maxTier: batch.maxTier } : {}),
  });
}

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

    // Load agent identities for all orgs (creates if missing)
    await loadAgentIdentities();
  } catch (err) {
    logError("failed to discover orgs", err);
  }
}

/**
 * Load agent identities for all active orgs.
 * Creates identities for any orgs that don't have one yet.
 */
async function loadAgentIdentities(): Promise<void> {
  const identities = await agentIdentityService.loadAll();

  for (const orgId of activeOrgs) {
    if (identities.has(orgId)) {
      const settings = identities.get(orgId)!;
      agentContexts.set(orgId, settings);
    } else {
      // Auto-create identity for orgs that don't have one
      const settings = await agentIdentityService.getOrCreate(orgId);
      agentContexts.set(orgId, settings);
      log("created agent identity for org", { orgId, agentId: settings.agentId });
    }
  }

  log(`loaded agent identities for ${agentContexts.size} org(s)`);
}

/**
 * Seed the chat membership gate for all orgs where the agent is a member.
 * Queries the ChatMember table for rows matching the agent's identity ID.
 */
async function seedChatMembershipGate(): Promise<void> {
  for (const [orgId, settings] of agentContexts) {
    try {
      const memberships = await prisma.chatMember.findMany({
        where: {
          organizationId: orgId,
          userId: settings.agentId,
          leftAt: null,
        },
        select: { chatId: true },
      });

      const chatIds = memberships.map((m) => m.chatId);
      seedChatMemberships(orgId, chatIds);

      if (chatIds.length > 0) {
        log("seeded chat memberships", { orgId, chatCount: chatIds.length });
      }
    } catch (err) {
      logError(`failed to seed chat memberships for org ${orgId}`, err);
    }
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
    // Skip disabled orgs — leave their events pending in Redis
    // so they can be processed if the agent is re-enabled
    const agentContext = agentContexts.get(orgId);
    if (agentContext && agentContext.status === "disabled") {
      continue;
    }
    streams.push(streamKey(orgId));
    ids.push(">"); // only new messages not yet delivered to this group
  }

  if (streams.length === 0) return result;

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

    for (const [key, entries] of response as [string, [string, string[]][]][]) {
      // Extract orgId from stream key: stream:org:{orgId}:events
      const orgId = key.replace(STREAM_KEY_PREFIX, "").replace(STREAM_KEY_SUFFIX, "");

      const parsed: StreamEntry[] = [];
      for (const [entryId, fields] of entries) {
        // fields is [field1, value1, field2, value2, ...]
        const fieldMap: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) {
          fieldMap[fields[i]] = fields[i + 1];
        }
        if (fieldMap.event) {
          parsed.push({ id: entryId, event: fieldMap.event });
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
 * Routes each event through the event router (ticket #04), then feeds
 * non-dropped events into the aggregator (ticket #05).
 *
 * The agent context (identity + settings) is available for each org.
 * When the agent takes actions in future tickets, it will use:
 *   actorType: "agent", actorId: agentContext.agentId
 */
async function processEvents(orgId: string, entries: StreamEntry[]): Promise<void> {
  const agentContext = agentContexts.get(orgId);
  if (!agentContext) {
    log("skipping events — no agent context", { orgId });
    return;
  }

  for (const entry of entries) {
    try {
      const raw = JSON.parse(entry.event) as Record<string, unknown>;
      const event: AgentEvent = {
        id: raw.id as string,
        organizationId: orgId,
        scopeType: raw.scopeType as string,
        scopeId: raw.scopeId as string,
        eventType: raw.eventType as string,
        actorType: raw.actorType as string,
        actorId: raw.actorId as string,
        payload: (raw.payload as Record<string, unknown>) ?? {},
        metadata: raw.metadata as Record<string, unknown> | undefined,
        timestamp: raw.timestamp as string,
      };

      // Update chat membership gate before routing
      updateChatMembership(event, agentContext.agentId);

      // Route the event
      const result = routeEvent(event, agentContext);

      log("event routed", {
        orgId,
        streamId: entry.id,
        eventType: event.eventType,
        scopeType: event.scopeType,
        scopeId: event.scopeId,
        decision: result.decision,
        reason: result.reason,
        ...(result.maxTier !== undefined ? { maxTier: result.maxTier } : {}),
      });

      // Feed non-dropped events into the aggregator
      if (result.decision !== "drop") {
        await aggregator.ingest(event, result);
      }
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
        await processEvents(orgId, entries);
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
let rateLimitCleanupTimer: ReturnType<typeof setInterval> | null = null;
let summaryRefreshTimer: ReturnType<typeof setInterval> | null = null;

function startOrgPolling(): void {
  orgPollTimer = setInterval(() => {
    if (!shuttingDown) {
      discoverOrgs().catch((err) => logError("org poll failed", err));
    }
  }, ORG_POLL_INTERVAL_MS);
}

function startRateLimitCleanup(): void {
  // Clean up stale rate limit entries every 30 seconds
  rateLimitCleanupTimer = setInterval(() => {
    cleanupRateLimits();
  }, 30_000);
}

function startSummaryRefresh(): void {
  summaryRefreshTimer = setInterval(async () => {
    if (shuttingDown) return;
    try {
      const staleEntities = await summaryService.findStaleEntities();
      if (staleEntities.length === 0) return;

      log("refreshing stale summaries", { count: staleEntities.length });

      for (const entity of staleEntities) {
        if (shuttingDown) break;
        try {
          await summaryService.refreshSummary({
            organizationId: entity.organizationId,
            entityType: entity.entityType,
            entityId: entity.entityId,
          });
          log("summary refreshed", {
            orgId: entity.organizationId,
            entityType: entity.entityType,
            entityId: entity.entityId,
            newEvents: entity.newEventCount,
          });
        } catch (err) {
          logError(
            `failed to refresh summary for ${entity.entityType}:${entity.entityId}`,
            err,
          );
        }
      }
    } catch (err) {
      logError("summary refresh cycle failed", err);
    }
  }, SUMMARY_REFRESH_INTERVAL_MS);
}

function stopTimers(): void {
  if (orgPollTimer) {
    clearInterval(orgPollTimer);
    orgPollTimer = null;
  }
  if (rateLimitCleanupTimer) {
    clearInterval(rateLimitCleanupTimer);
    rateLimitCleanupTimer = null;
  }
  if (summaryRefreshTimer) {
    clearInterval(summaryRefreshTimer);
    summaryRefreshTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`received ${signal}, shutting down gracefully...`);

  stopTimers();

  // Stop aggregator — persists open windows to Redis
  try {
    await aggregator.stop();
    log("aggregator stopped");
  } catch (err) {
    logError("error stopping aggregator", err);
  }

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

  // Seed chat membership gate from database
  await seedChatMembershipGate();

  // Start polling for new orgs
  startOrgPolling();

  // Start rate limit cleanup
  startRateLimitCleanup();

  // Start summary refresh loop (checks for stale entity summaries every 60s)
  startSummaryRefresh();
  log("summary refresh loop started");

  // Start the event aggregator (recovers persisted windows from Redis)
  await aggregator.start();
  log("aggregator started");

  // Enter the main consume loop (blocks until shutdown)
  await consumeLoop();
}

main().catch((err) => {
  console.error("[agent-worker] fatal error:", err);
  process.exit(1);
});
