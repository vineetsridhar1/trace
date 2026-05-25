export const HIDDEN_THRESHOLD_MS = 5_000;
// Treat only long event-loop/visibility gaps as sleep, not routine app switching.
export const SLEEP_RESUME_THRESHOLD_MS = 30 * 60 * 1_000;
export const RESUME_CHECK_INTERVAL_MS = 10_000;
export const WAKE_RESTART_DELAY_MS = 2_000;
export const RESTART_COOLDOWN_MS = 30_000;
export const LAST_WAKE_RESTART_KEY = "trace:last-wake-transport-restart-at";

export type ResumeAction = "none" | "refresh" | "refresh-and-restart";

export function getResumeAction(durationMs: number): ResumeAction {
  if (durationMs <= HIDDEN_THRESHOLD_MS) return "none";
  if (durationMs <= SLEEP_RESUME_THRESHOLD_MS) return "refresh";
  return "refresh-and-restart";
}

export function canRestartAfterWake(now: number, storage: Pick<Storage, "getItem">): boolean {
  const lastRestartAt = Number(storage.getItem(LAST_WAKE_RESTART_KEY) ?? "0");
  return !Number.isFinite(lastRestartAt) || now - lastRestartAt > RESTART_COOLDOWN_MS;
}
