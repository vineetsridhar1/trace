import { formatCostUsd, formatSessionUsageDateRange, formatTokens } from "./usage-format";

export const usageTooltipContentClassName =
  "w-80 max-w-none rounded-lg border border-white/10 !bg-zinc-900/70 px-0 py-0 text-foreground shadow-2xl shadow-black/40 ring-1 ring-white/10 backdrop-blur-2xl [&>div:last-child]:!bg-zinc-900/70 [&>div:last-child]:!fill-zinc-900/70";

interface UsageTooltipCardProps {
  title: string;
  subtitle?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  modeLabel?: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd?: number;
}

export function UsageTooltipCard({
  title,
  subtitle,
  startedAt,
  endedAt,
  modeLabel,
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheCreationTokens,
  costUsd,
}: UsageTooltipCardProps) {
  const dateRange = formatSessionUsageDateRange(startedAt, endedAt);
  const rows = [
    ["Input", inputTokens],
    ["Output", outputTokens],
    ["Cache read", cacheReadTokens],
    ["Cache write", cacheCreationTokens],
  ] as const;

  return (
    <div className="w-full min-w-0 px-3 py-2.5 text-[13px] leading-5">
      <div className="font-semibold text-zinc-100">{title}</div>
      {subtitle && <div className="text-zinc-200/90">{subtitle}</div>}
      {dateRange && <div className="mt-0.5 text-zinc-300/85">{dateRange}</div>}
      {modeLabel && <div className="mt-1 text-zinc-400">{modeLabel}</div>}
      <div className="mt-2 border-t border-white/10 pt-1.5">
        {rows.map(([label, value]) =>
          value > 0 ? (
            <div key={label} className="grid grid-cols-[1fr_auto] gap-6 text-zinc-300">
              <span>{label}</span>
              <span className="font-medium tabular-nums text-zinc-100">{formatTokens(value)}</span>
            </div>
          ) : null,
        )}
        {costUsd != null && costUsd > 0 && (
          <div className="mt-1 grid grid-cols-[1fr_auto] gap-6 border-t border-white/10 pt-1.5 text-zinc-300">
            <span>Cost</span>
            <span className="font-medium tabular-nums text-zinc-100">
              {formatCostUsd(costUsd)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
