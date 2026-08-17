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
  submitInitialCommand?: boolean;
}

interface AddTerminalOptions {
  customName?: string;
  initialCommand?: string;
  submitInitialCommand?: boolean;
}

interface TerminalState {
  terminals: Record<string, TerminalEntry>;
  pinnedTerminalIds: Record<string, boolean>;
  pendingPinnedTerminalSessions: Record<string, number>;
  addTerminal: (
    id: string,
    sessionId: string,
    sessionGroupId: string,
    status?: TerminalStatus,
    opts?: AddTerminalOptions,
  ) => void;
  setTerminalStatus: (id: string, status: TerminalStatus) => void;
  renameTerminal: (id: string, name: string) => void;
  pinTerminal: (id: string) => void;
  unpinTerminal: (id: string) => void;
  requestPinnedTerminal: (sessionId: string) => void;
  cancelPinnedTerminalRequest: (sessionId: string) => void;
  consumePinnedTerminalRequest: (sessionId: string) => boolean;
  removeTerminal: (id: string) => void;
}

type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void;

export const useTerminalStore = create<TerminalState>((set: SetState<TerminalState>) => ({
  terminals: {},
  pinnedTerminalIds: {},
  pendingPinnedTerminalSessions: {},

  addTerminal: (
    id: string,
    sessionId: string,
    sessionGroupId: string,
    status?: TerminalStatus,
    opts?: AddTerminalOptions,
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
          submitInitialCommand: opts?.submitInitialCommand,
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

  pinTerminal: (id: string) =>
    set((state: TerminalState) => {
      if (!state.terminals[id]) return {};
      return { pinnedTerminalIds: { ...state.pinnedTerminalIds, [id]: true } };
    }),

  unpinTerminal: (id: string) =>
    set((state: TerminalState) => {
      const { [id]: _, ...rest } = state.pinnedTerminalIds;
      return { pinnedTerminalIds: rest };
    }),

  requestPinnedTerminal: (sessionId: string) =>
    set((state: TerminalState) => ({
      pendingPinnedTerminalSessions: {
        ...state.pendingPinnedTerminalSessions,
        [sessionId]: (state.pendingPinnedTerminalSessions[sessionId] ?? 0) + 1,
      },
    })),

  cancelPinnedTerminalRequest: (sessionId: string) =>
    set((state: TerminalState) => ({
      pendingPinnedTerminalSessions: decrementPendingRequest(
        state.pendingPinnedTerminalSessions,
        sessionId,
      ),
    })),

  consumePinnedTerminalRequest: (sessionId: string) => {
    let consumed = false;
    set((state: TerminalState) => {
      consumed = (state.pendingPinnedTerminalSessions[sessionId] ?? 0) > 0;
      if (!consumed) return {};
      return {
        pendingPinnedTerminalSessions: decrementPendingRequest(
          state.pendingPinnedTerminalSessions,
          sessionId,
        ),
      };
    });
    return consumed;
  },

  removeTerminal: (id: string) =>
    set((state: TerminalState) => {
      const { [id]: _, ...rest } = state.terminals;
      const { [id]: _pinned, ...remainingPinnedIds } = state.pinnedTerminalIds;
      return { terminals: rest, pinnedTerminalIds: remainingPinnedIds };
    }),
}));

function decrementPendingRequest(
  requests: Record<string, number>,
  sessionId: string,
): Record<string, number> {
  const count = requests[sessionId] ?? 0;
  if (count <= 1) {
    const { [sessionId]: _, ...rest } = requests;
    return rest;
  }
  return { ...requests, [sessionId]: count - 1 };
}

export function useSessionGroupTerminals(sessionGroupId: string): TerminalEntry[] {
  return useTerminalStore(
    useShallow((state: TerminalState) =>
      Object.values(state.terminals).filter(
        (terminal: TerminalEntry) => terminal.sessionGroupId === sessionGroupId,
      ),
    ),
  );
}
