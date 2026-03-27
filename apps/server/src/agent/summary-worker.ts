/**
 * Summary Worker — background loop that refreshes stale entity summaries.
 *
 * Runs inside the agent-worker process. Periodically scans for scopes
 * with enough new events (or enough elapsed time) and regenerates their
 * rolling summaries using a cheap LLM call.
 *
 * Part of ticket #09 (Entity Summaries).
 */

import type { Event, EntitySummary } from "@prisma/client";
import { redis } from "../lib/redis.js";
import { summaryService } from "../services/summary.js";
import { costTrackingService } from "../services/cost-tracking.js";
import {
  generateSummary,
  type SummaryEvent,
} from "./summary-generator.js";
import { estimateCostCents } from "./cost-utils.js";
import { createAgentLogger } from "./logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 60_000; // check for stale summaries every 60s
const STALE_EVENT_THRESHOLD = 20;
const STALE_MINUTES_THRESHOLD = 30;
const BATCH_LIMIT = 10; // max summaries to refresh per cycle
const EVENTS_PER_SUMMARY = 100; // max events to feed into one summary call

/** Redis key tracking per-scope event counts since last summary. */
const SCOPE_EVENT_COUNT_PREFIX = "agent:summary:events:";
/** Redis SET that tracks all scopes with pending event counts — avoids SCAN. */
const ACTIVE_SCOPES_SET_KEY = "agent:summary:active_scopes";

// ---------------------------------------------------------------------------
// Event count tracking (called from the main event consumption loop)
// ---------------------------------------------------------------------------

/**
 * Increment the event counter for a scope. Called by the agent worker
 * each time an event is processed, so the summary worker can efficiently
 * detect which scopes have accumulated enough events.
 */
export async function trackEventForSummary(
  organizationId: string,
  scopeType: string,
  scopeId: string,
): Promise<void> {
  const scopeRef = `${organizationId}:${scopeType}:${scopeId}`;
  const key = `${SCOPE_EVENT_COUNT_PREFIX}${scopeRef}`;
  try {
    // Increment counter and register in the active scopes SET (pipeline for efficiency)
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.sadd(ACTIVE_SCOPES_SET_KEY, scopeRef);
    await pipeline.exec();
  } catch {
    // Non-critical — worst case the summary worker falls back to DB counts
  }
}

/**
 * Atomically read and reset the event counter for a scope.
 * Uses GETDEL to avoid race conditions where events arrive between GET and DEL.
 * Returns the count that was cleared.
 */
