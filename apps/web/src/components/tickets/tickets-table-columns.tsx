import type { ColDef, ICellRendererParams } from "ag-grid-community";
import type { Priority, TicketStatus } from "@trace/gql";
import { timeAgo } from "../../lib/utils";
import { TicketTitleCell } from "./TicketTitleCell";
import { TicketStatusCell } from "./TicketStatusCell";
import { TicketPriorityCell } from "./TicketPriorityCell";
import { TicketAssigneesCell } from "./TicketAssigneesCell";
import type { TicketRow } from "./tickets-table-types";
import { ticketStatusLabel, ticketPriorityLabel, ticketStatusOrder } from "./tickets-table-types";

export const ticketColumns: ColDef<TicketRow>[] = [
  {
    colId: "title",
    headerName: "Title",
    field: "title",
    flex: 2,
    minWidth: 200,
    filter: true,
    cellRenderer: (params: ICellRendererParams<TicketRow>) => (
      <TicketTitleCell row={params.data} />
    ),
  },
  {
    colId: "status",
    headerName: "Status",
    field: "status",
    width: 120,
    filter: true,
    valueFormatter: (params: { value: unknown }) => ticketStatusLabel[params.value as TicketStatus] ?? params.value,
    cellRenderer: (params: ICellRendererParams<TicketRow>) => (
      <TicketStatusCell row={params.data} />
    ),
    comparator: (a: string, b: string) =>
      (ticketStatusOrder[a as TicketStatus] ?? 99) - (ticketStatusOrder[b as TicketStatus] ?? 99),
  },
  {
    colId: "priority",
    headerName: "Priority",
    field: "priority",
    width: 110,
    filter: true,
    valueFormatter: (params: { value: unknown }) => ticketPriorityLabel[params.value as Priority] ?? params.value,
    cellRenderer: (params: ICellRendererParams<TicketRow>) => (
      <TicketPriorityCell row={params.data} />
    ),
  },
  {
    colId: "assignees",
    headerName: "Assignees",
    width: 150,
    filter: true,
    filterValueGetter: (params: { data?: TicketRow }) =>
      (params.data?.assignees ?? []).map((u: { name: string }) => u.name).join(", "),
    cellRenderer: (params: ICellRendererParams<TicketRow>) => (
      <TicketAssigneesCell row={params.data} />
    ),
  },
  {
    colId: "updatedAt",
    headerName: "Updated",
    field: "updatedAt",
    width: 120,
    sort: "desc",
    cellRenderer: (params: ICellRendererParams<TicketRow>) => {
      const value = params.data?.updatedAt;
      if (!value) return null;
      return <span className="text-xs text-muted-foreground">{timeAgo(value)}</span>;
    },
  },
];
