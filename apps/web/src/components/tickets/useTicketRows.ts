import { useMemo } from "react";
import { useEntityStore } from "../../stores/entity";
import type { Ticket } from "@trace/gql";
import type { TicketRow } from "./tickets-table-types";

export function useTicketRows(): TicketRow[] {
  const tickets = useEntityStore((s: { tickets: Record<string, unknown> }) => s.tickets);

  return useMemo(() => {
    return (Object.values(tickets) as Array<Ticket & { id: string }>)
      .sort((a, b) => {
        const diff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      }) as TicketRow[];
  }, [tickets]);
}
