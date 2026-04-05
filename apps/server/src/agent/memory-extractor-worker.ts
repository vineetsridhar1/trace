/**
 * Memory Extractor Worker — background loop that extracts derived memories
 * from high-signal events.
 *
 * Follows the same pattern as summary-worker.ts:
 * - Redis SET for tracking active scopes with pending events
 * - Poll loop (every 120s)
 * - Inflight dedup to prevent duplicate LLM calls
 * - Batch processing per scope
 *
 * Key difference from summaries: the extractor produces N discrete, atomic
 * facts per batch window (each with subject, kind, confidence, and source
 * event range), not a single narrative.
 */

import type { EventType, Prisma, ScopeType } from "@prisma/client";
import { redis } from "../lib/redis.js";
import { prisma } from "../lib/db.js";
import { memoryService } from "../services/memory.js";
import { costTrackingService } from "../services/cost-tracking.js";
import {
  extractMemories,
  EXTRACTABLE_EVENT_TYPES,
  type ExtractionEvent,
} from "./memory-extractor-prompt.js";
import { estimateCostCents } from "./cost-utils.js";
import { createAgentLogger } from "./logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 120_000; // check every 2 minutes
const STALE_EVENT_THRESHOLD = 10; // extract after N events
const BATCH_LIMIT = 5; // max scopes to process per cycle
const EVENTS_PER_EXTRACTION = 50; // max events per extraction call

/** Redis key tracking per-scope event counts for memory extraction. */
const SCOPE_EVENT_COUNT_PREFIX = "agent:memory:events:";
/** Redis key storing when a scope first had pending extraction work. */
const SCOPE_FIRST_PENDING_AT_PREFIX = "agent:memory:first_pending_at:";
/** Redis SET tracking scopes with pending memory extraction events. */
const ACTIVE_SCOPES_SET_KEY = "agent:memory:active_scopes";
/** Legacy Redis watermark key. New deployments store cursors durably in Postgres. */
const LEGACY_WATERMARK_PREFIX = "agent:memory:watermark:";
/** Extract low-volume scopes once they have been waiting long enough. */
const STALE_SCOPE_AGE_MS = 10 * 60_000;

const EXTRACTION_MODEL = process.env.AGENT_MEMORY_MODEL ?? "claude-haiku-4-5-20251001";

const { log, logError } = createAgentLogger("memory-extractor");

// ---------------------------------------------------------------------------
// Event count tracking (called from the main event consumption loop)
// ---------------------------------------------------------------------------

/**
 * Track an event for memory extraction. Only tracks high-signal event types.
 */
export async function trackEventForMemoryExtraction(
  organizationId: string,
  scopeType: string,
  scopeId: string,
  eventType: string,
): Promise<void> {
  // Only track extractable event types
  if (!EXTRACTABLE_EVENT_TYPES.has(eventType)) return;

  const scopeRef = `${organizationId}:${scopeType}:${scopeId}`;
  const countKey = `${SCOPE_EVENT_COUNT_PREFIX}${scopeRef}`;
  const firstPendingKey = `${SCOPE_FIRST_PENDING_AT_PREFIX}${scopeRef}`;
  try {
    const pipeline = redis.pipeline();
    pipeline.incr(countKey);
    pipeline.setnx(firstPendingKey, new Date().toISOString());
    pipeline.sadd(ACTIVE_SCOPES_SET_KEY, scopeRef);
    await pipeline.exec();
  } catch {
    // Non-critical — worst case extraction happens on time-based check
  }
}

/**
 * Read the pending extraction state for a scope without consuming it.
 */
async function getScopePendingState(scopeRef: string): Promise<{
  count: number;
  firstPendingAt: Date | null;
}> {
  const countKey = `${SCOPE_EVENT_COUNT_PREFIX}${scopeRef}`;
  const firstPendingKey = `${SCOPE_FIRST_PENDING_AT_PREFIX}${scopeRef}`;
  try {
    const [countRaw, firstPendingRaw] = await redis.mget(countKey, firstPendingKey);
    return {
      count: countRaw ? parseInt(countRaw, 10) : 0,
      firstPendingAt: firstPendingRaw ? new Date(firstPendingRaw) : null,
    };
  } catch {
    return { count: 0, firstPendingAt: null };
  }
}

