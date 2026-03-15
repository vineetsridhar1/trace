export const statusColor: Record<string, string> = {
  creating: "text-purple-400",
  pending: "text-muted-foreground",
  active: "text-blue-400",
  paused: "text-yellow-400",
  needs_input: "text-amber-400",
  completed: "text-green-400",
  failed: "text-destructive",
  unreachable: "text-muted-foreground",
};

export const statusLabel: Record<string, string> = {
  creating: "Preparing...",
  pending: "Pending",
  active: "In Progress",
  paused: "Paused",
  needs_input: "Needs Input",
  completed: "Completed",
  failed: "Stopped",
  unreachable: "Unreachable",
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

/** Check if a session's connection is in a disconnected state */
export function isDisconnected(connection: Record<string, unknown> | null | undefined): boolean {
  if (!connection) return false;
  return connection.state === "disconnected";
}

/** Check if a session can accept new messages (not disconnected and not in a terminal state) */
export function canSendMessage(status: string | undefined, connection: Record<string, unknown> | null | undefined): boolean {
  if (!status) return false;
  if (status === "completed" || status === "failed") return false;
  if (status === "active") return false; // waiting for response
  if (isDisconnected(connection)) return false;
  return true;
}
