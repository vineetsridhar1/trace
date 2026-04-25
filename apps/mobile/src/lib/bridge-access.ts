import type { BridgeAccessCapability } from "@trace/gql";

export type BridgeAccessRequestDuration = "1h" | "1d" | "7d" | "never";
export type BridgeAccessApprovalDuration = "1h" | "3h" | "1d" | "7d" | "never";

export function getBridgeAccessRequestExpiresAt(
  duration: BridgeAccessRequestDuration,
): string | undefined {
  if (duration === "never") return undefined;

  const now = Date.now();
  const ms =
    duration === "1h"
      ? 60 * 60 * 1000
      : duration === "1d"
        ? 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;
  return new Date(now + ms).toISOString();
}

export function getBridgeAccessApprovalExpiresAt(
  duration: BridgeAccessApprovalDuration,
): string | undefined {
  if (duration === "never") return undefined;

  const now = Date.now();
  const ms =
    duration === "1h"
      ? 60 * 60 * 1000
      : duration === "3h"
        ? 3 * 60 * 60 * 1000
        : duration === "1d"
          ? 24 * 60 * 60 * 1000
          : 7 * 24 * 60 * 60 * 1000;
  return new Date(now + ms).toISOString();
}

export function formatCapabilities(caps?: BridgeAccessCapability[] | null): string {
  const values = caps ?? [];
  if (values.length === 0) return "No access";

  const labels = values.map((cap) => {
    if (cap === "terminal") return "Sessions + terminal";
    return "Sessions";
  });
  return labels.length > 1 ? "Sessions + terminal" : labels[0]!;
}

export function describeBridgeAccessScope(
  scopeType: "all_sessions" | "session_group",
  sessionGroup?: { name?: string | null } | null,
): string {
  if (scopeType === "session_group") {
    return sessionGroup?.name ? `Workspace: ${sessionGroup.name}` : "Single workspace";
  }
  return "All sessions";
}

export function normalizeBridgeAccessApprovalScope(
  scopeType: "all_sessions" | "session_group",
  sessionGroup?: { id?: string | null } | null,
): {
  scopeType: "all_sessions" | "session_group";
  sessionGroupId: string | null;
} {
  if (scopeType === "session_group" && sessionGroup?.id) {
    return {
      scopeType: "session_group",
      sessionGroupId: sessionGroup.id,
    };
  }

  return {
    scopeType: "all_sessions",
    sessionGroupId: null,
  };
}
