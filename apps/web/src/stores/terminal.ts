import { create } from "zustand";

export type TerminalStatus = "connecting" | "active" | "exited";

export interface TerminalEntry {
  id: string;
  sessionId: string;
  status: TerminalStatus;
}

interface TerminalState {
  /** terminalId → entry */
  terminals: Record<string, TerminalEntry>;
  /** sessionId → active terminalId */
  activeTerminalId: Record<string, string>;

  addTerminal: (id: string, sessionId: string) => void;
  setTerminalStatus: (id: string, status: TerminalStatus) => void;
  removeTerminal: (id: string) => void;
  setActiveTerminal: (sessionId: string, terminalId: string) => void;
  getTerminalsForSession: (sessionId: string) => TerminalEntry[];
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  terminals: {},
  activeTerminalId: {},

  addTerminal: (id, sessionId) =>
    set((state) => ({
      terminals: { ...state.terminals, [id]: { id, sessionId, status: "connecting" } },
      activeTerminalId: { ...state.activeTerminalId, [sessionId]: id },
    })),

  setTerminalStatus: (id, status) =>
    set((state) => {
      const entry = state.terminals[id];
      if (!entry) return state;
      return { terminals: { ...state.terminals, [id]: { ...entry, status } } };
    }),

  removeTerminal: (id) =>
    set((state) => {
      const { [id]: removed, ...rest } = state.terminals;
      const activeTerminalId = { ...state.activeTerminalId };
      if (removed && activeTerminalId[removed.sessionId] === id) {
        // Switch to another terminal or clear
        const remaining = Object.values(rest).filter((t) => t.sessionId === removed.sessionId);
        if (remaining.length > 0) {
          activeTerminalId[removed.sessionId] = remaining[remaining.length - 1].id;
        } else {
          delete activeTerminalId[removed.sessionId];
        }
      }
      return { terminals: rest, activeTerminalId };
    }),

  setActiveTerminal: (sessionId, terminalId) =>
    set((state) => ({
      activeTerminalId: { ...state.activeTerminalId, [sessionId]: terminalId },
    })),

  getTerminalsForSession: (sessionId) => {
    return Object.values(get().terminals).filter((t) => t.sessionId === sessionId);
  },
}));
