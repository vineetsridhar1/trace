import type { TraceRuntimeStatus } from "./types.js";

export function mapFlyStateToTraceStatus(flyState: string | undefined): TraceRuntimeStatus {
  switch (flyState) {
    case "created":
      return "provisioning";
    case "starting":
      return "booting";
    case "started":
      return "connected";
    case "stopping":
      return "stopping";
    case "stopped":
    case "destroyed":
      return "stopped";
    case "failed":
    case "replacing":
      return "failed";
    default:
      return "unknown";
  }
}
