import type { BridgeAccessCapability } from "@trace/gql";

export type BridgeAccessApprovalDuration = "1h" | "3h" | "1d";

export const BRIDGE_ACCESS_APPROVAL_OPTIONS: Array<{
  id: BridgeAccessApprovalDuration;
  label: string;
}> = [
  { id: "1h", label: "1 hour" },
  { id: "3h", label: "3 hours" },
  { id: "1d", label: "1 day" },
];

export function getBridgeAccessApprovalExpiresAt(duration: BridgeAccessApprovalDuration): string {
  const now = Date.now();
  const ms =
    duration === "1h"
      ? 60 * 60 * 1000
      : duration === "3h"
        ? 3 * 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;
  return new Date(now + ms).toISOString();
}

export function getBridgeAccessRequestToastId(requestId: string): string {
  return `bridge-access-request:${requestId}`;
}

export const BRIDGE_ACCESS_CAPABILITIES: Array<{
  id: BridgeAccessCapability;
  label: string;
  description: string;
  required?: boolean;
}> = [
  {
    id: "session",
    label: "Sessions",
    description: "Create and use AI coding sessions on this bridge.",
    required: true,
  },
  {
    id: "terminal",
    label: "Terminal",
    description: "Open an interactive shell against this bridge's host.",
  },
];

export function formatCapabilities(caps: BridgeAccessCapability[]): string {
  if (caps.length === 0) return "no access";
  const labels = caps.map((cap) => {
    const entry = BRIDGE_ACCESS_CAPABILITIES.find((item) => item.id === cap);
    return entry?.label ?? cap;
  });
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} + ${labels[1]}`;
  return labels.join(", ");
}

export function ensureSessionCapability(caps: BridgeAccessCapability[]): BridgeAccessCapability[] {
  const set = new Set<BridgeAccessCapability>(caps);
  set.add("session");
  return Array.from(set);
}
