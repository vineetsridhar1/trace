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
import { getScopeAdapter } from "./scope-adapter.js";
import { isRedisHealthy } from "./redis-health.js";
import { createAgentLogger } from "./logger.js";

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

/**
 * Silence timeout per scope type (ms) — how long to wait after the last event
 * before closing the window and sending the batch to the pipeline.
 *
 * Conversations (chat, channel) use shorter windows so suggestions feel timely.
 * Ticket and session scopes are less latency-sensitive.
 */
const DEFAULT_SILENCE_TIMEOUTS: Record<string, number> = {
  chat: 10_000,
  channel: 15_000,
  ticket: 30_000,
  session: 30_000,
};

const DEFAULT_SILENCE_TIMEOUT_MS = 15_000;
const MAX_EVENTS_PER_WINDOW = 25;

/**
 * Max wall clock per scope type (ms) — hard cap on how long a window stays open,
 * even if events keep arriving within the silence timeout.
 *
 * Conversations cap at 60s so the agent responds within a minute during active
 * discussions. Tickets and sessions are more tolerant of longer batching.
 */
const MAX_WALL_CLOCK_TIMEOUTS: Record<string, number> = {
  chat: 60_000,
  channel: 60_000,
  ticket: 5 * 60 * 1_000,
  session: 5 * 60 * 1_000,
};

const DEFAULT_MAX_WALL_CLOCK_MS = 2 * 60 * 1_000; // 2 minutes
const REDIS_KEY_PREFIX = "agent:aggregator:window:";
const TIMER_CHECK_INTERVAL_MS = 1_000; // check timers every second
const PERSIST_DEBOUNCE_EVENTS = 5; // persist to Redis every N events (not every event)
const PERSIST_DEBOUNCE_MS = 3_000; // or every N ms, whichever comes first

// ---------------------------------------------------------------------------
// Scope key construction
// ---------------------------------------------------------------------------

/**
 * Build a scope key from an event. Delegates to scope adapters for
 * scope-specific key construction (e.g., thread support for chat/channel).
 * Falls back to a generic "scopeType:scopeId" for unknown scopes.
 */
export function buildScopeKey(event: AgentEvent): string {
  const adapter = getScopeAdapter(event.scopeType);
  if (adapter) {
    return adapter.buildScopeKey(event);
  }
  // Generic fallback for unknown scope types
  return `${event.scopeType}:${event.scopeId}`;
}

function getSilenceTimeout(scopeType: string): number {
  return DEFAULT_SILENCE_TIMEOUTS[scopeType] ?? DEFAULT_SILENCE_TIMEOUT_MS;
}

