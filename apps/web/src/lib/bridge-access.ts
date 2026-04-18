export type BridgeAccessApprovalDuration = "1h" | "3h" | "1d";

export const BRIDGE_ACCESS_APPROVAL_OPTIONS: Array<{
  id: BridgeAccessApprovalDuration;
  label: string;
}> = [
  { id: "1h", label: "1 hour" },
  { id: "3h", label: "3 hours" },
  { id: "1d", label: "1 day" },
];

export function getBridgeAccessApprovalExpiresAt(
  duration: BridgeAccessApprovalDuration,
): string {
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
