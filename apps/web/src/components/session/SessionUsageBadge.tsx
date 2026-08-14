import { useEntityField } from "@trace/client-core";
import { ActionTooltip } from "../ui/ActionTooltip";
import { getModelLabel, getReasoningEffortLabel } from "./modelOptions";
import { getToolLabel } from "./picker/pickerShared";
import { UsageTooltipCard, usageTooltipContentClassName } from "./UsageTooltipCard";
import { formatTokens } from "./usage-format";

/** Compact badge showing a session's accumulated tokens with a usage breakdown tooltip. */
export function SessionUsageBadge({ sessionId }: { sessionId: string }) {
  const tool = (useEntityField("sessions", sessionId, "tool") as string | null | undefined) ?? null;
  const model =
    (useEntityField("sessions", sessionId, "model") as string | null | undefined) ?? null;
  const reasoningEffort =
    (useEntityField("sessions", sessionId, "reasoningEffort") as string | null | undefined) ??
    null;
  const createdAt =
    (useEntityField("sessions", sessionId, "createdAt") as string | null | undefined) ?? null;
  const updatedAt =
    (useEntityField("sessions", sessionId, "updatedAt") as string | null | undefined) ?? null;
  const inputTokens = (useEntityField("sessions", sessionId, "inputTokens") as number) ?? 0;
  const outputTokens = (useEntityField("sessions", sessionId, "outputTokens") as number) ?? 0;
  const cacheReadTokens = (useEntityField("sessions", sessionId, "cacheReadTokens") as number) ?? 0;
  const cacheCreationTokens =
    (useEntityField("sessions", sessionId, "cacheCreationTokens") as number) ?? 0;

  const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
  if (totalTokens === 0) return null;

  const toolLabel = getToolLabel(tool ?? "claude_code");
  const modelLabel = model ? getModelLabel(model) : null;
  const title = modelLabel ? `${modelLabel} via ${toolLabel}` : `${toolLabel} usage`;
  const modeLabel = reasoningEffort
    ? `Effort ${getReasoningEffortLabel(reasoningEffort)}`
    : null;

  return (
    <ActionTooltip
      className="app-region-no-drag"
      contentClassName={usageTooltipContentClassName}
      label={
        <UsageTooltipCard
          title={title}
          startedAt={createdAt}
          endedAt={updatedAt}
          modeLabel={modeLabel}
          inputTokens={inputTokens}
          outputTokens={outputTokens}
          cacheReadTokens={cacheReadTokens}
          cacheCreationTokens={cacheCreationTokens}
        />
      }
    >
      <span className="flex shrink-0 items-center gap-1 rounded-md border border-white/10 bg-zinc-900/35 px-2 py-1 text-xs text-zinc-200 shadow-sm ring-1 ring-white/5 backdrop-blur-xl">
        <span>{formatTokens(totalTokens)} tok</span>
      </span>
    </ActionTooltip>
  );
}
