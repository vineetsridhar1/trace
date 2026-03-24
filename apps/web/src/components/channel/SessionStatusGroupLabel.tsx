import { Circle, Loader2 } from "lucide-react";
import { statusColor, statusLabel } from "../session/sessionStatus";

export function SessionStatusGroupLabel({
  count,
  hasReviewAndActive,
  status,
}: {
  count: number;
  hasReviewAndActive: boolean;
  status: string;
}) {
  const color = statusColor[status] ?? "text-muted-foreground";
  const label = statusLabel[status] ?? status;

  return (
    <div className={`flex items-center gap-2 ${color}`}>
      {hasReviewAndActive ? (
        <Loader2 size={12} className="shrink-0 animate-spin" />
      ) : (
        <Circle size={8} className="shrink-0 fill-current" />
      )}
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </div>
  );
}
