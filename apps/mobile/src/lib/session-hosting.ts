import type { HostingMode } from "@trace/gql";
import type { ConnectionMode } from "./connection-target";

export function resolveMobileSessionHosting(connectionMode: ConnectionMode): HostingMode {
  return connectionMode === "paired_local" ? "local" : "cloud";
}
