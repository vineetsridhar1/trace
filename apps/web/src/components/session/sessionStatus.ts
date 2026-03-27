// ─── Agent Status (what the coding agent is doing) ───

export const agentStatusColor: Record<string, string> = {
  active: "text-blue-400",
  done: "text-green-400",
  failed: "text-destructive",
  not_started: "text-muted-foreground",
  stopped: "text-muted-foreground",
};

export const agentStatusLabel: Record<string, string> = {
  active: "Active",
  done: "Done",
  failed: "Failed",
  not_started: "Not Started",
  stopped: "Stopped",
};

// ─── Session Status (where the session is in its lifecycle) ───

// Includes "failed" and "stopped" because getDisplaySessionStatus() maps terminal
// agent states into these display keys for group headers and table row groups.
export const sessionStatusColor: Record<string, string> = {
  in_progress: "text-blue-400",
  needs_input: "text-amber-400",
  in_review: "text-violet-400",
  failed: "text-destructive",
  stopped: "text-muted-foreground",
  merged: "text-emerald-400",
  archived: "text-muted-foreground",
};

export const sessionStatusLabel: Record<string, string> = {
  in_progress: "In Progress",
  needs_input: "Needs Input",
  in_review: "In Review",
  failed: "Failed",
  stopped: "Stopped",
  merged: "Merged",
  archived: "Archived",
};

// ─── Connection ───

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

// ─── Derived helpers ───

/**
 * Derive the display lifecycle label for a single session.
 */
export function getDisplaySessionStatus(
  sessionStatus: string | undefined,
  prUrl: string | null | undefined,
  agentStatus?: string | undefined,
): string {
  if (sessionStatus === "merged") return "merged";
  if (agentStatus === "failed") return "failed";
  if (agentStatus === "stopped") return "stopped";
  if (sessionStatus === "needs_input") return "needs_input";
  if (prUrl) return "in_review";
  return "in_progress";
}

/**
 * Derive the display activity state for dots/icons on a single session.
 */
export function getDisplayAgentStatus(
  agentStatus: string | undefined,
  sessionStatus?: string | undefined,
  prUrl?: string | null | undefined,
): string {
  const displaySessionStatus = getDisplaySessionStatus(sessionStatus, prUrl, agentStatus);

  if (displaySessionStatus === "failed") return "failed";
  if (displaySessionStatus === "stopped") return "stopped";
  if (agentStatus === "not_started") return "not_started";
  if (agentStatus === "active") return "active";

  return agentStatus ?? "done";
}

/**
 * Derive the display label/color for a session group from its member statuses.
 */
export function getSessionGroupDisplayStatus(
  sessionStatuses: Array<string | null | undefined>,
  agentStatuses: Array<string | null | undefined>,
  prUrl: string | null | undefined,
): string {
  // Merged is terminal and takes priority over all other states,
  // including needs_input and in_review (which depends on prUrl).
  if (sessionStatuses.some((s) => s === "merged")) return "merged";
  if (sessionStatuses.some((s) => s === "needs_input")) return "needs_input";
  if (prUrl) return "in_review";
  if (
    agentStatuses.some((s) => s === "active") ||
    sessionStatuses.some((s) => s === "in_progress")
  ) {
    return "in_progress";
  }
  if (agentStatuses.some((s) => s === "failed")) return "failed";
  if (agentStatuses.some((s) => s === "stopped")) return "stopped";
  return "in_progress";
}

/**
 * Derive the group-level agent status from its member agent statuses.
 * Returns the most active agent status across all members.
 */
export function getSessionGroupAgentStatus(
  agentStatuses: Array<string | null | undefined>,
): string {
  if (agentStatuses.some((s) => s === "active")) return "active";
  if (agentStatuses.some((s) => s === "failed")) return "failed";
  if (agentStatuses.some((s) => s === "stopped")) return "stopped";
  if (agentStatuses.every((s) => s === "not_started")) return "not_started";
  if (agentStatuses.some((s) => s === "done")) return "done";
  return "done";
}

/** Check if a session's connection is in a disconnected state */
export function isDisconnected(connection: Record<string, unknown> | null | undefined): boolean {
  if (!connection) return false;
  return connection.state === "disconnected";
}

/** Whether the session has reached a final state and cannot accept further input. */
export function isTerminalStatus(
  agentStatus: string | undefined,
  sessionStatus?: string | undefined,
): boolean {
  return agentStatus === "failed" || agentStatus === "stopped" || sessionStatus === "merged";
}

/** Check if a session can accept new messages (not disconnected and not fully unloaded) */
export function canSendMessage(
  agentStatus: string | undefined,
  connection: Record<string, unknown> | null | undefined,
  worktreeDeleted?: boolean,
): boolean {
  if (!agentStatus) return false;
  if (worktreeDeleted) return false;
  if (agentStatus === "active") return false; // waiting for response
  if (isDisconnected(connection)) return false;
  return true;
}