async function clearScopePendingState(scopeRef: string): Promise<void> {
  const countKey = `${SCOPE_EVENT_COUNT_PREFIX}${scopeRef}`;
  const firstPendingKey = `${SCOPE_FIRST_PENDING_AT_PREFIX}${scopeRef}`;
  try {
    const pipeline = redis.pipeline();
    pipeline.del(countKey);
    pipeline.del(firstPendingKey);
    pipeline.srem(ACTIVE_SCOPES_SET_KEY, scopeRef);
    await pipeline.exec();
  } catch {
    // Best effort cleanup
  }
}

async function markScopeProgress(
  scopeRef: string,
  processedCount: number,
  hasRemainingBacklog: boolean,
): Promise<void> {
  const countKey = `${SCOPE_EVENT_COUNT_PREFIX}${scopeRef}`;
  const firstPendingKey = `${SCOPE_FIRST_PENDING_AT_PREFIX}${scopeRef}`;

  try {
    const remainingRaw = await redis.decrby(countKey, processedCount);
    const remainingCount = Math.max(remainingRaw, 0);

    if (remainingCount > 0 || hasRemainingBacklog) {
      const pipeline = redis.pipeline();
      if (remainingCount <= 0 && hasRemainingBacklog) {
        // Keep the scope active for another pass when DB backlog exceeds Redis accounting.
        pipeline.set(countKey, "1");
      }
      pipeline.set(firstPendingKey, new Date().toISOString());
      pipeline.sadd(ACTIVE_SCOPES_SET_KEY, scopeRef);
      await pipeline.exec();
      return;
    }
  } catch {
    if (hasRemainingBacklog) {
      try {
        const pipeline = redis.pipeline();
        pipeline.set(countKey, "1");
        pipeline.set(firstPendingKey, new Date().toISOString());
        pipeline.sadd(ACTIVE_SCOPES_SET_KEY, scopeRef);
        await pipeline.exec();
        return;
      } catch {
        // Fall through to best-effort cleanup
      }
    }
  }

  await clearScopePendingState(scopeRef);
}

type ExtractionWatermark = {
  timestamp: string;
  eventId?: string;
};

function parseLegacyWatermark(raw: string | null): ExtractionWatermark | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { timestamp?: string; eventId?: string };
    if (parsed.timestamp) {
      return {
        timestamp: parsed.timestamp,
        ...(parsed.eventId ? { eventId: parsed.eventId } : {}),
      };
    }
  } catch {
    // Backward compatibility: older watermarks stored just the timestamp string.
  }

  return { timestamp: raw };
}

async function loadExtractionWatermark(
  organizationId: string,
  scopeType: string,
  scopeId: string,
): Promise<{ watermark: ExtractionWatermark | null; fromLegacyRedis: boolean }> {
  const dbCursor = await prisma.memoryExtractionCursor.findUnique({
    where: {
      organizationId_scopeType_scopeId: {
        organizationId,
        scopeType: scopeType as ScopeType,
        scopeId,
      },
    },
    select: {
      lastEventId: true,
      lastEventTimestamp: true,
    },
  });

  if (dbCursor) {
    return {
      watermark: {
        timestamp: dbCursor.lastEventTimestamp.toISOString(),
        eventId: dbCursor.lastEventId,
      },
      fromLegacyRedis: false,
    };
  }

  const legacyWatermarkKey = `${LEGACY_WATERMARK_PREFIX}${organizationId}:${scopeType}:${scopeId}`;
  return {
    watermark: parseLegacyWatermark(await redis.get(legacyWatermarkKey).catch(() => null)),
    fromLegacyRedis: true,
  };
}

async function persistExtractionWatermark(
  organizationId: string,
  scopeType: string,
  scopeId: string,
  watermark: ExtractionWatermark,
): Promise<void> {
  await prisma.memoryExtractionCursor.upsert({
    where: {
      organizationId_scopeType_scopeId: {
        organizationId,
        scopeType: scopeType as ScopeType,
        scopeId,
      },
    },
    create: {
      organizationId,
      scopeType: scopeType as ScopeType,
      scopeId,
      lastEventId: watermark.eventId ?? "",
      lastEventTimestamp: new Date(watermark.timestamp),
    },
    update: {
      lastEventId: watermark.eventId ?? "",
      lastEventTimestamp: new Date(watermark.timestamp),
    },
  });

  const legacyWatermarkKey = `${LEGACY_WATERMARK_PREFIX}${organizationId}:${scopeType}:${scopeId}`;
  await redis.del(legacyWatermarkKey).catch(() => {});
}

