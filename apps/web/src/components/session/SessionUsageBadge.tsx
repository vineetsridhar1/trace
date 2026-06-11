import { Coins } from "lucide-react";
import { useEntityField } from "@trace/client-core";
import { ActionTooltip } from "../ui/ActionTooltip";
import { formatCostUsd, formatTokens } from "./usage-format";

/** Compact badge showing a session's accumulated cost, with a token breakdown tooltip. */
export function SessionUsageBadge({ sessionId }: { sessionId: string }) {
  const inputTokens = (useEntityField("sessions", sessionId, "inputTokens") as number) ?? 0;
  const outputTokens = (useEntityField("sessions", sessionId, "outputTokens") as number) ?? 0;
  const cacheReadTokens = (useEntityField("sessions", sessionId, "cacheReadTokens") as number) ?? 0;
  const cacheCreationTokens =
    (useEntityField("sessions", sessionId, "cacheCreationTokens") as number) ?? 0;
  const costUsd = (useEntityField("sessions", sessionId, "costUsd") as number) ?? 0;

  const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
  if (totalTokens === 0 && costUsd === 0) return null;

  return (
    <ActionTooltip
      label={
        <div className="flex flex-col gap-0.5 text-xs">
          <span>Input: {formatTokens(inputTokens)}</span>
          <span>Output: {formatTokens(outputTokens)}</span>
          <span>Cache read: {formatTokens(cacheReadTokens)}</span>
          <span>Cache write: {formatTokens(cacheCreationTokens)}</span>
        </div>
      }
    >
      <span className="flex shrink-0 items-center gap-1 rounded-md bg-surface-elevated px-2 py-1 text-xs text-muted-foreground">
        <Coins size={12} />
        {formatCostUsd(costUsd)}
        <span className="text-muted-foreground/70">· {formatTokens(totalTokens)} tok</span>
      </span>
    </ActionTooltip>
  );
}
