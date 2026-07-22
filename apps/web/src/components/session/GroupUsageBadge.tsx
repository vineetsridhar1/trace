import { useMemo } from "react";
import { useEntitiesByIds, useSessionIdsByGroup } from "@trace/client-core";
import type { SessionEntity } from "@trace/client-core";
import { ActionTooltip } from "../ui/ActionTooltip";
import { UsageTooltipCard, usageTooltipContentClassName } from "./UsageTooltipCard";
import { formatTokens } from "./usage-format";

/** Badge showing summed usage for every session in a group. */
export function GroupUsageBadge({ sessionGroupId }: { sessionGroupId: string }) {
  const sessionIds = useSessionIdsByGroup(sessionGroupId);
  const sessions = useEntitiesByIds("sessions", sessionIds);

  const totals = useMemo(() => {
    let input = 0;
    let output = 0;
    let cacheRead = 0;
    let cacheCreation = 0;
    for (const session of sessions as (SessionEntity | undefined)[]) {
      if (!session) continue;
      input += session.inputTokens ?? 0;
      output += session.outputTokens ?? 0;
      cacheRead += session.cacheReadTokens ?? 0;
      cacheCreation += session.cacheCreationTokens ?? 0;
    }
    return {
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheRead,
      cacheCreationTokens: cacheCreation,
      totalTokens: input + output + cacheRead + cacheCreation,
    };
  }, [sessions]);

  if (totals.totalTokens === 0) return null;

  return (
    <ActionTooltip
      className="app-region-no-drag"
      contentClassName={usageTooltipContentClassName}
      label={
        <UsageTooltipCard
          title="Group usage"
          subtitle="Across all sessions"
          inputTokens={totals.inputTokens}
          outputTokens={totals.outputTokens}
          cacheReadTokens={totals.cacheReadTokens}
          cacheCreationTokens={totals.cacheCreationTokens}
        />
      }
    >
      <span className="flex shrink-0 items-center gap-1 rounded-md border border-white/10 bg-zinc-900/35 px-2 py-1 text-xs text-zinc-200 shadow-sm ring-1 ring-white/5 backdrop-blur-xl">
        <span>{formatTokens(totals.totalTokens)} tok</span>
      </span>
    </ActionTooltip>
  );
}
