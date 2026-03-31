import { sessionStatusColor } from "../session/sessionStatus";
import { AgentStatusIcon } from "../session/AgentStatusIcon";
import { useUIStore } from "../../stores/ui";
import type { SessionGroupRow } from "./sessions-table-types";

export function SessionStatusIndicator({
  row,
  size = 8,
}: {
  row: SessionGroupRow;
  size?: number;
}) {
  const color = sessionStatusColor[row.displaySessionStatus] ?? "text-muted-foreground";
  const hasDoneBadge = useUIStore((s) => !!s.sessionGroupDoneBadges[row.id]);

  return (
    <span className={`relative shrink-0 inline-flex items-center justify-center ${color}`} style={{ width: size, height: size }}>
      <AgentStatusIcon
        agentStatus={row.displayAgentStatus ?? "done"}
        size={size}
      />
      {hasDoneBadge && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
      )}
    </span>
  );
}
