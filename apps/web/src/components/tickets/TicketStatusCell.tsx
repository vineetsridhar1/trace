import type { TicketRow } from "./tickets-table-types";
import { ticketStatusLabel, ticketStatusColor } from "./tickets-table-types";

export function TicketStatusCell({ row }: { row?: TicketRow }) {
  if (!row) return null;

  const label = ticketStatusLabel[row.status] ?? row.status;
  const color = ticketStatusColor[row.status] ?? "text-muted-foreground";

  return <span className={`text-xs font-medium ${color}`}>{label}</span>;
}
