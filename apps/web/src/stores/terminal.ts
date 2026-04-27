import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

export type TerminalStatus = "connecting" | "active" | "exited";

export interface TerminalEntry {
  id: string;
  sessionId: string;
  sessionGroupId: string;
  status: TerminalStatus;
  customName?: string;
  initialCommand?: string;
}

interface TerminalState {
  terminals: Record<string, TerminalEntry>;
  addTerminal: (
    id: string,
    sessionId: string,
    sessionGroupId: string,
    status?: TerminalStatus,
    opts?: { customName?: string; initialCommand?: string },
  ) => void;
  setTerminalStatus: (id: string, status: TerminalStatus) => void;
  renameTerminal: (id: string, name: string) => void;
  removeTerminal: (id: string) => void;
}

type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void;

export const useTerminalStore = create<TerminalState>((set: SetState<TerminalState>) => ({
  terminals: {},

  addTerminal: (
    id: string,
    sessionId: string,
    sessionGroupId: string,
    status?: TerminalStatus,
    opts?: { customName?: string; initialCommand?: string },
  ) =>
    set((state: TerminalState) => ({
      terminals: {
        ...state.terminals,
        [id]: {
          id,
          sessionId,
          sessionGroupId,
          status: status ?? "connecting",
          customName: opts?.customName,
          initialCommand: opts?.initialCommand,
        },
      },
    })),

  setTerminalStatus: (id: string, status: TerminalStatus) =>
    set((state: TerminalState) => {
      const entry = state.terminals[id];
      if (!entry) return {};
      return { terminals: { ...state.terminals, [id]: { ...entry, status } } };
    }),

  renameTerminal: (id: string, name: string) =>
    set((state: TerminalState) => {
      const entry = state.terminals[id];
      if (!entry) return {};
      const customName = name.trim() || undefined;
      return { terminals: { ...state.terminals, [id]: { ...entry, customName } } };
    }),

  removeTerminal: (id: string) =>
    set((state: TerminalState) => {
      const { [id]: _, ...rest } = state.terminals;
      return { terminals: rest };
    }),
}));

export function useSessionGroupTerminals(sessionGroupId: string): TerminalEntry[] {
  return useTerminalStore(
    useShallow((state: TerminalState) =>
      Object.values(state.terminals).filter(
        (terminal: TerminalEntry) => terminal.sessionGroupId === sessionGroupId,
      ),
    ),
  );
}
