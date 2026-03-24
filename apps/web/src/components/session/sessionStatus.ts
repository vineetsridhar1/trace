// ─── Agent Status (what the coding agent is doing) ───

export const agentStatusColor: Record<string, string> = {
  active: "text-blue-400",
  done: "text-green-400",
  failed: "text-destructive",
  stopped: "text-muted-foreground",
};

export const agentStatusLabel: Record<string, string> = {
  active: "Active",
  done: "Done",
  failed: "Failed",
  stopped: "Stopped",
};

// ─── Session Status (where the session is in its lifecycle) ───

export const sessionStatusColor: Record<string, string> = {
  not_started: "text-muted-foreground",
  in_progress: "text-blue-400",
  needs_input: "text-amber-400",
  in_review: "text-violet-400",
  failed: "text-destructive",
  stopped: "text-muted-foreground",
  merged: "text-emerald-400",
};

export const sessionStatusLabel: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  needs_input: "Needs Input",
  in_review: "In Review",
  failed: "Failed",
  stopped: "Stopped",
  merged: "Merged",
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
  if (sessionStatus === "in_progress") return "in_progress";
  return "not_started";
}

/**
 * Derive the display label/color for a session group from its member statuses.
 */
export function getSessionGroupDisplayStatus(
  sessionStatuses: Array<string | null | undefined>,
  agentStatuses: Array<string | null | undefined>,
  prUrl: string | null | undefined,
): string {
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
  if (sessionStatuses.some((s) => s === "merged")) return "merged";
  return "not_started";
}

/**
 * Derive the group-level agent status from its member agent statuses.
 * Returns the most active agent status across all members.
 */
export function getSessionGroupAgentStatus(
  agentStatuses: Array<string | null | undefined>,
): string {
  if (agentStatuses.some((s) => s === "active")) return "active";
  if (agentStatuses.some((s) => s === "done")) return "done";
  if (agentStatuses.some((s) => s === "failed")) return "failed";
  if (agentStatuses.some((s) => s === "stopped")) return "stopped";
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
  sessionStatus: string | undefined,
  connection: Record<string, unknown> | null | undefined,
  worktreeDeleted?: boolean,
): boolean {
  if (!agentStatus) return false;
  if (isTerminalStatus(agentStatus, sessionStatus)) return false;
  if (worktreeDeleted) return false;
  if (agentStatus === "active") return false; // waiting for response
  if (isDisconnected(connection)) return false;
  return true;
}
