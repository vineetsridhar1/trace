import { createTable } from "../ui/table";
import type { TicketRow } from "./tickets-table-types";
import { ticketColumns } from "./tickets-table-columns";

export const ticketsGridTableInstance = createTable<TicketRow>({
  id: "tickets",
  columns: ticketColumns,
});
