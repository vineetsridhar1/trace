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
