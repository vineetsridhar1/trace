/**
 * Event Aggregator — batches related events into coherent units before the planner.
 *
 * A 5-message thread about a bug is one conceptual trigger, not 5 independent
 * planner calls. This reduces LLM costs and produces better decisions.
 *
 * Ticket: #05
 */

import { redis } from "../lib/redis.js";
import type { AgentEvent, RoutingResult } from "./router.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AggregationWindow {
  scopeKey: string;
  organizationId: string;
  events: AgentEvent[];
  maxTier?: number;
  openedAt: number; // epoch ms
  lastEventAt: number; // epoch ms
}

export interface AggregatedBatch {
  scopeKey: string;
  organizationId: string;
  events: AgentEvent[];
  maxTier?: number;
  openedAt: number;
  closedAt: number;
  closeReason: "silence" | "max_events" | "max_wall_clock" | "direct";
}

/** Callback invoked when a window closes and emits a batch */
export type BatchHandler = (batch: AggregatedBatch) => void;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default silence timeout per scope type (ms). Configurable per scope. */
const DEFAULT_SILENCE_TIMEOUTS: Record<string, number> = {
  chat: 30_000,
  ticket: 30_000,
  session: 30_000,
  channel: 60_000, // channels may want longer windows
};

const DEFAULT_SILENCE_TIMEOUT_MS = 30_000;
const MAX_EVENTS_PER_WINDOW = 25;
const MAX_WALL_CLOCK_MS = 5 * 60 * 1_000; // 5 minutes
const REDIS_KEY_PREFIX = "agent:aggregator:window:";
const TIMER_CHECK_INTERVAL_MS = 1_000; // check timers every second

// ---------------------------------------------------------------------------
// Scope key construction
// ---------------------------------------------------------------------------

/**
 * Build a scope key from an event. Handles all current scope types and
 * provides a generic fallback so adding new scopes is trivial.
 */
export function buildScopeKey(event: AgentEvent): string {
  const { scopeType, scopeId, payload } = event;

  if (scopeType === "chat") {
    const parentMessageId = payload.parentMessageId as string | undefined;
    if (parentMessageId) {
      return `chat:${scopeId}:thread:${parentMessageId}`;
    }
    return `chat:${scopeId}`;
  }

  if (scopeType === "ticket") {
    return `ticket:${scopeId}`;
  }

  if (scopeType === "session") {
    return `session:${scopeId}`;
  }

  // Generic fallback — future scope types (channels, etc.) work automatically
  return `${scopeType}:${scopeId}`;
}

function getSilenceTimeout(scopeType: string): number {
  return DEFAULT_SILENCE_TIMEOUTS[scopeType] ?? DEFAULT_SILENCE_TIMEOUT_MS;
}

// ---------------------------------------------------------------------------
// Redis persistence helpers
// ---------------------------------------------------------------------------

function redisKey(scopeKey: string, orgId: string): string {
  return `${REDIS_KEY_PREFIX}${orgId}:${scopeKey}`;
}

async function persistWindow(window: AggregationWindow): Promise<void> {
  const key = redisKey(window.scopeKey, window.organizationId);
  const data = JSON.stringify({
    scopeKey: window.scopeKey,
    organizationId: window.organizationId,
    events: window.events,
    maxTier: window.maxTier,
    openedAt: window.openedAt,
    lastEventAt: window.lastEventAt,
  });
  // Expire after max wall clock + generous buffer so orphaned keys are cleaned up
  const ttlSeconds = Math.ceil((MAX_WALL_CLOCK_MS + 60_000) / 1_000);
  await redis.set(key, data, "EX", ttlSeconds);
}

async function removePersistedWindow(scopeKey: string, orgId: string): Promise<void> {
  await redis.del(redisKey(scopeKey, orgId));
}

/**
 * Load all persisted windows from Redis. Uses a global SCAN — safe for
 * single-worker deployment. Multi-worker will need scoped recovery
 * (e.g. by consumer name or org assignment) — see ticket #15.
 */
async function loadPersistedWindows(): Promise<AggregationWindow[]> {
  const pattern = `${REDIS_KEY_PREFIX}*`;
  const windows: AggregationWindow[] = [];
  let cursor = "0";

  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;

    for (const key of keys) {
      try {
        const data = await redis.get(key);
        if (data) {
          const parsed = JSON.parse(data) as AggregationWindow;
          windows.push(parsed);
        }
      } catch {
        // Corrupt key — delete it
        await redis.del(key);
      }
    }
  } while (cursor !== "0");

  return windows;
}

// ---------------------------------------------------------------------------
// EventAggregator
// ---------------------------------------------------------------------------

export class EventAggregator {
  private windows = new Map<string, AggregationWindow>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private batchHandler: BatchHandler;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor(batchHandler: BatchHandler) {
    this.batchHandler = batchHandler;
  }

  /**
   * Start the aggregator. Recovers any open windows from Redis and
   * starts the periodic timer check for wall-clock expiry.
   */
  async start(): Promise<void> {
    // Recover persisted windows
    const persisted = await loadPersistedWindows();
    const now = Date.now();

    for (const window of persisted) {
      const windowKey = this.windowKey(window.scopeKey, window.organizationId);

      // Check if window should have already expired
      const wallClockElapsed = now - window.openedAt >= MAX_WALL_CLOCK_MS;
      const scopeType = window.scopeKey.split(":")[0];
      const silenceElapsed = now - window.lastEventAt >= getSilenceTimeout(scopeType);

      if (wallClockElapsed) {
        this.emitBatch(window, "max_wall_clock");
        await removePersistedWindow(window.scopeKey, window.organizationId);
      } else if (silenceElapsed) {
        this.emitBatch(window, "silence");
        await removePersistedWindow(window.scopeKey, window.organizationId);
      } else {
        // Window is still active — resume it
        this.windows.set(windowKey, window);
        this.scheduleSilenceTimer(window);
      }
    }

    if (persisted.length > 0) {
      log(`recovered ${persisted.length} window(s) from Redis, ${this.windows.size} still active`);
    }

    // Start periodic check for max wall clock expiry
    this.checkInterval = setInterval(() => this.checkWallClocks(), TIMER_CHECK_INTERVAL_MS);
  }

