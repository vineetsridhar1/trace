import { sessionStatusColor } from "../session/sessionStatus";
import { AgentStatusIcon } from "../session/AgentStatusIcon";
import type { SessionGroupRow } from "./sessions-table-types";

export function SessionStatusIndicator({
  row,
  size = 8,
}: {
  row: SessionGroupRow;
  size?: number;
}) {
  const color = sessionStatusColor[row.displaySessionStatus] ?? "text-muted-foreground";

  return (
    <AgentStatusIcon
      agentStatus={row.displayAgentStatus ?? "done"}
      size={size}
      className={`shrink-0 ${color}`}
    />
  );
}
