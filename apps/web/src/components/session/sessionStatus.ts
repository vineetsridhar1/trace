export const statusColor: Record<string, string> = {
  pending: "text-muted-foreground",
  active: "text-green-400",
  paused: "text-yellow-400",
  completed: "text-muted-foreground",
  failed: "text-destructive",
  unreachable: "text-muted-foreground",
};

export const statusLabel: Record<string, string> = {
  pending: "Pending",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
  unreachable: "Unreachable",
};
