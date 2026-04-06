import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useContextHealthQuery, type ContextHealthData } from "../hooks/useAiConversationQueries";

interface ContextHealthIndicatorProps {
  branchId: string;
}

function getHealthColor(percentage: number): string {
  if (percentage < 0.5) return "bg-emerald-500";
  if (percentage < 0.7) return "bg-yellow-500";
  if (percentage < 0.9) return "bg-orange-500";
  return "bg-red-500";
}

function getHealthLabel(percentage: number): string {
  if (percentage < 0.5) return "Healthy";
  if (percentage < 0.7) return "Moderate";
  if (percentage < 0.9) return "High";
  return "Critical";
}

function formatTokenCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}

function HealthBar({ data }: { data: ContextHealthData }) {
  const percentage = Math.round(data.percentage * 100);
  const color = getHealthColor(data.percentage);
  const label = getHealthLabel(data.percentage);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <div className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted/50 cursor-default">
            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", color)}
                style={{ width: `${Math.min(100, percentage)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {percentage}%
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div className="space-y-1">
            <div className="font-medium">Context: {label}</div>
            <div className="text-muted-foreground">
              {formatTokenCount(data.tokenUsage)} / {formatTokenCount(data.budgetTotal)} tokens
            </div>
            <div className="text-muted-foreground">
              {percentage}% of context window used
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ContextHealthIndicator({ branchId }: ContextHealthIndicatorProps) {
  const { data, loading } = useContextHealthQuery(branchId);

  if (loading || !data) return null;

  return <HealthBar data={data} />;
}
