/**
 * Suggestion Expiry Worker — periodically checks for and expires stale suggestions.
 *
 * Runs as a background timer in the agent worker process.
 * Checks every 60 seconds for suggestions past their expiresAt timestamp.
 *
 * Ticket: #14
 */

import { inboxService } from "../services/inbox.js";

const CHECK_INTERVAL_MS = 60_000; // 1 minute

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the suggestion expiry worker.
 */
export function startSuggestionExpiryWorker(): void {
  if (timer) return;

  timer = setInterval(() => {
    inboxService
      .expireSuggestions()
      .then((expired) => {
        if (expired.length > 0) {
          console.log(
            `[suggestion-expiry] expired ${expired.length} suggestion(s)`,
            expired.map((i) => ({ id: i.id, itemType: i.itemType })),
          );
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[suggestion-expiry] check failed:", message);
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
