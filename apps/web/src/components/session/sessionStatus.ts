export const statusColor: Record<string, string> = {
  creating: "text-purple-400",
  pending: "text-muted-foreground",
  active: "text-blue-400",
  paused: "text-yellow-400",
  needs_input: "text-amber-400",
  completed: "text-green-400",
  failed: "text-destructive",
  unreachable: "text-muted-foreground",
  in_review: "text-violet-400",
  merged: "text-emerald-400",
};

export const statusLabel: Record<string, string> = {
  creating: "Preparing...",
  pending: "Pending",
  active: "In Progress",
  paused: "Paused",
  needs_input: "Needs Input",
  completed: "Completed",
  failed: "Failed",
  unreachable: "Unreachable",
  in_review: "In Review",
  merged: "Merged",
};

export const connectionColor: Record<string, string> = {
  connected: "text-green-400",
  degraded: "text-yellow-400",
  disconnected: "text-destructive",
};

export const connectionLabel: Record<string, string> = {
  connected: "Connected",
  degraded: "Degraded",
  disconnected: "Connection Lost",
};

/**
 * Derive the display status for a session.
 * "in_review" is not a real DB status — it's derived from having a prUrl.
 */
export function getDisplayStatus(status: string | undefined, prUrl: string | null | undefined): string {
  if (!status) return "active";
  // These statuses take priority over the PR-derived "in review" state
  if (status === "merged" || status === "failed" || status === "needs_input") return status;
  if (prUrl) return "in_review";
  return status;
}

/** Whether the session is "in review" and actively working (show spinner). */
export function isReviewAndActive(status: string | undefined, prUrl: string | null | undefined): boolean {
  return !!prUrl && status === "active";
}

const GROUP_IN_PROGRESS_STATUSES = new Set([
  "creating",
  "pending",
  "active",
  "paused",
  "unreachable",
]);

export function getSessionGroupDisplayStatus(
  statuses: Array<string | null | undefined>,
  prUrl: string | null | undefined,
): string {
  if (statuses.some((status) => status === "needs_input")) return "needs_input";
  if (statuses.some((status) => status === "merged")) return "merged";
  if (prUrl) return "in_review";
  if (statuses.some((status) => status != null && GROUP_IN_PROGRESS_STATUSES.has(status))) {
    return "active";
  }
  if (statuses.some((status) => status === "completed")) return "completed";
  if (statuses.some((status) => status === "failed")) return "failed";
  return "pending";
}

/** Whether the session group is "in review" but still has active/in-progress sessions. */
export function isGroupReviewAndActive(
  statuses: Array<string | null | undefined>,
  prUrl: string | null | undefined,
): boolean {
  return !!prUrl && statuses.some((status) => status != null && GROUP_IN_PROGRESS_STATUSES.has(status));
}

/** Check if a session's connection is in a disconnected state */
export function isDisconnected(connection: Record<string, unknown> | null | undefined): boolean {
  if (!connection) return false;
  return connection.state === "disconnected";
}

/** Whether the session has reached a final state and cannot accept further input. */
export function isTerminalStatus(status: string | undefined): boolean {
  return status === "failed" || status === "merged";
}

/** Check if a session can accept new messages (not disconnected and not fully unloaded) */
export function canSendMessage(
  status: string | undefined,
  connection: Record<string, unknown> | null | undefined,
  worktreeDeleted?: boolean,
): boolean {
  if (!status) return false;
  if (isTerminalStatus(status)) return false;
  if (worktreeDeleted) return false;
  if (status === "active") return false; // waiting for response
  if (isDisconnected(connection)) return false;
  return true;
}