function buildPendingEventsWhere(input: {
  organizationId: string;
  scopeType: string;
  scopeId: string;
  watermark: ExtractionWatermark | null;
}): Prisma.EventWhereInput {
  const whereClause: Prisma.EventWhereInput = {
    organizationId: input.organizationId,
    scopeType: input.scopeType as ScopeType,
    scopeId: input.scopeId,
    eventType: { in: [...EXTRACTABLE_EVENT_TYPES] as EventType[] },
  };

  if (!input.watermark) {
    return whereClause;
  }

  const watermarkTimestamp = new Date(input.watermark.timestamp);
  if (input.watermark.eventId) {
    whereClause.AND = [
      {
        OR: [
          { timestamp: { gt: watermarkTimestamp } },
          {
            timestamp: watermarkTimestamp,
            id: { gt: input.watermark.eventId },
          },
        ],
      },
    ];
  } else {
    whereClause.timestamp = { gt: watermarkTimestamp };
  }

  return whereClause;
}

function shouldExtractScope(
  pendingState: { count: number; firstPendingAt: Date | null },
  nowMs = Date.now(),
): boolean {
  if (pendingState.count >= STALE_EVENT_THRESHOLD) return true;
  if (pendingState.count <= 0 || !pendingState.firstPendingAt) return false;
  return nowMs - pendingState.firstPendingAt.getTime() >= STALE_SCOPE_AGE_MS;
}

// ---------------------------------------------------------------------------
// Inflight dedup
// ---------------------------------------------------------------------------

const inflightExtractions = new Map<string, Promise<void>>();

// ---------------------------------------------------------------------------
// Extraction logic
// ---------------------------------------------------------------------------

async function extractForScope(
  organizationId: string,
  scopeType: string,
  scopeId: string,
): Promise<void> {
  const dedupeKey = `${organizationId}:${scopeType}:${scopeId}`;
  if (inflightExtractions.has(dedupeKey)) return;

  const promise = doExtractForScope(organizationId, scopeType, scopeId);
  inflightExtractions.set(dedupeKey, promise);
  try {
    await promise;
  } finally {
    inflightExtractions.delete(dedupeKey);
  }
}