async function getAndResetScopeEventCount(
  organizationId: string,
  scopeType: string,
  scopeId: string,
): Promise<number> {
  const scopeRef = `${organizationId}:${scopeType}:${scopeId}`;
  const key = `${SCOPE_EVENT_COUNT_PREFIX}${scopeRef}`;
  try {
    // GETDEL atomically returns and deletes — no events lost between read and reset
    const val = await redis.getdel(key);
    // Remove from active scopes SET
    await redis.srem(ACTIVE_SCOPES_SET_KEY, scopeRef);
    return val ? parseInt(val, 10) : 0;
  } catch {
    // Fallback: try non-atomic delete if GETDEL unsupported
    try {
      const val = await redis.get(key);
      await redis.del(key);
      await redis.srem(ACTIVE_SCOPES_SET_KEY, scopeRef);
      return val ? parseInt(val, 10) : 0;
    } catch {
      return 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Core refresh logic
// ---------------------------------------------------------------------------

/** Summary model — read from env or default to Haiku. */
const SUMMARY_MODEL = process.env.AGENT_SUMMARY_MODEL ?? "claude-haiku-4-5-20251001";

/**
 * In-flight refresh dedup — prevents the pipeline and summary worker from
 * generating the same summary concurrently. The second caller awaits the
 * first's promise instead of making a redundant LLM call.
 */
const inflightRefreshes = new Map<string, Promise<{ costCents: number } | null>>();

function refreshKey(orgId: string, entityType: string, entityId: string): string {
  return `${orgId}:${entityType}:${entityId}`;
}

/**
 * Refresh one entity's rolling summary.
 * Exported so the context builder (ticket #10) can trigger synchronous refresh.
 * Deduplicates concurrent calls for the same entity.
 */
export async function refreshSummary(
  organizationId: string,
  entityType: string,
  entityId: string,
): Promise<{ costCents: number } | null> {
  const key = refreshKey(organizationId, entityType, entityId);
  const inflight = inflightRefreshes.get(key);
  if (inflight) return inflight;

  const promise = refreshSummaryInner(organizationId, entityType, entityId).finally(() => {
    inflightRefreshes.delete(key);
  });
  inflightRefreshes.set(key, promise);
  return promise;
}

async function refreshSummaryInner(
  organizationId: string,
  entityType: string,
  entityId: string,
): Promise<{ costCents: number } | null> {
  // Fetch current summary
  const existing = await summaryService.getLatest({
    organizationId,
    entityType,
    entityId,
  });

  // Fetch new events since the last summary
  const events = await summaryService.getEventsForSummary({
    organizationId,
    scopeType: entityType,
    scopeId: entityId,
    afterEventId: existing?.endEventId ?? undefined,
    limit: EVENTS_PER_SUMMARY,
  });

  if (events.length === 0) {
    // No actual new events — reset the counter (may be stale) and skip
    await getAndResetScopeEventCount(organizationId, entityType, entityId);
    return null;
  }

  // Map DB events to the generator's input format
  const summaryEvents: SummaryEvent[] = events.map((e: Event) => ({
    id: e.id,
    eventType: e.eventType,
    actorType: e.actorType,
    actorId: e.actorId,
    payload: e.payload as Record<string, unknown>,
    timestamp: e.timestamp.toISOString(),
  }));

  // Generate the summary
  const result = await generateSummary({
    entityType,
    entityId,
    events: summaryEvents,
    previousSummary: existing?.content ?? undefined,
  });

  // Compute total event count
  const totalEventCount = (existing?.eventCount ?? 0) + events.length;
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];

  // Persist
  await summaryService.upsert({
    organizationId,
    entityType,
    entityId,
    summaryType: "rolling",
    content: result.content,
    structuredData: result.structuredData as unknown as Record<string, unknown>,
    startEventId: existing?.startEventId ?? firstEvent.id,
    endEventId: lastEvent.id,
    eventCount: totalEventCount,
  });

  // Atomically reset the Redis counter (events arriving during generation are preserved)
  await getAndResetScopeEventCount(organizationId, entityType, entityId);

  // Estimate cost using model-aware lookup
  const costCents = estimateCostCents(
    SUMMARY_MODEL,
    result.inputTokens,
    result.outputTokens,
  );

  // Record cost
  await costTrackingService.recordCost({
    organizationId,
    modelTier: "tier2",
    costCents,
    isSummary: true,
  });

  return { costCents };
}

/**
 * Refresh a summary only if it's stale. Convenience wrapper for the context builder.
 * Returns the current summary (refreshed if needed).
 */
export async function refreshIfStale(
  organizationId: string,
  entityType: string,
  entityId: string,
): Promise<EntitySummary | null> {
  const existing = await summaryService.getLatest({
    organizationId,
    entityType,
    entityId,
  });

  // Count events since last summary
  const currentCount = await summaryService.countEventsSince({
    organizationId,
    scopeType: entityType,
    scopeId: entityId,
    afterEventId: existing?.endEventId ?? undefined,
  });

  const totalCount = (existing?.eventCount ?? 0) + currentCount;
  const { fresh } = summaryService.isFresh(existing, totalCount);

  if (!fresh) {
    await refreshSummary(organizationId, entityType, entityId);
    // Re-fetch the updated summary
    return summaryService.getLatest({ organizationId, entityType, entityId });
  }

  return existing;
}

// ---------------------------------------------------------------------------
// Discovery: find scopes that need summary refresh
// ---------------------------------------------------------------------------

interface StaleScopeCandidate {
  organizationId: string;
  entityType: string;
  entityId: string;
  reason: "event_count" | "time_elapsed";
}

/**
 * Look up scopes that have accumulated enough events using the tracked SET.
 * This is O(N) where N = number of active scopes, not O(total Redis keys).
 */
async function findStaleByEventCount(
  activeOrgIds: Iterable<string>,
): Promise<StaleScopeCandidate[]> {
  const candidates: StaleScopeCandidate[] = [];

  try {
    const activeSet = new Set(activeOrgIds);

    // Read all tracked scopes from the SET
    const scopeRefs = await redis.smembers(ACTIVE_SCOPES_SET_KEY);

    // Batch-fetch all counters using pipeline
    if (scopeRefs.length === 0) return candidates;

    const pipeline = redis.pipeline();
    for (const ref of scopeRefs) {
      pipeline.get(`${SCOPE_EVENT_COUNT_PREFIX}${ref}`);
    }
    const results = await pipeline.exec();

    for (let i = 0; i < scopeRefs.length; i++) {
      const ref = scopeRefs[i];
      const result = results?.[i];
      const val = result?.[1] as string | null;
      const count = val ? parseInt(val, 10) : 0;

      if (count >= STALE_EVENT_THRESHOLD) {
        // Parse ref: {orgId}:{scopeType}:{scopeId}
        const parts = ref.split(":");
        if (parts.length >= 3) {
          const orgId = parts[0];
          const scopeType = parts[1];
          const scopeId = parts.slice(2).join(":");

          if (activeSet.has(orgId)) {
            candidates.push({
              organizationId: orgId,
              entityType: scopeType,
              entityId: scopeId,
              reason: "event_count",
            });
          }
        }
      }

      // Clean up entries with 0 count from the SET
      if (count === 0) {
        redis.srem(ACTIVE_SCOPES_SET_KEY, ref).catch(() => {});
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[summary-worker] Redis lookup failed:", msg);
  }

  return candidates;
}

/**
 * Find summaries that are stale by time (haven't been updated in 30+ min).
 * Only returns summaries that actually have new events to process.
 */
async function findStaleByTime(): Promise<StaleScopeCandidate[]> {
  const staleSummaries = await summaryService.findStale({
    minutesThreshold: STALE_MINUTES_THRESHOLD,
    limit: BATCH_LIMIT,
  });

  // Filter out summaries that have no new events (avoid wasted LLM calls)
  const candidates: StaleScopeCandidate[] = [];
  for (const s of staleSummaries) {
    const newEventCount = await summaryService.countEventsSince({
      organizationId: s.organizationId,
      scopeType: s.entityType,
      scopeId: s.entityId,
      afterEventId: s.endEventId ?? undefined,
    });

    if (newEventCount > 0) {
      candidates.push({
        organizationId: s.organizationId,
        entityType: s.entityType,
        entityId: s.entityId,
        reason: "time_elapsed",
      });
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Worker loop
// ---------------------------------------------------------------------------

let pollTimer: ReturnType<typeof setInterval> | null = null;
let running = false;
/** Guard against overlapping refresh cycles */
let cycleInProgress = false;

const summaryLogger = createAgentLogger("summary-worker");
const { log } = summaryLogger;

/**
 * One refresh cycle: find stale summaries and regenerate them.
 * Guarded against concurrent execution — if a previous cycle is still
 * running when the interval fires, the new cycle is skipped.
 */
async function refreshCycle(activeOrgIds: Iterable<string>): Promise<void> {
  if (cycleInProgress) return;
  cycleInProgress = true;
  try {
    await refreshCycleInner(activeOrgIds);
  } finally {
    cycleInProgress = false;
  }
}

async function refreshCycleInner(activeOrgIds: Iterable<string>): Promise<void> {
  // Collect candidates from both sources, deduplicate
  const [byCount, byTime] = await Promise.all([
    findStaleByEventCount(activeOrgIds),
    findStaleByTime(),
  ]);

  const seen = new Set<string>();
  const candidates: StaleScopeCandidate[] = [];

  for (const c of [...byCount, ...byTime]) {
    const key = `${c.organizationId}:${c.entityType}:${c.entityId}`;
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(c);
    }
  }

  if (candidates.length === 0) return;

  // Process up to BATCH_LIMIT summaries per cycle
  const batch = candidates.slice(0, BATCH_LIMIT);
  log("refreshing summaries", { count: batch.length });

  for (const candidate of batch) {
    try {
      const result = await refreshSummary(
        candidate.organizationId,
        candidate.entityType,
        candidate.entityId,
      );

      if (result) {
        log("summary refreshed", {
          orgId: candidate.organizationId,
          entityType: candidate.entityType,
          entityId: candidate.entityId,
          reason: candidate.reason,
          costCents: Math.round(result.costCents * 1000) / 1000,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[summary-worker] failed to refresh ${candidate.entityType}:${candidate.entityId}:`,
        msg,
      );
    }
  }
}

/**
 * Start the background summary refresh loop.
 * @param getActiveOrgs - function that returns currently active org IDs
 */
export function startSummaryWorker(
  getActiveOrgs: () => Iterable<string>,
): void {
  if (running) return;
  running = true;

  // Check for ANTHROPIC_API_KEY — summary generation requires it
  if (!process.env.ANTHROPIC_API_KEY) {
    log("ANTHROPIC_API_KEY not set — summary worker disabled");
    running = false;
    return;
  }

  log("started");

  pollTimer = setInterval(() => {
    if (running) {
      refreshCycle(getActiveOrgs()).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[summary-worker] refresh cycle failed:", msg);
      });
    }
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the summary worker gracefully.
 */
export function stopSummaryWorker(): void {
  running = false;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  log("stopped");
}
