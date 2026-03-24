import { Circle } from "lucide-react";
import { sessionStatusColor, sessionStatusLabel } from "../session/sessionStatus";

export function SessionStatusGroupLabel({
  count,
  status,
}: {
  count: number;
  status: string;
}) {
  const color = sessionStatusColor[status] ?? "text-muted-foreground";
  const label = sessionStatusLabel[status] ?? status;

  return (
    <div className={`flex items-center gap-2 ${color}`}>
      <Circle size={6} className="shrink-0 fill-current" />
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </div>
  );
}
