import { sessionStatusColor } from "../session/sessionStatus";
import { AgentStatusIcon } from "../session/AgentStatusIcon";
import { useUIStore, type UIState } from "../../stores/ui";
import type { SessionGroupRow } from "./sessions-table-types";

export function SessionStatusIndicator({ row, size = 8 }: { row: SessionGroupRow; size?: number }) {
  const color = sessionStatusColor[row.displaySessionStatus] ?? "text-muted-foreground";
  const hasDoneBadge = useUIStore((s: UIState) => !!s.sessionGroupDoneBadges[row.id]);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center pl-1 ${color}`}
      style={{ width: size + 4, height: size }}
    >
      <AgentStatusIcon agentStatus={row.displayAgentStatus ?? "done"} size={size} />
      {hasDoneBadge && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
      )}
    </span>
  );
}
