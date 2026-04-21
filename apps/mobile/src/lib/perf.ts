import { InteractionManager } from "react-native";

/**
 * Lightweight performance instrumentation for the mobile app. Mirrors the
 * intent of `expo-performance` without taking on the dependency: we only
 * need to validate the §16 budgets on a real device.
 *
 * Reported metrics (`__DEV__` console, ring-buffered for in-app surfacing):
 * - cold-start  — module-eval to first interactive frame
 * - warm-start  — last `appBackgrounded` to next interactive frame
 * - event-ingest — websocket arrival to scoped store update
 *
 * Production builds keep the markers cheap (timestamp arithmetic only) but
 * suppress the console output. Surface these in a dev-only overlay later if
 * we need richer in-app inspection.
 */

const MODULE_LOAD_AT = nowMs();

export type PerfMetric =
  | "cold-start"
  | "warm-start"
  | "event-ingest"
  | "input-latency";

interface PerfSample {
  metric: PerfMetric;
  /** Duration of the measured event, in milliseconds. */
  ms: number;
  /** Wall-clock timestamp of when the sample was recorded. */
  at: number;
  /** Optional tag — e.g. eventType for `event-ingest` samples. */
  meta?: string;
}

const RING_SIZE = 200;
const ring: PerfSample[] = [];

export function recordPerf(metric: PerfMetric, ms: number, meta?: string): void {
  const sample: PerfSample = { metric, ms, at: nowMs(), meta };
  ring.push(sample);
  if (ring.length > RING_SIZE) ring.shift();
  if (__DEV__) {
    const tag = meta ? `${metric} (${meta})` : metric;
    // eslint-disable-next-line no-console
    console.log(`[perf] ${tag}: ${ms.toFixed(1)}ms`);
  }
}

export function recentPerfSamples(metric?: PerfMetric): PerfSample[] {
  if (!metric) return ring.slice();
  return ring.filter((s) => s.metric === metric);
}

let coldStartReported = false;

/**
 * Mark the app as interactive. Called from the root layout once auth has
 * resolved. Reports cold-start once per process. Subsequent calls are no-ops.
 */
export function markAppInteractive(): void {
  if (coldStartReported) return;
  coldStartReported = true;
  InteractionManager.runAfterInteractions(() => {
    const elapsed = nowMs() - MODULE_LOAD_AT;
    recordPerf("cold-start", elapsed);
  });
}

let lastBackgroundedAt: number | null = null;

export function markAppBackgrounded(): void {
  lastBackgroundedAt = nowMs();
}

export function markAppForegrounded(): void {
  if (lastBackgroundedAt == null) return;
  const start = lastBackgroundedAt;
  lastBackgroundedAt = null;
  // We want "interactive" not just "JS thread free", so wait until any
  // pending interactions have flushed before stamping the warm-start. On a
  // healthy device this fires within a frame; on a janky one the delay is
  // exactly the bug we want to surface.
  InteractionManager.runAfterInteractions(() => {
    recordPerf("warm-start", nowMs() - start);
  });
}

/**
 * Wrap an event handler so the time from when this function is invoked to
 * when the handler returns is reported as an event-ingest sample. The handler
 * runs synchronously — store mutations in `client-core` are sync — so the
 * elapsed time is the JS-thread cost of routing + upserting. The `finally`
 * deliberately records even when the handler throws so a perpetually-bad
 * payload still shows up as an outlier instead of silently dropping samples.
 */
export function timedEventIngest<T>(eventType: string, handler: () => T): T {
  const start = nowMs();
  try {
    return handler();
  } finally {
    recordPerf("event-ingest", nowMs() - start, eventType);
  }
}

function nowMs(): number {
  // `performance.now()` is available in Hermes and yields a monotonic clock
  // suitable for measuring deltas. Falls back to `Date.now()` if a future
  // runtime change removes it.
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}
