function isTruthyFlag(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export function isLocalMode(): boolean {
  return isTruthyFlag(process.env.TRACE_LOCAL_MODE);
}

export function shouldUseRedisServices(): boolean {
  if (isLocalMode()) return false;
  const override = process.env.TRACE_REDIS?.trim().toLowerCase();
  if (override === "1" || override === "true" || override === "redis") return true;
  if (override === "0" || override === "false" || override === "memory") return false;
  if (process.env.TRACE_RUNTIME_DIRECTORY?.trim().toLowerCase() === "redis") return true;
  return process.env.NODE_ENV === "production";
}
