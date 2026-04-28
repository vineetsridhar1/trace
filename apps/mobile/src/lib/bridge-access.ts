import type { BridgeAccessCapability } from "@trace/gql";
import type { BridgeRuntimeAccessInfo } from "@/stores/bridge-access";

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

export function getBridgeAccessApprovalDurationFromRequest(
  requestedExpiresAt?: string | null,
  requestedAt?: string | null,
): BridgeAccessApprovalDuration {
  if (!requestedExpiresAt) return "never";

  const expiresAt = new Date(requestedExpiresAt).getTime();
  const startsAt = requestedAt ? new Date(requestedAt).getTime() : Date.now();
  if (Number.isNaN(expiresAt) || Number.isNaN(startsAt)) return "1d";

  const requestedMs = Math.max(0, expiresAt - startsAt);
  const options: Array<{ duration: BridgeAccessApprovalDuration; ms: number }> = [
    { duration: "1h", ms: 60 * 60 * 1000 },
    { duration: "3h", ms: 3 * 60 * 60 * 1000 },
    { duration: "1d", ms: 24 * 60 * 60 * 1000 },
    { duration: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
  ];

  return options.reduce((closest, option) =>
    Math.abs(option.ms - requestedMs) < Math.abs(closest.ms - requestedMs) ? option : closest,
  ).duration;
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

export function hasBridgeAccessCapability(
  access: Pick<
    BridgeRuntimeAccessInfo,
    "hostingMode" | "allowed" | "isOwner" | "capabilities"
  > | null,
  capability: BridgeAccessCapability,
): boolean {
  if (!access) return true;
  if (access.hostingMode !== "local") return true;
  if (access.isOwner) return true;
  if (!access.allowed) return false;
  if (capability === "session") return true;
  return access.capabilities?.includes(capability) ?? false;
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
