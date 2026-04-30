import type { ConnectionMode } from "./connection-target";

export function canUseMobileCloudHosting(connectionMode: ConnectionMode): boolean {
  return connectionMode === "hosted";
}
