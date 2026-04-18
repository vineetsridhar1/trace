export type BridgeAccessApprovalDuration = "1h" | "3h" | "1d" | "never";

export const BRIDGE_ACCESS_APPROVAL_OPTIONS: Array<{
  id: BridgeAccessApprovalDuration;
  label: string;
}> = [
  { id: "1h", label: "Approve 1 Hour" },
  { id: "3h", label: "Approve 3 Hours" },
  { id: "1d", label: "Approve 1 Day" },
  { id: "never", label: "Approve Unlimited" },
];

export function getBridgeAccessApprovalExpiresAt(
  duration: BridgeAccessApprovalDuration,
): string | null {
  if (duration === "never") return null;

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
