import { create } from "zustand";
import type { KanbanColumn, KanbanTicket } from "../types";

interface PendingTicket {
  ticket: KanbanTicket;
  channelId: string;
}

interface KanbanState {
  columns: KanbanColumn[];
  channelId: string | null;
  loading: boolean;
  pendingTickets: PendingTicket[];

  setColumns: (columns: KanbanColumn[], channelId: string) => void;
  setLoading: (loading: boolean) => void;
  upsertTicket: (ticket: KanbanTicket, channelId: string) => void;
  moveTicketOptimistic: (
    ticketId: string,
    columnId: string,
    sortOrder: number,
  ) => void;
  removeTicketByWorkspaceId: (workspaceId: string) => void;
  setTicketWorkspacePrUrl: (workspaceId: string, prUrl: string) => void;
  clearBoard: () => void;
}

export const useKanbanStore = create<KanbanState>((set) => ({
  columns: [],
  channelId: null,
  loading: false,
  pendingTickets: [],

  setColumns: (columns, channelId) =>
    set((state) => {
      // Drain any pending tickets that arrived before columns were loaded
      let updatedColumns = columns;
      for (const pending of state.pendingTickets) {
        if (pending.channelId !== channelId) continue;
        // Skip if the board data already contains this ticket (fresher data)
        const alreadyInBoard = updatedColumns.some((col) =>
          col.tickets.some((t) => t.id === pending.ticket.id),
        );
        if (alreadyInBoard) continue;
        const targetIdx = updatedColumns.findIndex(
          (col) =>
            col.id === pending.ticket.columnId ||
            (pending.ticket.columnSlug && col.slug === pending.ticket.columnSlug),
        );
        if (targetIdx === -1) continue;
        updatedColumns = updatedColumns.map((col, i) => {
          if (i !== targetIdx) return col;
          const tickets = [...col.tickets, pending.ticket].sort(
            (a, b) => a.sortOrder - b.sortOrder,
          );
          return { ...col, tickets };
        });
      }
      return { columns: updatedColumns, channelId, pendingTickets: [] };
    }),
  setLoading: (loading) => set({ loading }),

  upsertTicket: (ticket, channelId) =>
    set((state) => {
      if (state.channelId && channelId !== state.channelId) return state;

      // If columns haven't loaded yet, queue the ticket
      if (state.columns.length === 0) {
        return {
          pendingTickets: [...state.pendingTickets.filter((p) => p.ticket.id !== ticket.id), { ticket, channelId }],
        };
      }

      const cleaned = state.columns.map((col) => ({
        ...col,
        tickets: col.tickets.filter((t) => t.id !== ticket.id),
      }));

      const targetColIndex = cleaned.findIndex(
        (col) =>
          col.id === ticket.columnId ||
          (ticket.columnSlug && col.slug === ticket.columnSlug),
      );

      if (targetColIndex === -1) return state;

      const updated = [...cleaned];
      const targetCol = { ...updated[targetColIndex] };
      targetCol.tickets = [...targetCol.tickets, ticket].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      updated[targetColIndex] = targetCol;
      return { columns: updated };
    }),

  moveTicketOptimistic: (ticketId, columnId, sortOrder) =>
    set((state) => {
      let ticket: KanbanTicket | null = null;
      const cleaned = state.columns.map((col) => {
        const found = col.tickets.find((t) => t.id === ticketId);
        if (found) ticket = { ...found, columnId, sortOrder };
        return {
          ...col,
          tickets: col.tickets.filter((t) => t.id !== ticketId),
        };
      });

      if (!ticket) return state;

      return {
        columns: cleaned.map((col) => {
          if (col.id !== columnId) return col;
          const tickets = [...col.tickets, ticket!].sort(
            (a, b) => a.sortOrder - b.sortOrder,
          );
          return { ...col, tickets };
        }),
      };
    }),

  removeTicketByWorkspaceId: (workspaceId) =>
    set((state) => ({
      columns: state.columns.map((col) => ({
        ...col,
        tickets: col.tickets.filter((t) => t.workspaceId !== workspaceId),
      })),
    })),

  setTicketWorkspacePrUrl: (workspaceId, prUrl) =>
    set((state) => ({
      columns: state.columns.map((col) => ({
        ...col,
        tickets: col.tickets.map((t) => {
          if (t.workspaceId !== workspaceId || !t.workspace) return t;
          return { ...t, workspace: { ...t.workspace, prUrl } };
        }),
      })),
    })),

  clearBoard: () => set({ columns: [], channelId: null, pendingTickets: [] }),
}));
