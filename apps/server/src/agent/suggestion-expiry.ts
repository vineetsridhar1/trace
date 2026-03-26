/**
 * Agent Maintenance Worker — periodic background jobs for housekeeping.
 *
 * Runs in the agent worker process and handles:
 * 1. Suggestion expiry — resolves suggestions past their expiresAt timestamp
 * 2. Processed event cleanup — deletes ProcessedAgentEvent records older than 7 days
 * 3. Suggestion rate limit cleanup — clears stale in-memory rate counters
 *
 * Ticket: #14, #19
 */

import { inboxService } from "../services/inbox.js";
import { processedEventService } from "../services/processed-event.js";
import { cleanupSuggestionRates } from "./policy-engine.js";

const CHECK_INTERVAL_MS = 60_000; // 1 minute
const PROCESSED_EVENT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PROCESSED_EVENT_CLEANUP_INTERVAL = 15; // run every 15th cycle (~15 min)

let timer: ReturnType<typeof setInterval> | null = null;
let cycleCount = 0;

/**
 * Start the suggestion expiry worker.
 */
export function startSuggestionExpiryWorker(): void {
  if (timer) return;

  timer = setInterval(() => {
    runMaintenanceCycle().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[maintenance-worker] cycle failed:", message);
    });
  }, CHECK_INTERVAL_MS);
}

/**
 * Stop the suggestion expiry worker.
 */
export function stopSuggestionExpiryWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function runMaintenanceCycle(): Promise<void> {
  cycleCount++;

  // ── Always: expire stale suggestions ──
  try {
    const expired = await inboxService.expireSuggestions();
    if (expired.length > 0) {
      console.log(
        `[maintenance-worker] expired ${expired.length} suggestion(s)`,
        expired.map((i) => ({ id: i.id, itemType: i.itemType })),
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[maintenance-worker] suggestion expiry failed:", message);
  }

  // ── Always: clean up stale rate limit entries ──
  cleanupSuggestionRates();

  // ── Every 15 cycles (~15 min): clean up old processed events ──
  if (cycleCount % PROCESSED_EVENT_CLEANUP_INTERVAL === 0) {
    try {
      const deleted = await processedEventService.cleanupOldRecords(PROCESSED_EVENT_MAX_AGE_MS);
      if (deleted > 0) {
        console.log(`[maintenance-worker] cleaned up ${deleted} old processed event record(s)`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[maintenance-worker] processed event cleanup failed:", message);
    }
  }
}
