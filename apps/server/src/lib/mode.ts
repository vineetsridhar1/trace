function isTruthyFlag(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export function isLocalMode(): boolean {
  return isTruthyFlag(process.env.TRACE_LOCAL_MODE);
}

