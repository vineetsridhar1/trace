import { Circle } from "lucide-react";
import type { TicketRow } from "./tickets-table-types";
import { ticketStatusColor } from "./tickets-table-types";

export function TicketTitleCell({ row }: { row?: TicketRow }) {
  if (!row) return null;

  const color = ticketStatusColor[row.status] ?? "text-muted-foreground";

  return (
    <div className="flex h-full items-center gap-2">
      <Circle size={8} className={`shrink-0 fill-current ${color}`} />
      <span className="truncate text-sm text-foreground">{row.title}</span>
    </div>
  );
}
