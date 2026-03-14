export const statusColor: Record<string, string> = {
  pending: "text-muted-foreground",
  active: "text-blue-400",
  paused: "text-yellow-400",
  completed: "text-green-400",
  failed: "text-destructive",
  unreachable: "text-muted-foreground",
};

export const statusLabel: Record<string, string> = {
  pending: "Pending",
  active: "In Progress",
  paused: "Paused",
  completed: "Completed",
  failed: "Stopped",
  unreachable: "Unreachable",
};