  /**
   * Stop the aggregator. Flushes all open windows and clears timers.
   */
  async stop(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Clear all silence timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    // Flush remaining windows (persist to Redis so they survive restart)
    for (const window of this.windows.values()) {
      await persistWindow(window);
    }

    log(`stopped — ${this.windows.size} window(s) persisted to Redis`);
    this.windows.clear();
  }

  /**
   * Ingest an event with its routing result.
   * Direct-routed events bypass aggregation and emit immediately.
   * Aggregate-routed events are batched into windows.
   */
  async ingest(event: AgentEvent, routing: RoutingResult): Promise<void> {
    // Direct-routed events bypass aggregation entirely
    if (routing.decision === "direct") {
      const batch: AggregatedBatch = {
        scopeKey: buildScopeKey(event),
        organizationId: event.organizationId,
        events: [event],
        maxTier: routing.maxTier,
        openedAt: Date.now(),
        closedAt: Date.now(),
        closeReason: "direct",
      };
      this.batchHandler(batch);
      return;
    }

    // Aggregate the event into a window
    const scopeKey = buildScopeKey(event);
    const windowKey = this.windowKey(scopeKey, event.organizationId);
    const now = Date.now();

    let window = this.windows.get(windowKey);

    if (!window) {
      // Open a new window
      window = {
        scopeKey,
        organizationId: event.organizationId,
        events: [],
        maxTier: routing.maxTier,
        openedAt: now,
        lastEventAt: now,
      };
      this.windows.set(windowKey, window);
    }

    window.events.push(event);
    window.lastEventAt = now;

    // Track the most restrictive maxTier across all events in the window
    if (routing.maxTier !== undefined) {
      window.maxTier = window.maxTier !== undefined
        ? Math.min(window.maxTier, routing.maxTier)
        : routing.maxTier;
    }

    // Check max events threshold
    if (window.events.length >= MAX_EVENTS_PER_WINDOW) {
      await this.closeWindow(windowKey, "max_events");
      return;
    }

    // Reset silence timer
    this.scheduleSilenceTimer(window);

    // Persist to Redis
    await persistWindow(window);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private windowKey(scopeKey: string, orgId: string): string {
    return `${orgId}:${scopeKey}`;
  }

  private scheduleSilenceTimer(window: AggregationWindow): void {
    const windowKey = this.windowKey(window.scopeKey, window.organizationId);

    // Clear existing timer
    const existing = this.timers.get(windowKey);
    if (existing) {
      clearTimeout(existing);
    }

    const scopeType = window.scopeKey.split(":")[0];
    const timeout = getSilenceTimeout(scopeType);

    const timer = setTimeout(() => {
      this.closeWindow(windowKey, "silence").catch((err) => {
        logError("failed to close window on silence timeout", err);
      });
    }, timeout);

    this.timers.set(windowKey, timer);
  }

  private checkWallClocks(): void {
    const now = Date.now();
    // Collect expired keys first to avoid mutating the map during iteration
    const expired: string[] = [];
    for (const [windowKey, window] of this.windows) {
      if (now - window.openedAt >= MAX_WALL_CLOCK_MS) {
        expired.push(windowKey);
      }
    }
    for (const key of expired) {
      this.closeWindow(key, "max_wall_clock").catch((err) => {
        logError("failed to close window on wall clock", err);
      });
    }
  }

  private async closeWindow(
    windowKey: string,
    reason: AggregatedBatch["closeReason"],
  ): Promise<void> {
    const window = this.windows.get(windowKey);
    if (!window) return;

    // Clean up
    this.windows.delete(windowKey);
    const timer = this.timers.get(windowKey);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(windowKey);
    }

    // Remove from Redis
    await removePersistedWindow(window.scopeKey, window.organizationId);

    // Emit the batch
    this.emitBatch(window, reason);
  }

  private emitBatch(window: AggregationWindow, reason: AggregatedBatch["closeReason"]): void {
    const batch: AggregatedBatch = {
      scopeKey: window.scopeKey,
      organizationId: window.organizationId,
      events: window.events,
      maxTier: window.maxTier,
      openedAt: window.openedAt,
      closedAt: Date.now(),
      closeReason: reason,
    };

    log("window closed", {
      scopeKey: batch.scopeKey,
      orgId: batch.organizationId,
      eventCount: batch.events.length,
      reason,
      durationMs: batch.closedAt - batch.openedAt,
    });

    this.batchHandler(batch);
  }

  /** Number of currently open windows (for testing/observability) */
  get openWindowCount(): number {
    return this.windows.size;
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(msg: string, data?: Record<string, unknown>): void {
  const prefix = "[aggregator]";
  if (data) {
    console.log(prefix, msg, JSON.stringify(data));
  } else {
    console.log(prefix, msg);
  }
}

function logError(msg: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[aggregator] ${msg}:`, message);
}
