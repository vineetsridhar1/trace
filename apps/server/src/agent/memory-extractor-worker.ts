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

import type { Event, EventType, ScopeType } from "@prisma/client";
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
/** Redis SET tracking scopes with pending memory extraction events. */
const ACTIVE_SCOPES_SET_KEY = "agent:memory:active_scopes";
/** Redis key storing the last extracted event ID per scope (watermark). */
const WATERMARK_PREFIX = "agent:memory:watermark:";

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
  const key = `${SCOPE_EVENT_COUNT_PREFIX}${scopeRef}`;
  try {
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.sadd(ACTIVE_SCOPES_SET_KEY, scopeRef);
    await pipeline.exec();
  } catch {
    // Non-critical — worst case extraction happens on time-based check
  }
}

/**
 * Atomically read and reset the event counter for a scope.
 */
async function getAndResetScopeEventCount(scopeRef: string): Promise<number> {
  const key = `${SCOPE_EVENT_COUNT_PREFIX}${scopeRef}`;
  try {
    const val = await redis.getdel(key);
    if (val) {
      await redis.srem(ACTIVE_SCOPES_SET_KEY, scopeRef);
    }
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
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
  // Read the watermark — last extracted event's timestamp for this scope
  const watermarkKey = `${WATERMARK_PREFIX}${organizationId}:${scopeType}:${scopeId}`;
  const lastWatermark = await redis.get(watermarkKey).catch(() => null);

  // Build query — only fetch events after the watermark
  const whereClause: Record<string, unknown> = {
    organizationId,
    scopeType: scopeType as ScopeType,
    scopeId,
    eventType: { in: [...EXTRACTABLE_EVENT_TYPES] as EventType[] },
  };
  if (lastWatermark) {
    whereClause.timestamp = { gt: new Date(lastWatermark) };
  }

  // Fetch high-signal events since last extraction, oldest-first so we process
  // chronologically and can advance the watermark to the newest processed event.
  const events = await prisma.event.findMany({
    where: whereClause,
    orderBy: { timestamp: "asc" },
    take: EVENTS_PER_EXTRACTION,
  });

  if (events.length === 0) return;

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
  // If >EVENTS_PER_EXTRACTION events arrived, the next cycle picks up from here.
  const newestProcessed = events[events.length - 1];
  await redis.set(watermarkKey, newestProcessed.timestamp.toISOString()).catch(() => {});

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

      const count = await getAndResetScopeEventCount(scopeRef);
      if (count >= STALE_EVENT_THRESHOLD) {
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
