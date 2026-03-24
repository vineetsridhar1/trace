import { Circle, Loader2 } from "lucide-react";
import { sessionStatusColor, sessionStatusLabel } from "../session/sessionStatus";

export function SessionStatusGroupLabel({
  count,
  hasActive,
  status,
}: {
  count: number;
  hasActive: boolean;
  status: string;
}) {
  const color = sessionStatusColor[status] ?? "text-muted-foreground";
  const label = sessionStatusLabel[status] ?? status;

  return (
    <div className={`flex items-center gap-2 ${color}`}>
      {hasActive ? (
        <Loader2 size={10} className="shrink-0 animate-spin" />
      ) : (
        <Circle size={6} className="shrink-0 fill-current" />
      )}
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </div>
  );
}
