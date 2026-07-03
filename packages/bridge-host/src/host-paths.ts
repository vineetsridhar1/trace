/**
 * Host-specific filesystem locations, injected by the embedding process:
 * the desktop app points these at its Electron paths, the CLI at its own
 * config directory. Everything else in the package is host-agnostic.
 */
export interface BridgeHostPaths {
  /** The repo-registry config file (desktop: ~/.trace/config.json). */
  configPath: string;
  /** Directory for persistent bridge state such as the instance ID. */
  stateDir: string;
}

let paths: BridgeHostPaths | null = null;

export function setBridgeHostPaths(next: BridgeHostPaths): void {
  paths = next;
}

export function getBridgeHostPaths(): BridgeHostPaths {
  if (!paths) {
    throw new Error(
      "@trace/bridge-host: paths not configured. Call setBridgeHostPaths() during host bootstrap.",
    );
  }
  return paths;
}
