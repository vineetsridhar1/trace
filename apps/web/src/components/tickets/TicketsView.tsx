import { useCallback, useEffect, useMemo, useState } from "react";
import { SquareCheck } from "lucide-react";
import { gql } from "@urql/core";
import type { FilterChangedEvent, GridReadyEvent, RowClickedEvent } from "ag-grid-community";
import type { Ticket } from "@trace/gql";
import { useEntityStore } from "@trace/client-core";
import { useAuthStore } from "@trace/client-core";
import { useUIStore } from "../../stores/ui";
import { client } from "../../lib/urql";
import { SidebarTrigger } from "../ui/sidebar";
import { ConnectionStatus } from "../ConnectionStatus";
import { Skeleton } from "../ui/skeleton";
import { ticketsGridTableInstance } from "./tickets-grid-table-instance";
import { TicketsGridTable } from "./TicketsGridTable";
import { TicketDetailPanel } from "./TicketDetailPanel";
import type { TicketRow } from "./tickets-table-types";
import { TICKET_FILTER_STORAGE_KEY, TICKET_DETAIL_PANEL_WIDTH } from "./tickets-table-types";
import { useTicketRows } from "./useTicketRows";

const TICKETS_QUERY = gql`
  query Tickets($organizationId: ID!) {
    tickets(organizationId: $organizationId) {
      id
      title
      description
      status
      priority
      assignees {
        id
        name
        avatarUrl
      }
      labels
      createdBy {
        id
        name
        avatarUrl
      }
      channel {
        id
      }
      createdAt
      updatedAt
    }
  }
`;

export function TicketsView() {
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const upsertMany = useEntityStore(
    (s: { upsertMany: ReturnType<typeof useEntityStore.getState>["upsertMany"] }) => s.upsertMany,
  );
  const refreshTick = useUIStore((s: { refreshTick: number }) => s.refreshTick);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client.query(TICKETS_QUERY, { organizationId: activeOrgId }).toPromise();

    if (result.data?.tickets) {
      const fetched = result.data.tickets as Array<Ticket & { id: string }>;
      upsertMany("tickets", fetched);
    }

    setLoading(false);
  }, [activeOrgId, upsertMany]);

  useEffect(() => {
    setLoading(true);
    fetchTickets();
  }, [fetchTickets, refreshTick]);

  // Derive grid rows from entity store — single source of truth
  const ticketRows = useTicketRows();

  useEffect(() => {
    ticketsGridTableInstance.useTable.getState().setRows(ticketRows);
  }, [ticketRows]);

  const handleRowClick = useCallback((event: RowClickedEvent<TicketRow>) => {
    const id = event.data?.id;
    if (id) {
      setSelectedTicketId((prev: string | null) => (prev === id ? null : id));
    }
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedTicketId(null);
  }, []);

  const agGridOptions = useMemo(
    () => ({
      rowHeight: 40,
      headerHeight: 32,
      suppressCellFocus: true,
      onRowClicked: handleRowClick,
      onGridReady: (event: GridReadyEvent<TicketRow>) => {
        try {
          const saved = localStorage.getItem(TICKET_FILTER_STORAGE_KEY);
          if (saved) {
            event.api.setFilterModel(JSON.parse(saved));
          }
        } catch {
          // ignore corrupt data
        }
      },
      onFilterChanged: (event: FilterChangedEvent<TicketRow>) => {
        const model = event.api.getFilterModel();
        if (Object.keys(model).length === 0) {
          localStorage.removeItem(TICKET_FILTER_STORAGE_KEY);
        } else {
          localStorage.setItem(TICKET_FILTER_STORAGE_KEY, JSON.stringify(model));
        }
      },
    }),
    [handleRowClick],
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger />
        <SquareCheck size={18} className="text-muted-foreground" />
        <h2 className="text-lg font-semibold text-foreground">Tickets</h2>
        <ConnectionStatus />
      </header>

      <div className="relative flex-1 overflow-hidden">
        <div
          className="h-full transition-[margin] duration-200 ease-in-out"
          style={{ marginRight: selectedTicketId ? TICKET_DETAIL_PANEL_WIDTH : 0 }}
        >
          {loading ? (
            <div className="space-y-1 px-4 pt-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="flex h-10 items-center gap-4 px-2">
                  <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
                  <Skeleton className="h-3.5 w-[40%]" />
                  <Skeleton className="ml-auto h-3.5 w-[10%]" />
                </div>
              ))}
            </div>
          ) : (
            <TicketsGridTable
              className="h-full"
              agGridOptions={agGridOptions}
              selectedRowIds={selectedTicketId ? [selectedTicketId] : undefined}
            />
          )}
        </div>

        <TicketDetailPanel ticketId={selectedTicketId} onClose={handleCloseDetail} />
      </div>
    </div>
  );
}
