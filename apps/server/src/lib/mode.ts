function isTruthyFlag(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export function isLocalMode(): boolean {
  return isTruthyFlag(process.env.TRACE_LOCAL_MODE);
}

/**
 * Local cloud support is an explicit development-only capability. Keeping this
 * separate from local mode preserves local authentication and storage behavior
 * without accidentally enabling provisioned runtimes for every local server.
 */
export function isLocalCloudEnabled(): boolean {
  return isLocalMode() && isTruthyFlag(process.env.TRACE_LOCAL_CLOUD_ENABLED);
}

export function isCloudHostingAllowed(): boolean {
  return !isLocalMode() || isLocalCloudEnabled();
}

export function assertCloudHostingAllowed(hosting: string | null | undefined): void {
  if (hosting === "cloud" && !isCloudHostingAllowed()) {
    throw new Error("Cloud sessions are disabled in local mode");
  }
}
