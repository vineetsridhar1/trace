import type { HostingMode } from "@trace/gql";
import type { ConnectionMode } from "./connection-target";

export function resolveMobileSessionHosting(_connectionMode: ConnectionMode): HostingMode {
  return "local";
}
