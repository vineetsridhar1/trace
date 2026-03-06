import { create } from 'zustand';
import type { Workspace } from '../types';

interface CommandPaletteState {
  isOpen: boolean;
  query: string;
  selectedIndex: number;
  /** Workspaces keyed by channelId, fetched across all channels when palette opens. */
  allWorkspaces: Record<string, Workspace[]>;
  /** Maps workspaceId → ticket title from kanban boards. */
  ticketTitles: Record<string, string>;

  open: () => void;
  close: () => void;
  setQuery: (query: string) => void;
  setSelectedIndex: (index: number) => void;
  setChannelWorkspaces: (channelId: string, workspaces: Workspace[]) => void;
  mergeTicketTitles: (titles: Record<string, string>) => void;
  clearAllWorkspaces: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  isOpen: false,
  query: '',
  selectedIndex: 0,
  allWorkspaces: {},
  ticketTitles: {},

  open: () => set({ isOpen: true, query: '', selectedIndex: 0 }),
  close: () => set({ isOpen: false, query: '', selectedIndex: 0 }),
  setQuery: (query) => set({ query, selectedIndex: 0 }),
  setSelectedIndex: (index) => set({ selectedIndex: index }),
  setChannelWorkspaces: (channelId, workspaces) =>
    set((state) => ({
      allWorkspaces: { ...state.allWorkspaces, [channelId]: workspaces },
    })),
  mergeTicketTitles: (titles) =>
    set((state) => ({
      ticketTitles: { ...state.ticketTitles, ...titles },
    })),
  clearAllWorkspaces: () => set({ allWorkspaces: {}, ticketTitles: {} }),
}));
