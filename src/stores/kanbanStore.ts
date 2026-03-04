import { create } from "zustand";
import type { KanbanColumn, KanbanTicket } from "../types";

interface PendingTicket {
  ticket: KanbanTicket;
  channelId: string;
}

function buildWorkspaceTickets(columns: KanbanColumn[]): Record<string, KanbanTicket> {
  const map: Record<string, KanbanTicket> = {};
  for (const col of columns) {
    for (const t of col.tickets) {
      if (t.workspaceId) map[t.workspaceId] = t;
    }
  }
  return map;
}

interface KanbanState {
  columns: KanbanColumn[];
  channelId: string | null;
  loading: boolean;
  pendingTickets: PendingTicket[];
  workspaceTickets: Record<string, KanbanTicket>;

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
  workspaceTickets: {},

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
      return {
        columns: updatedColumns,
        channelId,
        pendingTickets: [],
        workspaceTickets: buildWorkspaceTickets(updatedColumns),
      };
    }),
  setLoading: (loading) => set({ loading }),

  upsertTicket: (ticket, channelId) =>
    set((state) => {
      if (state.channelId && channelId !== state.channelId) return state;

      // If columns haven't loaded yet, queue the ticket
      if (state.columns.length === 0) {
        const wsUpdate: Record<string, KanbanTicket> = {};
        if (ticket.workspaceId) wsUpdate[ticket.workspaceId] = ticket;
        return {
          pendingTickets: [...state.pendingTickets.filter((p) => p.ticket.id !== ticket.id), { ticket, channelId }],
          workspaceTickets: { ...state.workspaceTickets, ...wsUpdate },
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

      const wsUpdate: Record<string, KanbanTicket> = {};
      if (ticket.workspaceId) wsUpdate[ticket.workspaceId] = ticket;

      return {
        columns: updated,
        workspaceTickets: { ...state.workspaceTickets, ...wsUpdate },
      };
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
    set((state) => {
      const { [workspaceId]: _, ...remainingWs } = state.workspaceTickets;
      return {
        columns: state.columns.map((col) => ({
          ...col,
          tickets: col.tickets.filter((t) => t.workspaceId !== workspaceId),
        })),
        workspaceTickets: remainingWs,
      };
    }),

  setTicketWorkspacePrUrl: (workspaceId, prUrl) =>
    set((state) => {
      const existing = state.workspaceTickets[workspaceId];
      const wsUpdate: Record<string, KanbanTicket> =
        existing?.workspace
          ? { [workspaceId]: { ...existing, workspace: { ...existing.workspace, prUrl } } }
          : {};
      return {
        columns: state.columns.map((col) => ({
          ...col,
          tickets: col.tickets.map((t) => {
            if (t.workspaceId !== workspaceId || !t.workspace) return t;
            return { ...t, workspace: { ...t.workspace, prUrl } };
          }),
        })),
        workspaceTickets: { ...state.workspaceTickets, ...wsUpdate },
      };
    }),

  clearBoard: () => set({ columns: [], channelId: null, pendingTickets: [], workspaceTickets: {} }),
}));
