import { Circle } from "lucide-react";
import { useEntityField } from "@trace/client-core";
import type { Priority, TicketStatus } from "@trace/gql";
import { cn } from "../../lib/utils";
import {
  ticketPriorityColor,
  ticketPriorityLabel,
  ticketStatusColor,
  ticketStatusLabel,
} from "../tickets/tickets-table-types";

export function ProjectTicketRow({
  ticketId,
  selected,
  onSelect,
}: {
  ticketId: string;
  selected: boolean;
  onSelect: (ticketId: string) => void;
}) {
  const title = useEntityField("tickets", ticketId, "title");
  const status = useEntityField("tickets", ticketId, "status") as TicketStatus | undefined;
  const priority = useEntityField("tickets", ticketId, "priority") as Priority | undefined;
  const labels = useEntityField("tickets", ticketId, "labels") ?? [];
  const assignees = useEntityField("tickets", ticketId, "assignees") ?? [];

  return (
    <button
      type="button"
      onClick={() => onSelect(ticketId)}
      className={cn(
        "grid h-[52px] w-full grid-cols-[minmax(0,1fr)_92px_78px] items-center gap-3 border-b border-border px-3 text-left hover:bg-surface-deep",
        selected && "bg-surface-deep",
      )}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <Circle
            size={8}
            className={cn("shrink-0 fill-current", status ? ticketStatusColor[status] : "")}
          />
          <span className="truncate text-sm font-medium text-foreground">{title}</span>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {labels.slice(0, 2).map((label) => (
            <span key={label} className="truncate rounded bg-surface px-1.5 py-0.5">
              {label}
            </span>
          ))}
          {assignees.length > 0 ? <span>{assignees.length} assigned</span> : null}
        </div>
      </div>
      <span className={cn("text-xs font-medium", status ? ticketStatusColor[status] : "")}>
        {status ? ticketStatusLabel[status] : "backlog"}
      </span>
      <span className={cn("text-xs", priority ? ticketPriorityColor[priority] : "")}>
        {priority ? ticketPriorityLabel[priority] : "Medium"}
      </span>
    </button>
  );
}
