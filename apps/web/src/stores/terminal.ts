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
  pendingInput: Record<string, string>;
  addTerminal: (
    id: string,
    sessionId: string,
    sessionGroupId: string,
    status?: TerminalStatus,
  ) => void;
  setTerminalStatus: (id: string, status: TerminalStatus) => void;
  renameTerminal: (id: string, name: string) => void;
  removeTerminal: (id: string) => void;
  setPendingInput: (terminalId: string, input: string) => void;
  consumePendingInput: (terminalId: string) => string | undefined;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  terminals: {},
  pendingInput: {},

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

  setPendingInput: (terminalId, input) =>
    set((state) => ({
      pendingInput: { ...state.pendingInput, [terminalId]: input },
    })),

  consumePendingInput: (terminalId) => {
    const input = get().pendingInput[terminalId];
    if (input !== undefined) {
      set((state) => {
        const { [terminalId]: _, ...rest } = state.pendingInput;
        return { pendingInput: rest };
      });
    }
    return input;
  },
}));

export function useSessionGroupTerminals(sessionGroupId: string): TerminalEntry[] {
  return useTerminalStore(
    useShallow((state) =>
      Object.values(state.terminals).filter((terminal) => terminal.sessionGroupId === sessionGroupId),
    ),
  );
}
