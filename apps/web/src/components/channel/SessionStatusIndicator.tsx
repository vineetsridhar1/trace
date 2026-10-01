import { sessionStatusColor } from "../session/sessionStatus";
import { AgentStatusIcon } from "../session/AgentStatusIcon";
import { SessionPullRequestIndicators } from "../session/SessionPullRequestIndicators";
import { useUIStore, type UIState } from "../../stores/ui";
import type { SessionGroupRow } from "./sessions-table-types";

export function SessionStatusIndicator({
  row,
  size = 8,
  showDonePulse = true,
}: {
  row: SessionGroupRow;
  size?: number;
  showDonePulse?: boolean;
}) {
  const status = row.displaySessionStatus ?? "in_progress";
  const color = sessionStatusColor[status] ?? "text-muted-foreground";
  const hasDoneBadge = useUIStore((s: UIState) => !!s.sessionGroupDoneBadges[row.id]);
  const showPullRequest =
    status === "in_review" && row.displayAgentStatus === "done" && !!row.prUrl;
  const indicatorSize = showPullRequest ? 20 : size;

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center pl-1 ${color}`}
      style={{ width: indicatorSize + 4, height: indicatorSize }}
    >
      {showPullRequest ? (
        <SessionPullRequestIndicators sessionGroupId={row.id} />
      ) : (
        <AgentStatusIcon agentStatus={row.displayAgentStatus} size={size} />
      )}
      {hasDoneBadge && showDonePulse && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
      )}
    </span>
  );
}
