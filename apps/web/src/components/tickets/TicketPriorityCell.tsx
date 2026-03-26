import {
  AlertTriangle,
  ArrowUp,
  Minus,
  ArrowDown,
  type LucideIcon,
} from "lucide-react";
import type { Priority } from "@trace/gql";
import type { TicketRow } from "./tickets-table-types";
import { ticketPriorityLabel, ticketPriorityColor } from "./tickets-table-types";

const priorityIcon: Record<Priority, LucideIcon> = {
  urgent: AlertTriangle,
  high: ArrowUp,
  medium: Minus,
  low: ArrowDown,
};

export function TicketPriorityCell({ row }: { row?: TicketRow }) {
  if (!row) return null;

  const label = ticketPriorityLabel[row.priority] ?? row.priority;
  const color = ticketPriorityColor[row.priority] ?? "text-muted-foreground";
  const Icon = priorityIcon[row.priority] ?? Minus;

  return (
    <div className={`flex h-full items-center gap-1.5 ${color}`}>
      <Icon size={14} className="shrink-0" />
      <span className="text-xs">{label}</span>
    </div>
  );
}