function getMaxWallClock(scopeType: string): number {
  return MAX_WALL_CLOCK_TIMEOUTS[scopeType] ?? DEFAULT_MAX_WALL_CLOCK_MS;
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
  const scopeType = window.scopeKey.split(":")[0];
  const ttlSeconds = Math.ceil((getMaxWallClock(scopeType) + 60_000) / 1_000);
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
  /** Tracks events since last Redis persist per window — enables debounced persistence. */
  private dirtyCount = new Map<string, number>();
  private persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
      const scopeType = window.scopeKey.split(":")[0];
      const wallClockElapsed = now - window.openedAt >= getMaxWallClock(scopeType);
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
   * Stop the aggregator. Emits all open windows as batches (so no data is lost),
   * then removes them from Redis.
   */
  async stop(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Clear all silence timers and persist timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    for (const timer of this.persistTimers.values()) {
      clearTimeout(timer);
    }
    this.persistTimers.clear();
    this.dirtyCount.clear();

    // Emit all open windows before shutting down so events aren't lost
    const windowCount = this.windows.size;
    for (const [windowKey, window] of this.windows) {
      try {
        this.emitBatch(window, "silence");
        await removePersistedWindow(window.scopeKey, window.organizationId);
      } catch (err) {
        // If emit fails, persist to Redis as a fallback
        logError(`failed to emit window ${windowKey} on shutdown, persisting instead`, err);
        await persistWindow(window).catch(() => {});
      }
    }

    log(`stopped — emitted ${windowCount} remaining window(s)`);
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

    // Debounced persistence — only persist every N events or after a time interval.
    // This reduces Redis writes from 1-per-event to ~1-per-5-events.
    // Crash recovery is still safe: the silence timer provides a floor, and
    // on shutdown we persist all dirty windows explicitly.
    await this.debouncedPersist(windowKey, window);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Debounced persistence: persist to Redis every PERSIST_DEBOUNCE_EVENTS events
   * or after PERSIST_DEBOUNCE_MS, whichever comes first.
   * Skips persistence entirely when Redis is degraded.
   */
  private async debouncedPersist(windowKey: string, window: AggregationWindow): Promise<void> {
    if (!isRedisHealthy()) return;

    const dirty = (this.dirtyCount.get(windowKey) ?? 0) + 1;
    this.dirtyCount.set(windowKey, dirty);

    if (dirty >= PERSIST_DEBOUNCE_EVENTS) {
      // Threshold reached — persist immediately
      this.cancelPersistTimer(windowKey);
      this.dirtyCount.set(windowKey, 0);
      await persistWindow(window);
      return;
    }

    // Schedule a deferred persist if one isn't already pending
    if (!this.persistTimers.has(windowKey)) {
      const timer = setTimeout(() => {
        this.persistTimers.delete(windowKey);
        const currentWindow = this.windows.get(windowKey);
        if (currentWindow && isRedisHealthy()) {
          this.dirtyCount.set(windowKey, 0);
          persistWindow(currentWindow).catch((err) => {
            logError("deferred persist failed", err);
          });
        }
      }, PERSIST_DEBOUNCE_MS);
      this.persistTimers.set(windowKey, timer);
    }
  }

  private cancelPersistTimer(windowKey: string): void {
    const timer = this.persistTimers.get(windowKey);
    if (timer) {
      clearTimeout(timer);
      this.persistTimers.delete(windowKey);
    }
  }

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
      const scopeType = window.scopeKey.split(":")[0];
      if (now - window.openedAt >= getMaxWallClock(scopeType)) {
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

    // Clean up all timers and tracking for this window
    this.windows.delete(windowKey);
    this.dirtyCount.delete(windowKey);
    this.cancelPersistTimer(windowKey);
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

  /**
   * Close all open windows whose scope key starts with the given prefix.
   * Used when the agent is removed from a scope (e.g. removed from a chat) —
   * all pending windows for that scope should be discarded immediately.
   */
  async closeWindowsForScope(orgId: string, scopePrefix: string): Promise<number> {
    const toClose: string[] = [];
    for (const [windowKey, window] of this.windows) {
      if (window.organizationId === orgId && window.scopeKey.startsWith(scopePrefix)) {
        toClose.push(windowKey);
      }
    }
    for (const key of toClose) {
      const window = this.windows.get(key);
      if (window) {
        this.windows.delete(key);
        this.dirtyCount.delete(key);
        this.cancelPersistTimer(key);
        const timer = this.timers.get(key);
        if (timer) {
          clearTimeout(timer);
          this.timers.delete(key);
        }
        await removePersistedWindow(window.scopeKey, window.organizationId);
        log("window closed (scope removed)", { scopeKey: window.scopeKey, orgId });
      }
    }
    return toClose.length;
  }

  /** Number of currently open windows (for testing/observability) */
  get openWindowCount(): number {
    return this.windows.size;
  }

  /** Get info about all currently open aggregation windows (for debug console) */
  getOpenWindows(): Array<{
    scopeKey: string;
    organizationId: string;
    eventCount: number;
    openedAt: number;
    lastEventAt: number;
  }> {
    const result: Array<{
      scopeKey: string;
      organizationId: string;
      eventCount: number;
      openedAt: number;
      lastEventAt: number;
    }> = [];
    for (const window of this.windows.values()) {
      result.push({
        scopeKey: window.scopeKey,
        organizationId: window.organizationId,
        eventCount: window.events.length,
        openedAt: window.openedAt,
        lastEventAt: window.lastEventAt,
      });
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const aggregatorLogger = createAgentLogger("aggregator");
const { log, logError } = aggregatorLogger;