async function doExtractForScope(
  organizationId: string,
  scopeType: string,
  scopeId: string,
): Promise<void> {
  const scopeRef = `${organizationId}:${scopeType}:${scopeId}`;
  // Read the last processed cursor from Postgres, with a compatibility fallback
  // to legacy Redis watermarks from older deployments.
  const { watermark: lastWatermark, fromLegacyRedis } = await loadExtractionWatermark(
    organizationId,
    scopeType,
    scopeId,
  );

  // Build query — only fetch events after the watermark
  const whereClause = buildPendingEventsWhere({
    organizationId,
    scopeType,
    scopeId,
    watermark: lastWatermark,
  });

  // Fetch high-signal events since last extraction, oldest-first so we process
  // chronologically and can advance the watermark to the newest processed event.
  const events = await prisma.event.findMany({
    where: whereClause,
    orderBy: [
      { timestamp: "asc" },
      { id: "asc" },
    ],
    take: EVENTS_PER_EXTRACTION,
  });

  if (events.length === 0) {
    if (lastWatermark && fromLegacyRedis && lastWatermark.eventId) {
      await persistExtractionWatermark(organizationId, scopeType, scopeId, lastWatermark);
    }
    await clearScopePendingState(scopeRef);
    return;
  }

  // Convert to extraction format
  const extractionEvents: ExtractionEvent[] = events.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    actorType: e.actorType,
    actorId: e.actorId,
    payload: e.payload as Record<string, unknown>,
    timestamp: e.timestamp.toISOString(),
  }));

  // Determine if this is a DM scope
  let isDm = false;
  if (scopeType === "chat") {
    const chat = await prisma.chat.findUnique({
      where: { id: scopeId },
      select: { type: true },
    });
    isDm = chat?.type === "dm";
  }

  // Run extraction
  const result = await extractMemories(extractionEvents, { scopeType, scopeId });

  // Store extracted memories (events are ordered oldest-first)
  const startEventId = events[0].id;
  const endEventId = events[events.length - 1].id;

  for (const memory of result.memories) {
    try {
      await memoryService.upsert({
        organizationId,
        kind: memory.kind,
        subjectType: memory.subjectType,
        subjectId: memory.subjectId,
        sourceScopeType: scopeType as ScopeType,
        sourceScopeId: scopeId,
        sourceIsDm: isDm,
        startEventId,
        endEventId,
        sourceType: "auto",
        content: memory.content,
        structuredData: memory.structuredData,
        confidence: memory.confidence,
      });
    } catch (err) {
      logError("failed to store extracted memory", err);
    }
  }

  // Track cost
  if (result.inputTokens > 0 || result.outputTokens > 0) {
    const costCents = estimateCostCents(
      EXTRACTION_MODEL,
      result.inputTokens,
      result.outputTokens,
    );
    await costTrackingService.recordCost({
      organizationId,
      modelTier: "tier2",
      costCents,
      isSummary: false,
    }).catch(() => {});
  }

  // Advance watermark to the newest processed event's timestamp.
  // Events are ordered oldest-first, so the last element is the newest.
  // Include the event ID so same-timestamp rows don't get skipped.
  const newestProcessed = events[events.length - 1];
  const nextWatermark: ExtractionWatermark = {
    timestamp: newestProcessed.timestamp.toISOString(),
    eventId: newestProcessed.id,
  };
  await persistExtractionWatermark(organizationId, scopeType, scopeId, nextWatermark);

  const remaining = await prisma.event.findFirst({
    where: buildPendingEventsWhere({
      organizationId,
      scopeType,
      scopeId,
      watermark: nextWatermark,
    }),
    orderBy: [
      { timestamp: "asc" },
      { id: "asc" },
    ],
    select: { id: true },
  });
  await markScopeProgress(scopeRef, events.length, !!remaining);

  log("extraction complete", {
    organizationId,
    scopeType,
    scopeId,
    eventsProcessed: events.length,
    memoriesExtracted: result.memories.length,
  });
}

// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------

let pollTimer: ReturnType<typeof setInterval> | null = null;
let cycleInProgress = false;
let getActiveOrgs: (() => Iterable<string>) | null = null;

async function runExtractionCycle(): Promise<void> {
  if (cycleInProgress) return;
  cycleInProgress = true;

  try {
    // Get all active scopes from Redis
    const activeScopes = await redis.smembers(ACTIVE_SCOPES_SET_KEY);
    if (activeScopes.length === 0) return;

    // Check event counts and find scopes that need extraction
    const scopesToProcess: Array<{ orgId: string; scopeType: string; scopeId: string }> = [];
    const activeOrgSet = getActiveOrgs ? new Set(getActiveOrgs()) : null;

    for (const scopeRef of activeScopes) {
      const [orgId, scopeType, scopeId] = scopeRef.split(":");
      if (!orgId || !scopeType || !scopeId) continue;

      // Only process scopes from active orgs
      if (activeOrgSet && !activeOrgSet.has(orgId)) continue;

      const pendingState = await getScopePendingState(scopeRef);
      if (shouldExtractScope(pendingState)) {
        scopesToProcess.push({ orgId, scopeType, scopeId });
      }

      if (scopesToProcess.length >= BATCH_LIMIT) break;
    }

    // Process scopes
    for (const { orgId, scopeType, scopeId } of scopesToProcess) {
      try {
        await extractForScope(orgId, scopeType, scopeId);
      } catch (err) {
        logError("extraction failed for scope", err);
      }
    }
  } catch (err) {
    logError("extraction cycle error", err);
  } finally {
    cycleInProgress = false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function startMemoryExtractorWorker(
  activeOrgsFn: () => Iterable<string>,
): void {
  getActiveOrgs = activeOrgsFn;
  pollTimer = setInterval(() => {
    runExtractionCycle().catch((err) => logError("extraction cycle unhandled", err));
  }, POLL_INTERVAL_MS);
  log("memory extractor worker started");
}

export function stopMemoryExtractorWorker(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  log("memory extractor worker stopped");
}

export const __testOnly__ = {
  buildPendingEventsWhere,
  parseLegacyWatermark,
  shouldExtractScope,
  runExtractionCycle,
};
