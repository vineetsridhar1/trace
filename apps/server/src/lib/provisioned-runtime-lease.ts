const DEFAULT_RUNTIME_LEASE_DURATION_MS = 15 * 60 * 1000;
const DEFAULT_RUNTIME_MAX_LIFETIME_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RUNTIME_LEASE_JITTER_RATIO = 0.1;
const MIN_RUNTIME_LEASE_DURATION_MS = 30 * 1000;
const MIN_RUNTIME_MAX_LIFETIME_MS = 10 * 60 * 1000;

function readDurationMs(name: string, fallback: number, minimum: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= minimum ? Math.floor(value) : fallback;
}

export function runtimeLeaseDurationMs(): number {
  return readDurationMs(
    "TRACE_PROVISIONED_RUNTIME_LEASE_DURATION_MS",
    DEFAULT_RUNTIME_LEASE_DURATION_MS,
    MIN_RUNTIME_LEASE_DURATION_MS,
  );
}

export function runtimeMaxLifetimeMs(): number {
  return readDurationMs(
    "TRACE_PROVISIONED_RUNTIME_MAX_LIFETIME_MS",
    DEFAULT_RUNTIME_MAX_LIFETIME_MS,
    MIN_RUNTIME_MAX_LIFETIME_MS,
  );
}

/**
 * Return a duration rather than an absolute control-lease timestamp. The
 * runtime applies it to a monotonic clock, avoiding host/server clock skew.
 * Positive jitter spreads expirations after a regional control-plane outage.
 */
export function runtimeLeaseTtlMs(
  minimumDurationMs = 0,
  random: () => number = Math.random,
): number {
  const base = Math.max(runtimeLeaseDurationMs(), minimumDurationMs);
  const boundedRandom = Math.min(1, Math.max(0, random()));
  return Math.floor(base * (1 + DEFAULT_RUNTIME_LEASE_JITTER_RATIO * boundedRandom));
}

export function runtimeHardDeadlineAt(now = Date.now(), minimumDurationMs = 0): string {
  return new Date(now + Math.max(runtimeMaxLifetimeMs(), minimumDurationMs)).toISOString();
}
