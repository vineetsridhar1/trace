import { Circle, Loader2 } from "lucide-react";
import { statusColor } from "../session/sessionStatus";
import type { SessionGroupRow } from "./sessions-table-types";

export function SessionStatusIndicator({
  row,
  size = 12,
}: {
  row: SessionGroupRow;
  size?: number;
}) {
  const color = statusColor[row.status ?? "active"] ?? "text-muted-foreground";

  return row.reviewAndActive ? (
    <Loader2 size={size} className={`shrink-0 animate-spin ${color}`} />
  ) : (
    <Circle size={Math.max(size - 4, 7)} className={`shrink-0 fill-current ${color}`} />
  );
}
