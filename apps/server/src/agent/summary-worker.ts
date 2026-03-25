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
  const key = `${SCOPE_EVENT_COUNT_PREFIX}${organizationId}:${scopeType}:${scopeId}`;
  try {
    await redis.incr(key);
  } catch {
    // Non-critical — worst case the summary worker falls back to DB counts
  }
}

/**
 * Get the accumulated event count for a scope since last summary reset.
 */
async function getScopeEventCount(
  organizationId: string,
  scopeType: string,
  scopeId: string,
): Promise<number> {
  const key = `${SCOPE_EVENT_COUNT_PREFIX}${organizationId}:${scopeType}:${scopeId}`;
  try {
    const val = await redis.get(key);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

/**
 * Reset the event counter for a scope after a summary is generated.
 */
async function resetScopeEventCount(
  organizationId: string,
  scopeType: string,
  scopeId: string,
): Promise<void> {
  const key = `${SCOPE_EVENT_COUNT_PREFIX}${organizationId}:${scopeType}:${scopeId}`;
  try {
    await redis.del(key);
  } catch {
    // Non-critical
  }
}

// ---------------------------------------------------------------------------
// Core refresh logic
// ---------------------------------------------------------------------------

/**
 * Refresh one entity's rolling summary.
 */
async function refreshSummary(
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
    // Reset the counter — no actual new events (counter may be stale)
    await resetScopeEventCount(organizationId, entityType, entityId);
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

  // Reset the Redis counter
  await resetScopeEventCount(organizationId, entityType, entityId);

  // Estimate cost (Haiku-class pricing: ~$0.25/M input, ~$1.25/M output)
  const costCents =
    (result.inputTokens * 0.000025 + result.outputTokens * 0.000125) * 100;

  // Record cost
  await costTrackingService.recordCost({
    organizationId,
    modelTier: "tier2",
    costCents,
    isSummary: true,
  });

  return { costCents };
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
 * Scan Redis for scopes that have accumulated enough events.
 */
async function findStaleByEventCount(
  activeOrgIds: Iterable<string>,
): Promise<StaleScopeCandidate[]> {
  const candidates: StaleScopeCandidate[] = [];

  try {
    // Scan Redis keys matching our counter prefix
    const pattern = `${SCOPE_EVENT_COUNT_PREFIX}*`;
    let cursor = "0";
    const activeSet = new Set(activeOrgIds);

    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;

      for (const key of keys) {
        const val = await redis.get(key);
        const count = val ? parseInt(val, 10) : 0;

        if (count >= STALE_EVENT_THRESHOLD) {
          // Parse key: agent:summary:events:{orgId}:{scopeType}:{scopeId}
          const parts = key.replace(SCOPE_EVENT_COUNT_PREFIX, "").split(":");
          if (parts.length >= 3) {
            const orgId = parts[0];
            const scopeType = parts[1];
            const scopeId = parts.slice(2).join(":"); // scopeId may contain colons

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
      }
    } while (cursor !== "0");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[summary-worker] Redis scan failed:", msg);
  }

  return candidates;
}

/**
 * Find summaries that are stale by time (haven't been updated in 30+ min).
 */
async function findStaleByTime(): Promise<StaleScopeCandidate[]> {
  const staleSummaries = await summaryService.findStale({
    minutesThreshold: STALE_MINUTES_THRESHOLD,
    limit: BATCH_LIMIT,
  });

  return staleSummaries.map((s: EntitySummary) => ({
    organizationId: s.organizationId,
    entityType: s.entityType,
    entityId: s.entityId,
    reason: "time_elapsed" as const,
  }));
}

// ---------------------------------------------------------------------------
// Worker loop
// ---------------------------------------------------------------------------

let pollTimer: ReturnType<typeof setInterval> | null = null;
let running = false;

function log(msg: string, data?: Record<string, unknown>): void {
  const prefix = "[summary-worker]";
  if (data) {
    console.log(prefix, msg, JSON.stringify(data));
  } else {
    console.log(prefix, msg);
  }
}

/**
 * One refresh cycle: find stale summaries and regenerate them.
 */
async function refreshCycle(activeOrgIds: Iterable<string>): Promise<void> {
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
