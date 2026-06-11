import { useMemo } from "react";
import { Coins } from "lucide-react";
import { useEntitiesByIds, useSessionIdsByGroup } from "@trace/client-core";
import type { SessionEntity } from "@trace/client-core";
import { ActionTooltip } from "../ui/ActionTooltip";
import { formatCostUsd, formatTokens } from "./usage-format";

/** Badge showing the summed cost of every session in a group. */
export function GroupUsageBadge({ sessionGroupId }: { sessionGroupId: string }) {
  const sessionIds = useSessionIdsByGroup(sessionGroupId);
  const sessions = useEntitiesByIds("sessions", sessionIds);

  const { totalCostUsd, totalTokens } = useMemo(() => {
    let cost = 0;
    let tokens = 0;
    for (const session of sessions as (SessionEntity | undefined)[]) {
      if (!session) continue;
      cost += session.costUsd ?? 0;
      tokens +=
        (session.inputTokens ?? 0) +
        (session.outputTokens ?? 0) +
        (session.cacheReadTokens ?? 0) +
        (session.cacheCreationTokens ?? 0);
    }
    return { totalCostUsd: cost, totalTokens: tokens };
  }, [sessions]);

  if (totalCostUsd === 0 && totalTokens === 0) return null;

  return (
    <ActionTooltip label={`${formatTokens(totalTokens)} tokens across all sessions`}>
      <span className="flex shrink-0 items-center gap-1 rounded-md bg-surface-elevated px-2 py-1 text-xs text-muted-foreground">
        <Coins size={12} />
        {formatCostUsd(totalCostUsd)}
      </span>
    </ActionTooltip>
  );
}
