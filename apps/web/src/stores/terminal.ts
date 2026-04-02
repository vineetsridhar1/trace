import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

export type TerminalStatus = "connecting" | "active" | "exited";

export interface TerminalEntry {
  id: string;
  sessionId: string;
  sessionGroupId: string;
  status: TerminalStatus;
  customName?: string;
}

interface TerminalState {
  terminals: Record<string, TerminalEntry>;
  addTerminal: (
    id: string,
    sessionId: string,
    sessionGroupId: string,
    status?: TerminalStatus,
  ) => void;
  setTerminalStatus: (id: string, status: TerminalStatus) => void;
  renameTerminal: (id: string, name: string) => void;
  removeTerminal: (id: string) => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  terminals: {},

  addTerminal: (id, sessionId, sessionGroupId, status) =>
    set((state) => ({
      terminals: {
        ...state.terminals,
        [id]: { id, sessionId, sessionGroupId, status: status ?? "connecting" },
      },
    })),

  setTerminalStatus: (id, status) =>
    set((state) => {
      const entry = state.terminals[id];
      if (!entry) return state;
      return { terminals: { ...state.terminals, [id]: { ...entry, status } } };
    }),

  renameTerminal: (id, name) =>
    set((state) => {
      const entry = state.terminals[id];
      if (!entry) return state;
      const customName = name.trim() || undefined;
      return { terminals: { ...state.terminals, [id]: { ...entry, customName } } };
    }),

  removeTerminal: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.terminals;
      return { terminals: rest };
    }),
}));

export function useSessionGroupTerminals(sessionGroupId: string): TerminalEntry[] {
  return useTerminalStore(
    useShallow((state) =>
      Object.values(state.terminals).filter((terminal) => terminal.sessionGroupId === sessionGroupId),
    ),
  );
}
