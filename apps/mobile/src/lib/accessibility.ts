import type { SessionGroupStatus, SessionStatus } from "@trace/gql";

interface SessionRowLabelOptions {
  name: string;
  status: SessionGroupStatus | SessionStatus | null | undefined;
  secondaryLabel?: string | null;
  preview?: string | null;
  syncedBridgeLabel?: string | null;
}

export function describeSessionStatus(
  status: SessionGroupStatus | SessionStatus | null | undefined,
): string {
  switch (status) {
    case "in_progress":
      return "In progress";
    case "needs_input":
      return "Needs input";
    case "in_review":
      return "In review";
    case "failed":
      return "Failed";
    case "merged":
      return "Merged";
    case "stopped":
      return "Stopped";
    case "archived":
      return "Archived";
    default:
      return "Unknown status";
  }
}

export function buildSessionRowAccessibilityLabel({
  name,
  status,
  secondaryLabel,
  preview,
  syncedBridgeLabel,
}: SessionRowLabelOptions): string {
  const parts = [`${name}.`, `${describeSessionStatus(status)}.`];
  if (secondaryLabel) parts.push(`${secondaryLabel}.`);
  if (preview) parts.push(`${preview}.`);
  if (syncedBridgeLabel) parts.push(`Synced to ${syncedBridgeLabel}.`);
  parts.push("Double-tap to open.");
  return parts.join(" ");
}
